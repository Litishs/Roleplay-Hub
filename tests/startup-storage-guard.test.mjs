import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ref, reactive, watch, nextTick } from 'vue';
import { useDataLoader } from '../src/composables/useDataLoader.mjs';

const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = app.indexOf(start);
    const to = app.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    return app.slice(from, to);
};

function fixture() {
    const writes = [];
    const pending = [];
    let initCalls = 0;
    const context = vm.createContext({
        console: { warn() {}, error() {} },
        ref, reactive, watch,
        _dataLoaded: false, _dataLoadFailed: false, _initComplete: false,
        db: null, MAX_CONTEXT_SIZE: 1000000,
        characters: ref([]), settings: reactive({ model: '', apiProviderKeys: {} }),
        presets: ref([]), presetGroups: ref([]), presetDefinitionsVersionApplied: ref(0),
        deletedDefaultPresetNames: ref([]), regexScripts: ref([]), globalRegexScripts: ref([]),
        worldInfo: ref([]), globalWorldInfo: ref([]), globalUiTemplates: ref([]),
        activeTools: ref([]), user: reactive({ name: 'default' }), userProfiles: ref([]),
        activeProfileId: ref(null), recentGenerationTimes: ref([]),
        worldInfoSettings: reactive({}), currentCharacterIndex: ref(-1),
        normalizeActiveToolAggressivenessSettings() {},
        normalizeActiveTools: () => context.activeTools.value,
        persistNativeMediaAssets: async () => {},
        saveMemorySettingsNow: async () => {}, saveMemoriesNow: async () => {},
        saveClassicMemoriesNow: async () => {},
        initDB: async () => { initCalls++; context.db = {}; },
        setStoredValue: async (key, value) => { writes.push({ key, value: JSON.parse(JSON.stringify(value)) }); },
        debounce: fn => () => pending.push(fn),
    });
    vm.runInContext(section('const saveData = async (options = {}) => {', 'const saveConversationMutationNow ='), context);
    vm.runInContext(section('const debouncedSave = debounce(() => {', '// Watch chat history length only'), context);
    return { context, writes, pending, initCalls: () => initCalls };
}

test('plugin state changes cannot save defaults while a startup dialog delays loading', async () => {
    const state = fixture();
    vm.runInContext('activeTools.value = [{ id: "synthetic-plugin" }]', state.context);
    await nextTick();
    assert.equal(state.pending.length, 1, 'startup plugin change schedules the real auto-save watcher');
    state.pending.shift()();
    await nextTick();
    assert.deepEqual(state.writes, [], 'no existing values or secrets may be replaced');
    assert.equal(state.initCalls(), 0, 'a skipped startup save does not open storage');
});

test('successful loading permits saving restored values without writing startup persona defaults', async () => {
    const state = fixture();
    state.context.characters.value = [{ uuid: 'saved-card', name: 'Saved card' }];
    state.context.settings.model = 'saved-model';
    state.context._dataLoaded = true;
    await vm.runInContext('saveData({ saveMemories: false })', state.context);
    assert.equal(state.initCalls(), 1);
    assert.equal(state.writes.find(row => row.key === 'characters').value[0].uuid, 'saved-card');
    assert.equal(state.writes.find(row => row.key === 'settings').value.model, 'saved-model');
    assert.ok(!state.writes.some(row => row.key === 'user' || row.key === 'user_profiles'));
});

test('a failed read keeps all persistence blocked', async () => {
    const state = fixture();
    state.context._dataLoaded = true;
    state.context._dataLoadFailed = true;
    await vm.runInContext('saveData()', state.context);
    assert.deepEqual(state.writes, []);
    assert.equal(state.initCalls(), 0);
});

test('startup initializes plugins only after successful data loading', () => {
    const lifecycle = app.slice(app.indexOf('onMounted(async () => {'));
    const loaded = lifecycle.indexOf('await loadData();');
    const failGuard = lifecycle.indexOf('if (_dataLoadFailed) return;');
    const ready = lifecycle.indexOf('_dataLoaded = true;');
    const plugins = lifecycle.indexOf('await initializePlugins()');
    assert.ok(loaded >= 0 && failGuard > loaded && ready > failGuard && plugins > ready);
    const scopeWatcher = app.indexOf('watch(() => getCurrentChatStorageScopeId()');
    assert.ok(app.indexOf('const { currentCharacter } = characterState;') < scopeWatcher,
        'the initial watcher getter must not access a temporal dead zone');
    const warmup = section('const schedulePluginWarmup = () => {', 'const unwrapForStorage =');
    assert.ok(warmup.indexOf('if (!_dataLoaded || _dataLoadFailed) return;') < warmup.indexOf('setTimeout('));
});

test('real storage parsing failures block loader hydration and pending autosaves', async () => {
    const repositorySource = await readFile(new URL('../src/modules/storage-repository.mjs', import.meta.url), 'utf8');
    for (const [key, raw] of [
        ['rp_hub_characters', '[{"uuid":"saved-card",'],
        ['rp_hub_characters', '{}'],
        ['rp_hub_settings', '{broken'],
        ['rp_hub_memory_settings', 'null'],
    ]) {
        const state = fixture();
        const kv = new Map([[key, raw], ['rp_hub_presets', '[{"name":"Saved preset"}]']]);
        const nativeWrites = [];
        const plugin = {
            init: async () => {},
            kvGet: async ({ key }) => ({ json: kv.get(key) ?? null }),
            kvSet: async ({ key, json }) => { nativeWrites.push(key); kv.set(key, json); },
            secretGet: async () => ({ value: null }),
            secretSet: async () => { nativeWrites.push('secret'); },
        };
        const repositoryContext = vm.createContext({ window: { Capacitor: { Plugins: { NativeStorage: plugin } } }, console: { error() {}, warn() {} } });
        vm.runInContext(repositorySource.replace('export { RPHStorage };', 'globalThis.repository = RPHStorage;'), repositoryContext);
        const repository = repositoryContext.repository;
        state.context.initDB = async () => { await repository.init(); state.context.db = repository; };
        state.context.setStoredValue = (name, value) => repository.set(`rp_hub_${name}`, value);
        const loader = useDataLoader({
            ...state.context,
            initDB: state.context.initDB,
            getStoredValue: name => repository.get(`rp_hub_${name}`),
            setStoredValue: state.context.setStoredValue,
            setDataLoadFailed: value => { state.context._dataLoadFailed = value; },
            showToast: message => { state.context.errorToast = message; },
        });
        await loader.loadData();
        assert.equal(state.context._dataLoadFailed, true);
        assert.equal(state.context._dataLoaded, false);
        assert.equal(state.context.errorToast, '读取本地数据失败，已停止自动保存，请勿清除数据');
        state.context.activeTools.value = [{ id: 'synthetic-plugin' }];
        await nextTick();
        state.pending.forEach(callback => callback());
        await vm.runInContext('saveData()', state.context);
        assert.deepEqual(nativeWrites, []);
        assert.equal(kv.get(key), raw, 'the unread source must remain byte-for-byte intact');
        assert.equal(kv.get('rp_hub_presets'), '[{"name":"Saved preset"}]');
    }
});
