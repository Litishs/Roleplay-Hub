// Contract tests for the Phase 2 composables extraction pattern.
//
// Locks the pattern established by the pilot extraction (useMemorySystem):
// - Domain state lives in src/composables/*.mjs, created and returned by a
//   single composable function; the composable holds NO business logic.
// - app.mjs imports the composable, calls it exactly once in setup(), and
//   destructures the returned properties at the original declaration sites
//   so every identifier keeps its previous name (provide("appContext") and
//   window.__RPH__ ctx contract unchanged).
// - Mutable module-level guards are destructured with `let` so existing
//   reassignment sites keep working.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ref, isRef, isReactive } from 'vue';

const app = (await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const memoryState = (await readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const worldInfoState = (await readFile(new URL('../src/composables/useWorldInfo.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

test('useMemorySystem composable exists and is pure state', () => {
    assert.ok(memoryState.includes("import { ref, reactive } from 'vue';"), 'imports vue reactivity');
    assert.ok(memoryState.includes('export function useMemorySystem()'), 'named export');
    // pure state holder: no business logic allowed
    assert.ok(!memoryState.includes('fetch('), 'no network calls');
    assert.ok(!memoryState.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!memoryState.includes('saveData('), 'no persistence logic');
});

test('app.mjs wires useMemorySystem with single call and site destructuring', () => {
    assert.ok(app.includes("import { useMemorySystem } from '../composables/useMemorySystem.mjs';"), 'import');
    assert.equal(app.split('useMemorySystem()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const memorySystemState = useMemorySystem();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { showNoMemoryNeededModal } = memorySystemState;'));
    assert.ok(app.includes('const { showMemorySettings } = memorySystemState;'));
    assert.ok(app.includes('memorySettings,'));
    assert.ok(app.includes('const {\n            memoryFacts,'));
    // mutable guards use let-destructuring
    assert.ok(app.includes('let {\n            _summaryInFlight,'));
    assert.ok(app.includes('let {\n            _factExtractAbort,'));
});

test('app.mjs no longer declares memory state inline', () => {
    assert.ok(!app.includes('const memories = ref('), 'memories moved to composable');
    assert.ok(!app.includes('const memorySettings = reactive('), 'memorySettings moved to composable');
    assert.ok(!app.includes('const memoryFacts = ref('), 'memoryFacts moved to composable');
    assert.ok(!app.includes('const showMemorySettings = ref('), 'panel flag moved to composable');
    // general data-load guards stay in app.mjs (not memory domain)
    assert.ok(app.includes('let _initComplete = false;'));
    assert.ok(app.includes('let _dataLoadFailed = false;'));
    assert.ok(app.includes('let _isApplyingCharacterScopedData = false;'));
});

test('useMemorySystem returns live reactive state (runtime)', async () => {
    const { useMemorySystem } = await import('../src/composables/useMemorySystem.mjs');
    const state = useMemorySystem();
    // a second call must return an independent instance (no module-level shared state)
    const other = useMemorySystem();
    assert.notEqual(state.memories, other.memories, 'independent instances per call');

    assert.ok(isRef(state.memories) && Array.isArray(state.memories.value));
    assert.ok(isReactive(state.memorySettings), 'memorySettings is reactive');
    assert.equal(state.memorySettings.enabled, false);
    assert.equal(state.memorySettings.mode, 'vector');
    assert.equal(state.memorySettings.embeddingBackend, 'api');
    assert.equal(state.memorySettings.keepFloors, 16);
    assert.equal(state.memorySettings.summaryBatchSize, 12);
    assert.equal(state.memorySettings.vectorTopK, 10);
    assert.equal(state.memorySettings.similarityThreshold, 50);
    assert.equal(state.memorySettings.defaultDepth, 1);
    assert.equal(state.memorySettings.localEmbeddingModel, 'bge-small-zh-v1.5');

    for (const key of [
        'classicMemories', 'classicMemoryPage', 'memorySummaries', 'memoryProfile',
        'summaryProgress', 'sliceBuildStatus', 'memoryGraphView', 'showNoMemoryNeededModal',
        'showMemorySettings', 'memoryFacts', 'factBaselineStatus', 'factShowRecycleBin',
        'MEMORY_VECTOR_BATCH_SIZE', 'LIST_PAGE_SIZE', 'MEMORY_MODE_VECTOR',
        'MIN_CONTEXT_FLOORS', 'SUMMARY_BATCH_SIZE_DEFAULT'
    ]) {
        assert.ok(key in state, `exposes ${key}`);
    }
    assert.equal(state.MEMORY_VECTOR_BATCH_SIZE, 16);
    assert.equal(state.LIST_PAGE_SIZE, 10);
    assert.equal(state.MEMORY_MODE_VECTOR, 'vector');
    assert.ok(isRef(state.memoryFacts) && Array.isArray(state.memoryFacts.value));
});

test('useWorldInfo composable exists and is pure state', () => {
    assert.ok(worldInfoState.includes("import { ref, reactive } from 'vue';"), 'imports vue reactivity');
    assert.ok(worldInfoState.includes('export function useWorldInfo()'), 'named export');
    assert.ok(!worldInfoState.includes('fetch('), 'no network calls');
    assert.ok(!worldInfoState.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!worldInfoState.includes('saveData('), 'no persistence logic');
});

test('app.mjs wires useWorldInfo with single call and site destructuring', () => {
    assert.ok(app.includes("import { useWorldInfo } from '../composables/useWorldInfo.mjs';"), 'import');
    assert.equal(app.split('useWorldInfo()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const worldInfoState = useWorldInfo();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { systemWorldInfoNames } = worldInfoState;'));
    assert.ok(app.includes('const { showWorldInfoEditor } = worldInfoState;'));
    assert.ok(app.includes('const { worldInfoPositionOptions } = worldInfoState;'));
    assert.ok(app.includes('const { globalWorldInfo, worldInfo } = worldInfoState;'));
    assert.ok(app.includes('const { showWorldInfoSettings } = worldInfoState;'));
    assert.ok(app.includes('const { worldInfoSettings } = worldInfoState;'));
    assert.ok(app.includes('const { editingWorldInfo, worldInfoKeysText } = worldInfoState;'));
    assert.ok(app.includes('const { currentHoverWorldInfo } = worldInfoState;'));
    // chat-context trigger records and data-IO export type stay in app.mjs
    assert.ok(app.includes('const lastTriggeredWorldInfos = ref([]);'));
    assert.ok(app.match(/const exportType = ref\(null\);/));
});

test('app.mjs no longer declares world info state inline', () => {
    assert.ok(!app.includes('const worldInfo = ref('), 'worldInfo moved to composable');
    assert.ok(!app.includes('const globalWorldInfo = ref('), 'globalWorldInfo moved to composable');
    assert.ok(!app.includes('const worldInfoSettings = reactive('), 'worldInfoSettings moved to composable');
    assert.ok(!app.includes('const editingWorldInfo = reactive('), 'editingWorldInfo moved to composable');
    assert.ok(!app.includes("const systemWorldInfoNames = ['自动生图'];"), 'system names moved to composable');
    assert.ok(!app.includes('const currentHoverWorldInfo = ref('), 'hover state moved to composable');
});

test('useWorldInfo returns live reactive state (runtime)', async () => {
    const { useWorldInfo } = await import('../src/composables/useWorldInfo.mjs');
    const state = useWorldInfo();
    const other = useWorldInfo();
    assert.notEqual(state.worldInfo, other.worldInfo, 'independent instances per call');

    assert.ok(isRef(state.worldInfo) && Array.isArray(state.worldInfo.value));
    assert.ok(isRef(state.globalWorldInfo) && Array.isArray(state.globalWorldInfo.value));
    assert.ok(isReactive(state.worldInfoSettings), 'worldInfoSettings is reactive');
    assert.equal(state.worldInfoSettings.scanDepth, 2);
    assert.equal(state.worldInfoSettings.maxDepth, 0);
    assert.ok(isReactive(state.editingWorldInfo), 'editingWorldInfo is reactive');
    assert.deepEqual(state.systemWorldInfoNames, ['自动生图']);
    assert.equal(state.worldInfoPositionOptions.length, 7);
    assert.ok(state.worldInfoPositionOptions.every(opt => 'group' in opt && 'value' in opt && 'label' in opt));

    for (const key of [
        'showWorldInfoEditor', 'showWorldInfoSettings', 'worldInfoKeysText',
        'currentHoverWorldInfo'
    ]) {
        assert.ok(isRef(state[key]), `exposes ref ${key}`);
    }
});
