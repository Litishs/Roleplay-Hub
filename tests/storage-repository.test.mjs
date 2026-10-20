import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const createRepository = async () => {
  const kv = new Map();
  const secrets = new Map();
  const chats = new Map();
  const logs = [];
  const plugin = {
    async init() {},
    async kvSet({ key, json }) { kv.set(key, json); },
    async kvGet({ key }) { return { json: kv.get(key) ?? null }; },
    async kvRemove({ key }) { kv.delete(key); },
    async secretSet({ key, value }) { secrets.set(key, value); },
    async secretGet({ key }) { return { value: secrets.get(key) ?? null }; },
    async secretRemove({ key }) { secrets.delete(key); },
    async chatApply({ characterId, changesJson }) {
      const changes = JSON.parse(changesJson);
      const current = chats.get(characterId) || [];
      const rows = new Map(current.map((message, position) => [message.id, { message, position }]));
      changes.deletes.forEach(id => rows.delete(id));
      changes.upserts.forEach(item => rows.set(item.message.id, item));
      chats.set(characterId, [...rows.values()].sort((a, b) => a.position - b.position).map(row => row.message));
    },
    async chatGet({ characterId }) { return { json: JSON.stringify(chats.get(characterId) || []) }; },
    async chatReplace({ characterId, messagesJson }) { chats.set(characterId, JSON.parse(messagesJson)); },
    async chatDelete({ characterId }) { chats.delete(characterId); }
  };
  const window = { Capacitor: { Plugins: { NativeStorage: plugin } } };
  const context = vm.createContext({ window, console: { ...console, error: (...args) => logs.push(args.join(' ')) } });
  const source = await readFile(new URL('../src/modules/storage-repository.mjs', import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
  }).replace(/^export default\s+(\S+);\s*$/m, (_, name) => { return 'window.' + name + ' = ' + name + ';\nglobalThis.' + name + ' = ' + name + ';'; });
  vm.runInContext(cleanSource, context);
  return { repository: window.RPHStorage, kv, secrets, chats, plugin, logs };
};

test('settings secrets are excluded from SQLite JSON and restored from secure storage', async () => {
  const { repository, kv, secrets } = await createRepository();
  const settings = {
    model: 'example',
    apiKey: 'chat-secret',
    imageGenKey: 'image-secret',
    apiProviderKeys: { primary: 'provider-secret' }
  };

  await repository.set('rp_hub_settings', settings);
  const sqliteValue = JSON.parse(kv.get('rp_hub_settings'));
  assert.equal(sqliteValue.apiKey, '');
  assert.equal(sqliteValue.imageGenKey, '');
  assert.deepEqual(sqliteValue.apiProviderKeys, {});
  assert.equal(kv.get('rp_hub_settings').includes('chat-secret'), false);
  assert.equal(kv.get('rp_hub_settings').includes('provider-secret'), false);
  assert.equal(secrets.size, 1);

  const restored = await repository.get('rp_hub_settings');
  assert.equal(restored.apiKey, 'chat-secret');
  assert.equal(restored.imageGenKey, 'image-secret');
  assert.equal(restored.apiProviderKeys.primary, 'provider-secret');
});

test('novel_settings secrets ride the secret channel (novel workshop bridge)', async () => {
  const { repository, kv, secrets } = await createRepository();
  const novelSettings = {
    providerId: 'deepseek',
    apiUrl: 'https://api.deepseek.com/v1',
    apiKey: 'novel-secret',
    apiProviderKeys: { deepseek: 'novel-provider-secret', zhipu: 'novel-zhipu-secret' },
    model: 'example-model'
  };

  await repository.set('novel_settings', novelSettings);
  const sqliteValue = JSON.parse(kv.get('novel_settings'));
  assert.equal(sqliteValue.apiKey, '', 'apiKey must be blanked out in plain SQLite');
  assert.deepEqual(sqliteValue.apiProviderKeys, {}, 'apiProviderKeys must be blanked out in plain SQLite');
  assert.equal(kv.get('novel_settings').includes('novel-secret'), false);
  assert.equal(kv.get('novel_settings').includes('novel-provider-secret'), false);
  assert.equal(sqliteValue.providerId, 'deepseek', 'non-secret fields stay public');
  assert.equal(secrets.get('config:novel_settings') !== undefined, true, 'secrets must live in the secret channel');

  const restored = await repository.get('novel_settings');
  assert.equal(restored.apiKey, 'novel-secret');
  assert.equal(restored.apiProviderKeys.deepseek, 'novel-provider-secret');
  assert.equal(restored.apiProviderKeys.zhipu, 'novel-zhipu-secret');
});

test('novel library stays non-secret (no keys inside, plain SQLite is fine)', async () => {
  const { repository, kv, secrets } = await createRepository();
  await repository.set('novel_library', { version: 1, books: [{ id: 'b1', title: 'demo' }] });
  assert.equal(JSON.parse(kv.get('novel_library')).books[0].title, 'demo');
  assert.equal(secrets.has('config:novel_library'), false, 'library must not enter the secret channel');
});

test('chat repository applies per-row upserts and deletes', async () => {
  const { repository } = await createRepository();
  await repository.applyChatChanges('character-1', [
    { position: 0, message: { id: 'a', content: 'A' } },
    { position: 1, message: { id: 'b', content: 'B' } }
  ], []);
  await repository.applyChatChanges(
    'character-1',
    [{ position: 0, message: { id: 'b', content: 'edited' } }],
    ['a']
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(await repository.loadChat('character-1'))),
    [{ id: 'b', content: 'edited' }]
  );
});

test('corrupt JSON is preserved and cannot be overwritten after a failed read', async () => {
  const { repository, kv } = await createRepository();
  const key = 'rp_hub_characters';
  const raw = '[{"uuid":"saved-card",';
  kv.set(key, raw);
  await assert.rejects(repository.get(key), error => error.code === 'STORAGE_INVALID_JSON' && error.storageKey === key);
  await assert.rejects(repository.set(key, []), error => error.code === 'STORAGE_WRITE_BLOCKED');
  await assert.rejects(repository.remove(key), error => error.code === 'STORAGE_WRITE_BLOCKED');
  assert.equal(kv.get(key), raw);

  await repository.get('unrelated-missing-key');
  await assert.rejects(repository.set(key, []), error => error.code === 'STORAGE_WRITE_BLOCKED');
  kv.set(key, '[{"uuid":"repaired-card"}]');
  assert.equal((await repository.get(key))[0].uuid, 'repaired-card');
  await repository.set(key, []);
  assert.equal(kv.get(key), '[]', 'a successful reread permits an intentional empty value');
});

test('missing records allow defaults while present empty or wrongly shaped records fail', async () => {
  const { repository, kv } = await createRepository();
  assert.equal(await repository.get('rp_hub_characters'), undefined);
  for (const raw of ['', ' ', 'null', '{}', '"text"']) {
    kv.set('rp_hub_characters', raw);
    await assert.rejects(repository.get('rp_hub_characters'));
    assert.equal(kv.get('rp_hub_characters'), raw);
  }
  kv.set('rp_hub_characters', '[]');
  assert.equal((await repository.get('rp_hub_characters')).length, 0);
  for (const key of ['rp_hub_settings', 'rp_hub_user', 'rp_hub_memory_settings']) {
    kv.set(key, '[]');
    await assert.rejects(repository.get(key), error => error.code === 'STORAGE_INVALID_SHAPE');
  }
});

test('secret parse failures block public and secret replacement without logging the payload', async () => {
  const { repository, kv, secrets, logs } = await createRepository();
  const key = 'rp_hub_settings';
  const raw = 'private-synthetic-payload-is-not-json';
  kv.set(key, '{"apiKey":"","model":"saved"}');
  secrets.set(`config:${key}`, raw);
  await assert.rejects(repository.get(key), error => error.code === 'STORAGE_INVALID_JSON');
  await assert.rejects(repository.set(key, { apiKey: '', model: '' }), error => error.code === 'STORAGE_WRITE_BLOCKED');
  await assert.rejects(repository.setSecret(`config:${key}`, '{}'), error => error.code === 'STORAGE_WRITE_BLOCKED');
  await assert.rejects(repository.removeSecret(`config:${key}`), error => error.code === 'STORAGE_WRITE_BLOCKED');
  assert.equal(secrets.get(`config:${key}`), raw);
  assert.equal(kv.get(key), '{"apiKey":"","model":"saved"}');
  assert.ok(!logs.join('\n').includes(raw));
});

test('a corrupt chat blocks incremental changes, replacement, and deletion', async () => {
  const { repository, chats, plugin } = await createRepository();
  const saved = [{ id: 'saved', role: 'user', content: 'Saved message' }];
  chats.set('card', saved);
  plugin.chatGet = async () => ({ json: '[{"id":' });
  await assert.rejects(repository.loadChat('card'), error => error.code === 'STORAGE_INVALID_JSON');
  await assert.rejects(repository.applyChatChanges('card', [], ['saved']), error => error.code === 'STORAGE_WRITE_BLOCKED');
  await assert.rejects(repository.replaceChat('card', []), error => error.code === 'STORAGE_WRITE_BLOCKED');
  await assert.rejects(repository.deleteChat('card'), error => error.code === 'STORAGE_WRITE_BLOCKED');
  assert.deepEqual(chats.get('card'), saved);
  plugin.chatGet = async () => ({ json: '{}' });
  await assert.rejects(repository.loadChat('card'), error => error.code === 'STORAGE_INVALID_SHAPE');
});

test('native read errors do not allow callers to replace unread data', async () => {
  const { repository, kv, plugin } = await createRepository();
  kv.set('rp_hub_presets', '[{"name":"Saved"}]');
  plugin.kvGet = async () => { throw new Error('Synthetic bridge failure'); };
  await assert.rejects(repository.get('rp_hub_presets'), /Synthetic bridge failure/);
  await assert.rejects(repository.set('rp_hub_presets', []), error => error.code === 'STORAGE_WRITE_BLOCKED');
  assert.equal(kv.get('rp_hub_presets'), '[{"name":"Saved"}]');
});
