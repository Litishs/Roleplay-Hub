// 插件框架测试：清单校验（plugin-api）+ 注册表行为（plugin-registry）。
// storage 用内存假实现驱动持久化路径；一个测试文件覆盖「注册→启停→设置→
// 工具贡献→执行门禁」的完整生命周期。
import assert from 'node:assert/strict';
import test from 'node:test';

const { definePlugin, PLUGIN_PERMISSIONS } = await import('../src/plugins/plugin-api.mjs');
const { createPluginRegistry, PLUGIN_STATE_STORAGE_KEY } = await import('../src/plugins/plugin-registry.mjs');

const makeStorage = () => {
    const store = new Map();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        set: async (key, value) => { store.set(key, JSON.parse(JSON.stringify(value))); }
    };
};

const baseManifest = {
    id: 'rph-demo',
    name: '演示插件',
    version: '1.0.0',
    permissions: [PLUGIN_PERMISSIONS.CHAT_READ]
};

const makeToolPlugin = (overrides = {}) => ({
    ...baseManifest,
    defaultEnabled: true,
    activeTool: {
        id: 'tool_demo',
        name: '演示工具',
        callName: 'tool_demo',
        type: 'plugin',
        resultCount: 3,
        description: '演示用模型侧说明',
        displayDescription: '演示用展示说明'
    },
    execute: async () => [{ ok: true }],
    ...overrides
});

test('definePlugin: 合法清单通过并冻结，非法字段逐项拒绝', () => {
    const plugin = definePlugin(baseManifest);
    assert.equal(plugin.id, 'rph-demo');
    assert.equal(plugin.builtin, true);
    assert.ok(Object.isFrozen(plugin), '清单应被冻结');
    assert.throws(() => { plugin.version = '9.9.9'; }, TypeError, '冻结后不可改写');

    assert.throws(() => definePlugin({ ...baseManifest, id: 'demo' }), /id 不合法/);
    assert.throws(() => definePlugin({ ...baseManifest, id: 'RPH-Demo' }), /id 不合法/);
    assert.throws(() => definePlugin({ ...baseManifest, name: '' }), /缺少 name/);
    assert.throws(() => definePlugin({ ...baseManifest, version: '1.0' }), /x\.y\.z/);
    assert.throws(() => definePlugin({ ...baseManifest, permissions: ['root:everything'] }), /未知权限/);
    assert.throws(() => definePlugin({
        ...baseManifest,
        activeTool: { callName: 'bad name', description: 'x', displayDescription: 'y' }
    }), /callName 不合法/);
    assert.throws(() => definePlugin({
        ...baseManifest,
        activeTool: { callName: 'tool_ok', description: ' ', displayDescription: 'y' }
    }), /description/);
});

test('registry: 注册、默认启用、启停持久化并可跨实例恢复', async () => {
    const storage = makeStorage();
    const registry = createPluginRegistry({ storage });
    await registry.register(makeToolPlugin());

    assert.equal(registry.list().length, 1);
    assert.equal(registry.isEnabled('rph-demo'), true, 'defaultEnabled: true 开箱即用');
    assert.deepEqual(storage.store.get(PLUGIN_STATE_STORAGE_KEY)?.enabled, {}, '未显式启停时不写入记录');

    await registry.setEnabled('rph-demo', false);
    assert.equal(registry.isEnabled('rph-demo'), false);
    assert.equal(storage.store.get(PLUGIN_STATE_STORAGE_KEY)?.enabled['rph-demo'], false);

    // 新实例从同一存储恢复用户的选择
    const second = createPluginRegistry({ storage });
    await second.register(makeToolPlugin());
    assert.equal(second.isEnabled('rph-demo'), false, '显式停用优先于 defaultEnabled');
});

test('registry: 工具贡献只含启用中的插件，停用后执行被门禁拦截', async () => {
    const registry = createPluginRegistry({ storage: makeStorage() });
    const plugin = makeToolPlugin();
    await registry.register(plugin);

    assert.equal(registry.getToolContributions().length, 1);
    const contribution = registry.getToolContributions()[0];
    assert.equal(contribution.callName, 'tool_demo');
    assert.equal(contribution.pluginId, 'rph-demo');

    await registry.setEnabled('rph-demo', false);
    assert.equal(registry.getToolContributions().length, 0);
    await assert.rejects(
        () => registry.executeTool('rph-demo', '查询', contribution, null, {}),
        /插件未启用/
    );
    await assert.rejects(
        () => registry.executeTool('rph-unknown', '查询', contribution, null, {}),
        /插件未注册/
    );
});

test('registry: 每插件设置的默认值合并与数字钳制', async () => {
    const registry = createPluginRegistry({ storage: makeStorage() });
    await registry.register(makeToolPlugin({
        settings: [{ key: 'indexSize', label: '索引', type: 'number', default: 200, min: 50, max: 1000 }]
    }));

    assert.deepEqual(registry.getPluginSettings('rph-demo'), { indexSize: 200 });
    await registry.setPluginSetting('rph-demo', 'indexSize', 9999);
    assert.equal(registry.getPluginSettings('rph-demo').indexSize, 1000, '超出上限被钳制');
    await assert.rejects(
        () => registry.setPluginSetting('rph-demo', 'indexSize', 'not-a-number'),
        /需为数字/,
        '非法输入被拒绝'
    );
    assert.equal(registry.getPluginSettings('rph-demo').indexSize, 1000, '被拒后保持原值');
    await assert.rejects(() => registry.setPluginSetting('rph-demo', 'unknown', 1), /没有设置项/);
});

test('registry: 持久化失败不阻塞内存态，重复注册被拒绝', async () => {
    const failingStorage = { get: async () => null, set: async () => { throw new Error('disk full'); } };
    const registry = createPluginRegistry({ storage: failingStorage, logger: { warn() {} } });
    await registry.register(makeToolPlugin());
    await registry.setEnabled('rph-demo', false);
    assert.equal(registry.isEnabled('rph-demo'), false, '写盘失败时改动仍在内存生效');

    await assert.rejects(() => registry.register(makeToolPlugin()), /重复注册/);
});

test('registry: onChange 在注册与启停时触发', async () => {
    const registry = createPluginRegistry({ storage: makeStorage() });
    let changes = 0;
    registry.onChange(() => { changes++; });
    await registry.register(makeToolPlugin());
    await registry.setEnabled('rph-demo', false);
    assert.equal(changes, 2);
});
