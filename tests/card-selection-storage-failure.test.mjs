import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { useCardOperations } from '../src/composables/useCardOperations.mjs';

function fixture(overrides = {}) {
    const characters = ref([{ uuid: 'old-card' }, { uuid: 'new-card', name: 'New card' }]);
    const currentCharacterIndex = ref(0);
    const chatHistory = ref([{ id: 'old-message' }]);
    const branch = ref('old-branch');
    const events = [];
    const toasts = [];
    let applying = false;
    const deps = {
        characters, currentCharacterIndex, chatHistory,
        currentCharacter: computed(() => characters.value[currentCharacterIndex.value]),
        isConversationBusy: ref(false), isAutoImageGenEnabled: ref(false),
        worldInfo: ref([]), recentGenerationTimes: ref([]), currentView: ref('cards'),
        flushPendingChatHistorySave: async () => {},
        abortUiTemplateUpdate() {}, stopSpeaking() {},
        abortVectorBatchExtraction() {}, abortClassicBatchExtraction() {}, abortRollingSummary() {},
        readStoryBranchesForCharacter: async () => ({ activeBranchId: 'new-branch', branches: [] }),
        getStoryBranchScopeId: (uuid, id) => `${uuid}:${id}`,
        loadStoredChatHistory: async () => [{ id: 'new-message' }],
        setApplyingCharacterScopedData: value => { applying = value; },
        saveGlobalUiTemplateRuntimeForCharacter(char) { events.push(['save-runtime', char.uuid, branch.value]); },
        applyStoryBranchState(state) {
            assert.equal(applying, true, 'scope watchers must be guarded during the switch');
            events.push(['apply-branch']);
            branch.value = state.activeBranchId;
        },
        resetChatRenderWindow() {}, normalizeCharacterUiTemplates() {},
        loadGlobalUiTemplateRuntimeForCharacter() {}, getCombinedWorldInfo: () => [],
        combineRegexScriptsForCharacter() {}, finishApplyingCharacterScopedData() {},
        ensureDefaultUserRegex() {}, enforceSpecialRules() {},
        loadCharacterMemories: async () => {}, scrollChatToBottom: async () => {},
        saveData() { events.push(['save', currentCharacterIndex.value, branch.value, chatHistory.value[0].id]); },
        showToast: (...args) => toasts.push(args),
        ...overrides,
    };
    return { ...useCardOperations(deps), deps, branch, events, toasts };
}

test('failed chat reads preserve the current character, history, and branch while pending and after rejection', async () => {
    let rejectRead;
    let signalRead;
    const started = new Promise(resolve => { signalRead = resolve; });
    const pending = new Promise((_, reject) => { rejectRead = reject; });
    const state = fixture({
        loadStoredChatHistory: async (_char, _index, scope) => {
            assert.equal(scope, 'new-card:new-branch', 'read the staged target branch');
            signalRead();
            return pending;
        },
    });
    const selection = state.selectCharacter(1);
    await started;
    const assertUnchanged = () => {
        assert.equal(state.deps.currentCharacterIndex.value, 0);
        assert.equal(state.deps.chatHistory.value[0].id, 'old-message');
        assert.equal(state.branch.value, 'old-branch');
        assert.deepEqual(state.events, []);
    };
    assertUnchanged();
    rejectRead(new Error('Synthetic unreadable chat'));
    await selection;
    assertUnchanged();
    assert.equal(state.toasts[0][1], 'error');
});

test('failed branch reads do not read or save a different conversation', async () => {
    const state = fixture({
        readStoryBranchesForCharacter: async () => { throw new Error('Synthetic unreadable branch'); },
        loadStoredChatHistory: async () => assert.fail('chat read must not start'),
    });
    await state.selectCharacter(1);
    assert.equal(state.deps.currentCharacterIndex.value, 0);
    assert.equal(state.deps.chatHistory.value[0].id, 'old-message');
    assert.equal(state.branch.value, 'old-branch');
    assert.deepEqual(state.events, []);
    assert.equal(state.toasts[0][1], 'error');
});

test('successful selection saves the previous runtime before committing the new branch and history', async () => {
    const state = fixture();
    await state.selectCharacter(1);
    assert.deepEqual(state.events, [
        ['save-runtime', 'old-card', 'old-branch'],
        ['apply-branch'],
        ['save', 1, 'new-branch', 'new-message'],
    ]);
});
