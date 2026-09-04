// useActiveToolPipeline — active tool queue execution (Phase 3.0, roadmap 3.0)
//
// Owns handleActiveToolCallFromAssistant, previously inlined in app.mjs
// setup(): tool call promotion/parsing, the abortable queue run (keyword /
// web batch / vector searches), inline result bookkeeping and the recursive
// continuation into generateResponse. The moved code is byte-identical to
// the app.mjs original except for the run AbortController, which stays in
// the app.mjs chatState binding and is reached through get/set accessors so
// stopGeneration can abort an in-flight queue (same shared-guard bridge
// pattern as useCardOperations.setApplyingCharacterScopedData).
//
// Mutual recursion with useMessageSender: the pipeline calls generateResponse
// while useMessageSender receives handleActiveToolCallFromAssistant as a
// dep. app.mjs resolves the cycle with a late-bound wrapper — the deps
// object passes (...args) => activeToolPipeline.handleActiveToolCallFromAssistant(...args)
// and the binding is assigned right after this factory is wired (invocation
// happens at runtime only, never during setup()).
//
// Contract locks: tests/composables-contract.test.mjs.

import { cleanupActiveToolCaptureState, stripActiveToolCallsFromAssistant } from '../modules/utils.mjs';
import { RPHRequestDiagnostics } from '../modules/request-diagnostics.mjs';

export function useActiveToolPipeline(deps) {
    const {
        // chat state / generation flags
        activeToolHandoffPending,
        activeToolQueueRunning,
        activeToolContinuationPending,
        activeToolContinuationHasResponse,
        memorySettings,
        currentCharacter,
        // shared guard bridge: the run AbortController lives in the app.mjs
        // chatState binding so stopGeneration can abort an in-flight queue
        getActiveToolQueueAbortController,
        setActiveToolQueueAbortController,
        // tool parsing / attachment helpers
        promoteActiveToolCallsFromAssistant,
        buildActiveToolCallFromUi,
        findActiveToolCallsInAssistantMessage,
        attachActiveToolCallsToAssistant,
        createAbortReason,
        // tool predicates + search backends
        isVectorActiveTool,
        isKeywordActiveTool,
        isWebActiveTool,
        searchDialogueByKeywordForTool,
        searchWebByTavilyForTool,
        searchVectorMemoriesForTool,
        // result context helpers / orchestration
        updateActiveToolResultContext,
        normalizeActiveToolResultContext,
        formatActiveToolResultContext,
        formatActiveToolErrorContext,
        markActiveToolInlineWorkCancelled,
        appendAssistantResponseError,
        saveChatHistoryNow,
        getCurrentChatStorageScopeId,
        // late-bound generation entry (mutual recursion with useMessageSender)
        generateResponse
    } = deps;

    const ACTIVE_TOOL_MAX_AUTO_CONTINUE = 4;

        const handleActiveToolCallFromAssistant = async (assistantMessage, activeToolDepth = 0) => {
            // Open a dedicated "tool execution" activity journal record that
            // carries every per-tool behaviour.  We don't rely on the chat
            // record because it may already be complete()'d by the time the
            // tool pipeline runs; a standalone record keeps timings honest
            // and avoids accidental coupling to the chat handle lifecycle.
            const toolScope = {
                characterId: currentCharacter?.value?.id || '',
                characterName: currentCharacter?.value?.name || '',
                chatScopeId: (typeof getCurrentChatStorageScopeId === 'function' ? getCurrentChatStorageScopeId() : '') || '',
                assistantMessageId: assistantMessage?.id || '',
                activeToolDepth
            };
            const toolJournal = (RPHRequestDiagnostics?.begin?.({
                category: 'tool',
                action: 'execute_batch',
                scope: toolScope
            })) || null;
            promoteActiveToolCallsFromAssistant(assistantMessage);
            let toolUis = Array.isArray(assistantMessage?.toolCalls)
                ? assistantMessage.toolCalls.filter(toolCall => ['queued', 'running'].includes(toolCall?.status))
                : [];
            let toolCalls = toolUis.map(buildActiveToolCallFromUi).filter(toolCall => toolCall.query);

            if (toolCalls.length === 0) {
                toolCalls = findActiveToolCallsInAssistantMessage(assistantMessage);
            }
            if (toolCalls.length === 0) {
                const receivingToolUis = Array.isArray(assistantMessage?.toolCalls)
                    ? assistantMessage.toolCalls.filter(toolCall => toolCall?.status === 'receiving')
                    : [];
                if (receivingToolUis.length > 0) {
                    receivingToolUis.forEach(toolUi => {
                        toolUi.status = 'error';
                        toolUi.error = '工具调用没有完整输出，请重试。';
                        toolUi.resultText = toolUi.error;
                    });
                    await saveChatHistoryNow();
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                toolJournal?.complete?.();
                return false;
            }

            toolJournal?.input?.({
                kind: 'tool_batch',
                chars: toolCalls.reduce((sum, tc) => sum + String(tc?.query || '').length, 0),
                summary: `${toolCalls.length} tool call(s): ${toolCalls.slice(0, 3).map(tc => tc?.tool?.name || 'tool').join(', ')}`
            });

            if (activeToolDepth >= ACTIVE_TOOL_MAX_AUTO_CONTINUE) {
                toolJournal?.behavior?.({ name: 'tool_queue_gate', result: 'failed', summary: 'max auto-continue reached' });
                if (toolUis.length === 0) {
                    stripActiveToolCallsFromAssistant(assistantMessage, toolCalls);
                } else {
                    toolUis.forEach(toolUi => {
                        toolUi.status = 'error';
                    });
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                await saveChatHistoryNow();
                toolJournal?.fail?.(new Error('active tool max auto-continue depth reached'));
                return false;
            }

            if (toolUis.length === 0) {
                toolUis = attachActiveToolCallsToAssistant(assistantMessage, toolCalls);
            }
            if (toolUis.length === 0) {
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolHandoffPending.value = false;
                toolJournal?.complete?.();
                return false;
            }
            await saveChatHistoryNow();

            const toolAbort = new AbortController();
            activeToolQueueRunning.value = true;
            activeToolHandoffPending.value = false;
            setActiveToolQueueAbortController(toolAbort);
            let continuationToolUi = null;
            let hasToolResult = false;

            const applyActiveToolSuccessRecord = (record) => {
                if (!record?.ok) return;
                updateActiveToolResultContext(record.resultContext, record.toolCall.mode);
                continuationToolUi = record.toolUi;
                hasToolResult = true;
            };

            const runActiveToolCallSafely = async (toolCall, toolUi, options = {}) => {
                const toolName = toolCall?.tool?.name || 'unknown';
                const toolMode = toolCall?.mode || (isKeywordActiveTool(toolCall?.tool) ? 'keyword'
                    : isWebActiveTool(toolCall?.tool) ? 'web'
                    : isVectorActiveTool(toolCall?.tool) ? 'vector' : 'unknown');
                const startedAt = Date.now();
                try {
                    if (toolAbort.signal.aborted) throw createAbortReason('Generation cancelled by user');
                    if (options.markRunning !== false) {
                        toolUi.status = 'running';
                        await saveChatHistoryNow();
                    }

                    if (isVectorActiveTool(toolCall.tool) && !memorySettings.enabled) {
                        throw new Error('记忆系统未开启，无法执行向量检索。');
                    }

                    const results = isKeywordActiveTool(toolCall.tool)
                        ? searchDialogueByKeywordForTool(toolCall.query, toolCall.tool.resultCount, {
                            excludeMessageId: assistantMessage.id
                        })
                        : isWebActiveTool(toolCall.tool)
                        ? await searchWebByTavilyForTool(
                            toolCall.query,
                            toolCall.tool,
                            toolAbort.signal
                        )
                        : await searchVectorMemoriesForTool(
                            toolCall.query,
                            toolCall.tool.resultCount,
                            toolAbort.signal
                        );
                    if (toolAbort.signal.aborted) throw createAbortReason('Generation cancelled by user');

                    const resultContext = normalizeActiveToolResultContext(
                        formatActiveToolResultContext(toolCall.tool, toolCall.query, results, toolCall.mode),
                        toolCall.tool,
                        toolCall.query,
                        toolCall.mode
                    );
                    toolUi.status = 'done';
                    toolUi.resultCount = Array.isArray(results) ? results.length : 0;
                    toolUi.resultText = resultContext;
                    toolJournal?.behavior?.({
                        name: `tool_${toolName}`,
                        result: 'ok',
                        chars: String(resultContext || '').length,
                        meta: {
                            mode: toolMode,
                            resultCount: toolUi.resultCount,
                            durationMs: Math.max(0, Date.now() - startedAt),
                            queryChars: String(toolCall?.query || '').length
                        }
                    });
                    await saveChatHistoryNow();
                    return {
                        ok: true,
                        toolCall,
                        toolUi,
                        resultContext
                    };
                } catch (err) {
                    if (err.name === 'AbortError') {
                        toolJournal?.behavior?.({
                            name: `tool_${toolName}`,
                            result: 'cancelled',
                            meta: { mode: toolMode, durationMs: Math.max(0, Date.now() - startedAt) }
                        });
                        return { aborted: true, toolCall, toolUi };
                    }
                    const resultContext = formatActiveToolErrorContext(toolCall.tool, toolCall.query, err, toolCall.mode);
                    toolUi.status = 'error';
                    toolUi.error = err.message || '工具检索失败';
                    toolUi.resultCount = 0;
                    toolUi.resultText = resultContext;
                    toolJournal?.behavior?.({
                        name: `tool_${toolName}`,
                        result: 'failed',
                        chars: String(resultContext || '').length,
                        meta: {
                            mode: toolMode,
                            durationMs: Math.max(0, Date.now() - startedAt),
                            queryChars: String(toolCall?.query || '').length
                        },
                        summary: String(err?.message || 'tool error').slice(0, 80)
                    });
                    await saveChatHistoryNow();
                    return { ok: true, toolCall, toolUi, resultContext, error: err };
                }
            };

            const flushWebToolBatch = async (webBatch) => {
                if (!webBatch.length) return;
                webBatch.forEach(({ toolUi }) => {
                    toolUi.status = 'running';
                });
                await saveChatHistoryNow();

                const records = await Promise.all(webBatch.map(({ toolCall, toolUi }) => (
                    runActiveToolCallSafely(toolCall, toolUi, { markRunning: false })
                )));
                if (records.some(record => record?.aborted)) {
                    throw createAbortReason('Generation cancelled by user');
                }
                records.forEach(applyActiveToolSuccessRecord);
                webBatch.length = 0;
            };

            try {
                const webBatch = [];
                for (let index = 0; index < toolCalls.length; index += 1) {
                    const toolCall = toolCalls[index];
                    const toolUi = toolUis[index];
                    if (isWebActiveTool(toolCall.tool)) {
                        webBatch.push({ toolCall, toolUi });
                        continue;
                    }

                    await flushWebToolBatch(webBatch);
                    const record = await runActiveToolCallSafely(toolCall, toolUi);
                    if (record?.aborted) {
                        markActiveToolInlineWorkCancelled();
                        await saveChatHistoryNow();
                        return false;
                    }
                    applyActiveToolSuccessRecord(record);
                }
                await flushWebToolBatch(webBatch);

                if (!hasToolResult || !continuationToolUi) {
                    toolJournal?.output?.({
                        contentChars: 0
                    });
                    toolJournal?.complete?.();
                    return false;
                }
                if (toolAbort.signal.aborted) {
                    markActiveToolInlineWorkCancelled();
                    await saveChatHistoryNow();
                    toolJournal?.fail?.(new Error('tool queue aborted by user'));
                    return false;
                }

                if (continuationToolUi.status !== 'error') {
                    continuationToolUi.status = 'continuing';
                }
                cleanupActiveToolCaptureState(assistantMessage);
                activeToolQueueRunning.value = false;
                activeToolContinuationPending.value = true;
                await saveChatHistoryNow();
                toolJournal?.behavior?.({
                    name: 'tool_generate_continuation',
                    result: 'ok',
                    meta: { nextDepth: activeToolDepth + 1 }
                });
                toolJournal?.complete?.();
                await generateResponse(Date.now(), {
                    activeToolDepth: activeToolDepth + 1,
                    continueAssistantMessageId: assistantMessage.id,
                    continuationToolCallId: continuationToolUi.id
                });
                if (continuationToolUi.status === 'continuing') {
                    continuationToolUi.status = 'done';
                }
                await saveChatHistoryNow();
                return true;
            } catch (err) {
                if (err.name === 'AbortError') {
                    markActiveToolInlineWorkCancelled();
                    await saveChatHistoryNow();
                    toolJournal?.fail?.(err);
                    return false;
                }
                if (assistantMessage) {
                    const errorMessage = err.message || '生成失败';
                    appendAssistantResponseError(assistantMessage, errorMessage);
                    activeToolContinuationHasResponse.value = true;
                    await saveChatHistoryNow();
                }
                toolJournal?.fail?.(err);
                return false;
            } finally {
                if (getActiveToolQueueAbortController() === toolAbort) {
                    setActiveToolQueueAbortController(null);
                }
                activeToolHandoffPending.value = false;
                activeToolQueueRunning.value = false;
                activeToolContinuationPending.value = false;
                cleanupActiveToolCaptureState(assistantMessage);
                await saveChatHistoryNow();
            }
        };
    return { handleActiveToolCallFromAssistant };
}
