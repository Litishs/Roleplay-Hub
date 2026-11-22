// useRollingSummary — rolling memory trigger adapter (v6 L1)
//
// The chain logic moved to src/modules/memory-reconcile.mjs, the single
// writer of the memory ledger. This composable keeps the historical entry
// point that the panel, the patrol scheduler and the retry path call, and
// owns the only UI-facing concerns left: the disabled-memory guard and the
// "nothing to summarize" toast on a forced run.
//
// Contract locks: tests/composables-contract.test.mjs,
// tests/memory-summary-contract.test.mjs.

export function useRollingSummary(deps) {
    const {
        currentCharacter,
        chatHistory,
        memorySettings,
        showToast,
        buildConversationTurnSnapshot,
        reconcileMemory
    } = deps;
    const runRollingSummaryCheck = async (options = {}) => {
        if (!memorySettings.enabled || !currentCharacter.value?.uuid) return false;
        const result = await reconcileMemory({ force: options.force === true });
        if (options.force === true && result?.reason === 'no-pending' && Number(result?.processed) === 0) {
            const turnCount = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false }).turns.length;
            showToast(`当前对话 ${turnCount} 轮未超过保留窗口（${memorySettings.keepFloors} 轮），暂无需要总结的内容，继续聊天后会自动总结`, 'info');
        }
        return Number(result?.processed) > 0;
    };
    return { runRollingSummaryCheck };
}