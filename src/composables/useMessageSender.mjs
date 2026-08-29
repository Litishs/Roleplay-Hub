// useMessageSender — chat message generation pipeline (Phase 2, roadmap 2.2)
//
// Owns the send-path business logic previously inlined in app.mjs setup():
// the chat request resilience policy (timeouts / retry backoff / friendly
// error classification), the generateResponseCore context-assembly and
// streaming pipeline, and the generateResponse top-level error recovery
// wrapper. Also owns the waitTimer interval handle — every read and write
// of it lives inside this pipeline, so it is private to the composable.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable is a logic factory: it receives its collaborators from
//   app.mjs as a flat deps object (chat/memory/worldinfo/settings state
//   refs, API helpers, tool and UI-template pipeline functions) and
//   returns { generateResponse }. All other call sites (sendMessage,
//   regenerateMessage, tool continuation, triggered sends) stay in
//   app.mjs and call the returned function.
// - app.mjs calls this composable exactly once per setup(), after the last
//   dep (handleActiveToolCallFromAssistant) is defined; generateResponse is
//   only ever invoked at runtime, so the late binding is safe.
// - The moved code is byte-identical to the app.mjs original except for
//   the deps destructuring at the top.

import { nextTick, reactive } from 'vue';
import { RPHRequestDiagnostics } from '../modules/request-diagnostics.mjs';
import { RPHRuntimePolicy } from '../modules/runtime-policy.mjs';
import { create as createChatRequestGuard } from '../modules/chat-request-guard.mjs';
import { generateUUID, parseCot } from '../modules/utils.mjs';

export function useMessageSender(deps) {
    const {
        // chat state / generation flags
        abortController,
        chatHistory,
        isGenerating,
        isReceiving,
        isRemoteGenerating,
        isThinking,
        pendingActiveToolContext,
        activeToolContinuationMessageId,
        activeToolContinuationToolCallId,
        activeToolContinuationHasResponse,
        lastContextMessages,
        lastTriggeredWorldInfos,
        recentGenerationTimes,
        currentWaitTime,
        // persona / character / settings / presets
        user,
        settings,
        currentCharacter,
        buildUserInfoPrompt,
        getCurrentCharacterPrompt,
        syncChatModelFromPresets,
        presets,
        normalizePreset,
        estimateTokens,
        estimateMessagesTokens,
        // world info / context assembly
        worldInfo,
        worldInfoSettings,
        getWorldInfoTokenBudget,
        getContextTokenBudget,
        MIN_CONTEXT_FLOORS,
        buildConversationTurnSnapshot,
        postprocessContextMessages,
        getPostprocessedChatMessages,
        processRegex,
        stripDisabledImageGenContext,
        // memory recall
        memories,
        memorySummaries,
        memorySettings,
        MEMORY_MODE_VECTOR,
        MEMORY_VECTOR_DEFAULT_DEPTH,
        ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG,
        ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG,
        isVectorMemoryRecallContent,
        isRoleMemoryContextContent,
        isEnabledVectorMemory,
        getMemoryEmptyTurnsKey,
        extractMemoryFromChat,
        buildMemoryContextForPrompt,
        selectVectorMemoriesForChatContext,
        getRetainedRecentMemoryTurns,
        getVectorMemoryText,
        mergeRepeatedTurnVectorMemories,
        // UI template pipeline
        updateUiTemplatesFromChat,
        stripUiTemplateContextInjection,
        stripUiTemplateUpdateBlock,
        buildUiTemplateContextSystemPrompt,
        buildMainModelUiTemplateUpdatePrompt,
        applyMainModelUiTemplateUpdates,
        // active tools
        appendActiveToolReminderToLatestUserMessage,
        buildActiveToolSystemPrompt,
        shouldSuppressStandardVectorMemoryRecall,
        buildActiveToolResultPayload,
        resetActiveToolResultContext,
        promoteActiveToolCallsFromAssistant,
        handleActiveToolCallFromAssistant,
        // rendering / message formatting helpers
        extractNativeReasoning,
        collapseNativeReasoning,
        collapseActiveNativeReasoning,
        formatAIResponseForConsole,
        createCharacterErrorReply,
        appendAssistantResponseError,
        escapeXmlAttribute,
        indentXmlText,
        printAIRequestLogs,
        toggleSpeakMessage,
        // API request helpers
        getChatProvider,
        getChatProviderEndpoint,
        getProviderDisplayName,
        extractApiErrorMessage,
        formatApiErrorMessage,
        throwApiError,
        friendlyNetworkErrorMessage,
        normalizeApiUsage,
        getApiUsagePayload,
        recordApiUsage,
        abortSafely,
        raceWithTimeout,
        // app.mjs orchestration (persistence / stats / toast / diagnostics scope)
        saveChatHistoryNow,
        startDraftPersistence,
        stopDraftPersistence,
        scheduleChatStatsRecompute,
        showToast,
        getCurrentChatStorageScopeId,
    } = deps;

    // Generation wait-timer handle (private: all uses are in this pipeline)
    let waitTimer = null;

        // --- Chat request resilience (timeout / retry / friendly errors) ---
        const CHAT_FIRST_BYTE_TIMEOUT_MS = 60000;
        const CHAT_FIRST_TOKEN_TIMEOUT_MS = 60000;
        const CHAT_STREAM_IDLE_TIMEOUT_MS = 120000;
        const CHAT_TOTAL_TIMEOUT_MS = 600000;
        const CHAT_MAX_ATTEMPTS = 3;
        const CHAT_RETRY_BASE_DELAY_MS = 800;
        const sleepChatRetry = (attempt) => new Promise(resolve => setTimeout(resolve, CHAT_RETRY_BASE_DELAY_MS * attempt));

        const truncateErrorMessage = (message, maxLength = 600) => {
            const text = String(message || '');
            return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
        };

        const isRetryableChatHttpStatus = (status) => status === 429 || (status >= 500 && status <= 599);
        const isRetryableChatNetworkError = (error) => {
            if (!error) return false;
            if (error?.name === 'AbortError') return /timed out/i.test(String(error?.message || ''));
            // 2026-08-28: classify by message, not by error name. Chrome/Safari/Firefox
            // all report real fetch failures as TypeError, but so do programming errors
            // ("x is not a function"); only network-shaped messages deserve retries.
            return /failed to fetch|network error|networkerror|networkrequestfailed|load failed/i.test(String(error?.message || ''));
        };
        const isUserAbortError = (error) => error?.name === 'AbortError' && !/timed out/i.test(String(error?.message || ''));

        // Refactored generation logic
        const generateResponseCore = async (startTime = null, options = {}) => {
            const reuseGeneratingState = options.reuseGeneratingState === true;
            if (isGenerating.value && !reuseGeneratingState) return;
            const activeToolDepth = Number(options.activeToolDepth) || 0;
            const continueAssistantMessageId = options.continueAssistantMessageId || null;
            const continuationToolCallId = options.continuationToolCallId || null;
            const requestModel = syncChatModelFromPresets();

            if (!requestModel) {
                showToast('请先在设置中选择聊天模型', 'error');
                return;
            }

            if (!currentCharacter.value) {
                showToast('请先选择一个角色', 'error');
                return;
            }

            const continuationTargetMessage = continueAssistantMessageId
                ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === continueAssistantMessageId) || null
                : null;
            if (!continuationTargetMessage && activeToolDepth === 0) {
                resetActiveToolResultContext();
            }

            isGenerating.value = true;
            // 工具续写时内容会回填到旧气泡里，这里先占住“已在接收”的状态，
            // 避免底部全局 typing 占位气泡冒出来。
            isReceiving.value = !!continuationTargetMessage;
            isThinking.value = false;
            activeToolContinuationMessageId.value = continuationTargetMessage?.id || null;
            activeToolContinuationToolCallId.value = continuationTargetMessage ? continuationToolCallId : null;
            activeToolContinuationHasResponse.value = false;
            const generationController = new AbortController();
            abortController.value = generationController;
            let generationStartTime = startTime || Date.now();
            let wasCancelled = false;
            // 修复 2026-08-05 真机回归: watchdog 曾以 const 声明在 try 块内,
            // finally 块引用时抛 ReferenceError; 提升到函数作用域并统一清理。
            let chatWatchdog = null;
            // 2026-08-28: pin the chat provider once per generation so the URL,
            // Authorization header and diagnostics all read the same provider.
            // Prevents mid-retry drift and surfaces misconfigured chat providers
            // (empty API key / wrong URL) instead of misleading "network failed".
            const chatProviderForRequest = getChatProvider();
            const chatUrl = getChatProviderEndpoint('chat/completions');
            let requestDiagnostic = RPHRequestDiagnostics?.start({
                url: chatUrl,
                payload: {
                    model: requestModel,
                    messages: [],
                    temperature: settings.temperature,
                    stream: settings.stream,
                    providerId: chatProviderForRequest.providerId,
                    providerApiUrl: chatProviderForRequest.apiUrl,
                    hasApiKey: !!chatProviderForRequest.apiKey
                },
                requestType: activeToolDepth > 0 ? 'tool_continuation' : 'chat'
            }) || null;

            // Start Timer
            const startTimer = () => {
                if (waitTimer) clearInterval(waitTimer);
                currentWaitTime.value = '0.0';
                waitTimer = setInterval(() => {
                    const now = Date.now();
                    currentWaitTime.value = ((now - generationStartTime) / 1000).toFixed(1);
                }, 100);
            };
            startTimer(); // Start timer immediately upon request initiation

            // --- Advanced World Info Processing ---

            const evaluatedProbability = new Map(); // Store rolled probabilities to prevent re-rolls

            const toNonNegativeNumber = (value, fallback = 0) => {
                const number = Number(value);
                return Number.isFinite(number) ? Math.max(0, number) : fallback;
            };

            const createWorldInfoRegex = (pattern) => {
                let source = String(pattern || '');
                let flags = 'i';
                if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
                    const lastSlash = source.lastIndexOf('/');
                    const potentialFlags = source.slice(lastSlash + 1);
                    if (/^[dgimsuvy]*$/.test(potentialFlags)) {
                        source = source.slice(1, lastSlash);
                        flags = potentialFlags;
                    }
                }
                flags = flags.replace(/g/g, '');
                if (!flags.includes('i')) flags += 'i';
                if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
                return new RegExp(source, flags);
            };

            const worldInfoKeyMatchesText = (entry, key, text) => {
                const rawKey = String(key || '').trim();
                const rawText = String(text || '');
                if (!rawKey || !rawText) return false;

                if (entry.useRegex) {
                    try {
                        return createWorldInfoRegex(rawKey).test(rawText);
                    } catch (e) {
                        console.warn(`Invalid world info regex: ${rawKey}`);
                        return false;
                    }
                }

                return rawText.toLowerCase().includes(rawKey.toLowerCase());
            };

            const passesWorldInfoProbability = (entry) => {
                const probability = Math.min(100, toNonNegativeNumber(entry.probability, 100));
                if (entry.useProbability !== false && probability < 100) {
                    if (!evaluatedProbability.has(entry)) {
                        evaluatedProbability.set(entry, probability > 0 && (Math.random() * 100) < probability);
                    }
                    return !!evaluatedProbability.get(entry);
                }
                return true;
            };

            // Helper function to check a single entry against a text block
            const checkEntryTrigger = (entry, text) => {
                // Probability Check (do this early, rolled once per entry per generation)
                if (!passesWorldInfoProbability(entry)) return { triggered: false };

                let primaryMatches = 0;
                let matchedKeys = [];

                const checkKeys = (keys) => {
                    let matchCount = 0;
                    if (!keys || keys.length === 0 || keys.every(k => !k)) return 0;

                    keys.forEach(key => {
                        const rawKey = String(key || '').trim();
                        if (!rawKey) return;
                        if (worldInfoKeyMatchesText(entry, rawKey, text)) {
                            matchCount++;
                            if (!matchedKeys.includes(rawKey)) matchedKeys.push(rawKey);
                        }
                    });
                    return matchCount;
                };

                primaryMatches = checkKeys(entry.keys);
                if (primaryMatches === 0) return { triggered: false };

                return { triggered: true, score: primaryMatches, matchedKeys };
            };

            let triggeredEntries = new Map(); // Use Map to store entries and their scores
            const activeWorldInfo = worldInfo.value.filter(e => e.enabled !== false);
            const postprocessedChatHistory = getPostprocessedChatMessages(chatHistory.value, { includeSystem: false });

            // 1. Initial Scan (Chat History)
            activeWorldInfo.forEach(entry => {
                if (entry.constant) {
                    triggeredEntries.set(entry, { score: Infinity, matchedKeys: ['常驻 (Constant)'] }); // Constants get highest score
                    return;
                }

                const rawScanDepth = toNonNegativeNumber(entry.scanDepth ?? worldInfoSettings.scanDepth, 0);
                const maxScanDepth = toNonNegativeNumber(worldInfoSettings.maxDepth, 0);
                const entryScanDepth = maxScanDepth > 0 ? Math.min(rawScanDepth, maxScanDepth) : rawScanDepth;
                if (entryScanDepth === 0 || !entry.keys || entry.keys.length === 0) return;

                const scanText = postprocessedChatHistory.slice(-entryScanDepth).map(m => m.content).join('\n');

                if (entry.keys && entry.keys.length > 0) {
                    const result = checkEntryTrigger(entry, scanText);
                    if (result.triggered) {
                        triggeredEntries.set(entry, { score: result.score, matchedKeys: result.matchedKeys });
                    }
                }
            });
            let finalEntries = Array.from(triggeredEntries.keys());

            // Sort by constant, then order
            finalEntries.sort((a, b) => {
                if (a.constant && !b.constant) return -1;
                if (!a.constant && b.constant) return 1;
                // Sort descending by order for budget priority (higher order = more important/inserted later = kept if budget tight?)
                // Docs: "Then entries with higher order numbers." implying they are prioritized after constants.
                return (b.order || 0) - (a.order || 0);
            });

            // P4 世界书预算治理：先与角色卡去重，再按 token 预算裁剪
            // （常驻优先；保底保留最高优先常驻 + 最高优先触发各 1 条，避免预算把关键设定全砍）
            const worldInfoBudgetTokens = getWorldInfoTokenBudget();
            const charPromptForDedup = String(getCurrentCharacterPrompt() || '');
            const dedupedEntries = [];
            finalEntries.forEach(entry => {
                const text = String(entry.content || '').trim();
                if (!text) return;
                dedupedEntries.push(entry);
            });

            let budgetedEntries = dedupedEntries;
            if (worldInfoBudgetTokens > 0 && dedupedEntries.length > 0) {
                const forced = [];
                [dedupedEntries.find(e => e.constant), dedupedEntries.find(e => !e.constant)].forEach(entry => {
                    if (entry && !forced.includes(entry)) forced.push(entry);
                });
                const selected = [];
                let used = 0;
                forced.forEach(entry => {
                    selected.push(entry);
                    used += estimateTokens(entry.content || '');
                });
                dedupedEntries.forEach(entry => {
                    if (forced.includes(entry)) return;
                    const tokens = estimateTokens(entry.content || '');
                    if (used + tokens <= worldInfoBudgetTokens) {
                        selected.push(entry);
                        used += tokens;
                    }
                });
                budgetedEntries = selected;
            }

            // --- Output Trigger Log ---
            console.groupCollapsed('📚 World Info Trigger Log');
            if (budgetedEntries.length === 0) {
                console.log('No World Info entries triggered for this request.');
            } else {
                budgetedEntries.forEach(entry => {
                    const data = triggeredEntries.get(entry);
                    const keysStr = data && data.matchedKeys ? data.matchedKeys.join(', ') : 'Unknown';
                    console.log(`[${entry.comment || 'Unnamed'}] (Pos: ${entry.position || 'at_depth'}, Order: ${entry.order || 0})`);
                    console.log(`  ↪ Matched Keys: ${keysStr}`);
                    console.log(`  ↪ Content Preview: ${(entry.content || '').substring(0, 50).replace(/\n/g, ' ')}...`);
                });
            }
            console.groupEnd();

            // 5. Group by Position
            const wiGroups = {
                system_top: [], global_note: [], before_char: [], after_char: [],
                user_top: [], assistant_top: [], at_depth: []
            };

            budgetedEntries.forEach(entry => {
                const pos = entry.position || 'at_depth';
                if (wiGroups.hasOwnProperty(pos)) {
                    wiGroups[pos].push(entry);
                } else {
                    wiGroups.at_depth.push(entry);
                }
            });

            // Fix: Sort entries within each group by Order (Ascending)
            Object.keys(wiGroups).forEach(key => {
                wiGroups[key].sort((a, b) => (a.order || 0) - (b.order || 0));
            });

            // Construct Prompt Parts
            const enabledPresets = presets.value
                .map(normalizePreset)
                .filter(p => p.enabled && p.content.trim());
            const systemPresets = enabledPresets.filter(p => p.role === 'system');
            const messagePresets = enabledPresets.filter(p => p.role === 'user' || p.role === 'assistant');
            const systemPresetPrompt = systemPresets
                .filter(p => p.name === '破限')
                .map(p => p.content)
                .join('\n\n');
            const otherPresets = systemPresets.filter(p => p.name !== '破限');

            const charPrompt = getCurrentCharacterPrompt();
            const mesExample = currentCharacter.value.mes_example;

            let userPrompt = buildUserInfoPrompt();

            // Helper to join content with comments
            const joinContent = (entries) => entries.map(e => `[${e.comment || 'Entry'}]\n${e.content}`).join('\n\n');
            const getWorldInfoDisplayName = (entry) => entry.comment || entry.name || '未命名条目';

            // Build System Prompt
            let systemPromptParts = [];

            // 1. Presets (只有设定环境的破限预设保留在 system 中)
            if (systemPresetPrompt) systemPromptParts.push(systemPresetPrompt);

            // 2. System Top WI
            if (wiGroups.system_top.length > 0) systemPromptParts.push(joinContent(wiGroups.system_top));

            // 3. Global Notes
            if (wiGroups.global_note.length > 0) systemPromptParts.push(joinContent(wiGroups.global_note));

            // 4. Other Presets (辅助约束 - 提前于角色设定)
            if (otherPresets.length > 0) {
                systemPromptParts.push(`[System Presets]\n${otherPresets.map(p => p.content).join('\n\n---\n\n')}`);
            }

            systemPromptParts.push(`[Style Priority]\n开场白和历史消息只用于理解剧情事实、人物关系和场景状态，不作为文风模板；不要继承或模仿开场白、前文回复的句式、语气密度、段落节奏或排版习惯。最终回复的文风必须优先遵守上方系统预设中的规定文风。`);

            // 5. Character pre-dialogue context (user side)
            const characterPreludeParts = [];
            if (wiGroups.before_char.length > 0) {
                characterPreludeParts.push(joinContent(wiGroups.before_char));
            }
            let charDefinitionParts = [`[Character]`, charPrompt];
            if (mesExample && mesExample.trim()) {
                charDefinitionParts.push(mesExample);
            }
            characterPreludeParts.push(charDefinitionParts.join('\n\n'));
            if (wiGroups.after_char.length > 0) {
                characterPreludeParts.push(joinContent(wiGroups.after_char));
            }
            const characterPreludePrompt = characterPreludeParts.join('\n\n');

            // 6. User Info (Moved to end)
            systemPromptParts.push(userPrompt);

            const activeToolPrompt = buildActiveToolSystemPrompt();
            if (activeToolPrompt) systemPromptParts.push(activeToolPrompt);

            const uiTemplateContextPrompt = buildUiTemplateContextSystemPrompt();
            if (uiTemplateContextPrompt) systemPromptParts.push(uiTemplateContextPrompt);

            const systemPrompt = systemPromptParts.join('\n\n');
            const systemWorldInfo = [
                ...wiGroups.system_top,
                ...wiGroups.global_note
            ];

            // 记忆背景（滚动摘要 + 动态信息卡）：固定注入前缀，不随历史楼层压缩裁剪
            const timelineDigestText = memorySettings.enabled
                ? buildMemoryContextForPrompt()
                : '';

            // Base Messages
            let messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                    _worldInfoEntries: systemWorldInfo
                }
            ];

            let safeTargetLimit = 1;
            messagePresets.forEach(preset => {
                messages.push({
                    role: preset.role,
                    content: preset.content
                });
            });
            safeTargetLimit += messagePresets.length;

            if (characterPreludePrompt) {
                messages.push({
                    role: 'user',
                    content: characterPreludePrompt,
                    _worldInfoEntries: [
                        ...wiGroups.before_char,
                        ...wiGroups.after_char
                    ]
                });
                safeTargetLimit += 1;
            }

            if (timelineDigestText) {
                messages.push({
                    role: 'user',
                    content: timelineDigestText
                });
                safeTargetLimit += 1;
            }

            // 确保开场白存在 (Double check for First Message)
            // 如果聊天记录为空，或者第一条不是开场白，且角色有开场白，则手动添加
            // 注意：通常 chatHistory 会包含开场白，这里是为了响应用户反馈的强制保险
            const hasFirstMesInHistory = chatHistory.value.length > 0 &&
                chatHistory.value[0].role === 'assistant' &&
                chatHistory.value[0].content === currentCharacter.value.first_mes;

            // 如果当前历史记录的第一条是“总结”消息，则认为开场白已被总结包含，不再强制补录开场白
            if (!hasFirstMesInHistory && currentCharacter.value.first_mes) {
                messages.push({
                    role: 'assistant',
                    name: currentCharacter.value.name,
                    content: currentCharacter.value.first_mes
                });
            }

            // 记忆压缩：新引擎（滚动摘要）保留最近 keepFloors 轮原文，更早轮次由摘要覆盖；
            // 旧模式逻辑仅在派生摘要层尚未建立时保留（过渡，P3 移除）。
            let chatHistoryForContext = postprocessedChatHistory.map((message, index) => ({
                ...message,
                _contextFloor: index + 1
            }));

            if (memorySettings.enabled
                && memorySummaries.value
                && (memorySummaries.value.short || memorySummaries.value.long)) {
                const totalFloors = chatHistoryForContext.length;
                const keepCount = memorySettings.keepFloors;
                if (totalFloors > keepCount) {
                    const candidateCount = totalFloors - keepCount;
                    const removableIndices = new Set();
                    const contextSnapshot = buildConversationTurnSnapshot(chatHistoryForContext, { alreadyPostprocessed: true });
                    contextSnapshot.turns.forEach(turnInfo => {
                        if (!turnInfo.messageIndexes.every(messageIndex => messageIndex < candidateCount)) return;
                        turnInfo.messageIndexes.forEach(messageIndex => removableIndices.add(messageIndex));
                    });
                    if (removableIndices.size > 0) {
                        const newChatHistoryForContext = [];
                        for (let idx = 0; idx < chatHistoryForContext.length; idx++) {
                            if (!removableIndices.has(idx)) {
                                newChatHistoryForContext.push(chatHistoryForContext[idx]);
                            }
                        }
                        chatHistoryForContext = newChatHistoryForContext;
                    }
                }
            } else if (memorySettings.enabled
                && memorySettings.mode === MEMORY_MODE_VECTOR
                && memories.value.length > 0) {
                const totalFloors = chatHistoryForContext.length;
                const keepCount = memorySettings.keepFloors;

                if (totalFloors > keepCount) {
                    const candidateCount = totalFloors - keepCount;

                    const memoryTurnSet = new Set(
                        memories.value
                            .filter(isEnabledVectorMemory)
                            .map(memory => memory.turn || 0)
                            .filter(turn => turn > 0)
                    );
                    const emptyLog = memorySettings.emptyTurns?.[
                        getMemoryEmptyTurnsKey(getCurrentChatStorageScopeId())
                    ] || [];
                    const emptyTurnSet = new Set(emptyLog);

                    const removableIndices = new Set();
                    const contextSnapshot = buildConversationTurnSnapshot(chatHistoryForContext, { alreadyPostprocessed: true });

                    contextSnapshot.turns.forEach(turnInfo => {
                        if (!turnInfo.messageIndexes.every(messageIndex => messageIndex < candidateCount)) return;
                        const hasMemory = memoryTurnSet.has(turnInfo.turn);
                        const isEmpty = emptyTurnSet.has(turnInfo.turn);

                        if (hasMemory || isEmpty) {
                            turnInfo.messageIndexes.forEach(messageIndex => removableIndices.add(messageIndex));
                        }
                    });

                    if (removableIndices.size > 0) {
                        const newChatHistoryForContext = [];

                        for (let idx = 0; idx < chatHistoryForContext.length; idx++) {
                            if (!removableIndices.has(idx)) {
                                newChatHistoryForContext.push(chatHistoryForContext[idx]);
                            }
                        }
                        chatHistoryForContext = newChatHistoryForContext;
                    }
                }
            }

            // 添加聊天记录（按 token 预算保留最近楼层，至少保留现场窗口下限）
            const contextBudget = getContextTokenBudget();
            let budgetedChatHistory = chatHistoryForContext;
            if (contextBudget > 0 && chatHistoryForContext.length > MIN_CONTEXT_FLOORS) {
                const prefixTokens = estimateMessagesTokens(messages) + estimateTokens(timelineDigestText);
                const historyBudget = Math.max(0, contextBudget - prefixTokens);
                let used = 0;
                let keepCount = 0;
                for (let i = chatHistoryForContext.length - 1; i >= 0; i--) {
                    const est = estimateTokens(chatHistoryForContext[i].content || '');
                    if (keepCount >= MIN_CONTEXT_FLOORS && used + est > historyBudget) break;
                    used += est;
                    keepCount++;
                }
                if (keepCount < chatHistoryForContext.length) {
                    budgetedChatHistory = chatHistoryForContext.slice(-Math.max(MIN_CONTEXT_FLOORS, keepCount));
                }
            }
            messages = messages.concat(budgetedChatHistory
                .map((m, index) => {
                    const sourceIndexes = Array.isArray(m._sourceIndexes) ? m._sourceIndexes : [];
                    const sourceMessages = sourceIndexes.length > 0
                        ? sourceIndexes.map(sourceIndex => chatHistory.value[sourceIndex]).filter(source => source && source.role === m.role)
                        : [m];
                    const cleanSourceContent = (source) => {
                        // Remove CoT content from history messages before sending to AI.
                        const parsedData = parseCot(source.content || '');
                        let content = stripUiTemplateUpdateBlock(stripDisabledImageGenContext(stripUiTemplateContextInjection(parsedData.main)));
                        const cleanSys = stripDisabledImageGenContext(parsedData.sys || '');
                        if (cleanSys && source.role === 'user') {
                            content += '\n\n[系统指令: ' + cleanSys + ']';
                        }
                        return content.trim();
                    };
            let cleanContent = sourceMessages
                .map(cleanSourceContent)
                .filter(Boolean)
                .join('\n\n');

                    return {
                        role: m.role === 'user' ? 'user' : 'assistant',
                        name: m.name || (m.role === 'user' ? user.name : currentCharacter.value.name),
                        content: cleanContent,
                        _sourceIndexes: sourceIndexes,
                        _contextFloor: m._contextFloor
                    };
                })
                .filter(m => String(m.content || '').trim())
            );

            let selectedVectorMemories = [];
            if (memorySettings.enabled
                && memorySettings.mode === MEMORY_MODE_VECTOR
                && memories.value.length > 0
                && !shouldSuppressStandardVectorMemoryRecall()) {
                requestDiagnostic?.stage('memory_recall');
                selectedVectorMemories = await selectVectorMemoriesForChatContext(
                    {
                        excludedTurns: getRetainedRecentMemoryTurns(postprocessedChatHistory)
                    },
                    generationController.signal,
                    requestDiagnostic
                );
                requestDiagnostic?.stage('building_prompt');
            }
            if (contextBudget > 0 && selectedVectorMemories.length > 0) {
                const remainingBudget = Math.max(0, contextBudget - estimateMessagesTokens(messages) - estimateTokens(timelineDigestText));
                let used = 0;
                const capped = [];
                for (const memory of selectedVectorMemories) {
                    if (capped.length >= 5) break;
                    const est = estimateTokens(getVectorMemoryText(memory));
                    if (capped.length > 0 && used + est > remainingBudget) break;
                    used += est;
                    capped.push(memory);
                }
                selectedVectorMemories = capped;
            }

            // Handle @D (At Depth) and other message-level injections
            const processMessageInjections = (msgArray) => {
                let finalMessages = [...msgArray];
                // At Depth
                if (wiGroups.at_depth.length > 0) {
                    wiGroups.at_depth.sort((a, b) => (a.order || 0) - (b.order || 0));
                    const reversedHistory = [...finalMessages].reverse();

                    wiGroups.at_depth.forEach(entry => {
                        const depth = entry.depth !== undefined ? entry.depth : 4;
                        const content = `[${entry.comment || 'Entry'}]\n${entry.content}`;

                        // Find the correct insertion point from the end of the array
                        let countdown = depth;
                        let targetIndex = -1;
                        for (let i = 0; i < reversedHistory.length; i++) {
                            // We only count user/assistant pairs as "turns" for depth
                            if (reversedHistory[i].role === 'user' || reversedHistory[i].role === 'assistant') {
                                countdown--;
                            }
                            if (countdown < 0) {
                                targetIndex = reversedHistory.length - 1 - i;
                                break;
                            }
                        }
                        // 如果 depth 超出历史记录长度，或计算出的 targetIndex 会破坏破限多轮对话的顺序，则进行保护
                        if (targetIndex < safeTargetLimit) targetIndex = safeTargetLimit;

                        finalMessages.splice(targetIndex, 0, {
                            role: 'user',
                            content,
                            _worldInfoEntries: [entry]
                        });
                    });
                }

                // Memory Injection (at_depth style, grouped by turn, 证据分片收敛到 5 条)
                if (memorySettings.enabled
                    && memorySettings.mode === MEMORY_MODE_VECTOR
                    && selectedVectorMemories.length > 0) {
                    const enabledMemories = mergeRepeatedTurnVectorMemories(selectedVectorMemories).slice(0, 5);

                    if (enabledMemories.length > 0) {
                        const formatMemoryLine = (m) => {
                            const turnValue = escapeXmlAttribute(m.turn || '?');
                            const scoreValue = escapeXmlAttribute(m.vectorRecallMode === 'lexical-fallback'
                                ? 'lexical-fallback'
                                : (Number.isFinite(m.vectorScore) ? `${(m.vectorScore * 100).toFixed(1)}%` : 'unknown'));
                            const fragmentText = indentXmlText(m.paragraph || m.summary || '', 4);
                            const fragmentTag = `<memory_fragment turn="${turnValue}" similarity="${scoreValue}">`;
                            return [
                                `  ${fragmentTag}`,
                                fragmentText,
                                `  </memory_fragment>`
                            ].join('\n');
                        };

                        const formattedContent = enabledMemories.map(formatMemoryLine).join('\n\n');
                        const fullContent = [
                            ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG,
                            '  <description>',
                            '    以下内容是从往期对话记录中按当前输入检索出的相关记忆分片，并非全部历史。',
                            '    请尽力理解这些分片之间的前因后果、人物关系和情绪延续，理清它们与当前对话的关联。',
                            '    这些分片已按原对话时间顺序排列；它们不一定是今天或刚才发生的内容，请不要误当作当前现场，只把它们作为过往经历和关系背景参考。',
                            '  </description>',
                            formattedContent,
                            ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG
                        ].join('\n');

                        const memoryDepth = Number(memorySettings.defaultDepth) || MEMORY_VECTOR_DEFAULT_DEPTH;

                        const reversedForMemory = [...finalMessages].reverse();
                        let countdown = memoryDepth;
                        let targetIndex = -1;
                        for (let i = 0; i < reversedForMemory.length; i++) {
                            if (reversedForMemory[i].role === 'user' || reversedForMemory[i].role === 'assistant') {
                                countdown--;
                            }
                            if (countdown < 0) {
                                targetIndex = reversedForMemory.length - 1 - i;
                                break;
                            }
                        }
                        if (targetIndex < safeTargetLimit) targetIndex = safeTargetLimit;

                        finalMessages.splice(targetIndex, 0, {
                            role: 'user',
                            content: fullContent
                        });
                    }
                }

                // User Top
                if (wiGroups.user_top.length > 0) {
                    const content = joinContent(wiGroups.user_top);
                    const lastUserMessage = finalMessages.slice().reverse().find(m => m.role === 'user');
                    if (lastUserMessage) {
                        lastUserMessage.content = `${content}\n\n${lastUserMessage.content}`;
                        lastUserMessage._worldInfoEntries = [
                            ...(lastUserMessage._worldInfoEntries || []),
                            ...wiGroups.user_top
                        ];
                    }
                }

                // Assistant Top
                if (wiGroups.assistant_top.length > 0) {
                    const content = joinContent(wiGroups.assistant_top);
                    // This should be injected into the *next* assistant message,
                    // so we add it as a system message right before the end.
                    finalMessages.push({
                        role: 'system',
                        content: `[Instructions for next message]\n${content}`,
                        _worldInfoEntries: wiGroups.assistant_top
                    });
                }

                // UI 模板变量更新指令（B1）：不再插入对话中部（原 insertUserMessageAtDepth(..., 1)），
                // 改为追加到最末尾，与 assistant_top 的 "Instructions for next message" 风格一致。
                // 保证主模型读到的是最后一条指令，避免中部插入被截断或淹没。
                const mainModelUiTemplatePrompt = buildMainModelUiTemplateUpdatePrompt();
                if (mainModelUiTemplatePrompt) {
                    finalMessages.push({
                        role: 'system',
                        content: `[Instructions for next message]\n${mainModelUiTemplatePrompt}`
                    });
                }

                return finalMessages;
            };

            messages = processMessageInjections(messages);
            messages = appendActiveToolReminderToLatestUserMessage(messages);
            const activeToolContextPayload = pendingActiveToolContext.value || (activeToolDepth > 0 ? buildActiveToolResultPayload() : '');
            if (activeToolContextPayload) {
                messages.push({
                    role: 'user',
                    content: activeToolContextPayload
                });
                pendingActiveToolContext.value = '';
            }
            messages = postprocessContextMessages(messages).map((message, index, array) => ({
                ...message,
                content: processRegex(message.content || '', {
                    isPrompt: true,
                    role: message.role,
                    depth: array.length - 1 - index
                })
            }));

            // Escape HTML helper
            const escapeHtml = (unsafe) => {
                if (!unsafe) return '';
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            // Pre-calculate trigger keyword floors (only within actual scan depth range)
            const floorInfo = new Map();
            const scanDepthForDisplay = toNonNegativeNumber(worldInfoSettings.scanDepth, 2);
            const maxScanDepthForDisplay = toNonNegativeNumber(worldInfoSettings.maxDepth, 0);

            triggeredEntries.forEach((data, entry) => {
                if (!data.matchedKeys) return;
                const rawEntryScanDepth = toNonNegativeNumber(entry.scanDepth ?? scanDepthForDisplay, 0);
                const entryScanDepth = maxScanDepthForDisplay > 0 ? Math.min(rawEntryScanDepth, maxScanDepthForDisplay) : rawEntryScanDepth;
                const entryStart = Math.max(0, postprocessedChatHistory.length - entryScanDepth);

                data.matchedKeys.forEach(k => {
                    if (k === '常驻 (Constant)') return;

                    for (let i = entryStart; i < postprocessedChatHistory.length; i++) {
                        const text = postprocessedChatHistory[i].content;
                        if (worldInfoKeyMatchesText(entry, k, text)) {
                            if (!floorInfo.has(k)) floorInfo.set(k, new Set());
                            floorInfo.get(k).add(i + 1);
                        }
                    }
                });
            });

            const getWorldInfoTriggerText = (entry) => {
                const entryData = triggeredEntries.get(entry);
                if (!entryData || !entryData.matchedKeys) return '关联触发';

                return entryData.matchedKeys.map(k => {
                    if (k === '常驻 (Constant)') return '常驻';
                    const floors = floorInfo.get(k);
                    if (floors && floors.size > 0) {
                        return `${k} (${Array.from(floors).map(f => 'F' + f).join(', ')})`;
                    }
                    return k;
                }).join(', ');
            };

            // Compute message-level World Info injections for Context Viewer
            let globalInjectedWIs = budgetedEntries.map(entry => ({
                name: getWorldInfoDisplayName(entry),
                triggers: getWorldInfoTriggerText(entry)
            }));
            lastContextMessages.value = messages.map(m => {
                let injectedWIsMap = new Map();

                (Array.isArray(m._worldInfoEntries) ? m._worldInfoEntries : []).forEach(entry => {
                    if (!entry) return;
                    injectedWIsMap.set(getWorldInfoDisplayName(entry), getWorldInfoTriggerText(entry));
                });

                const isMemoryMessage = m.role !== 'system' && isRoleMemoryContextContent(m.content);

                // Detect Memory injections in this message
                if (isMemoryMessage) {
                    const memoryContent = String(m.content || '');
                    const memoryFragmentTagCount = (memoryContent.match(/<memory_fragment\b/gi) || []).length;
                    const standardMemoryFragmentCloseCount = (memoryContent.match(/<\/memory_fragment>/gi) || []).length;
                    const legacyVectorMemoryTags = memoryContent
                        .split('\n')
                        .filter(l => /^<第\s*.+?次对话_相似度\s+.+>$/.test(l.trim()));
                    const vectorMemoryFragmentCount = memoryFragmentTagCount > 0
                        ? Math.max(1, standardMemoryFragmentCloseCount > 0 ? memoryFragmentTagCount : Math.ceil(memoryFragmentTagCount / 2))
                        : legacyVectorMemoryTags.length;
                    const isVectorMemoryMessage = isVectorMemoryRecallContent(memoryContent);
                    const memoryDisplayName = isVectorMemoryMessage ? '角色记忆（向量召回）' : '角色记忆';
                    const memoryTriggerText = isVectorMemoryMessage
                        ? `已注入 ${vectorMemoryFragmentCount} 个向量分片`
                        : '已注入';
                    injectedWIsMap.set(memoryDisplayName, memoryTriggerText);
                    if (!globalInjectedWIs.some(i => i.name === memoryDisplayName)) {
                        globalInjectedWIs.push({ name: memoryDisplayName, triggers: memoryTriggerText });
                    }
                }

                let renderedContent = escapeHtml(m.content);
                // Sort keys by length descending to match longer phrases first
                const sortedKeys = Array.from(floorInfo.keys()).sort((a, b) => b.length - a.length);
                sortedKeys.forEach(k => {
                    if (k.length < 1) return;
                    const escapedK = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    // Avoid replacing inside html tags like <mark class="...">
                    const safeRegex = new RegExp(`(${escapedK})(?![^<]*>)`, 'gi');
                    renderedContent = renderedContent.replace(safeRegex, '<mark class="bg-yellow-200/80 text-yellow-900 border-b border-yellow-400 font-bold px-0.5 mx-px rounded shadow-sm">$1</mark>');
                });

                // Highlight memory content with purple
                if (isMemoryMessage) {
                    renderedContent = renderedContent.replace(
                        /&lt;\/?(?:role_memory_vector_recall|memory_fragment)\b[\s\S]*?&gt;/g,
                        '<mark class="bg-purple-200/80 text-purple-900 border-b border-purple-400 font-bold px-1 rounded shadow-sm">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[角色记忆[^\]]*\]/g,
                        '<mark class="bg-purple-200/80 text-purple-900 border-b border-purple-400 font-bold px-1 rounded shadow-sm">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[——[^—]*——\]/g,
                        '<mark class="bg-purple-100/80 text-purple-700 font-semibold px-0.5 rounded">$&</mark>'
                    );
                    renderedContent = renderedContent.replace(
                        /\[向量召回[^\]]*\]/g,
                        '<mark class="bg-teal-100/90 text-teal-800 border-b border-teal-300 font-semibold px-0.5 rounded">$&</mark>'
                    );
                }

                return {
                    role: m.role,
                    name: m.name,
                    content: m.content,
                    renderedContent: renderedContent,
                    floor: Number.isFinite(m._contextFloor) ? m._contextFloor : null,
                    isMemory: isMemoryMessage,
                    wiTriggers: Array.from(injectedWIsMap.entries()).map(([name, triggers]) => ({
                        name,
                        triggers
                    }))
                };
            });
            // Store overall triggered entries based on actual injection order in the prompt
            lastTriggeredWorldInfos.value = globalInjectedWIs;

            const apiMessages = messages.map(({ role, name, content }) => ({
                role,
                name,
                content
            }));

            // --- 优化后的控制台日志 ---
            printAIRequestLogs(apiMessages, requestModel);
            // ---------------------------

            let generatedAssistantMessageId = null;
            let assistantMessage = null;
            let continuingAssistantMessage = continuationTargetMessage;
            let continuationToolCall = null;
            let continuationContentStarted = false;
            let continuationReasoningStarted = false;
            let rawAssistantContentForLog = '';
            let nativeReasoningForLog = '';
            let responseUsage = null;

            if (continuingAssistantMessage && continuationToolCallId && Array.isArray(continuingAssistantMessage.toolCalls)) {
                continuationToolCall = continuingAssistantMessage.toolCalls.find(call => call && call.id === continuationToolCallId) || null;
                if (continuationToolCall && typeof continuationToolCall.reasoning !== 'string') continuationToolCall.reasoning = '';
            }

            const prepareAssistantMessageForAppend = (message) => {
                if (!message) return null;
                if (!message.id) message.id = generateUUID();
                if (typeof message.content !== 'string') message.content = '';
                if (typeof message.reasoning !== 'string') message.reasoning = '';
                if (message.isCotOpen === undefined) message.isCotOpen = false;
                if (message.isReasoningOpen === undefined) message.isReasoningOpen = true;
                if (message.isReasoningUserToggled === undefined) message.isReasoningUserToggled = false;
                if (message.isReasoningAutoCollapsed === undefined) message.isReasoningAutoCollapsed = false;
                message.shouldAnimate = !continuingAssistantMessage;
                return message;
            };

            const pendingStreamAppends = new Map();
            let streamAppendTimer = null;

            const commitAssistantText = (message, field, text) => {
                if (!message || !text) return;
                const isContinuation = continuingAssistantMessage && message.id === continuingAssistantMessage.id;
                const startedKey = field === 'reasoning' ? 'continuationReasoningStarted' : 'continuationContentStarted';
                const hasStarted = field === 'reasoning' ? continuationReasoningStarted : continuationContentStarted;

                if (field === 'content' && message._activeToolCaptureActive) {
                    message._activeToolPendingText = `${message._activeToolPendingText || ''}${text}`;
                    promoteActiveToolCallsFromAssistant(message);
                    if (isContinuation) {
                        if (!hasStarted) continuationContentStarted = true;
                        activeToolContinuationHasResponse.value = true;
                    }
                    return;
                }

                const existing = String(message[field] || '');

                if (isContinuation && !hasStarted && existing.trim()) {
                    message[field] = existing.replace(/\s+$/, '') + '\n\n' + text;
                } else {
                    message[field] = existing + text;
                }

                if (isContinuation && !hasStarted) {
                    if (startedKey === 'continuationReasoningStarted') continuationReasoningStarted = true;
                    else continuationContentStarted = true;
                }
                if (field === 'content') {
                    promoteActiveToolCallsFromAssistant(message);
                }
                if (isContinuation) activeToolContinuationHasResponse.value = true;
            };

            const flushStreamAppends = () => {
                if (streamAppendTimer) clearTimeout(streamAppendTimer);
                streamAppendTimer = null;
                const pending = [...pendingStreamAppends.values()];
                pendingStreamAppends.clear();
                pending.forEach(({ message, field, text }) => commitAssistantText(message, field, text));
            };

            const appendAssistantText = (message, field, text) => {
                if (!message || !text) return;
                if (!settings.stream || !isReceiving.value) {
                    commitAssistantText(message, field, text);
                    return;
                }
                const key = `${message.id || 'pending'}:${field}`;
                const pending = pendingStreamAppends.get(key);
                if (pending) pending.text += text;
                else pendingStreamAppends.set(key, { message, field, text });
                if (!streamAppendTimer) streamAppendTimer = setTimeout(
                    flushStreamAppends,
                    RPHRuntimePolicy?.limits?.streamFlushMs || 50
                );
            };

            const appendAssistantReasoning = (message, text) => {
                if (!message || !text) return;
                if (continuationToolCall && continuingAssistantMessage && message.id === continuingAssistantMessage.id) {
                    appendAssistantText(message, 'reasoning', text);
                    return;
                }
                appendAssistantText(message, 'reasoning', text);
            };

            const createAssistantMessage = (content = '', reasoning = '') => reactive({
                role: 'assistant',
                name: currentCharacter.value.name,
                content: content || '',
                reasoning: reasoning || '',
                id: generateUUID(),
                shouldAnimate: true,
                isCotOpen: false,
                isReasoningOpen: true,
                isReasoningUserToggled: false,
                isReasoningAutoCollapsed: false,
                storageStatus: 'draft'
            });

            const ensureAssistantMessage = (content = '', reasoning = '') => {
                if (assistantMessage) return assistantMessage;
                if (continuingAssistantMessage) {
                    assistantMessage = prepareAssistantMessageForAppend(continuingAssistantMessage);
                    assistantMessage.storageStatus = 'draft';
                    if (reasoning) appendAssistantReasoning(assistantMessage, reasoning);
                    if (content) appendAssistantText(assistantMessage, 'content', content);
                    isReceiving.value = true;
                    startDraftPersistence(assistantMessage);
                    return assistantMessage;
                }

                assistantMessage = createAssistantMessage(content, reasoning);
                promoteActiveToolCallsFromAssistant(assistantMessage);
                chatHistory.value.push(assistantMessage);
                isReceiving.value = true;
                startDraftPersistence(assistantMessage);
                return assistantMessage;
            };

            try {
                        // 2026-08-28: guard against an empty chat-provider key. Servers
                        // and gateways often drop the connection on an empty Authorization
                        // header, which surfaces later as a misleading TypeError
                        // ("failed to fetch") only after CHAT_MAX_ATTEMPTS retries.
                        // This message does not match friendlyNetworkErrorMessage's
                        // network patterns, so it passes through verbatim.
                        if (!chatProviderForRequest.apiKey) {
                            throw new Error(`聊天供应商「${getProviderDisplayName(chatProviderForRequest.providerId)}」未配置 API Key，请在设置中检查`);
                        }
                        const requestPayload = {
                            model: requestModel,
                            messages: apiMessages,
                            temperature: settings.temperature,
                            stream: settings.stream,
                            ...(settings.stream ? { stream_options: { include_usage: true } } : {})
                        };
                        requestDiagnostic?.request(requestPayload, Date.now() - generationStartTime);
                        requestDiagnostic?.stage('waiting_headers');
                        let response = null;
                        // 2026-08-28: call the imported create() directly. The previous
                        // alias (`const chatRequestGuard = createChatRequestGuard`) turned
                        // every send into "chatRequestGuard.create is not a function",
                        // which friendlyNetworkErrorMessage misreported as a CORS error.
                        const chatGuard = createChatRequestGuard({
                            firstByteMs: CHAT_FIRST_BYTE_TIMEOUT_MS,
                            firstTokenMs: CHAT_FIRST_TOKEN_TIMEOUT_MS,
                            streamIdleMs: CHAT_STREAM_IDLE_TIMEOUT_MS,
                            totalMs: CHAT_TOTAL_TIMEOUT_MS
                        });
                        const abortForChatTimeout = (timeout) => {
                            if (!timeout) return;
                            requestDiagnostic?.stage(timeout.stage);
                            abortSafely(generationController, timeout.message);
                        };
                        const markMeaningfulChatActivity = (content, reasoning) => {
                            const wasMeaningful = chatGuard.hasMeaningful();
                            const marked = chatGuard.markMeaningful(content, reasoning);
                            if (marked && !wasMeaningful) {
                                requestDiagnostic?.stage('streaming');
                            }
                            return marked;
                        };
                        chatWatchdog = setInterval(() => {
                            if (generationController.signal.aborted) return;
                            abortForChatTimeout(chatGuard.getTimeout());
                        }, 1000);

                        for (let chatAttempt = 1; chatAttempt <= CHAT_MAX_ATTEMPTS; chatAttempt++) {
                            chatGuard.resetHeaders();
                            requestDiagnostic?.stage('waiting_headers');
                            try {
                                response = await raceWithTimeout(
                                    fetch(chatUrl, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${chatProviderForRequest.apiKey}`
                                        },
                                        body: JSON.stringify(requestPayload),
                                        signal: generationController.signal
                                    }),
                                    chatGuard.getRemainingMs(),
                                    () => abortForChatTimeout({
                                        message: 'Generation first byte timed out',
                                        stage: 'timed_out_waiting_headers'
                                    }),
                                    'Generation first byte timed out',
                                    generationController.signal
                                );
                                chatGuard.markHeaders();
                                requestDiagnostic?.responseHeaders(response.status, response.headers.get('content-type') || '');
                                requestDiagnostic?.stage(response.ok ? 'waiting_first_token' : 'reading_error_response');

                                if (response.ok) break;

                                let errorDetail = '';
                                try {
                                    const errorText = await raceWithTimeout(
                                        response.text(),
                                        Math.min(30000, chatGuard.getRemainingMs()),
                                        () => abortForChatTimeout({
                                            message: 'Generation error response timed out',
                                            stage: 'timed_out_error_response'
                                        }),
                                        'Generation error response timed out',
                                        generationController.signal
                                    );
                                    try {
                                        const errorJson = JSON.parse(errorText);
                                        const apiError = extractApiErrorMessage(errorJson, response.status);
                                        if (apiError) throwApiError(apiError);
                                        errorDetail = errorJson;
                                    } catch (e) {
                                        if (e.isApiError) throw e;
                                        if (errorText) errorDetail = errorText;
                                    }
                                } catch (e) {
                                    if (e.isApiError) throw e;
                                }

                                const status = response.status;
                                if (isRetryableChatHttpStatus(status) && chatAttempt < CHAT_MAX_ATTEMPTS) {
                                    await sleepChatRetry(chatAttempt);
                                    continue;
                                }
                                const detailText = formatApiErrorMessage(status, errorDetail);
                                if (status === 429) {
                                    throw new Error('请求过于频繁（429），请稍后重试' + (detailText ? ': ' + detailText : ''));
                                }
                                throw new Error(detailText);
                            } catch (error) {
                                if (error?.isApiError) throw error;
                                if (generationController.signal.aborted) {
                                    throw generationController.signal.reason || error;
                                }
                                if (isUserAbortError(error)) throw error;
                                if (isRetryableChatNetworkError(error) && chatAttempt < CHAT_MAX_ATTEMPTS) {
                                    await sleepChatRetry(chatAttempt);
                                    continue;
                                }
                                if (isRetryableChatNetworkError(error)) {
                                    throw new Error(friendlyNetworkErrorMessage(error, chatUrl));
                                }
                                throw error;
                            }
                        }

                        // Check Content-Type to determine if we should stream
                        const contentType = response.headers.get('content-type');
                        const isStream = settings.stream && contentType && contentType.includes('text/event-stream');

                        if (isStream) {
                            const reader = response.body.getReader();
                            const decoder = new TextDecoder();
                            let buffer = '';
                            let pendingNativeReasoning = '';
                            let nativeReasoningFlushRaf = null;
                            const applyPendingNativeReasoning = () => {
                                if (!assistantMessage || !pendingNativeReasoning) return;
                                appendAssistantReasoning(assistantMessage, pendingNativeReasoning);
                                pendingNativeReasoning = '';
                            };
                            const scheduleNativeReasoningFlush = () => {
                                if (!assistantMessage || !pendingNativeReasoning || nativeReasoningFlushRaf) return;
                                nativeReasoningFlushRaf = requestAnimationFrame(() => {
                                    nativeReasoningFlushRaf = null;
                                    applyPendingNativeReasoning();
                                });
                            };
                            const flushNativeReasoning = () => {
                                if (!assistantMessage || !pendingNativeReasoning) return;
                                if (nativeReasoningFlushRaf) {
                                    cancelAnimationFrame(nativeReasoningFlushRaf);
                                    nativeReasoningFlushRaf = null;
                                }
                                applyPendingNativeReasoning();
                            };

                            while (true) {
                                const { done, value } = await raceWithTimeout(
                                    reader.read(),
                                    chatGuard.getRemainingMs(),
                                    () => {
                                        abortForChatTimeout(chatGuard.getTimeout(Date.now() + 5) || {
                                            message: 'Generation stream timed out',
                                            stage: chatGuard.hasMeaningful() ? 'timed_out_streaming' : 'timed_out_waiting_first_token'
                                        });
                                        reader.cancel?.().catch?.(() => { });
                                    },
                                    chatGuard.hasMeaningful()
                                        ? 'Generation stream idle timed out'
                                        : 'Generation first token timed out',
                                    generationController.signal
                                );
                                if (done) break;
                                requestDiagnostic?.networkChunk(value?.byteLength || 0);

                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop();

                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (!trimmedLine) continue;

                                    if (trimmedLine.startsWith('data:')) {
                                        const dataStr = trimmedLine.slice(5).trimStart();
                                        if (dataStr === '[DONE]') continue;

                                        try {
                                            const data = JSON.parse(dataStr);
                                            const apiError = extractApiErrorMessage(data, response.status);
                                            if (apiError) throwApiError(apiError);
                                            responseUsage = getApiUsagePayload(data) || responseUsage;

                                            const choice = data.choices?.[0];
                                            if (!choice) continue;

                                            const delta = choice.delta || choice.message || {};
                                            const rawContent = delta.content || '';
                                            if (rawContent) rawAssistantContentForLog += rawContent;
                                            const content = (!assistantMessage && !String(rawContent).trim()) ? '' : rawContent;
                                            const reasoning = extractNativeReasoning(delta) || extractNativeReasoning(choice);
                                            markMeaningfulChatActivity(rawContent, reasoning);
                                            if (reasoning) nativeReasoningForLog += reasoning;
                                            requestDiagnostic?.reasoning(reasoning);
                                            requestDiagnostic?.content(rawContent);

                                            if (content || reasoning) {
                                                let seededContent = false;
                                                let seededReasoning = false;
                                                if (!assistantMessage) {
                                                    if (reasoning) {
                                                        isThinking.value = true;
                                                    }
                                                    assistantMessage = ensureAssistantMessage(content, reasoning);
                                                    seededContent = !!content;
                                                    seededReasoning = !!reasoning;
                                                    if (seededContent && !reasoning) {
                                                        isThinking.value = false;
                                                        collapseNativeReasoning(assistantMessage);
                                                    }
                                                    await nextTick();
                                                }

                                                if (reasoning && !seededReasoning) {
                                                    pendingNativeReasoning += reasoning;
                                                    isThinking.value = true;
                                                    scheduleNativeReasoningFlush();
                                                }

                                                if (content && !seededContent) {
                                                    flushNativeReasoning();
                                                    appendAssistantText(assistantMessage, 'content', content);
                                                    isThinking.value = false;
                                                    collapseNativeReasoning(assistantMessage);
                                                }

                                            }
                                        } catch (e) {
                                            if (e.isApiError) throw e;
                                            if (/error/i.test(dataStr)) throw new Error(formatApiErrorMessage(response.status, dataStr));
                                            console.warn('Error parsing stream chunk:', e);
                                        }
                                    }
                                }
                            }
                            flushNativeReasoning();
                            if (!chatGuard.hasMeaningful()) {
                                throw new Error('模型结束了流式响应，但没有返回正文或思维内容');
                            }
                        } else {
                            // Non-streaming response handling
                            // Compatibility Fix: Some APIs force return SSE format even if stream=false
                            // We read as text first to handle both valid JSON and "forced stream" text
                            const rawText = await raceWithTimeout(
                                response.text(),
                                chatGuard.getRemainingMs(),
                                () => abortForChatTimeout(chatGuard.getTimeout(Date.now() + 5) || {
                                    message: 'Generation first token timed out',
                                    stage: 'timed_out_waiting_first_token'
                                }),
                                'Generation first token timed out',
                                generationController.signal
                            );
                            requestDiagnostic?.networkChunk(new TextEncoder().encode(rawText).byteLength);
                            let content = '';

                            try {
                                // 1. Try parsing as standard JSON
                                const data = JSON.parse(rawText);
                                const apiError = extractApiErrorMessage(data, response.status);
                                if (apiError) throwApiError(apiError);
                                responseUsage = getApiUsagePayload(data) || responseUsage;

                                const msg = data.choices?.[0]?.message || {};
                                content = msg.content || '';
                                const reasoning = extractNativeReasoning(msg) || extractNativeReasoning(data.choices?.[0]);
                                markMeaningfulChatActivity(content, reasoning);
                                if (content) rawAssistantContentForLog += content;
                                if (reasoning) nativeReasoningForLog += reasoning;
                                requestDiagnostic?.reasoning(reasoning);
                                requestDiagnostic?.content(content);

                                if (reasoning && !content) {
                                    isThinking.value = true;
                                } else {
                                    isThinking.value = false;
                                }

                                if (content || reasoning) {
                                    assistantMessage = ensureAssistantMessage(content, reasoning);
                                    if (!continuingAssistantMessage) {
                                        assistantMessage.isReasoningOpen = !(reasoning && content);
                                        assistantMessage.isReasoningAutoCollapsed = !!(reasoning && content);
                                    } else if (reasoning && content) {
                                        collapseNativeReasoning(assistantMessage);
                                    }
                                }
                            } catch (e) {
                                if (e.isApiError) throw e;
                                // 2. If JSON fails, try parsing as SSE text (data: {...})
                                // This handles cases where API returns stream format even if stream=false
                                console.log('Non-standard JSON response detected, attempting manual SSE parsing...');
                                const lines = rawText.split('\n');
                                let finalReasoning = '';
                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (trimmedLine.startsWith('data:')) {
                                        const dataStr = trimmedLine.replace(/^data:\s*/, '');
                                        if (dataStr === '[DONE]') continue;
                                        try {
                                            const chunk = JSON.parse(dataStr);
                                            const apiError = extractApiErrorMessage(chunk, response.status);
                                            if (apiError) throwApiError(apiError);
                                            responseUsage = getApiUsagePayload(chunk) || responseUsage;

                                            const choice = chunk.choices?.[0];
                                            if (!choice) continue;

                                            const delta = choice.delta || choice.message || {};
                                            const chunkContent = delta.content || '';
                                            const chunkReasoning = extractNativeReasoning(delta) || extractNativeReasoning(choice);
                                            markMeaningfulChatActivity(chunkContent, chunkReasoning);

                                            if (chunkContent) {
                                                content += chunkContent;
                                                rawAssistantContentForLog += chunkContent;
                                            }
                                            if (chunkReasoning) {
                                                finalReasoning += chunkReasoning;
                                                nativeReasoningForLog += chunkReasoning;
                                            }
                                            requestDiagnostic?.reasoning(chunkReasoning);
                                            requestDiagnostic?.content(chunkContent);
                                        } catch (err) {
                                            if (err.isApiError) throw err;
                                            if (/error/i.test(dataStr)) throw new Error(formatApiErrorMessage(response.status, dataStr));
                                            // Ignore invalid chunks
                                        }
                                    }
                                }

                                if (content || finalReasoning) {
                                    assistantMessage = ensureAssistantMessage(content, finalReasoning);
                                    if (!continuingAssistantMessage) {
                                        assistantMessage.isReasoningOpen = !(finalReasoning && content);
                                        assistantMessage.isReasoningAutoCollapsed = !!(finalReasoning && content);
                                    } else if (finalReasoning && content) {
                                        collapseNativeReasoning(assistantMessage);
                                    }

                                }
                            }
                            if (!chatGuard.hasMeaningful() || !assistantMessage) {
                                throw new Error('模型返回了空响应，没有正文或思维内容');
                            }
                        }

                        flushStreamAppends();
                        requestDiagnostic?.complete(normalizeApiUsage(responseUsage));
                        recordApiUsage(responseUsage, {
                            type: activeToolDepth > 0 ? 'tool_continuation' : 'chat',
                            model: requestModel,
                            detail: activeToolDepth > 0 ? `第 ${activeToolDepth} 次续写` : ''
                        });

                        if (assistantMessage) {
                            generatedAssistantMessageId = assistantMessage.id;
                            console.groupCollapsed('📬 AI 响应接收完毕');
                            console.log('AI返回的完整内容:', formatAIResponseForConsole(
                                rawAssistantContentForLog || assistantMessage.content,
                                nativeReasoningForLog || assistantMessage.reasoning
                            ));
                            console.groupEnd();

                            if (settings.uiTemplateEnabled && settings.uiTemplateMainModelAnalysis) {
                                const uiTemplateUpdateResult = applyMainModelUiTemplateUpdates(assistantMessage, requestModel);
                                if (uiTemplateUpdateResult?.needsFallback) {
                                    nextTick(() => {
                                        updateUiTemplatesFromChat({ manual: true, targetMessageId: assistantMessage.id });
                                    });
                                }
                            }

                            // Record generation time
                            const duration = Date.now() - generationStartTime;
                            recentGenerationTimes.value.push({
                                id: assistantMessage.id,
                                duration: duration
                            });
                            if (recentGenerationTimes.value.length > 5) {
                                recentGenerationTimes.value.shift();
                            }

                            // -----------------------------
                        }

            } catch (error) {
                requestDiagnostic?.fail(error);
                if (error.name === 'AbortError') {
                    const timedOut = /timed out/i.test(String(error.message || ''));
                    const interruptLabel = timedOut ? '*-- 生成超时 --*' : '*-- 生成已中止 --*';
                    wasCancelled = true;
                    const wasReceiving = isReceiving.value;
                    isGenerating.value = false;
                    isRemoteGenerating.value = false;
                    isThinking.value = false;
                    const lastMessage = chatHistory.value[chatHistory.value.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant' && wasReceiving) {
                        const hasContent = !!(lastMessage.content || '').trim();
                        const hasReasoning = !!(lastMessage.reasoning || '').trim();
                        if (hasContent || hasReasoning) {
                            if (hasContent) {
                                lastMessage.content += '\n\n' + interruptLabel;
                            } else {
                                lastMessage.content = interruptLabel;
                            }
                            lastMessage.shouldAnimate = false;
                            collapseNativeReasoning(lastMessage);
                        } else {
                            chatHistory.value.pop();
                            chatHistory.value.push(createCharacterErrorReply(interruptLabel));
                        }
                    } else {
                        chatHistory.value.push(createCharacterErrorReply(interruptLabel));
                    }
                } else if (continuingAssistantMessage) {
                    const errorMessage = truncateErrorMessage(friendlyNetworkErrorMessage(error, chatUrl)) || '生成失败';
                    appendAssistantResponseError(continuingAssistantMessage, errorMessage);
                    activeToolContinuationHasResponse.value = true;
                } else {
                    const errorMessage = truncateErrorMessage(friendlyNetworkErrorMessage(error, chatUrl)) || '生成失败';
                    chatHistory.value.push(createCharacterErrorReply(errorMessage));
                }
            } finally {
                flushStreamAppends();
                scheduleChatStatsRecompute(0);
                stopDraftPersistence();
                if (assistantMessage) assistantMessage.storageStatus = 'final';
                if (continuationToolCall && continuationToolCall.status === 'continuing') {
                    continuationToolCall.status = 'done';
                }
                collapseActiveNativeReasoning();
                // 存储写入可能被原生事务长期挂起，不能让它继续占住生成锁和读秒 UI。
                // saveChatHistoryNow 自身按队列保证顺序，后续保存仍会排在本次最终快照之后。
                saveChatHistoryNow().catch(error => console.error('Final chat save failed:', error));
                if (!continueAssistantMessageId || activeToolContinuationMessageId.value === continueAssistantMessageId) {
                    activeToolContinuationMessageId.value = null;
                    activeToolContinuationToolCallId.value = null;
                    activeToolContinuationHasResponse.value = false;
                }
                if (abortController.value === generationController) {
                    abortController.value = null;
                }
                if (chatWatchdog) {
                    clearInterval(chatWatchdog);
                    chatWatchdog = null;
                }
                if (waitTimer) {
                    clearInterval(waitTimer);
                    waitTimer = null;
                }
                isGenerating.value = false;
                isReceiving.value = false;
                isThinking.value = false;

                const needsPostGenerationTurns = !wasCancelled
                    && ((settings.uiTemplateEnabled && generatedAssistantMessageId)
                        || memorySettings.enabled);
                const activeToolContinued = !wasCancelled && assistantMessage
                    ? await handleActiveToolCallFromAssistant(assistantMessage, activeToolDepth)
                    : false;
                if (!activeToolContinued) {
                    resetActiveToolResultContext();
                }
                const hasCompletedTurns = !activeToolContinued && needsPostGenerationTurns && buildConversationTurnSnapshot().turns.length > 0;

                if (hasCompletedTurns && settings.uiTemplateEnabled && generatedAssistantMessageId && !settings.uiTemplateMainModelAnalysis) {
                    nextTick(() => {
                        updateUiTemplatesFromChat({ manual: false, targetMessageId: generatedAssistantMessageId });
                    });
                }

                // 记忆提取：在对话正常完成后异步提取记忆（用户取消时不触发）
                if (hasCompletedTurns && memorySettings.enabled) {
                    nextTick(() => {
                        extractMemoryFromChat();
                    });
                }

                // TTS 自动朗读：正常完成生成时朗读角色回复（P0 系统 TTS）
                if (!wasCancelled && !activeToolContinued && generatedAssistantMessageId
                    && settings.ttsEnabled && settings.ttsAutoPlay) {
                    const ttsTargetIndex = chatHistory.value.findIndex(m => m.id === generatedAssistantMessageId);
                    if (ttsTargetIndex !== -1 && !chatHistory.value[ttsTargetIndex].isError) {
                        nextTick(() => { toggleSpeakMessage(ttsTargetIndex); });
                    }
                }
            }
        };

        // generateResponseCore 的网络阶段有完整 catch/finally；这一层兜住更早的上下文构建异常，
        // 确保任何未预期错误都不能把全局生成锁永久留在 true。
        const generateResponse = async (startTime = null, options = {}) => {
            try {
                return await generateResponseCore(startTime, options);
            } catch (error) {
                console.error('Unhandled generation failure:', error);
                if (!isGenerating.value) return;
                stopDraftPersistence();
                if (waitTimer) {
                    clearInterval(waitTimer);
                    waitTimer = null;
                }
                if (abortController.value) {
                    abortSafely(abortController.value, 'Generation failed');
                    abortController.value = null;
                }
                isGenerating.value = false;
                isReceiving.value = false;
                isThinking.value = false;
                activeToolContinuationMessageId.value = null;
                activeToolContinuationToolCallId.value = null;
                activeToolContinuationHasResponse.value = false;
                const message = truncateErrorMessage(error?.message || error) || '生成失败';
                chatHistory.value.push(createCharacterErrorReply(message));
                saveChatHistoryNow().catch(saveError => console.error('Recovery chat save failed:', saveError));
            }
        };

    return { generateResponse };
}
