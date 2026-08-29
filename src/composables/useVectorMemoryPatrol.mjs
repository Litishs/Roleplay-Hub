// useVectorMemoryPatrol — vector batch memory extraction (Phase 3.0, roadmap 3.0)
//
// Owns startVectorBatchMemoryExtraction, previously inlined in app.mjs
// setup(): the abortable background/manual patrol that slices conversation
// turns into embedding chunks (with the v4 self-healing full-rescan for
// stale extracted-turn markers), feeds them to _doBatchEmbedMemoryChunks
// and advances the extracted-turn marker. The moved code is byte-identical
// to the app.mjs original except for two shared mutable guards which stay
// in the app.mjs bindings (abortVectorBatchExtraction and the manual-patrol
// rescan request read/write them) and are reached through get/set
// accessors — the shared-guard bridge pattern.
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - RPHLocalEmbedding is a direct module import; the memory key helpers come
//   from memory-utils.mjs; everything else is a dep.
// Contract locks: tests/composables-contract.test.mjs.

import { RPHLocalEmbedding } from '../modules/local-embedding.mjs';
import { getMemoryEmptyTurnsKey, getMemoryVectorExtractedKey } from '../modules/memory-utils.mjs';

export function useVectorMemoryPatrol(deps) {
    const {
        // memory state
        currentCharacter,
        chatHistory,
        isConversationBusy,
        memorySettings,
        memories,
        isBatchExtracting,
        sliceBuildStatus,
        batchExtractProgress,
        showNoMemoryNeededModal,
        // shared guard bridges (abort controller + rescan flag)
        getBatchExtractAbort,
        setBatchExtractAbort,
        getVectorBatchRescanRequested,
        setVectorBatchRescanRequested,
        // embedding + orchestration
        getMemoryEmbeddingModel,
        getCurrentChatStorageScopeId,
        buildConversationTurnSnapshot,
        _doBatchEmbedMemoryChunks,
        waitForMemoryConversationIdle,
        saveMemorySettingsNow,
        showToast
    } = deps;
        const startVectorBatchMemoryExtraction = async (options = {}) => {
            const { manual = true } = options;
            if (isBatchExtracting.value || !currentCharacter.value || chatHistory.value.length === 0) return;
            const isLocalBackend = memorySettings.embeddingBackend === 'local';
            const embeddingReady = isLocalBackend
                ? !!RPHLocalEmbedding
                : !!getMemoryEmbeddingModel();
            if (!embeddingReady) {
                sliceBuildStatus.value = {
                    status: 'error',
                    message: isLocalBackend ? '本地嵌入模块不可用' : '请先选择向量嵌入模型'
                };
                if (manual) showToast(sliceBuildStatus.value.message, 'warning');
                return;
            }

            const batchController = new AbortController();
            setBatchExtractAbort(batchController);
            setVectorBatchRescanRequested(false);
            isBatchExtracting.value = true;
            sliceBuildStatus.value = { status: 'building', message: '' };
            batchExtractProgress.value = { current: 0, total: 0 };
            let totalAdded = 0;

            try {
                if (!memorySettings.emptyTurns) memorySettings.emptyTurns = {};
                const uuid = getCurrentChatStorageScopeId() || currentCharacter.value.uuid;
                const emptyLogKey = getMemoryEmptyTurnsKey(uuid);
                if (!memorySettings.emptyTurns[emptyLogKey]) memorySettings.emptyTurns[emptyLogKey] = [];
                const emptyLog = memorySettings.emptyTurns[emptyLogKey];
                if (!memorySettings.vectorExtractedTurns) memorySettings.vectorExtractedTurns = {};
                const extractedKey = getMemoryVectorExtractedKey(uuid);

                while (getBatchExtractAbort() === batchController && !batchController.signal.aborted) {
                    setVectorBatchRescanRequested(false);
                    const snapshot = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false });
                    const safeTurns = isConversationBusy.value ? snapshot.turns.slice(0, -1) : snapshot.turns;
                    const emptyTurnSet = new Set(emptyLog);
                    let lastExtracted = Number(memorySettings.vectorExtractedTurns[extractedKey]) || 0;
                    let chunks = safeTurns
                        .filter(turnInfo => {
                            const turn = Number(turnInfo.turn) || 0;
                            if (!manual && turn <= lastExtracted) return false;
                            return !emptyTurnSet.has(turn);
                        })
                        .map(turnInfo => ({
                            data: turnInfo.messages,
                            endIdx: turnInfo.endIndex,
                            turnValue: turnInfo.turn
                        }));
                    // v4 自愈：分片为 0 但标记称已提取（清空重建漏清标记等历史脏状态）→ 重置标记全量重扫
                    if (!manual
                        && memories.value.length === 0
                        && lastExtracted > 0
                        && chunks.length === 0
                        && safeTurns.some(turnInfo => {
                            const turn = Number(turnInfo.turn) || 0;
                            return turn <= lastExtracted && !emptyTurnSet.has(turn);
                        })) {
                        delete memorySettings.vectorExtractedTurns[extractedKey];
                        await saveMemorySettingsNow().catch(() => { });
                        lastExtracted = 0;
                        chunks = safeTurns
                            .filter(turnInfo => !emptyTurnSet.has(Number(turnInfo.turn) || 0))
                            .map(turnInfo => ({
                                data: turnInfo.messages,
                                endIdx: turnInfo.endIndex,
                                turnValue: turnInfo.turn
                            }));
                    }
                    const scannedTurnCount = safeTurns.length;
                    const added = chunks.length > 0
                        ? await _doBatchEmbedMemoryChunks(chunks, batchController.signal, emptyLog, { interactive: manual })
                        : 0;
                    totalAdded += added;

                    if (isConversationBusy.value) {
                        await waitForMemoryConversationIdle(batchController.signal);
                        continue;
                    }
                    const currentTurnCount = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false }).turns.length;
                    if (added > 0 || getVectorBatchRescanRequested() || currentTurnCount !== scannedTurnCount) continue;
                    // 全部处理完成：推进已提取轮次标记，避免下次切换角色时重复全量重扫
                    const maxTurn = safeTurns.reduce((max, turnInfo) => Math.max(max, Number(turnInfo.turn) || 0), 0);
                    if (maxTurn > lastExtracted) {
                        memorySettings.vectorExtractedTurns[extractedKey] = maxTurn;
                        await saveMemorySettingsNow();
                    }
                    break;
                }

                if (getBatchExtractAbort() === batchController) {
                    if (totalAdded > 0) {
                        sliceBuildStatus.value = { status: 'done', message: `已生成 ${totalAdded} 个分片` };
                        if (manual) showToast(`向量补录完成：新增 ${totalAdded} 个分片`, 'success');
                    } else {
                        sliceBuildStatus.value = { status: 'done', message: '没有需要补录的分片' };
                        if (manual) showNoMemoryNeededModal.value = true;
                    }
                }
            } catch (error) {
                if (getBatchExtractAbort() !== batchController) return;
                if (error.name !== 'AbortError') {
                    sliceBuildStatus.value = {
                        status: 'error',
                        message: String(error?.message || error)
                    };
                    console.error('Vector memory patrol failed:', error);
                }
            } finally {
                if (getBatchExtractAbort() === batchController) {
                    setBatchExtractAbort(null);
                    isBatchExtracting.value = false;
                }
            }
        };    return { startVectorBatchMemoryExtraction };
}
