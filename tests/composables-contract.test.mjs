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
const characterSource = (await readFile(new URL('../src/composables/useCharacterState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const uiStateSource = (await readFile(new URL('../src/composables/useUiState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const settingsStateSource = (await readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

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

test('useCharacterState composable exists and is pure state', () => {
    assert.ok(characterSource.includes("import { ref, reactive, computed } from 'vue';"), 'imports vue reactivity');
    assert.ok(characterSource.includes('export function useCharacterState()'), 'named export');
    assert.ok(!characterSource.includes('fetch('), 'no network calls');
    assert.ok(!characterSource.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!characterSource.includes('saveData('), 'no persistence logic');
});

test('app.mjs wires useCharacterState with single call and site destructuring', () => {
    assert.ok(app.includes("import { useCharacterState } from '../composables/useCharacterState.mjs';"), 'import');
    assert.equal(app.split('useCharacterState()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const characterState = useCharacterState();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { showCharacterEditor } = characterState;'));
    assert.ok(app.includes('const { characterDisplayLimit } = characterState;'));
    assert.ok(app.includes('const { characterSearchQuery } = characterState;'));
    assert.ok(app.includes('const { characters, showAddCharacterMenu, currentCharacterIndex } = characterState;'));
    assert.ok(app.includes('const { lastActiveCharacterId } = characterState;'));
    assert.ok(app.includes('const { editingCharacter, editorTab, isBatchDeleteMode, selectedCharacterIndices } = characterState;'));
    assert.ok(app.includes('const { showCharacterExportModal, characterToExportIndex } = characterState;'));
    assert.ok(app.includes('const { currentCharacter } = characterState;'));
    assert.ok(app.includes('const { getCharacterFavoriteTime, isCharacterFavorite, filteredCharacters, displayedCharacters, loadMoreCharacters } = characterState;'));
});

test('app.mjs no longer declares character state inline', () => {
    assert.ok(!app.includes('const characters = ref('), 'characters moved to composable');
    assert.ok(!app.includes('const currentCharacter = computed('), 'currentCharacter moved to composable');
    assert.ok(!app.includes('const filteredCharacters = computed('), 'filteredCharacters moved to composable');
    assert.ok(!app.includes('const editingCharacter = reactive('), 'editingCharacter moved to composable');
    assert.ok(!app.includes('const characterSearchQuery = ref('), 'search query moved to composable');
    assert.ok(!app.includes('const showCharacterEditor = ref('), 'editor flag moved to composable');
});

test('useCharacterState returns live reactive state (runtime)', async () => {
    const { useCharacterState } = await import('../src/composables/useCharacterState.mjs');
    const state = useCharacterState();
    const other = useCharacterState();
    assert.notEqual(state.characters, other.characters, 'independent instances per call');

    assert.ok(isRef(state.characters) && Array.isArray(state.characters.value));
    assert.equal(state.currentCharacterIndex.value, -1);
    assert.equal(state.currentCharacter.value, null, 'no character selected initially');
    assert.ok(isReactive(state.editingCharacter), 'editingCharacter is reactive');
    assert.ok(state.selectedCharacterIndices.value instanceof Set);
    assert.equal(state.editorTab.value, 'basic');
    assert.equal(state.characterDisplayLimit.value, 8);

    // derived state reacts to collection mutations
    state.characters.value = [
        { uuid: 'a', name: 'Beta', favoriteAt: 0, createdAt: 1 },
        { uuid: 'b', name: 'Alpha', favoriteAt: 5, createdAt: 2 }
    ];
    assert.equal(state.currentCharacterIndex.value, -1);
    state.currentCharacterIndex.value = 0;
    assert.equal(state.currentCharacter.value.name, 'Beta');
    assert.equal(state.filteredCharacters.value[0].uuid, 'b', 'favorite sorts first');
    assert.equal(state.filteredCharacters.value[0].originalIndex, 1, 'original index preserved');
    state.characterSearchQuery.value = 'alpha';
    assert.equal(state.filteredCharacters.value.length, 1);
    assert.equal(state.displayedCharacters.value.length, 1);
    state.characterSearchQuery.value = '';
    assert.equal(state.displayedCharacters.value.length, 2);
    state.loadMoreCharacters();
    assert.equal(state.characterDisplayLimit.value, 16);
    assert.equal(state.isCharacterFavorite(state.characters.value[1]), true);
    assert.equal(state.getCharacterFavoriteTime(state.characters.value[0]), 0);
});

test('useUiState composable exists and is pure state', () => {
    assert.ok(uiStateSource.includes("import { ref, reactive } from 'vue';"), 'imports vue reactivity');
    assert.ok(uiStateSource.includes('export function useUiState()'), 'named export');
    assert.ok(!uiStateSource.includes('fetch('), 'no network calls');
    assert.ok(!uiStateSource.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!uiStateSource.includes('saveData('), 'no persistence logic');
});

test('app.mjs wires useUiState with single call and site destructuring', () => {
    assert.ok(app.includes("import { useUiState } from '../composables/useUiState.mjs';"), 'import');
    assert.equal(app.split('useUiState()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const uiState = useUiState();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { globalConfirmModal, showVueConfirmModal } = uiState;'));
    assert.ok(app.includes('const { showAuthorNoticeModal, showConfirmModal, confirmMessage, confirmCallback } = uiState;'));
    assert.ok(app.includes('const { toasts } = uiState;'));
    assert.ok(app.includes('const { showInstructionPanel } = uiState;'));
    assert.ok(app.includes('const { showContextViewerModal } = uiState;'));
    assert.ok(app.includes('const { quotaValue, quotaLoading, quotaError, backupInProgress } = uiState;'));
    // mutable non-reactive guards use let-destructuring
    assert.ok(app.includes('let { isMobileSidebarOpen, nativeAppStateListener, nativeBackButtonListener } = uiState;'));
    assert.ok(app.includes('let { uiTemplateUpdateSeq, uiTemplateUpdateAbortController } = uiState;'));
    assert.ok(app.includes('let { toastIdSeed } = uiState;'));
    // active-tool pipeline contexts stay in app.mjs (not UI shell domain)
    assert.ok(app.includes('const pendingActiveToolContext = ref('));
    assert.ok(app.includes('const activeToolResultContexts = ref('));
    // check/update logic stays in app.mjs while display state moved
    assert.ok(app.includes('const checkForUpdates = async (showResult = true) => {'));
    assert.ok(app.includes('const downloadAndInstallUpdate = async (maxRetries = 2) => {'));
});

test('app.mjs no longer declares UI shell state inline', () => {
    assert.ok(!app.includes('const globalConfirmModal = ref('), 'globalConfirmModal moved to composable');
    assert.ok(!app.includes('const currentView = ref('), 'currentView moved to composable');
    assert.ok(!app.includes('const isSidebarCollapsed = ref('), 'sidebar flag moved to composable');
    assert.ok(!app.includes('const uiTemplateUpdateStatus = reactive('), 'template status moved to composable');
    assert.ok(!app.includes('const tempUserSetup = reactive('), 'user setup draft moved to composable');
    assert.ok(!app.includes('const toasts = ref('), 'toasts moved to composable');
    assert.ok(!app.includes('const updateAvailable = ref('), 'update state moved to composable');
    assert.ok(!app.includes('const showAuthorNoticeModal = ref('), 'notice flag moved to composable');
    assert.ok(!app.includes('const showInstructionPanel = ref('), 'instruction panel flag moved to composable');
});

test('useUiState returns live reactive state (runtime)', async () => {
    const { useUiState } = await import('../src/composables/useUiState.mjs');
    const state = useUiState();
    const other = useUiState();
    assert.notEqual(state.globalConfirmModal, other.globalConfirmModal, 'independent instances per call');

    assert.equal(state.currentView.value, 'chat');
    assert.equal(state.isSidebarCollapsed.value, false);
    assert.ok(isReactive(state.uiTemplateUpdateStatus), 'uiTemplateUpdateStatus is reactive');
    assert.equal(state.uiTemplateUpdateStatus.state, 'idle');
    assert.ok(isReactive(state.tempUserSetup), 'tempUserSetup is reactive');
    assert.equal(state.tempUserSetup.person, 'second');
    assert.ok(state.toasts.value instanceof Array);

    for (const key of [
        'appVersionName', 'appVersionCode', 'isAdvancedNavOpen', 'showModelSelector',
        'showPresetEditor', 'showUiTemplateEditor', 'showRegexEditor', 'showUserSetupModal',
        'quotaValue', 'backupInProgress', 'updateAvailable', 'downloadingUpdate',
        'showConfirmModal', 'confirmMessage', 'confirmCallback'
    ]) {
        assert.ok(isRef(state[key]), `exposes ref ${key}`);
    }

    // toggleAdvancedNav flips only the advanced-nav flag
    state.isSidebarCollapsed.value = false;
    state.toggleAdvancedNav();
    assert.equal(state.isAdvancedNavOpen.value, true);
    state.toggleAdvancedNav();
    assert.equal(state.isAdvancedNavOpen.value, false);

    // showVueConfirmModal resolves through the shared modal ref
    const pending = state.showVueConfirmModal('t', 'm');
    assert.equal(state.globalConfirmModal.value.show, true);
    assert.equal(state.globalConfirmModal.value.title, 't');
    state.globalConfirmModal.value.onConfirm();
    assert.equal(await pending, true);
    assert.equal(state.globalConfirmModal.value.show, false);

    // syncUserSetupName reads INPUT targets into the draft
    state.syncUserSetupName({ target: { tagName: 'INPUT', value: '阿明' } });
    assert.equal(state.tempUserSetup.name, '阿明');
});

test('useSettingsState composable exists and is pure state', () => {
    assert.ok(settingsStateSource.includes("import { ref, reactive } from 'vue';"), 'imports vue reactivity');
    assert.ok(settingsStateSource.includes('export function useSettingsState()'), 'named export');
    assert.ok(!settingsStateSource.includes('fetch('), 'no network calls');
    assert.ok(!settingsStateSource.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!settingsStateSource.includes('saveData('), 'no persistence logic');
    assert.ok(!settingsStateSource.includes('document.documentElement'), 'no DOM application (stays in app.mjs)');
});

test('app.mjs wires useSettingsState with single call and site destructuring', () => {
    assert.ok(app.includes("import { useSettingsState } from '../composables/useSettingsState.mjs';"), 'import');
    assert.equal(app.split('useSettingsState()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const settingsState = useSettingsState();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { user } = settingsState;'));
    assert.ok(app.includes('const { userProfiles, activeProfileId, showProfileDropdown } = settingsState;'));
    assert.ok(app.includes('const { normalizeFontFamily } = settingsState;'));
    assert.ok(app.includes('const { THEME_MODES, normalizeThemeMode, themeMedia, resolveTheme } = settingsState;'));
    assert.ok(app.includes('const { settingsHelpTopic } = settingsState;'));
    assert.ok(app.includes('const { settingsSectionsOpen } = settingsState;'));
    // theme/font DOM application and token estimation stay in app.mjs
    assert.ok(app.includes('const applyTheme = () => {'));
    assert.ok(app.includes('const applyFontFamily = (value) => {'));
    assert.ok(app.includes('const estimateTokens = (text) => {'));
});

test('app.mjs no longer declares settings state inline', () => {
    assert.ok(!app.includes('const settings = reactive('), 'settings moved to composable');
    assert.ok(!app.includes('const user = reactive('), 'user persona moved to composable');
    assert.ok(!app.includes('const userProfiles = ref('), 'profiles moved to composable');
    assert.ok(!app.includes('const MAX_CONTEXT_SIZE = 1000000;'), 'context constants moved to composable');
    assert.ok(!app.includes("const DEFAULT_API_PROVIDER_ID = 'deepseek';"), 'API defaults moved to composable');
    assert.ok(!app.includes("const THEME_MODES = ['system', 'light', 'dark'];"), 'theme constants moved to composable');
    assert.ok(!app.includes('const settingsSectionsOpen = reactive('), 'accordion state moved to composable');
});

test('useSettingsState returns live reactive state (runtime)', async () => {
    // the composable reads window.innerWidth/matchMedia for defaults; stub for Node
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = { innerWidth: 1024, matchMedia: () => ({ matches: false }) };
    }
    const { useSettingsState } = await import('../src/composables/useSettingsState.mjs');
    const state = useSettingsState();
    const other = useSettingsState();
    assert.notEqual(state.settings, other.settings, 'independent instances per call');

    assert.ok(isReactive(state.settings), 'settings is reactive');
    assert.ok(isReactive(state.user), 'user is reactive');
    assert.equal(state.user.person, 'second');
    assert.equal(state.settings.themeMode, 'system');
    assert.equal(state.settings.contextTokenBudget, 26000);
    assert.equal(state.MAX_CONTEXT_SIZE, 1000000);
    assert.equal(state.CONTEXT_TOKEN_BUDGET_MIN, 8000);
    assert.equal(state.CONTEXT_TOKEN_BUDGET_MAX, 64000);
    assert.equal(state.DEFAULT_API_PROVIDER_ID, 'deepseek');
    assert.equal(state.DEFAULT_API_CONFIG.apiUrl, 'https://api.deepseek.com/v1');
    assert.ok(isRef(state.userProfiles) && Array.isArray(state.userProfiles.value));
    assert.ok(isRef(state.activeProfileId) && state.activeProfileId.value === null);
    assert.ok(isReactive(state.settingsSectionsOpen), 'settingsSectionsOpen is reactive');
    assert.equal(state.settingsSectionsOpen.user, false);

    // budget getters clamp to the locked ranges
    state.settings.contextTokenBudget = 1;
    assert.equal(state.getContextTokenBudget(), state.CONTEXT_TOKEN_BUDGET_MIN);
    state.settings.contextTokenBudget = 0;
    assert.equal(state.getContextTokenBudget(), 0);
    state.settings.maxOutputTokens = 999999;
    assert.equal(state.getMaxOutputTokens(), 8192);
    state.settings.worldInfoTokenBudget = 999999;
    assert.equal(state.getWorldInfoTokenBudget(), 16000);

    // theme resolution follows the mode
    assert.equal(state.normalizeThemeMode('bogus'), 'system');
    state.settings.themeMode = 'dark';
    assert.equal(state.resolveTheme(), 'dark');
    assert.equal(state.normalizeFontFamily('bogus'), 'modern');
    assert.equal(state.themeModeOptions.length, 3);
    assert.equal(state.imageStyleOptions.length, 7);
    assert.equal(state.imageSizeOptions.length, 9);
    assert.equal(state.imageGenCountOptions.length, 6);
});
