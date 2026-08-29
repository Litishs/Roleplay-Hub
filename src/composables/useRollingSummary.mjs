// useRollingSummary — rolling memory summary chain (Phase 3.0, roadmap 3.0)
//
// Owns runRollingSummaryCheck, previously inlined in app.mjs setup(): the
// per-scope rolling summary chain that batches conversation turns into
// long/short summaries (and optionally merges character/plot profile
// updates per batch), with failed-batch bookkeeping, progress reporting
// and the processed>200 safety cap. The moved code is byte-identical to
// the app.mjs original except for two shared mutable guards which stay in
// the app.mjs chatState bindings (abortRollingSummary and the memory
// patrol read them) and are reached through get/set accessors — the
// shared-guard bridge pattern.
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - summaryLib()/profileLib() module aliases are recreated from direct
//   module imports (same objects app.mjs aliases); everything else is a dep.
// Contract locks: tests/composables-contract.test.mjs.

import * as RPHMemorySummary from '../modules/memory-summary.mjs';
import * as RPHMemoryProfile from '../modules/memory-profile.mjs';

export function useRollingSummary(deps) {
    const {
        // memory state
        currentCharacter,
        chatHistory,
        user,
        memorySettings,
        memoryProfile,
        // shared guard bridges (in-flight flag + abort controller)
        getSummaryInFlight,
        setSummaryInFlight,
        getSummaryAbortController,
        setSummaryAbortController,
        // summary domain helpers
        getMemorySummaries,
        getMemoryProfile,
        saveMemorySummariesNow,
        saveMemoryProfileNow,
        setSummaryProgress,
        clearSummaryProgress,
        requestRollingSummary,
        // context helpers
        getCurrentChatStorageScopeId,
        buildConversationTurnSnapshot,
        showToast
    } = deps;
    const summaryLib = () => RPHMemorySummary;
    const profileLib = () => RPHMemoryProfile;
        const runRollingSummaryCheck = async (options = {}) => {
            const lib = summaryLib();
            if (!lib || !memorySettings.enabled || !currentCharacter.value?.uuid) return false;
            if (getSummaryInFlight()) return false;
            const current = getMemorySummaries();
            const historySnapshot = chatHistory.value;
            const turnCount = buildConversationTurnSnapshot(historySnapshot, { includeSystem: false }).turns.length;
            const state = {
                keepFloors: memorySettings.keepFloors,
                batchSize: memorySettings.summaryBatchSize
            };
            const force = options.force === true;
            const firstBatch = lib.computePendingBatch(current.batches, turnCount, state, { force });
            if (!firstBatch) {
                if (options.force === true) {
                    showToast(`当前对话 ${turnCount} 轮未超过保留窗口（${memorySettings.keepFloors} 轮），暂无需要总结的内容，继续聊天后会自动总结`, 'info');
                }
                return false;
            }
            const scopeId = getCurrentChatStorageScopeId();
            // v4 链快照：链内每批只读这里捕获的数据，切换角色/分支由 abortRollingSummary 中止，杜绝混合写入
            const chainContext = {
                summaries: current,
                profile: profileLib() ? getMemoryProfile() : null,
                historySnapshot,
                characterName: currentCharacter.value?.name || '角色',
                userRoleName: user.name || '用户'
            };
            const abortController = new AbortController();
            setSummaryAbortController(abortController);
            setSummaryInFlight(true);
            try {
                let processed = 0;
                let chainProfile = chainContext.profile;
                while (true) {
                    // 双保险：作用域已切换（中止信号丢失时）立即停链，保留已完成批次
                    if (getCurrentChatStorageScopeId() !== scopeId) break;
                    const batch = lib.computePendingBatch(current.batches, turnCount, state, { force });
                    if (!batch) break;
                    setSummaryProgress({ ...batch, status: 'running' }, false);
                    try {
                        const parsed = await requestRollingSummary(batch, abortController.signal, chainContext);
                        current.long = parsed.long || current.long;
                        current.short = parsed.short;
                        current.batches = lib.pruneCoveredFailedBatches([...current.batches, { ...batch, status: 'done', at: Date.now() }]);
                        current.updatedAt = Date.now();
                        await saveMemorySummariesNow(scopeId, current);
                        if (parsed.profile && profileLib() && chainProfile) {
                            // 链内逐批累计合并（旧实现在快照上合并，同链多批时只保留最后一批的信息卡更新）
                            const mergedCharacters = profileLib().mergeCharacters(parsed.profile.characters, chainProfile, batch.toTurn);
                            const mergedPlots = profileLib().mergeOpenPlots(parsed.profile.openPlots, chainProfile, batch.toTurn);
                            chainProfile = {
                                ...chainProfile,
                                characters: mergedCharacters.characters,
                                openPlots: mergedPlots.openPlots,
                                updatedAt: Date.now()
                            };
                            if (getCurrentChatStorageScopeId() === scopeId) {
                                memoryProfile.value = chainProfile;
                            }
                            await saveMemoryProfileNow(scopeId, chainProfile);
                        }
                        processed++;
                    } catch (error) {
                        if (error?.name === 'AbortError') {
                            clearSummaryProgress();
                            break;
                        }
                        const failedEntry = {
                            ...batch,
                            status: 'failed',
                            at: Date.now(),
                            error: String(error?.message || error)
                        };
                        current.batches = [...current.batches, failedEntry];
                        current.updatedAt = Date.now();
                        await saveMemorySummariesNow(scopeId, current).catch(() => { });
                        setSummaryProgress({ ...batch, status: 'failed' });
                        console.error('Rolling summary failed:', error);
                        break;
                    }
                    if (processed > 200) break; // 安全上限，防止异常死循环
                }
                if (processed > 0) {
                    setSummaryProgress({ fromTurn: firstBatch.fromTurn, toTurn: current.batches[current.batches.length - 1]?.toTurn || firstBatch.toTurn, status: 'done' });
                }
                return true;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    current.batches = [...current.batches, {
                        ...firstBatch,
                        status: 'failed',
                        at: Date.now(),
                        error: String(error.message || error)
                    }];
                    setSummaryProgress({ ...firstBatch, status: 'failed' });
                    console.error('Rolling summary failed:', error);
                }
                return false;
            } finally {
                setSummaryInFlight(false);
                if (getSummaryAbortController() === abortController) setSummaryAbortController(null);
            }
        };    return { runRollingSummaryCheck };
}
