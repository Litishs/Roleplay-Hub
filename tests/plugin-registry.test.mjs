// Plugin framework tests: manifest validation (plugin-api) + registry
// behavior (plugin-registry). Storage is an in-memory fake driving the
// persistence path; one file covers the full lifecycle of
// "register → enable/disable → settings → tool contributions → execution gate".
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

test('definePlugin: valid manifest passes frozen, invalid fields rejected one by one', () => {
    const plugin = definePlugin(baseManifest);
    assert.equal(plugin.id, 'rph-demo');
    assert.equal(plugin.builtin, true);
    assert.ok(Object.isFrozen(plugin), 'manifest should be frozen');
    assert.throws(() => { plugin.version = '9.9.9'; }, TypeError, 'frozen manifest must not be writable');

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

test('registry: register, default-on, enable/disable persisted and restored across instances', async () => {
    const storage = makeStorage();
    const registry = createPluginRegistry({ storage });
    await registry.register(makeToolPlugin());

    assert.equal(registry.list().length, 1);
    assert.equal(registry.isEnabled('rph-demo'), true, 'defaultEnabled: true works out of the box');
    assert.deepEqual(storage.store.get(PLUGIN_STATE_STORAGE_KEY)?.enabled, {}, 'no record written without an explicit toggle');

    await registry.setEnabled('rph-demo', false);
    assert.equal(registry.isEnabled('rph-demo'), false);
    assert.equal(storage.store.get(PLUGIN_STATE_STORAGE_KEY)?.enabled['rph-demo'], false);

    // A new instance restores the user's choice from the same storage
    const second = createPluginRegistry({ storage });
    await second.register(makeToolPlugin());
    assert.equal(second.isEnabled('rph-demo'), false, 'explicit disable wins over defaultEnabled');
});

test('registry: tool contributions only from enabled plugins, execution gated after disable', async () => {
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

test('registry: per-plugin settings merge defaults and clamp numbers', async () => {
    const registry = createPluginRegistry({ storage: makeStorage() });
    await registry.register(makeToolPlugin({
        settings: [{ key: 'indexSize', label: '索引', type: 'number', default: 200, min: 50, max: 1000 }]
    }));

    assert.deepEqual(registry.getPluginSettings('rph-demo'), { indexSize: 200 });
    await registry.setPluginSetting('rph-demo', 'indexSize', 9999);
    assert.equal(registry.getPluginSettings('rph-demo').indexSize, 1000, 'values beyond the cap are clamped');
    await assert.rejects(
        () => registry.setPluginSetting('rph-demo', 'indexSize', 'not-a-number'),
        /需为数字/,
        'invalid input is rejected'
    );
    assert.equal(registry.getPluginSettings('rph-demo').indexSize, 1000, 'value unchanged after a rejected write');
    await assert.rejects(() => registry.setPluginSetting('rph-demo', 'unknown', 1), /没有设置项/);
});

test('registry: persistence failure never blocks in-memory state, duplicate registration rejected', async () => {
    const failingStorage = { get: async () => null, set: async () => { throw new Error('disk full'); } };
    const registry = createPluginRegistry({ storage: failingStorage, logger: { warn() {} } });
    await registry.register(makeToolPlugin());
    await registry.setEnabled('rph-demo', false);
    assert.equal(registry.isEnabled('rph-demo'), false, 'changes still apply in memory when writes fail');

    await assert.rejects(() => registry.register(makeToolPlugin()), /重复注册/);
});

test('registry: onChange fires on registration and enable/disable', async () => {
    const registry = createPluginRegistry({ storage: makeStorage() });
    let changes = 0;
    registry.onChange(() => { changes++; });
    await registry.register(makeToolPlugin());
    await registry.setEnabled('rph-demo', false);
    assert.equal(changes, 2);
});
