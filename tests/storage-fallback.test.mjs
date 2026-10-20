// Storage fallback tests for non-native environments: without the Capacitor
// bridge, kv/chats land in localStorage (per-key memory fallback on quota
// overflow), while secrets deliberately stay session-only and never touch
// disk. The localStorage stub must be installed before importing the module
// (availability is decided once at module scope).
import assert from 'node:assert/strict';
import test from 'node:test';

const backing = new Map();
let failNextWrites = false;
let failNextReads = false;
globalThis.localStorage = {
    getItem: (key) => {
        if (failNextReads) throw new Error('Synthetic read failure');
        return backing.has(key) ? backing.get(key) : null;
    },
    setItem: (key, value) => {
        if (failNextWrites) throw new Error('QuotaExceededError');
        backing.set(key, String(value));
    },
    removeItem: (key) => backing.delete(key)
};
globalThis.window = {};

const { RPHStorage } = await import('../src/modules/storage-repository.mjs');

test('fallback: kv writes land in localStorage and read back', async () => {
    await RPHStorage.set('test_kv', { hello: 'world', nested: { n: 1 } });
    assert.ok(backing.has('rph_storage:test_kv'), 'value should land in localStorage');
    const value = await RPHStorage.get('test_kv');
    assert.deepEqual(value, { hello: 'world', nested: { n: 1 } });
});

test('fallback: pre-seeded localStorage data is readable (cross-session restore)', async () => {
    backing.set('rph_storage:test_preset', JSON.stringify({ persisted: true }));
    const value = await RPHStorage.get('test_preset');
    assert.deepEqual(value, { persisted: true });
});

test('fallback: chats land in localStorage, replace/delete semantics preserved', async () => {
    await RPHStorage.replaceChat('char-1', [
        { id: 'm1', role: 'user', content: '你好' },
        { id: 'm2', role: 'assistant', content: '你好呀' }
    ]);
    assert.ok(backing.has('rph_storage:chat:char-1'));
    let messages = await RPHStorage.loadChat('char-1');
    assert.equal(messages.length, 2);

    await RPHStorage.applyChatChanges('char-1', [{ position: 2, message: { id: 'm3', role: 'user', content: '再来' } }], []);
    messages = await RPHStorage.loadChat('char-1');
    assert.equal(messages.length, 3);

    await RPHStorage.deleteChat('char-1');
    assert.ok(!backing.has('rph_storage:chat:char-1'));
    assert.equal((await RPHStorage.loadChat('char-1')).length, 0);
});

test('secrets never reach localStorage: settings apiKey stays session-only', async () => {
    await RPHStorage.set('rp_hub_settings', { apiKey: 'sk-secret-1', themeMode: 'dark' });
    const stored = backing.get('rph_storage:rp_hub_settings') || '';
    assert.ok(!stored.includes('sk-secret-1'), 'plaintext secrets must not enter localStorage');
    // Within the same session the secret is restored from the in-memory secret channel
    const value = await RPHStorage.get('rp_hub_settings');
    assert.equal(value.apiKey, 'sk-secret-1');
    assert.equal(value.themeMode, 'dark');
});

test('quota overflow: writes fall back to memory per key, reads keep working', async () => {
    failNextWrites = true;
    try {
        await RPHStorage.set('test_quota', { big: true });
    } finally {
        failNextWrites = false;
    }
    const value = await RPHStorage.get('test_quota');
    assert.deepEqual(value, { big: true }, 'the memory backstop keeps the value readable this session');
    assert.ok(!backing.has('rph_storage:test_quota'));
});

test('fallback: corrupt stored JSON cannot become an empty replacement', async () => {
    const key = 'rp_hub_characters';
    const raw = '[{"uuid":"saved-card",';
    backing.set(`rph_storage:${key}`, raw);
    await assert.rejects(RPHStorage.get(key), error => error.code === 'STORAGE_INVALID_JSON');
    await assert.rejects(RPHStorage.set(key, []), error => error.code === 'STORAGE_WRITE_BLOCKED');
    await assert.rejects(RPHStorage.remove(key), error => error.code === 'STORAGE_WRITE_BLOCKED');
    assert.equal(backing.get(`rph_storage:${key}`), raw);
});

test('fallback: incremental writes read persisted history before applying changes', async () => {
    backing.set('rph_storage:chat:fresh-session', JSON.stringify([{ id: 'old', role: 'user', content: 'Saved' }]));
    await RPHStorage.applyChatChanges('fresh-session', [{ position: 1, message: { id: 'new', role: 'assistant', content: 'New' } }], []);
    assert.deepEqual((await RPHStorage.loadChat('fresh-session')).map(message => message.id), ['old', 'new']);
});

test('fallback: corrupt and non-array chats reject edits without mutating the source', async () => {
    for (const [scope, raw] of [['bad-json', '[broken'], ['bad-shape', '{}']]) {
        backing.set(`rph_storage:chat:${scope}`, raw);
        await assert.rejects(RPHStorage.applyChatChanges(scope, [], ['old']));
        await assert.rejects(RPHStorage.replaceChat(scope, []), error => error.code === 'STORAGE_WRITE_BLOCKED');
        await assert.rejects(RPHStorage.deleteChat(scope), error => error.code === 'STORAGE_WRITE_BLOCKED');
        assert.equal(backing.get(`rph_storage:chat:${scope}`), raw);
    }
});

test('fallback: storage access errors are not treated as missing records', async () => {
    const key = 'read-failure';
    const raw = '{"saved":true}';
    backing.set(`rph_storage:${key}`, raw);
    failNextReads = true;
    try {
        await assert.rejects(RPHStorage.get(key), /Synthetic read failure/);
    } finally {
        failNextReads = false;
    }
    await assert.rejects(RPHStorage.set(key, {}), error => error.code === 'STORAGE_WRITE_BLOCKED');
    assert.equal(backing.get(`rph_storage:${key}`), raw);
    assert.deepEqual(await RPHStorage.get(key), { saved: true });
    await RPHStorage.set(key, { saved: true, repaired: true });
});
