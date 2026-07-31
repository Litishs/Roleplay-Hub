import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const createRepository = async () => {
  const kv = new Map();
  const secrets = new Map();
  const chats = new Map();
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
    async chatGet({ characterId }) { return { json: JSON.stringify(chats.get(characterId) || []) }; }
  };
  const window = { Capacitor: { Plugins: { NativeStorage: plugin } } };
  const context = vm.createContext({ window, console });
  const source = await readFile(new URL('../assets/js/storage-repository.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return { repository: window.RPHStorage, kv, secrets };
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
