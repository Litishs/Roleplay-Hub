// 非原生环境的存储回退测试：无 Capacitor 桥时 kv/聊天落到 localStorage
// （配额超限逐键退内存），密钥刻意保持会话级不落盘。localStorage 桩须在
// 模块导入前挂好（可用性在模块作用域判定一次）。
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

test('回退：kv 写入 localStorage 并可回读', async () => {
    await RPHStorage.set('test_kv', { hello: 'world', nested: { n: 1 } });
    assert.ok(backing.has('rph_storage:test_kv'), '应落在 localStorage');
    const value = await RPHStorage.get('test_kv');
    assert.deepEqual(value, { hello: 'world', nested: { n: 1 } });
});

test('回退：预置的 localStorage 数据可被读取（跨会话恢复）', async () => {
    backing.set('rph_storage:test_preset', JSON.stringify({ persisted: true }));
    const value = await RPHStorage.get('test_preset');
    assert.deepEqual(value, { persisted: true });
});

test('回退：聊天记录落到 localStorage，整删整写语义保持', async () => {
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

test("密钥不落 localStorage：settings 的 apiKey 只留会话级", async () => {
    await RPHStorage.set('rp_hub_settings', { apiKey: 'sk-secret-1', themeMode: 'dark' });
    const stored = backing.get('rph_storage:rp_hub_settings') || '';
    assert.ok(!stored.includes('sk-secret-1'), '明文密钥不得进入 localStorage');
    // 同一会话内读回时密钥从内存密钥通道还原
    const value = await RPHStorage.get('rp_hub_settings');
    assert.equal(value.apiKey, 'sk-secret-1');
    assert.equal(value.themeMode, 'dark');
});

test('配额超限：写入逐键退回内存，读取不中断', async () => {
    failNextWrites = true;
    try {
        await RPHStorage.set('test_quota', { big: true });
    } finally {
        failNextWrites = false;
    }
    const value = await RPHStorage.get('test_quota');
    assert.deepEqual(value, { big: true }, '内存兜底保证本会话可读');
    assert.ok(!backing.has('rph_storage:test_quota'));
});
