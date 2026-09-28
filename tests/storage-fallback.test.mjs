// Storage fallback tests for non-native environments: without the Capacitor
// bridge, kv/chats land in localStorage (per-key memory fallback on quota
// overflow), while secrets deliberately stay session-only and never touch
// disk. The localStorage stub must be installed before importing the module
// (availability is decided once at module scope).
import assert from 'node:assert/strict';
import test from 'node:test';

const backing = new Map();
let failNextWrites = false;
globalThis.localStorage = {
    getItem: (key) => backing.has(key) ? backing.get(key) : null,
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
