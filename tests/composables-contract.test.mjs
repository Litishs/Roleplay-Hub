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
const utilsSource = (await readFile(new URL('../src/modules/utils.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const memoryState = (await readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const worldInfoState = (await readFile(new URL('../src/composables/useWorldInfo.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const characterSource = (await readFile(new URL('../src/composables/useCharacterState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const uiStateSource = (await readFile(new URL('../src/composables/useUiState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const settingsStateSource = (await readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const apiConfigSource = (await readFile(new URL('../src/composables/useApiConfig.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const chatStateSource = (await readFile(new URL('../src/composables/useChatState.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const senderSource = (await readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const rendererSource = (await readFile(new URL('../src/composables/useTemplateRenderer.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const cardOpsSource = (await readFile(new URL('../src/composables/useCardOperations.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const dataIoSource = (await readFile(new URL('../src/composables/useDataIO.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const backupRestoreSource = (await readFile(new URL('../src/composables/useBackupRestore.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const dataLoaderSource = (await readFile(new URL('../src/composables/useDataLoader.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const pipelineSource = (await readFile(new URL('../src/composables/useUiTemplatePipeline.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const activeToolPipelineSource = (await readFile(new URL('../src/composables/useActiveToolPipeline.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const specialRulesSource = (await readFile(new URL('../src/composables/useSpecialRules.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const vectorPatrolSource = (await readFile(new URL('../src/composables/useVectorMemoryPatrol.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const rollingSummarySource = (await readFile(new URL('../src/composables/useRollingSummary.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const regexPipelineSource = (await readFile(new URL('../src/composables/useRegexPipeline.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const branchingSource = (await readFile(new URL('../src/composables/useStoryBranching.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

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
    // data-IO export type moved to useDataIO (Phase 2.2); chat-context trigger
    // records moved to useChatState (locked in the useChatState wiring test)
    assert.ok(!app.includes('const exportType = ref(null);'), 'exportType moved to useDataIO');
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
    assert.ok(app.includes('let { toastIdSeed } = uiState;'));
    // UI template run lifecycle guards moved to useUiTemplatePipeline (Phase 3.0)
    assert.ok(!uiStateSource.includes('let uiTemplateUpdateSeq'), 'seq guard moved to pipeline');
    assert.ok(!uiStateSource.includes('let uiTemplateUpdateAbortController'), 'abort guard moved to pipeline');
    // active-tool pipeline contexts moved to useChatState (locked in the
    // useChatState wiring test)
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
        'showConfirmModal', 'confirmMessage', 'confirmCallback', 'releaseNotesModal'
    ]) {
        assert.ok(isRef(state[key]), `exposes ref ${key}`);
    }

    // release-notes modal helper resolves through the shared ref like the confirm modal
    const notesPending = state.showReleaseNotesModal('1.0', '2.0', '<p>notes</p>');
    assert.equal(state.releaseNotesModal.value.show, true);
    assert.equal(state.releaseNotesModal.value.currentVersion, '1.0');
    assert.equal(state.releaseNotesModal.value.latestVersion, '2.0');
    assert.equal(state.releaseNotesModal.value.html, '<p>notes</p>');
    state.releaseNotesModal.value.onConfirm();
    assert.equal(await notesPending, true);
    assert.equal(state.releaseNotesModal.value.show, false);

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
    // theme/font DOM application stays in app.mjs; token estimation moved to utils.mjs (Phase 2.3)
    assert.ok(app.includes('const applyTheme = () => {'));
    assert.ok(app.includes('const applyFontFamily = (value) => {'));
    assert.ok(utilsSource.includes('export const estimateTokens = (text) => {'));
    assert.ok(app.includes('estimateTokens'), 'app still references estimateTokens via import');
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

test('useApiConfig composable exists and is pure state', () => {
    assert.ok(apiConfigSource.includes("import { ref, reactive, computed } from 'vue';"), 'imports vue reactivity');
    assert.ok(apiConfigSource.includes('export function useApiConfig()'), 'named export');
    assert.ok(!apiConfigSource.includes('await fetch'), 'no network calls');
    assert.ok(!apiConfigSource.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!apiConfigSource.includes('saveData('), 'no persistence logic');
    assert.ok(!apiConfigSource.includes('settings.'), 'no settings access (settings-dependent logic stays in app.mjs)');
});

test('app.mjs wires useApiConfig with single call and site destructuring', () => {
    assert.ok(app.includes("import { useApiConfig } from '../composables/useApiConfig.mjs';"), 'import');
    assert.equal(app.split('useApiConfig()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const apiConfigState = useApiConfig();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { imageGenProviderOptions, getImageGenProviderById, imageGenUnavailable } = apiConfigState;'));
    assert.ok(app.includes('const { apiProviderOptions } = apiConfigState;'));
    assert.ok(app.includes('const { apiStatus, apiLatency, imageGenStatus, imageGenLatency } = apiConfigState;'));
    assert.ok(app.includes('const { apiKeyInput, apiKeyVisible, toggleApiKeyVisibility } = apiConfigState;'));
    assert.ok(app.includes('const { currentModelMode } = apiConfigState;'));
    // settings-dependent logic and computed stay in app.mjs
    assert.ok(app.includes('const selectedApiProviderId = ref(DEFAULT_API_PROVIDER_ID);'));
    assert.ok(app.includes('const syncCurrentApiKeyToProvider = () => {'));
    assert.ok(app.includes('const normalizeApiProviderSettings = () => {'));
    assert.ok(app.includes('const selectedApiProvider = computed(() => {'));
    assert.ok(app.includes('const fetchModelsForProvider = async (providerId, options = {}) => {'));
    assert.ok(app.includes('const modelMode = computed({'));
});

test('app.mjs no longer declares API config state inline', () => {
    assert.ok(!app.includes('const apiProviderOptions = ['), 'provider catalogue moved to composable');
    assert.ok(!app.includes('const apiStatus = ref('), 'connection status moved to composable');
    assert.ok(!app.includes('const availableModels = ref('), 'model list moved to composable');
    assert.ok(!app.includes('const providerModels = reactive('), 'provider models moved to composable');
    assert.ok(!app.includes('const customApiProviderOptions = ['), 'custom providers moved to composable');
    assert.ok(!app.includes("const currentModelMode = ref('quality');"), 'model mode moved to composable');
    assert.ok(!app.includes('const apiKeyVisible = ref('), 'key visibility moved to composable');
});

test('useApiConfig returns live reactive state (runtime)', async () => {
    const { useApiConfig } = await import('../src/composables/useApiConfig.mjs');
    const state = useApiConfig();
    const other = useApiConfig();
    assert.notEqual(state.availableModels, other.availableModels, 'independent instances per call');

    assert.equal(state.apiProviderOptions.length, 5);
    assert.ok(state.apiProviderOptions.every(p => 'id' in p && 'name' in p && 'apiUrl' in p));
    assert.equal(state.apiProviderOptions[0].id, 'deepseek');
    assert.equal(state.imageGenProviderOptions.length, 0, 'image gen extension point stays empty');
    assert.equal(state.imageGenUnavailable.value, true);
    assert.equal(state.apiStatus.value, 'unknown');
    assert.equal(state.imageGenStatus.value, 'unavailable');
    assert.equal(state.currentModelMode.value, 'quality');
    assert.equal(state.activeModelTag.value, 'all');
    assert.equal(state.popularModelFamilies.length, 8);
    assert.ok(isReactive(state.providerModels), 'providerModels is reactive');
    assert.ok(isRef(state.modelSearchQuery) && state.modelSearchQuery.value === '');
    assert.equal(state.isCustomApiProviderId('custom'), true);
    assert.equal(state.isCustomApiProviderId('custom2'), true);
    assert.equal(state.isCustomApiProviderId('deepseek'), false);
    assert.equal(state.getCustomApiUrlKey('custom2'), 'customApiUrl2');
    assert.equal(state.getCustomApiUrlKey('custom'), 'customApiUrl');
    assert.equal(state.getApiProviderById('zhipu').name, '智谱');
    assert.equal(state.getApiProviderById('nope'), undefined);
    assert.equal(state.getApiProviderByUrl('https://api.deepseek.com/v1/').id, 'deepseek', 'trailing slash normalized');
    assert.equal(state.getApiProviderByUrl('https://example.com'), undefined);
    assert.equal(state.customApiProviderOptions.length, 2);

    // toggleApiKeyVisibility flips the shared ref
    assert.equal(state.apiKeyVisible.value, false);
    state.toggleApiKeyVisibility();
    assert.equal(state.apiKeyVisible.value, true);
});

test('useChatState composable exists and is pure state', () => {
    assert.ok(chatStateSource.includes("import { ref, computed } from 'vue';"), 'imports vue reactivity');
    assert.ok(chatStateSource.includes("import { RPHRuntimePolicy } from '../modules/runtime-policy.mjs';"), 'imports runtime policy for render limits');
    assert.ok(chatStateSource.includes('export function useChatState()'), 'named export');
    assert.ok(!chatStateSource.includes('fetch('), 'no network calls');
    assert.ok(!chatStateSource.includes('watch('), 'no watchers (belong to app.mjs for now)');
    assert.ok(!chatStateSource.includes('saveData('), 'no persistence logic');
    assert.ok(!chatStateSource.includes('settings.'), 'no settings access');
});

test('app.mjs wires useChatState with single call and site destructuring', () => {
    assert.ok(app.includes("import { useChatState } from '../composables/useChatState.mjs';"), 'import');
    assert.equal(app.split('useChatState()').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const chatState = useChatState();'), 'state holder binding');
    // destructured at original declaration sites — identifiers keep previous names
    assert.ok(app.includes('const { pendingActiveToolContext, activeToolResultContexts } = chatState;'));
    assert.ok(app.includes('const { lastContextMessages, lastTriggeredWorldInfos, lastContextTotalLength } = chatState;'));
    assert.ok(app.includes('const { recentGenerationTimes, currentWaitTime, longPressTimer, estimatedGenerationTime } = chatState;'));
    // mutable non-reactive guards use let-destructuring
    assert.ok(app.includes('let { activeToolQueueAbortController } = chatState;'));
    assert.ok(app.includes('let { isLoadingEarlierChatMessages, isLoadingLaterChatMessages, isChatTopUnlockArmed } = chatState;'));
    assert.ok(app.includes('let { chatStatsTimer } = chatState;'));
    // waitTimer moved out of useChatState to useMessageSender (Phase 2.2):
    // every read/write of it lives inside the generation pipeline
    assert.ok(!app.includes('let { waitTimer } = chatState;'));
    assert.ok(!chatStateSource.includes('let waitTimer = null;'));
    // generation pipeline logic and tool-inline computeds stay in app.mjs
    assert.ok(app.includes('const sendMessage = async () => {'));
    assert.ok(app.includes('function hasActiveToolContinuationWork()'));
    assert.ok(app.includes('const hasActiveToolInlineWork = computed(() => {'));
    assert.ok(app.includes('const isConversationBusy = computed(() => isGenerating.value || isRemoteGenerating.value || hasActiveToolInlineWork.value);'));
});

test('app.mjs no longer declares chat state inline', () => {
    assert.ok(!app.includes('const chatHistory = ref('), 'chatHistory moved to composable');
    assert.ok(!app.includes('const isGenerating = ref('), 'generation flag moved to composable');
    assert.ok(!app.includes('const abortController = ref('), 'abort controller moved to composable');
    assert.ok(!app.includes('const userInput = ref('), 'input moved to composable');
    assert.ok(!app.includes('const chatContainer = ref('), 'container ref moved to composable');
    assert.ok(!app.includes('const isChatFullscreen = ref('), 'fullscreen flag moved to composable');
    assert.ok(!app.includes('const inputBox = ref('), 'input ref moved to composable');
    assert.ok(!app.includes('const chatRenderLimit = ref('), 'render window moved to composable');
    assert.ok(!app.includes('const lastContextMessages = ref('), 'context snapshot moved to composable');
    assert.ok(!app.includes('const currentWaitTime = ref('), 'wait time moved to composable');
    assert.ok(!app.includes('const estimatedGenerationTime = computed('), 'timer computed moved to composable');
});

test('useChatState returns live reactive state (runtime)', async () => {
    const { useChatState } = await import('../src/composables/useChatState.mjs');
    const state = useChatState();
    const other = useChatState();
    assert.notEqual(state.chatHistory, other.chatHistory, 'independent instances per call');

    assert.ok(isRef(state.chatHistory) && Array.isArray(state.chatHistory.value));
    assert.equal(state.isGenerating.value, false);
    assert.equal(state.userInput.value, '');
    assert.equal(state.isChatFullscreen.value, false);
    assert.equal(state.chatRenderLimit.value, 20, 'render limit defaults to runtime policy chatInitial');
    assert.equal(state.CHAT_RENDER_BATCH_SIZE, 10);
    assert.equal(state.CHAT_RENDER_MAX_LIMIT, 40);
    assert.equal(state.CHAT_ESTIMATED_MESSAGE_HEIGHT, 180);
    assert.equal(state.currentWaitTime.value, '0.0');
    assert.equal(state.pendingActiveToolContext.value, '');
    assert.ok(Array.isArray(state.activeToolResultContexts.value));
    assert.equal(state.estimatedGenerationTime.value, null);

    // derived computeds react to their domain state
    state.lastContextMessages.value = [{ content: 'hello' }, { content: 'world!' }];
    assert.equal(state.lastContextTotalLength.value, 11);
    state.recentGenerationTimes.value = [1000, 3000];
    assert.equal(state.estimatedGenerationTime.value, '2.0');

    for (const key of [
        'isRemoteGenerating', 'isReceiving', 'isThinking', 'activeToolHandoffPending',
        'chatContainer', 'inputBox', 'messageElements', 'chatRenderStart',
        'lastTriggeredWorldInfos', 'chatRoundStats', 'conversationBodyLength',
        'summaryCompressedBodyLength', 'longPressTimer', 'remoteEstimatedTime'
    ]) {
        assert.ok(isRef(state[key]), `exposes ref ${key}`);
    }
});

// --- useMessageSender (Phase 2, roadmap 2.2): chat generation pipeline ---

test('useMessageSender composable holds the chat generation pipeline', () => {
    assert.ok(senderSource.includes("import { nextTick, reactive } from 'vue';"), 'imports vue');
    assert.ok(senderSource.includes("import { create as createChatRequestGuard } from '../modules/chat-request-guard.mjs';"), 'imports the chat request guard');
    assert.ok(senderSource.includes('export function useMessageSender(deps)'), 'deps-injecting factory export');
    assert.ok(senderSource.includes('const generateResponseCore = async (startTime = null, options = {}) => {'), 'owns generateResponseCore');
    assert.ok(senderSource.includes('const generateResponse = async (startTime = null, options = {}) => {'), 'owns generateResponse');
    assert.ok(senderSource.includes('return { generateResponse };'), 'exposes only generateResponse');
    // chat request resilience policy moved along with the pipeline
    assert.ok(senderSource.includes('CHAT_FIRST_BYTE_TIMEOUT_MS = 60000'));
    assert.ok(senderSource.includes('const sleepChatRetry = (attempt) =>'));
    assert.ok(senderSource.includes('const truncateErrorMessage = (message, maxLength = 600) => {'));
    // waitTimer is private to the pipeline (all its uses moved here)
    assert.ok(senderSource.includes('let waitTimer = null;'));
});

test('app.mjs wires useMessageSender with a single deps call', () => {
    assert.ok(app.includes("import { useMessageSender } from '../composables/useMessageSender.mjs';"), 'import');
    assert.equal(app.split('useMessageSender(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { generateResponse } = useMessageSender({'), 'destructures generateResponse from deps call');
    // app.mjs keeps the send/regenerate/continuation call sites
    assert.ok(app.includes('const sendMessage = async () => {'));
    assert.ok(app.includes('await generateResponse(startTime);'));
});

test('app.mjs no longer declares the generation pipeline inline', () => {
    assert.ok(!app.includes('const generateResponseCore = async'), 'generateResponseCore moved to composable');
    assert.ok(!app.includes('CHAT_FIRST_BYTE_TIMEOUT_MS'), 'retry policy moved to composable');
    assert.ok(!app.includes('const truncateErrorMessage ='), 'error helpers moved to composable');
    assert.ok(!app.includes("import { create as createChatRequestGuard } from './chat-request-guard.mjs';"), 'guard import moved to composable');
});

test('useMessageSender returns callable generateResponse (runtime smoke)', async () => {
    const { useMessageSender } = await import('../src/composables/useMessageSender.mjs');
    const sender = useMessageSender({});
    const other = useMessageSender({});
    assert.equal(typeof sender.generateResponse, 'function');
    assert.notEqual(sender.generateResponse, other.generateResponse, 'independent closures per call');
});

// --- useTemplateRenderer (Phase 2, roadmap 2.2): markdown/template rendering ---

test('useTemplateRenderer composable holds the rendering pipeline', () => {
    assert.ok(rendererSource.includes("import { RPHRuntimePolicy } from '../modules/runtime-policy.mjs';"), 'imports runtime policy for render caches');
    assert.ok(rendererSource.includes("import { parseCot } from '../modules/utils.mjs';"), 'imports parseCot');
    assert.ok(rendererSource.includes('export function useTemplateRenderer(deps)'), 'deps-injecting factory export');
    assert.ok(rendererSource.includes('const renderMarkdownCache = new RPHRuntimePolicy.LruCache('), 'owns the render LRU cache');
    assert.ok(rendererSource.includes('const htmlFrameDetectionCache = new RPHRuntimePolicy.LruCache('), 'owns the frame detection cache');
    assert.ok(rendererSource.includes('const htmlBlockStartPattern = '), 'owns HTML block detection');
    assert.ok(rendererSource.includes('const contentUsesHtmlFrame = (text, role'), 'owns frame detection');
    assert.ok(rendererSource.includes('const messageUsesWideLayout = (msg) => {'), 'owns layout predicates');
    assert.ok(rendererSource.includes('const renderMarkdown = (text, role'), 'owns renderMarkdown');
    assert.ok(rendererSource.includes('const clearRenderCaches = () => {'), 'exposes cache clearing for the app.mjs watcher');
    assert.ok(rendererSource.includes('return { renderMarkdown, messageUsesWideLayout, clearRenderCaches };'), 'exposes exactly the three consumers need');
    // no watchers inside the composable (they stay in app.mjs for now)
    assert.ok(!rendererSource.includes('watch('), 'no watchers');
});

test('app.mjs wires useTemplateRenderer and keeps the cache-clear watcher', () => {
    assert.ok(app.includes("import { useTemplateRenderer } from '../composables/useTemplateRenderer.mjs';"), 'import');
    assert.equal(app.split('useTemplateRenderer(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { renderMarkdown, messageUsesWideLayout, clearRenderCaches } = useTemplateRenderer({'), 'destructures at the wiring site');
    // the invalidation watcher stays in app.mjs and calls the returned helper
    assert.ok(app.includes("watch(() => [settings.disableImages, regexScripts.value], () => {\n            clearRenderCaches();\n        }, { deep: true });"));
    // consumers (MessageList etc.) keep reading renderMarkdown/messageUsesWideLayout from ctx
    assert.ok(app.includes('renderMarkdown, messageUsesWideLayout, parseCot,'));
});

test('app.mjs no longer declares the rendering pipeline inline', () => {
    assert.ok(!app.includes('const renderMarkdown = (text, role'), 'renderMarkdown moved to composable');
    assert.ok(!app.includes('const renderMarkdownCache = new RPHRuntimePolicy.LruCache('), 'render cache moved to composable');
    assert.ok(!app.includes('const htmlBlockStartPattern = '), 'HTML block detection moved to composable');
    assert.ok(!app.includes('const messageUsesWideLayout = (msg) => {'), 'layout predicates moved to composable');
});

test('useTemplateRenderer returns callable members (runtime smoke)', async () => {
    const { useTemplateRenderer } = await import('../src/composables/useTemplateRenderer.mjs');
    const renderer = useTemplateRenderer({});
    const other = useTemplateRenderer({});
    assert.equal(typeof renderer.renderMarkdown, 'function');
    assert.equal(typeof renderer.messageUsesWideLayout, 'function');
    assert.equal(typeof renderer.clearRenderCaches, 'function');
    assert.notEqual(renderer.renderMarkdown, other.renderMarkdown, 'independent closures per call');
    assert.equal(renderer.messageUsesWideLayout(null), false, 'null guard works without deps');
});

// --- useCardOperations (Phase 2, roadmap 2.2): character card operations ---

test('useCardOperations composable holds the card CRUD/selection logic', () => {
    assert.ok(cardOpsSource.includes("import { generateUUID } from '../modules/utils.mjs';"), 'imports generateUUID');
    assert.ok(cardOpsSource.includes('export function useCardOperations(deps)'), 'deps-injecting factory export');
    assert.ok(cardOpsSource.includes('const createNewCharacter = () => {'), 'owns createNewCharacter');
    assert.ok(cardOpsSource.includes('const saveCharacter = () => {'), 'owns saveCharacter');
    assert.ok(cardOpsSource.includes('const deleteCharacter = (index) => {'), 'owns deleteCharacter');
    assert.ok(cardOpsSource.includes('const batchDeleteCharacters = () => {'), 'owns batch delete');
    assert.ok(cardOpsSource.includes('const selectCharacter = async (index, isNewImport = false) => {'), 'owns selectCharacter');
    assert.ok(cardOpsSource.includes('const characterCardPressStates = new WeakMap();'), 'owns card press animation');
    // the shared data-load guard is bridged through a setter, never the raw binding
    assert.ok(cardOpsSource.includes('setApplyingCharacterScopedData(true);'));
    assert.ok(!/_{1}_isApplyingCharacterScopedDatas*=/.test(cardOpsSource), 'raw guard binding must not be assigned inside the composable');
    assert.ok(cardOpsSource.includes('return {'), 'returns the operation functions');
    assert.ok(cardOpsSource.includes('selectCharacter'), 'exposes selectCharacter');
    // no watchers inside the composable
    assert.ok(!cardOpsSource.includes('watch('), 'no watchers');
});

test('app.mjs wires useCardOperations with the guard bridge in place', () => {
    assert.ok(app.includes("import { useCardOperations } from '../composables/useCardOperations.mjs';"), 'import');
    assert.equal(app.split('useCardOperations(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const setApplyingCharacterScopedData = (value) => {'), 'guard setter bridge stays in app.mjs');
    assert.ok(app.includes('_isApplyingCharacterScopedData = value;'), 'bridge writes the shared let binding');
    // call sites stay wired through ctx
    assert.ok(app.includes('createNewCharacter, editCharacter, saveCharacter,'));
});

// --- useBackupRestore (Phase 2, roadmap 2.2): full backup / restore ---

test('useBackupRestore composable holds backup and restore', () => {
    assert.ok(backupRestoreSource.includes("import { RPHStorage } from '../modules/storage-repository.mjs';"), 'imports storage repository');
    assert.ok(backupRestoreSource.includes('export function useBackupRestore(deps)'), 'deps-injecting factory export');
    assert.ok(backupRestoreSource.includes('const exportNativeBackup = async () => {'), 'owns exportNativeBackup');
    assert.ok(backupRestoreSource.includes('const restoreNativeBackup = async () => {'), 'owns restoreNativeBackup');
    assert.ok(backupRestoreSource.includes('await RPHStorage.exportBackup();'), 'delegates to the native plugin');
    assert.ok(backupRestoreSource.includes('window.location.reload();'), 'restore reloads the webview');
    assert.ok(backupRestoreSource.includes("showVueConfirmModal('恢复完整备份'"), 'restore asks before replacing data');
    assert.ok(backupRestoreSource.includes('return { exportNativeBackup, restoreNativeBackup };'));
    assert.ok(!backupRestoreSource.includes('watch('), 'no watchers');
});

test('app.mjs wires useBackupRestore after its last dep', () => {
    assert.ok(app.includes("import { useBackupRestore } from '../composables/useBackupRestore.mjs';"), 'import');
    assert.equal(app.split('useBackupRestore(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { exportNativeBackup, restoreNativeBackup } = useBackupRestore({'), 'destructures at the wiring site');
    // ctx keeps exposing both functions for the settings data manager
    assert.ok(app.includes('backupInProgress, exportNativeBackup, restoreNativeBackup,'));
    assert.ok(!app.includes('const exportNativeBackup = async'), 'moved out of app.mjs');
});

test('useBackupRestore returns callable members (runtime smoke)', async () => {
    const { useBackupRestore } = await import('../src/composables/useBackupRestore.mjs');
    const br = useBackupRestore({});
    const other = useBackupRestore({});
    assert.equal(typeof br.exportNativeBackup, 'function');
    assert.equal(typeof br.restoreNativeBackup, 'function');
    assert.notEqual(br.exportNativeBackup, other.exportNativeBackup, 'independent closures per call');
});

// --- useUiTemplatePipeline (Phase 3.0): UI template variable analysis pipeline ---

test('useUiTemplatePipeline composable owns the analysis pipeline', () => {
    assert.ok(pipelineSource.includes("import { generateUUID, parseCot, runWithConcurrency, stringifyUiSchema } from '../modules/utils.mjs';"), 'imports utils helpers');
    assert.ok(pipelineSource.includes("import engine from '../modules/ui-template-engine.mjs';"), 'imports template engine');
    assert.ok(pipelineSource.includes('export function useUiTemplatePipeline(deps)'), 'deps-injecting factory export');
    assert.ok(pipelineSource.includes('const updateUiTemplatesFromChat = async ({ manual = false, targetMessageId = null, forceSuggestions = false } = {}) => {'), 'owns updateUiTemplatesFromChat');
    assert.ok(pipelineSource.includes('const markUiTemplateStatus = (state, message, remaining = 0, targetMessageId = null) => {'), 'owns status marker');
    assert.ok(pipelineSource.includes('const failUiTemplateAnalysis = (message, targetMessageId = null) => {'), 'owns failure marker');
    assert.ok(pipelineSource.includes('const abortUiTemplateUpdate = (targetMessageId = null) => {'), 'owns run abort');
    // run lifecycle guards are private to the pipeline now
    assert.ok(pipelineSource.includes('let uiTemplateUpdateSeq = 0;'), 'private seq guard');
    assert.ok(pipelineSource.includes('let uiTemplateUpdateAbortController = null;'), 'private abort guard');
    assert.ok(pipelineSource.includes('return { markUiTemplateStatus, failUiTemplateAnalysis, abortUiTemplateUpdate, updateUiTemplatesFromChat };'));
    assert.ok(!pipelineSource.includes('showToast('), 'no toast side effects (inline status bar only)');
});

test('app.mjs wires useUiTemplatePipeline after its last dep', () => {
    assert.ok(app.includes("import { useUiTemplatePipeline } from '../composables/useUiTemplatePipeline.mjs';"), 'import');
    assert.equal(app.split('useUiTemplatePipeline(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const {\n            markUiTemplateStatus,\n            failUiTemplateAnalysis,\n            abortUiTemplateUpdate,\n            updateUiTemplatesFromChat\n        } = useUiTemplatePipeline({'), 'destructures at the wiring site');
    // app.mjs no longer holds the moved definitions or the uiState guards
    assert.ok(!app.includes('const updateUiTemplatesFromChat = async'), 'moved out of app.mjs');
    assert.ok(!app.includes('const markUiTemplateStatus = '), 'moved out of app.mjs');
    assert.ok(!app.includes('let { uiTemplateUpdateSeq, uiTemplateUpdateAbortController } = uiState;'), 'lifecycle guards removed from uiState destructuring');
    // useCardOperations and ctx still receive abortUiTemplateUpdate / updateUiTemplatesFromChat
    assert.ok(app.includes('abortUiTemplateUpdate,'));
    assert.ok(app.includes('updateUiTemplatesFromChat,'));
});

test('useUiTemplatePipeline returns callable members (runtime smoke)', async () => {
    const { useUiTemplatePipeline } = await import('../src/composables/useUiTemplatePipeline.mjs');
    const pipeline = useUiTemplatePipeline({});
    const other = useUiTemplatePipeline({});
    assert.equal(typeof pipeline.updateUiTemplatesFromChat, 'function');
    assert.equal(typeof pipeline.markUiTemplateStatus, 'function');
    assert.equal(typeof pipeline.failUiTemplateAnalysis, 'function');
    assert.equal(typeof pipeline.abortUiTemplateUpdate, 'function');
    assert.notEqual(pipeline.updateUiTemplatesFromChat, other.updateUiTemplatesFromChat, 'independent closures per call');
});

// --- useActiveToolPipeline (Phase 3.0): active tool queue execution ---

test('useActiveToolPipeline composable owns the tool queue run', () => {
    assert.ok(activeToolPipelineSource.includes("import { cleanupActiveToolCaptureState, stripActiveToolCallsFromAssistant } from '../modules/utils.mjs';"), 'imports utils helpers');
    assert.ok(activeToolPipelineSource.includes('export function useActiveToolPipeline(deps)'), 'deps-injecting factory export');
    assert.ok(activeToolPipelineSource.includes('const handleActiveToolCallFromAssistant = async (assistantMessage, activeToolDepth = 0) => {'), 'owns handleActiveToolCallFromAssistant');
    assert.ok(activeToolPipelineSource.includes('const ACTIVE_TOOL_MAX_AUTO_CONTINUE = 4;'), 'owns the auto-continue limit');
    // run AbortController is reached through the shared-guard accessors, never rebound locally
    assert.ok(activeToolPipelineSource.includes('setActiveToolQueueAbortController(toolAbort);'), 'stores run controller through bridge');
    assert.ok(activeToolPipelineSource.includes('getActiveToolQueueAbortController() === toolAbort'), 'clears run controller through bridge');
    assert.ok(!activeToolPipelineSource.includes('activeToolQueueAbortController ='), 'no local reassignment of the shared binding');
    assert.ok(activeToolPipelineSource.includes('return { handleActiveToolCallFromAssistant };'));
});

test('app.mjs wires useActiveToolPipeline with a late-bound bridge into useMessageSender', () => {
    assert.ok(app.includes("import { useActiveToolPipeline } from '../composables/useActiveToolPipeline.mjs';"), 'import');
    assert.equal(app.split('useActiveToolPipeline(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('let activeToolPipeline = null;'), 'late-bound bridge binding declared before both factories');
    // mutual recursion: useMessageSender receives the wrapper, pipeline receives generateResponse
    assert.ok(app.includes('handleActiveToolCallFromAssistant: (...args) => activeToolPipeline.handleActiveToolCallFromAssistant(...args),'), 'useMessageSender dep is the late-bound wrapper');
    assert.ok(app.includes('const { handleActiveToolCallFromAssistant } = useActiveToolPipeline({'), 'destructures at the wiring site');
    assert.ok(app.includes('activeToolPipeline = { handleActiveToolCallFromAssistant };'), 'bridge assigned after wiring');
    // app.mjs no longer holds the moved definition or the auto-continue constant
    assert.ok(!app.includes('const handleActiveToolCallFromAssistant = async'), 'moved out of app.mjs');
    assert.ok(!app.includes('const ACTIVE_TOOL_MAX_AUTO_CONTINUE = 4;'), 'constant moved to the pipeline');
    // the shared chatState guard binding stays in app.mjs for stopGeneration
    assert.ok(app.includes('let { activeToolQueueAbortController } = chatState;'));
    assert.ok(app.includes('const getActiveToolQueueAbortController = () => activeToolQueueAbortController;'), 'getter accessor defined');
});

test('useActiveToolPipeline returns a callable member (runtime smoke)', async () => {
    const { useActiveToolPipeline } = await import('../src/composables/useActiveToolPipeline.mjs');
    const pipeline = useActiveToolPipeline({});
    const other = useActiveToolPipeline({});
    assert.equal(typeof pipeline.handleActiveToolCallFromAssistant, 'function');
    assert.notEqual(pipeline.handleActiveToolCallFromAssistant, other.handleActiveToolCallFromAssistant, 'independent closures per call');
});

// --- useDataLoader (Phase 3.0): startup data load / migration ---

test('useDataLoader composable owns loadData', () => {
    assert.ok(dataLoaderSource.includes("import { generateUUID } from '../modules/utils.mjs';"), 'imports utils helper');
    assert.ok(dataLoaderSource.includes('export function useDataLoader(deps)'), 'deps-injecting factory export');
    assert.ok(dataLoaderSource.includes('const loadData = async () => {'), 'owns loadData');
    assert.ok(dataLoaderSource.includes('setDataLoadFailed(true); // 阻止后续 saveData 用默认空值覆盖存储中的数据'), 'flips the failure guard through the bridge');
    assert.ok(!/_dataLoadFailed\s*[=!]/.test(dataLoaderSource), 'no direct access to the shared guard binding');
    // migrations stay intact
    assert.ok(dataLoaderSource.includes('Migrated characters to UUID and timestamp system'), 'character UUID migration kept');
    assert.ok(dataLoaderSource.includes("normalizeRegexScript(script, 'character')"), 'character regex normalization kept');
    assert.ok(dataLoaderSource.includes('Migrate single user to profiles'), 'user profile migration kept');
    assert.ok(dataLoaderSource.includes('return { loadData };'));
});

test('app.mjs wires useDataLoader after its last dep', () => {
    assert.ok(app.includes("import { useDataLoader } from '../composables/useDataLoader.mjs';"), 'import');
    assert.equal(app.split('useDataLoader(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { loadData } = useDataLoader({'), 'destructures at the wiring site');
    // the wiring comment must pin the placement reason (last dep defined above)
    assert.ok(app.includes('after its last dep (normalizeCharacterUiTemplates, above) is defined.'), 'late wiring documented');
    // app.mjs no longer holds the moved definition
    assert.ok(!app.includes('const loadData = async'), 'moved out of app.mjs');
    assert.ok(app.includes('/* extracted loadData — src/composables/useDataLoader.mjs (Phase 3.0) */'), 'marker comment at the original site');
    // the shared guard stays in app.mjs for saveData, with the setter bridge
    assert.ok(app.includes('let _dataLoadFailed = false;'));
    assert.ok(app.includes('const setDataLoadFailed = (value) => {'), 'setter bridge defined');
    assert.ok(app.includes('if (_dataLoadFailed) {'), 'saveData still reads the guard');
});

test('useDataLoader restores data end-to-end with mocked storage (runtime)', async () => {
    const { useDataLoader } = await import('../src/composables/useDataLoader.mjs');
    // in-memory storage mock
    const store = new Map();
    const getStoredValue = async (key) => structuredClone(store.get(key));
    const setStoredValue = async (key, value) => { store.set(key, structuredClone(value)); };
    const getScopedStoredValue = async (name, id) => name === 'chat' ? store.get(`chat:${id}`) : store.get(`${name}:${id}`);
    const setScopedStoredValue = async (name, id, value) => {
        if (name === 'chat') store.set(`chat:${id}`, structuredClone(value));
        else store.set(`${name}:${id}`, structuredClone(value));
    };
    const deleteScopedStoredValue = async (name, id) => { if (name === 'chat') store.delete(`chat:${id}`); else store.delete(`${name}:${id}`); };
    const normalizeRegexScript = (script, scope) => ({ ...script, scope: script.scope || scope });
    const normalizeWorldInfoEntry = (entry) => ({ ...entry });
    const normalizeUiTemplate = (t) => ({ ...t });
    const normalizeActiveTools = (items) => items;
    const normalizeApiProviderSettings = () => { };
    const normalizeActiveToolAggressivenessSettings = () => { };
    const normalizeMemorySettings = () => { };
    const normalizeFontFamily = (v) => v;
    const applyFontFamily = () => { };
    const syncChatModelFromPresets = () => 'm';
    const getApiProviderByUrl = () => null;
    let loadFailed = false;

    // legacy character without uuid/createdAt + scenario field, plus saved user/settings
    store.set('characters', [{ name: '旧卡', scenario: '旧场景', worldInfo: [{ scope: 'global', id: 'g1' }], regexScripts: [{ name: 'r', scope: 'global' }] }]);
    store.set('user', { name: '老用户' });
    store.set('settings', { model: 'm1' });
    let loadErrorToast = null;
    const loader = useDataLoader({
        initDB: async () => { },
        getStoredValue, setStoredValue, getScopedStoredValue, setScopedStoredValue, deleteScopedStoredValue,
        characters: { value: [] },
        settings: { model: '', fontFamily: 'modern', fontFamilyVersion: 4, contextSize: 0, apiProviderId: '', stream: false },
        presets: { value: [] },
        deletedDefaultPresetNames: { value: [] },
        globalRegexScripts: { value: [] },
        regexScripts: { value: [] },
        globalWorldInfo: { value: [] },
        worldInfo: { value: [] },
        worldInfoSettings: {},
        globalUiTemplates: { value: [] },
        activeTools: { value: [] },
        user: {},
        userProfiles: { value: [] },
        activeProfileId: { value: null },
        lastActiveCharacterId: { value: null },
        memorySettings: {},
        tokenUsageHistory: { value: [] },
        DEFAULT_API_PROVIDER_ID: 'default',
        MAX_CONTEXT_SIZE: 64,
        getApiProviderByUrl,
        normalizeApiProviderSettings,
        normalizeFontFamily,
        applyFontFamily,
        syncChatModelFromPresets,
        normalizeActiveToolAggressivenessSettings,
        normalizePreset: (p) => p,
        normalizeRegexScript,
        normalizeWorldInfoEntry,
        normalizeUiTemplate,
        normalizeActiveTools,
        normalizeCharacterUiTemplates: (char) => { char.uiTemplates = []; },
        normalizeMemorySettings,
        setDataLoadFailed: (v) => { loadFailed = v; },
        showToast: (msg) => { loadErrorToast = msg; }
    });

    await loader.loadData();
    assert.equal(loadFailed, false, 'no failure guard flip on the happy path');
    assert.equal(loadErrorToast, null, 'no error toast on the happy path');
    // characters restored + migrated
    assert.equal(store.get('characters')[0].name, '旧卡');
    assert.ok(store.get('characters')[0].uuid, 'legacy character migrated to uuid');
    assert.ok(store.get('characters')[0].createdAt, 'legacy character migrated to createdAt');
    assert.ok(!('scenario' in store.get('characters')[0]), 'legacy scenario field dropped');
    // user restored
    assert.equal(store.get('user').name, '老用户');
    // settings merged (existing key only) + forced fields
    assert.equal(store.get('settings').model, 'm1');
});

test('useDataLoader flips the failure guard on storage errors (runtime)', async () => {
    const { useDataLoader } = await import('../src/composables/useDataLoader.mjs');
    let loadFailed = false;
    let errorToast = null;
    const loader = useDataLoader({
        initDB: async () => { throw new Error('db unavailable'); },
        getStoredValue: async () => undefined,
        setStoredValue: async () => { },
        getScopedStoredValue: async () => undefined,
        setScopedStoredValue: async () => { },
        deleteScopedStoredValue: async () => { },
        characters: { value: [] },
        settings: {},
        presets: { value: [] },
        deletedDefaultPresetNames: { value: [] },
        globalRegexScripts: { value: [] },
        regexScripts: { value: [] },
        globalWorldInfo: { value: [] },
        worldInfo: { value: [] },
        worldInfoSettings: {},
        globalUiTemplates: { value: [] },
        activeTools: { value: [] },
        user: {},
        userProfiles: { value: [] },
        activeProfileId: { value: null },
        lastActiveCharacterId: { value: null },
        memorySettings: {},
        tokenUsageHistory: { value: [] },
        DEFAULT_API_PROVIDER_ID: 'default',
        MAX_CONTEXT_SIZE: 64,
        getApiProviderByUrl: () => null,
        normalizeApiProviderSettings: () => { },
        normalizeFontFamily: (v) => v,
        applyFontFamily: () => { },
        syncChatModelFromPresets: () => '',
        normalizeActiveToolAggressivenessSettings: () => { },
        normalizePreset: (p) => p,
        normalizeRegexScript: (s, scope) => ({ ...s, scope }),
        normalizeWorldInfoEntry: (e) => e,
        normalizeUiTemplate: (t) => t,
        normalizeActiveTools: (i) => i,
        normalizeCharacterUiTemplates: () => { },
        normalizeMemorySettings: () => { },
        setDataLoadFailed: (v) => { loadFailed = v; },
        showToast: (msg) => { errorToast = msg; }
    });
    await loader.loadData();
    assert.equal(loadFailed, true, 'guard flipped so saveData refuses to overwrite storage with defaults');
    assert.equal(errorToast, '加载保存的数据失败');
});

// --- useSpecialRules (Phase 3.0): image-gen special rule injection ---

test('useSpecialRules composable owns enforceSpecialRules', () => {
    assert.ok(specialRulesSource.includes("import { RPHubCardUtils } from '../modules/card-utils.mjs';"), 'imports card utils');
    assert.ok(specialRulesSource.includes('export function useSpecialRules(deps)'), 'deps-injecting factory export');
    assert.ok(specialRulesSource.includes('const enforceSpecialRules = () => {'), 'owns enforceSpecialRules');
    // rule injection behavior markers stay intact
    assert.ok(specialRulesSource.includes("const imageGenRegexName = 'NAI画图正则';"), 'NAI regex rule kept');
    assert.ok(specialRulesSource.includes("const autoImageGenWIName = '自动生图';"), 'auto image-gen world info kept');
    assert.ok(specialRulesSource.includes("regexScripts.value.unshift(imageGenRegexContent);"), 'regex list injection kept');
    assert.ok(specialRulesSource.includes("worldInfo.value.unshift(autoImageGenWIContent);"), 'worldinfo injection kept');
    assert.ok(specialRulesSource.includes('return { enforceSpecialRules };'));
    assert.ok(!specialRulesSource.includes('showToast('), 'no toast side effects');
    assert.ok(!specialRulesSource.includes('saveData('), 'no persistence side effects');
});

test('app.mjs wires useSpecialRules at the original declaration site', () => {
    assert.ok(app.includes("import { useSpecialRules } from '../composables/useSpecialRules.mjs';"), 'import');
    assert.equal(app.split('useSpecialRules(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { enforceSpecialRules } = useSpecialRules({'), 'destructures at the wiring site');
    assert.ok(!app.includes('const enforceSpecialRules = () => {'), 'moved out of app.mjs');
    // call sites stay: settings watch, character switch (useCardOperations), ctx export
    assert.ok(app.includes('enforceSpecialRules();'), 'call sites kept in app.mjs');
    assert.ok(app.includes('enforceSpecialRules,'), 'ctx export kept');
});

// --- useVectorMemoryPatrol (Phase 3.0): vector batch memory extraction ---

test('useVectorMemoryPatrol composable owns the vector extraction run', () => {
    assert.ok(vectorPatrolSource.includes("import { RPHLocalEmbedding } from '../modules/local-embedding.mjs';"), 'imports local embedding');
    assert.ok(vectorPatrolSource.includes("import { getMemoryEmptyTurnsKey, getMemoryVectorExtractedKey } from '../modules/memory-utils.mjs';"), 'imports memory key helpers');
    assert.ok(vectorPatrolSource.includes('export function useVectorMemoryPatrol(deps)'), 'deps-injecting factory export');
    assert.ok(vectorPatrolSource.includes('const startVectorBatchMemoryExtraction = async (options = {}) => {'), 'owns startVectorBatchMemoryExtraction');
    // shared guards reached through accessors, never rebound locally
    assert.ok(vectorPatrolSource.includes('setBatchExtractAbort(batchController);'), 'stores run controller through bridge');
    assert.ok(vectorPatrolSource.includes('while (getBatchExtractAbort() === batchController && !batchController.signal.aborted) {'), 'run loop guarded through bridge');
    assert.ok(vectorPatrolSource.includes('setBatchExtractAbort(null);'), 'clears controller through bridge');
    assert.ok(vectorPatrolSource.includes('getVectorBatchRescanRequested() ||'), 'rescan flag read through bridge');
    assert.ok(!/_(batchExtractAbort|vectorBatchRescanRequested)/.test(vectorPatrolSource.replace(/^\/\/.*$/gm, '')), 'no direct guard access in code');
    // v4 self-healing marker stays
    assert.ok(vectorPatrolSource.includes('delete memorySettings.vectorExtractedTurns[extractedKey];'), 'self-healing rescan kept');
    assert.ok(vectorPatrolSource.includes('return { startVectorBatchMemoryExtraction };'));
});

test('app.mjs wires useVectorMemoryPatrol with guard accessors', () => {
    assert.ok(app.includes("import { useVectorMemoryPatrol } from '../composables/useVectorMemoryPatrol.mjs';"), 'import');
    assert.equal(app.split('useVectorMemoryPatrol(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { startVectorBatchMemoryExtraction } = useVectorMemoryPatrol({'), 'destructures at the wiring site');
    assert.ok(!app.includes('const startVectorBatchMemoryExtraction = async'), 'moved out of app.mjs');
    // the shared guard bindings stay in app.mjs for abortVectorBatchExtraction / manual rescan
    assert.ok(app.includes('let _batchExtractAbort = null;'));
    assert.ok(app.includes('const getBatchExtractAbort = () => _batchExtractAbort;'), 'getter accessor defined');
    assert.ok(app.includes('const setVectorBatchRescanRequested = (value) => { _vectorBatchRescanRequested = value; };'), 'setter accessor defined');
    assert.ok(app.includes('_vectorBatchRescanRequested = true;'), 'manual rescan request site kept');
    assert.ok(app.includes('startVectorBatchMemoryExtraction,'), 'ctx export kept');
});

// --- useRollingSummary (Phase 3.0): rolling memory summary chain ---

test('useRollingSummary composable owns the summary chain run', () => {
    assert.ok(rollingSummarySource.includes("import * as RPHMemorySummary from '../modules/memory-summary.mjs';"), 'imports summary lib');
    assert.ok(rollingSummarySource.includes("import * as RPHMemoryProfile from '../modules/memory-profile.mjs';"), 'imports profile lib');
    assert.ok(rollingSummarySource.includes('const summaryLib = () => RPHMemorySummary;'), 'module alias recreated');
    assert.ok(rollingSummarySource.includes('export function useRollingSummary(deps)'), 'deps-injecting factory export');
    assert.ok(rollingSummarySource.includes('const runRollingSummaryCheck = async (options = {}) => {'), 'owns runRollingSummaryCheck');
    // shared guards reached through accessors, never rebound locally
    assert.ok(rollingSummarySource.includes('if (getSummaryInFlight()) return false;'), 'in-flight guard read through bridge');
    assert.ok(rollingSummarySource.includes('setSummaryInFlight(true);'), 'in-flight guard set through bridge');
    assert.ok(rollingSummarySource.includes('if (getSummaryAbortController() === abortController) setSummaryAbortController(null);'), 'controller cleared through bridge');
    assert.ok(!/_(summaryInFlight|summaryAbortController)/.test(rollingSummarySource.replace(/^\/\/.*$/gm, '')), 'no direct guard access in code');
    // chain behavior markers stay
    assert.ok(rollingSummarySource.includes('if (processed > 200) break;'), 'safety cap kept');
    assert.ok(rollingSummarySource.includes("if (getCurrentChatStorageScopeId() !== scopeId) break;"), 'scope-switch double guard kept');
    assert.ok(rollingSummarySource.includes('return { runRollingSummaryCheck };'));
});

test('app.mjs wires useRollingSummary with guard accessors', () => {
    assert.ok(app.includes("import { useRollingSummary } from '../composables/useRollingSummary.mjs';"), 'import');
    assert.equal(app.split('useRollingSummary(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { runRollingSummaryCheck } = useRollingSummary({'), 'destructures at the wiring site');
    assert.ok(!app.includes('const runRollingSummaryCheck = async'), 'moved out of app.mjs');
    // the shared guard bindings stay in app.mjs for abortRollingSummary / memory patrol
    assert.ok(app.includes('const getSummaryInFlight = () => _summaryInFlight;'), 'getter accessor defined');
    assert.ok(app.includes('const setSummaryAbortController = (value) => { _summaryAbortController = value; };'), 'setter accessor defined');
    assert.ok(app.includes('if (!_summaryInFlight) {'), 'memory patrol still reads the flag');
    assert.ok(app.includes('runRollingSummaryCheck,'), 'ctx export kept');
});

// --- useRegexPipeline (Phase 3.0): regex script processing ---

test('useRegexPipeline composable owns processRegex', () => {
    assert.ok(regexPipelineSource.includes("import { RPHubCardUtils } from '../modules/card-utils.mjs';"), 'imports card utils');
    assert.ok(regexPipelineSource.includes('export function useRegexPipeline(deps)'), 'deps-injecting factory export');
    assert.ok(regexPipelineSource.includes('const processRegex = (text, options = {}) => {'), 'owns processRegex');
    // behavior markers stay intact
    assert.ok(regexPipelineSource.includes("=== 'NAI画图正则'"), 'NAI regex ordering kept');
    assert.ok(regexPipelineSource.includes('transformUnprotectedText'), 'HTML/code protection kept');
    assert.ok(regexPipelineSource.includes("script.name !== 'Auto Replace {{user}}'"), 'protection exemption kept');
    assert.ok(regexPipelineSource.includes('if (isDisplay && script.promptOnly) return;'), 'mode filter kept');
    assert.ok(regexPipelineSource.includes('return { processRegex };'));
    assert.ok(!regexPipelineSource.includes('showToast('), 'no toast side effects');
});

test('app.mjs wires useRegexPipeline at the original declaration site', () => {
    assert.ok(app.includes("import { useRegexPipeline } from '../composables/useRegexPipeline.mjs';"), 'import');
    assert.equal(app.split('useRegexPipeline(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { processRegex } = useRegexPipeline({ regexScripts });'), 'single-dep wiring');
    assert.ok(!app.includes('const processRegex = (text, options = {}) => {'), 'moved out of app.mjs');
    // consumers keep receiving it through the deps objects
    assert.ok(app.includes('processRegex,'));
});

// --- useStoryBranching (Phase 3.0): story branch creation ---

test('app.mjs wires useStoryBranching after its last dep', () => {
    assert.ok(app.includes("import { useStoryBranching } from '../composables/useStoryBranching.mjs';"), 'import');
    assert.equal(app.split('useStoryBranching(').length - 1, 1, 'exactly one composable call per setup()');
    assert.ok(app.includes('const { createStoryBranch } = useStoryBranching({'), 'destructures at the wiring site');
    assert.ok(app.includes('after its last dep (copyUiTemplateRuntimeForBranch, above) is defined.'), 'late wiring documented');
    assert.ok(!app.includes('const createStoryBranch = async'), 'moved out of app.mjs');
    // ctx export kept
    assert.ok(app.includes('openStoryBranchModal, createStoryBranch, switchStoryBranch,'));
    // guard setter bridges defined in app.mjs
    assert.ok(app.includes('const setMemoriesLoaded = (value) => { _memoriesLoaded = value; };'), 'memory guard setters');
    assert.ok(app.includes('const setFactFragmentsLoaded = (value) => { _factFragmentsLoaded = value; };'), 'fact guard setters');
});

test('Phase 3.0 device-caught dep regressions stay locked', () => {
    // _doBatchEmbedMemoryChunks: renamed dep broke the patrol call site (device logcat)
    assert.ok(vectorPatrolSource.includes('        _doBatchEmbedMemoryChunks,'), 'patrol destructures _doBatchEmbedMemoryChunks');
    assert.ok(app.includes('            _doBatchEmbedMemoryChunks,'), 'app.mjs passes it as a dep');
    // updateActiveToolResultContext: missing dep broke tool result bookkeeping
    assert.ok(activeToolPipelineSource.includes('        updateActiveToolResultContext,'), 'tool pipeline destructures updateActiveToolResultContext');
    // cloneForStorage / memoryFacts: missing deps broke branch seeding and rollback
    assert.ok(branchingSource.includes('        cloneForStorage,'), 'branching destructures cloneForStorage');
    assert.ok(branchingSource.includes('        memoryFacts,'), 'branching destructures memoryFacts');
});
