// useStoryBranching — story branch creation (Phase 3.0, roadmap 3.0)
//
// Owns createStoryBranch, previously inlined in app.mjs setup(): snapshots
// the parent branch chat/memories/summaries/profile (optionally forking at
// a specific assistant message), seeds the new branch scope, registers the
// branch, switches into it and rolls everything back on failure. The moved
// code is byte-identical to the app.mjs original except that the shared
// mutable guards it mutates are reached through setter bridges (deps are
// passed by value, so raw reassignment cannot reach the app.mjs bindings):
// _isApplyingCharacterScopedData via the existing
// setApplyingCharacterScopedData bridge, plus dedicated setters for
// _memoriesLoaded / _classicMemoriesLoaded; the storage handle is read
// through getDb()
// because app.mjs reassigns the db binding (same accessor pattern as
// useCardOperations).
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - storyBranchApi is recreated from direct story-branch.mjs imports (the
//   block only uses createId / defaultBranchName; the alias stays truthy so
//   the api-vs-fallback branches behave identically); generateUUID and
//   getMemoryEmptyTurnsKey come from utils / memory-utils module imports.
// Contract locks: tests/story-branch-contract.test.mjs, tests/composables-contract.test.mjs.

import { generateUUID } from '../modules/utils.mjs';
import { getMemoryEmptyTurnsKey } from '../modules/memory-utils.mjs';
import { createId as rphBranchCreateId, defaultBranchName as rphBranchDefaultBranchName } from '../modules/story-branch.mjs';

export function useStoryBranching(deps) {
    const {
        // branch / chat / memory state
        currentCharacter,
        chatHistory,
        memories,
        classicMemories,
        storyBranches,
        currentStoryBranch,
        selectedStoryBranchId,
        activeStoryBranchId,
        storyBranchSwitching,
        memorySettings,
        globalUiTemplates,
        // shared guard bridges
        setApplyingCharacterScopedData,
        finishApplyingCharacterScopedData,
        setMemoriesLoaded,
        setClassicMemoriesLoaded,
        getDb,
        // storage layer
        flushCurrentBranchState,
        getStoryBranchScopeId,
        getStoredChatHistoryWithRetry,
        getScopedStoredValue,
        setScopedStoredValue,
        deleteScopedStoredValue,
        setStoredValue,
        cloneForStorage,
        saveMemorySettingsNow,
        saveStoryBranchesForCharacter,
        // context / runtime helpers
        buildConversationTurnSnapshot,
        getPostprocessedChatMessages,
        serializeChatMessage,
        prepareLoadedChatHistoryForDisplay,
        createInitialChatHistory,
        prepareMemoriesForRuntime,
        prepareClassicMemoriesForRuntime,
        copyUiTemplateRuntimeForBranch,
        loadGlobalUiTemplateRuntimeForCharacter,
        ensureGlobalUiTemplates,
        resetChatRenderWindow,
        scrollChatToBottom,
        showToast
    } = deps;
    const storyBranchApi = () => ({ createId: rphBranchCreateId, defaultBranchName: rphBranchDefaultBranchName });
        const createStoryBranch = async (forkMessageIndex = null) => {
            const char = currentCharacter.value;
            if (!char?.uuid || storyBranchSwitching.value) return;
            const forkFromMessage = Number.isInteger(forkMessageIndex);
            const forkMessage = forkFromMessage ? chatHistory.value[forkMessageIndex] : null;
            if (forkFromMessage && forkMessage?.role !== 'assistant') return;
            const forkMessageId = forkMessage?.id;
            const parent = forkFromMessage
                ? currentStoryBranch.value
                : storyBranches.value.find(branch => branch.id === selectedStoryBranchId.value)
                || currentStoryBranch.value;
            if (!parent) return;
            storyBranchSwitching.value = true;
            let createdBranch = null;
            const previousState = {
                activeId: activeStoryBranchId.value,
                chatHistory: chatHistory.value,
                memories: memories.value,
                classicMemories: classicMemories.value
            };
            try {
                if (!await flushCurrentBranchState()) return;
                const parentId = parent.id;
                const parentScopeId = getStoryBranchScopeId(char.uuid, parentId);
                const api = storyBranchApi();
                const branchId = api ? api.createId() : generateUUID();
                const branchScopeId = getStoryBranchScopeId(char.uuid, branchId);
                createdBranch = { branchId, branchScopeId, parentId };
                const branchNumber = storyBranches.value.filter(branch => branch.id !== 'main').length + 1;
                const branchName = api ? api.defaultBranchName(branchNumber) : `分支 ${branchNumber}`;
                const now = Date.now();
                const [savedChat, savedMemories, savedClassicMemories, savedSummaries, savedProfile] = await Promise.all([
                    getStoredChatHistoryWithRetry(parentScopeId),
                    getScopedStoredValue('memories', parentScopeId),
                    getScopedStoredValue('classic_memories', parentScopeId),
                    getScopedStoredValue('memory_summaries', parentScopeId),
                    getScopedStoredValue('memory_profile', parentScopeId)
                ]);
                let branchChat = Array.isArray(savedChat) ? savedChat : [];
                let branchMemories = Array.isArray(savedMemories) ? savedMemories : [];
                let branchClassicMemories = Array.isArray(savedClassicMemories) ? savedClassicMemories : [];
                let branchSummaries = savedSummaries && typeof savedSummaries === 'object' ? { ...savedSummaries } : null;
                let branchProfile = savedProfile && typeof savedProfile === 'object' ? { ...savedProfile } : null;
                let forkTurn = null;
                if (forkFromMessage) {
                    let sourceIndex = forkMessageId
                        ? branchChat.findIndex(message => message?.id === forkMessageId)
                        : forkMessageIndex;
                    if (sourceIndex < 0 && Array.isArray(chatHistory.value)) {
                        const memorySourceIndex = forkMessageId
                            ? chatHistory.value.findIndex(message => message?.id === forkMessageId)
                            : forkMessageIndex;
                        if (memorySourceIndex >= 0 && chatHistory.value[memorySourceIndex]?.role === 'assistant') {
                            branchChat = chatHistory.value.map(message => serializeChatMessage(message, 'final'));
                            sourceIndex = memorySourceIndex;
                        }
                    }
                    if (sourceIndex < 0 || branchChat[sourceIndex]?.role !== 'assistant') {
                        throw new Error('目标消息已发生变化，请重试');
                    }
                    branchChat = branchChat.slice(0, sourceIndex + 1);
                    forkTurn = buildConversationTurnSnapshot(
                        prepareLoadedChatHistoryForDisplay(branchChat),
                        { includeSystem: false }
                    ).turns.length;
                    branchMemories = branchMemories.filter(memory => Number(memory?.turn) <= forkTurn);
                    branchClassicMemories = branchClassicMemories.filter(memory => Number(memory?.turn) <= forkTurn);
                    if (branchSummaries && Array.isArray(branchSummaries.batches)) {
                        branchSummaries.batches = branchSummaries.batches.filter(b => Number(b?.toTurn) <= forkTurn);
                    }
                }
                await setScopedStoredValue('chat', branchScopeId, branchChat, { clone: false });
                await setScopedStoredValue('memories', branchScopeId, branchMemories, { clone: false });
                await setScopedStoredValue('classic_memories', branchScopeId, branchClassicMemories, { clone: false });
                if (branchSummaries) {
                    await setScopedStoredValue('memory_summaries', branchScopeId, cloneForStorage(branchSummaries), { clone: false });
                }
                if (branchProfile) {
                    await setScopedStoredValue('memory_profile', branchScopeId, cloneForStorage(branchProfile), { clone: false });
                }
                copyUiTemplateRuntimeForBranch(parentScopeId, branchScopeId, forkTurn);
                const floorCount = getPostprocessedChatMessages(branchChat, { includeSystem: false }).length;
                const wordCount = branchChat.reduce((sum, message) => sum + String(message?.content || '').length, 0);
                storyBranches.value.push({
                    id: branchId,
                    name: branchName,
                    parentId,
                    createdAt: now,
                    updatedAt: now,
                    forkFloor: floorCount,
                    floorCount,
                    messageCount: branchChat.filter(message => ['user', 'assistant'].includes(message?.role)).length,
                    wordCount
                });
                activeStoryBranchId.value = branchId;
                selectedStoryBranchId.value = branchId;
                await Promise.all([
                    saveStoryBranchesForCharacter(char),
                    saveMemorySettingsNow(),
                    setStoredValue('global_ui_templates', globalUiTemplates.value)
                ]);
                loadGlobalUiTemplateRuntimeForCharacter(char);
                setApplyingCharacterScopedData(true);
                resetChatRenderWindow();
                chatHistory.value = branchChat.length
                    ? prepareLoadedChatHistoryForDisplay(branchChat)
                    : createInitialChatHistory(char);
                memories.value = branchMemories.length ? prepareMemoriesForRuntime(branchMemories) : [];
                classicMemories.value = prepareClassicMemoriesForRuntime(branchClassicMemories);
                setMemoriesLoaded(true);
                setClassicMemoriesLoaded(true);
                finishApplyingCharacterScopedData();
                showToast(`已创建并进入“${branchName}”`, 'success');
                await scrollChatToBottom();
            } catch (error) {
                setApplyingCharacterScopedData(false);
                if (createdBranch) {
                    storyBranches.value = storyBranches.value.filter(branch => branch.id !== createdBranch.branchId);
                    activeStoryBranchId.value = previousState.activeId;
                    selectedStoryBranchId.value = previousState.activeId;
                    chatHistory.value = previousState.chatHistory;
                    memories.value = previousState.memories;
                    classicMemories.value = previousState.classicMemories;
                    if (memorySettings.emptyTurns) {
                        delete memorySettings.emptyTurns[getMemoryEmptyTurnsKey(createdBranch.branchScopeId)];
                    }
                    ensureGlobalUiTemplates().forEach(template => {
                        if (template.runtimeByCharacter) delete template.runtimeByCharacter[createdBranch.branchScopeId];
                    });
                    loadGlobalUiTemplateRuntimeForCharacter(char);
                    await Promise.allSettled([
                        deleteScopedStoredValue('chat', createdBranch.branchScopeId),
                        deleteScopedStoredValue('memories', createdBranch.branchScopeId),
                        deleteScopedStoredValue('classic_memories', createdBranch.branchScopeId),
                        getDb() ? getDb().deleteFragments(createdBranch.branchScopeId) : Promise.resolve(),
                        saveStoryBranchesForCharacter(char),
                        saveMemorySettingsNow(),
                        setStoredValue('global_ui_templates', globalUiTemplates.value)
                    ]);
                }
                console.error('Failed to create story branch:', error);
                showToast(`创建分支失败：${error.message || '请稍后重试'}`, 'error');
            } finally {
                storyBranchSwitching.value = false;
            }
        };    return { createStoryBranch };
}
