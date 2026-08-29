// useUiTemplatePipeline — UI template variable analysis pipeline (Phase 3.0, roadmap 3.0)
//
// Owns the chat-driven UI template update run previously inlined in app.mjs
// setup(): status marking, the abortable run lifecycle (seq + AbortController,
// now private to this composable instead of living in useUiState), retryable
// analysis requests (batch mode + per-template fallback), update application
// and persistence. The moved code is byte-identical to the app.mjs original.
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - app.mjs passes chat/template state refs and the orchestration helpers
//   (context assembly, api usage recording, persistence) and destructures
//   markUiTemplateStatus / failUiTemplateAnalysis / abortUiTemplateUpdate /
//   updateUiTemplatesFromChat.
// - markUiTemplateStatus stays reachable for the main-model fallback path and
//   view reset paths in app.mjs; abortUiTemplateUpdate is consumed by
//   app.mjs call sites and useCardOperations.
// - Engine pure functions come from ui-template-engine.mjs (same module app.mjs
//   uses); runWithConcurrency / stringifyUiSchema / generateUUID / parseCot
//   from utils.mjs.
// Contract locks: tests/api-resilience-contract.test.mjs, tests/composables-contract.test.mjs.

import { generateUUID, parseCot, runWithConcurrency, stringifyUiSchema } from '../modules/utils.mjs';
import engine from '../modules/ui-template-engine.mjs';

const { parseUiTemplateUpdateJson, normalizeUiTemplateUpdateList, applyUiTemplateUpdateListToTemplate } = engine || {};

export function useUiTemplatePipeline(deps) {
    const {
        // settings / status / chat-template state
        settings,
        uiTemplateUpdateStatus,
        currentCharacter,
        user,
        chatHistory,
        activeUiTemplates,
        // chat context assembly
        buildConversationTurnSnapshot,
        getPostprocessedChatMessages,
        getLastAssistantMessage,
        getAssistantTurnAtIndex,
        buildUserInfoPrompt,
        // api plumbing
        getChatProvider,
        getChatProviderEndpoint,
        getMaxOutputTokens,
        recordApiUsage,
        getApiUsagePayload,
        // template attachment / persistence
        attachUiTemplateBlocksToLastAssistant,
        saveGlobalUiTemplateRuntimeForCharacter,
        saveData,
        saveChatHistoryNow
    } = deps;

    // run lifecycle guards (previously let-destructured from useUiState)
    let uiTemplateUpdateSeq = 0;
    let uiTemplateUpdateAbortController = null;

    const UI_TEMPLATE_ANALYSIS_TIMEOUT_MS = 60000;
    const UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS = 2;
    const UI_TEMPLATE_ANALYSIS_CONCURRENCY = 3;
    const UI_TEMPLATE_BATCH_MAX_TEMPLATES = 5;
    const UI_TEMPLATE_BATCH_MAX_PAYLOAD_BYTES = 200 * 1024;

        const markUiTemplateStatus = (state, message, remaining = 0, targetMessageId = null) => {
            uiTemplateUpdateStatus.state = state;
            uiTemplateUpdateStatus.message = message;
            uiTemplateUpdateStatus.time = Date.now();
            uiTemplateUpdateStatus.remaining = remaining;
            uiTemplateUpdateStatus.targetMessageId = targetMessageId;
        };

        const failUiTemplateAnalysis = (message, targetMessageId = null) => {
            markUiTemplateStatus('error', message, 0, targetMessageId);
            // 2026-08-05: 变量分析失败只保留界面内联红条状态，不再弹 toast。
            // 断网/服务失败时用户只应在聊天窗口看到角色回复气泡，避免“弹窗”干扰。
        };

        const startUiTemplateUpdateRun = () => {
            if (uiTemplateUpdateAbortController) {
                uiTemplateUpdateAbortController.abort();
            }
            uiTemplateUpdateAbortController = new AbortController();
            const seq = ++uiTemplateUpdateSeq;
            return { seq, signal: uiTemplateUpdateAbortController.signal };
        };

        const isUiTemplateUpdateRunCurrent = (seq, targetMessageId) => (
            seq === uiTemplateUpdateSeq
            && uiTemplateUpdateAbortController
            && !uiTemplateUpdateAbortController.signal.aborted
            && (!targetMessageId || chatHistory.value.some(msg => msg && msg.id === targetMessageId))
        );

        const abortUiTemplateUpdate = (targetMessageId = null) => {
            if (targetMessageId && uiTemplateUpdateStatus.targetMessageId && uiTemplateUpdateStatus.targetMessageId !== targetMessageId) return;
            if (uiTemplateUpdateAbortController) {
                uiTemplateUpdateAbortController.abort();
                uiTemplateUpdateAbortController = null;
            }
            uiTemplateUpdateSeq++;
            if (!targetMessageId || uiTemplateUpdateStatus.targetMessageId === targetMessageId) {
                markUiTemplateStatus('idle', '待命');
            }
        };

        const isRetryableUiTemplateError = (error) => {
            if (!error) return false;
            if (error?.name === 'AbortError') return true;
            const status = Number(error?.status);
            if (status === 429 || (status >= 500 && status <= 599)) return true;
            if (error instanceof TypeError) return true;
            return false;
        };

        const createUiTemplateRequestSignal = (signal) => {
            if (typeof AbortSignal !== 'undefined'
                && typeof AbortSignal.any === 'function'
                && typeof AbortSignal.timeout === 'function') {
                return AbortSignal.any([signal, AbortSignal.timeout(UI_TEMPLATE_ANALYSIS_TIMEOUT_MS)]);
            }
            return signal;
        };

        const sleepUiTemplateRetry = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const updateUiTemplatesFromChat = async ({ manual = false, targetMessageId = null, forceSuggestions = false } = {}) => {
            if (!settings.uiTemplateEnabled) {
                markUiTemplateStatus('skipped', '未开启');
                return false;
            }
            if (!currentCharacter.value) {
                markUiTemplateStatus('skipped', '未选择角色卡');
                return false;
            }
            const templates = activeUiTemplates.value;
            if (!templates.length) {
                markUiTemplateStatus('skipped', '无启用模板');
                return false;
            }
            if (buildConversationTurnSnapshot().turns.length < 1) {
                markUiTemplateStatus('skipped', '对话不足');
                return false;
            }

            const targetMessage = targetMessageId
                ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === targetMessageId)
                : getLastAssistantMessage();
            if (!targetMessage) {
                markUiTemplateStatus('skipped', '无AI回复');
                return false;
            }
            if (!targetMessage.id) targetMessage.id = generateUUID();
            const lockedTargetMessageId = targetMessage.id;
            const targetMessageIndex = chatHistory.value.findIndex(msg => msg === targetMessage || msg.id === lockedTargetMessageId);
            const contextMessages = targetMessageIndex >= 0 ? chatHistory.value.slice(0, targetMessageIndex + 1) : chatHistory.value;

            const uiTemplateAnalysisDepth = Number(settings.uiTemplateAnalysisDepth);
            const normalizedUiTemplateAnalysisDepth = Number.isFinite(uiTemplateAnalysisDepth)
                ? Math.max(4, Math.min(10, uiTemplateAnalysisDepth))
                : 4;
            const sourceMessages = getPostprocessedChatMessages(contextMessages, { includeSystem: false })
                .map(m => ({
                    role: m.role,
                    name: m.role === 'user' ? user.name : (m.name || currentCharacter.value.name),
                    content: parseCot(m.content || '').main
                }));
            const recentMessages = sourceMessages.slice(-normalizedUiTemplateAnalysisDepth);

            const chatProviderForAnalysis = getChatProvider();
            if (!chatProviderForAnalysis.apiKey) {
                markUiTemplateStatus('skipped', '未填 API Key');
                return false;
            }
            // D2：分析模型必填。不再静默回退主模型（主模型可能刚失败，回退无意义）。
            const analysisModel = (settings.uiTemplateModel || '').trim();
            if (!analysisModel) {
                markUiTemplateStatus('skipped', '未配置分析模型');
                return false;
            }
            const url = getChatProviderEndpoint('chat/completions');

            try {
                const updateRun = startUiTemplateUpdateRun();
                const isCurrentRun = () => isUiTemplateUpdateRunCurrent(updateRun.seq, lockedTargetMessageId);
                markUiTemplateStatus('running', '分析中', templates.length, lockedTargetMessageId);
                const turn = getAssistantTurnAtIndex(targetMessageIndex);
                let hasChanges = false;
                let changedFieldCount = 0;
                let changedTemplateCount = 0;
                let failedTemplateCount = 0;
                let rejectedFieldCount = 0;
                let firstFailureMessage = '';
                const failedTemplateIds = new Set();
                const pendingTemplateUpdates = [];

                // D1：合并请求模式（默认开）。模板数 > 5 或 payload 超 200KB 时自动回退逐模板。
                let batchPayload = null;
                if (settings.uiTemplateBatchMode !== false
                    && templates.length > 1
                    && templates.length <= UI_TEMPLATE_BATCH_MAX_TEMPLATES) {
                    try {
                        batchPayload = JSON.stringify({
                            templates: templates.map(template => ({
                                id: template.id,
                                name: template.name || 'UI模板',
                                currentVariables: template.variableState || {},
                                variableSchema: stringifyUiSchema(template.variableSchema)
                            })),
                            recentMessages
                        });
                    } catch (e) {
                        batchPayload = null;
                    }
                }
                const useBatchMode = batchPayload !== null
                    && batchPayload.length <= UI_TEMPLATE_BATCH_MAX_PAYLOAD_BYTES;

                const normalizeUiTemplateUpdates = (parsed) => {
                    if (Array.isArray(parsed)) {
                        return [{ variables: parsed, reason: '' }];
                    }
                    if (!parsed || typeof parsed !== 'object') return [];
                    if (Array.isArray(parsed.updates)) {
                        return parsed.updates
                            .map(update => {
                                if (!update || typeof update !== 'object') return null;
                                if (Object.prototype.hasOwnProperty.call(update, 'variables')) {
                                    return {
                                        ...(update.id !== undefined ? { id: update.id } : {}),
                                        ...(update.name !== undefined ? { name: update.name } : {}),
                                        variables: update.variables,
                                        reason: String(update.reason || '').trim()
                                    };
                                }
                                return { variables: update, reason: '' };
                            })
                            .filter(Boolean);
                    }
                    if (Object.prototype.hasOwnProperty.call(parsed, 'variables')) {
                        return [{
                            ...(parsed.id !== undefined ? { id: parsed.id } : {}),
                            ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                            variables: parsed.variables,
                            reason: String(parsed.reason || '').trim()
                        }];
                    }
                    return [{ variables: parsed, reason: '' }];
                };

                const applyTemplateUpdates = (template, updates, model) => {
                    updates.forEach(update => {
                        const result = applyUiTemplateUpdateListToTemplate(template, [update], { model, turn, matchName: false });
                        if (result.changed) {
                            changedTemplateCount += 1;
                            changedFieldCount += result.fieldCount;
                            hasChanges = true;
                        }
                        if (result.rejectedKeys && result.rejectedKeys.length) {
                            rejectedFieldCount += result.rejectedKeys.length;
                        }
                    });
                };

                if (useBatchMode) {
                    const batchModel = analysisModel;
                    const buildBatchMessages = () => [
                        {
                            role: 'system',
                            content: [
                                '你是RP-Hub的UI变量更新器。当前请求同时分析多个UI模板。',
                                '只根据用户消息里提供的最近对话，更新下方每个模板已定义的变量。',
                                '严格返回JSON，不要解释，不要输出Markdown围栏，不要输出任何额外字段。',
                                '返回格式固定为 {"updates":[{"id":"模板id","variables":{"变量路径":"新值"},"reason":"简短原因"}]}。',
                                '每个模板最多返回一条更新；没有变化的模板不要出现在updates里。',
                                ...(forceSuggestions ? ['本次请求为手动刷新建议：每个模板的 action_1/2/3 建议必须按最新情境重新生成，不要沿用上一轮。'] : []),
                                '变量值可以是文字、数字、对象或JSON数组；数组字段可返回完整数组，也可用 "items.0.name" 这种路径更新单项。',
                                '只更新每个模板已定义的变量；不要修改HTML；不要编造无关字段。',
                                '',
                                '用户信息如下（用于判断称呼、人称和用户相关变量；不要在JSON外复述）：',
                                buildUserInfoPrompt()
                            ].join('\n')
                        },
                        {
                            role: 'user',
                            content: batchPayload
                        }
                    ];
                    let batchLastError = null;
                    let batchSucceeded = false;
                    for (let attempt = 0; attempt < UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS; attempt++) {
                        if (!isCurrentRun()) return false;
                        try {
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${chatProviderForAnalysis.apiKey}`
                                },
                                body: JSON.stringify({
                                    model: batchModel,
                                    temperature: 0.2,
                                    max_tokens: getMaxOutputTokens(),
                                    ...(settings.uiTemplateJsonMode !== false ? { response_format: { type: 'json_object' } } : {}),
                                    stream: false,
                                    messages: buildBatchMessages()
                                }),
                                signal: createUiTemplateRequestSignal(updateRun.signal)
                            });
                            if (!isCurrentRun()) return false;
                            if (!response.ok) {
                                const error = new Error(`API Error: ${response.status}`);
                                error.status = response.status;
                                throw error;
                            }
                            const data = await response.json();
                            if (!isCurrentRun()) return false;
                            const content = data.choices?.[0]?.message?.content || '';
                            console.log('[UI模板变量分析] 合并请求原始返回:', content);
                            const updates = normalizeUiTemplateUpdateList(parseUiTemplateUpdateJson(content));
                            recordApiUsage(getApiUsagePayload(data), {
                                type: 'ui_template_batch',
                                model: batchModel,
                                detail: `${templates.length} 个模板合并`
                            });
                            updates.forEach(update => {
                                const targets = update?.id
                                    ? templates.filter(template => template.id === update.id)
                                    : (update?.name ? templates.filter(template => template.name === update.name) : []);
                                targets.forEach(template => pendingTemplateUpdates.push({ template, updates: [update], model: batchModel }));
                            });
                            batchSucceeded = true;
                            break;
                        } catch (e) {
                            if (updateRun.signal.aborted || !isCurrentRun()) return false;
                            batchLastError = e;
                            if (!isRetryableUiTemplateError(e) || attempt >= UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS - 1) break;
                            uiTemplateUpdateStatus.message = `重试中 (${attempt + 1}/${UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS})`;
                            await sleepUiTemplateRetry(800 * (attempt + 1));
                        }
                    }
                    uiTemplateUpdateStatus.remaining = 0;
                    if (!batchSucceeded && isCurrentRun()) {
                        failedTemplateCount = templates.length;
                        templates.forEach(template => failedTemplateIds.add(template.id));
                        firstFailureMessage = String(batchLastError?.message || batchLastError || '未知错误');
                        console.warn('[UI模板] 合并请求失败:', firstFailureMessage);
                    }
                } else {
                await runWithConcurrency(templates, UI_TEMPLATE_ANALYSIS_CONCURRENCY, async (template) => {
                    const model = analysisModel;
                    const currentVariableJson = JSON.stringify(template.variableState || {}, null, 2);
                    const variableSchemaText = stringifyUiSchema(template.variableSchema).trim();
                    const buildAnalysisMessages = () => [
                        {
                            role: 'system',
                            content: [
                                '你是RP-Hub的UI变量更新器。当前请求只分析一个UI模板。',
                                '只根据用户消息里提供的最近对话，更新下方模板已定义的变量。',
                                '严格返回JSON，不要解释，不要输出Markdown，不要输出任何额外字段。',
                                '返回格式固定为 {"variables":{"变量路径":"新值"},"reason":"简短原因"}，例如 {"variables":{"a_line_1":"新台词","a_line_3":"新台词"},"reason":"对话内容更新了角色台词"}。',
                                '变量值可以是文字、数字、对象或JSON数组；装备栏、背包、日志这类列表可直接返回完整数组字段，例如 {"equipment":[{"slot":"武器","name":"短剑"}]}。',
                                '如果模板根变量本身就是数组，可以直接返回JSON数组；如果只改数组里的一个小项，也可以返回 {"equipment.0.name":"短剑"} 这种路径对象。',
                                '没有变化则返回 {"variables":{},"reason":"无变化"}。不要返回模板id，不要套updates数组，不要修改HTML。',
                                ...(forceSuggestions ? ['本次请求为手动刷新建议：action_1/2/3 建议必须按最新情境重新生成，不要沿用上一轮。'] : []),
                                '',
                                '用户信息如下（用于判断称呼、人称和用户相关变量；不要在JSON外复述）：',
                                buildUserInfoPrompt(),
                                '',
                                '当前变量JSON如下：',
                                currentVariableJson,
                                variableSchemaText ? [
                                    '',
                                    '变量说明如下（给AI参考，必须按这里理解字段含义和生成规则）：',
                                    variableSchemaText
                                ].join('\n') : ''
                            ].join('\n')
                        },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                recentMessages
                            }, null, 2)
                        }
                    ];
                    try {
                        let lastError = null;
                        for (let attempt = 0; attempt < UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS; attempt++) {
                            if (!isCurrentRun()) return;
                            try {
                                const response = await fetch(url, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${chatProviderForAnalysis.apiKey}`
                                    },
                                    body: JSON.stringify({
                                        model,
                                        temperature: 0.2,
                                        max_tokens: getMaxOutputTokens(),
                                        ...(settings.uiTemplateJsonMode !== false ? { response_format: { type: 'json_object' } } : {}),
                                        stream: false,
                                        messages: buildAnalysisMessages()
                                    }),
                                    signal: createUiTemplateRequestSignal(updateRun.signal)
                                });
                                if (!isCurrentRun()) return;
                                if (!response.ok) {
                                    const error = new Error(`API Error: ${response.status}`);
                                    error.status = response.status;
                                    throw error;
                                }
                                const data = await response.json();
                                if (!isCurrentRun()) return;
                                const content = data.choices?.[0]?.message?.content || '';
                                console.log(`[UI模板变量分析] ${template.name || template.id} 原始返回:`, content);
                                const parsed = parseUiTemplateUpdateJson(content);
                                const updates = normalizeUiTemplateUpdates(parsed);
                                recordApiUsage(getApiUsagePayload(data), {
                                    type: 'ui_template',
                                    model,
                                    detail: template.name || ''
                                });
                                pendingTemplateUpdates.push({ template, updates, model });
                                return;
                            } catch (e) {
                                if (updateRun.signal.aborted || !isCurrentRun()) return;
                                lastError = e;
                                if (!isRetryableUiTemplateError(e) || attempt >= UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS - 1) break;
                                uiTemplateUpdateStatus.message = `重试中 (${attempt + 1}/${UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS})`;
                                await sleepUiTemplateRetry(800 * (attempt + 1));
                            }
                        }
                        if (lastError && isCurrentRun()) {
                            failedTemplateCount++;
                            failedTemplateIds.add(template.id);
                            if (!firstFailureMessage) {
                                firstFailureMessage = String(lastError?.message || lastError || '未知错误');
                            }
                            console.warn(`[UI模板] ${template.name || template.id} 未成功:`, lastError?.message);
                        }
                    } finally {
                        if (isCurrentRun()) {
                            uiTemplateUpdateStatus.remaining = Math.max(0, uiTemplateUpdateStatus.remaining - 1);
                        }
                    }
                });
                }

                if (!isCurrentRun()) {
                    if (uiTemplateUpdateSeq === updateRun.seq) {
                        uiTemplateUpdateAbortController = null;
                        markUiTemplateStatus('idle', '待命');
                    }
                    return false;
                }
                pendingTemplateUpdates.forEach(({ template, updates, model }) => {
                    applyTemplateUpdates(template, updates, model);
                });

                const inserted = attachUiTemplateBlocksToLastAssistant({ targetMessageId: lockedTargetMessageId });

                if (hasChanges) {
                    saveGlobalUiTemplateRuntimeForCharacter();
                    saveData({ saveMemories: false });
                    await saveChatHistoryNow();
                } else if (inserted) {
                    await saveChatHistoryNow();
                }
                if (failedTemplateCount) {
                    const detail = firstFailureMessage ? `：${firstFailureMessage.slice(0, 80)}` : '';
                    failUiTemplateAnalysis(`${failedTemplateCount} 个失败${detail}`, lockedTargetMessageId);
                } else if (hasChanges) {
                    markUiTemplateStatus('success', `更新 ${changedFieldCount} 项${rejectedFieldCount ? `，拒绝 ${rejectedFieldCount} 项未定义变量` : ''}`, 0, lockedTargetMessageId);
                } else {
                    markUiTemplateStatus('skipped', rejectedFieldCount ? `无变化，拒绝 ${rejectedFieldCount} 项未定义变量` : '无变化', 0, lockedTargetMessageId);
                }
                if (uiTemplateUpdateSeq === updateRun.seq) {
                    uiTemplateUpdateAbortController = null;
                }
                return failedTemplateCount < templates.length;
            } catch (e) {
                if (e?.name === 'AbortError') {
                    return false;
                }
                uiTemplateUpdateAbortController = null;
                console.warn('[UI模板] 未成功:', e.message);
                const failedCount = templates.length || 1;
                const message = `${failedCount} 个失败`;
                failUiTemplateAnalysis(message, lockedTargetMessageId);
                return false;
            }
        };
    return { markUiTemplateStatus, failUiTemplateAnalysis, abortUiTemplateUpdate, updateUiTemplatesFromChat };
}
