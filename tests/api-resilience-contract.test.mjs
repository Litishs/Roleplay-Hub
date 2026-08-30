import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const [app, sender, chatGuardSource, memoryFallbackSource, capConfig, java, uiState, utils, uiTemplatePipeline, dataLoaderSource] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/chat-request-guard.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/memory-recall-fallback.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useUiState.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/utils.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useUiTemplatePipeline.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useDataLoader.mjs', import.meta.url), 'utf8')
]);
    const appJs = readFileSync(new URL("../src/modules/app.mjs", import.meta.url), "utf8");
const [updateCheckerHtml, usagePanelHtml, worldInfoHtml] = await Promise.all([
        readFile(new URL("../src/components/settings/UpdateChecker.vue", import.meta.url), "utf8"),
        readFile(new URL("../src/components/views/UsageStatsPanel.vue", import.meta.url), "utf8"),
        readFile(new URL("../src/components/views/WorldInfoPanel.vue", import.meta.url), "utf8")
    ]);


test('API URL normalization is unified and handles trailing slashes', () => {
    assert.ok(app.includes('const getApiEndpoint = (path) => {'));
    assert.ok(app.includes("replace(/\\/+$/, '')"));
    assert.ok(app.includes("replace(/^\\/+/, '')"));
    assert.ok(app.includes('const getOpenAICompatUrl = (endpoint) => getApiEndpoint(endpoint);'));
});

// 2026-08-29 (Phase 2.2): the chat generation pipeline moved from app.mjs to
// src/composables/useMessageSender.mjs; assertions for pipeline-internal text
// read from `sender` instead of `app`.
test('聊天请求按首包、首有效 token、有效流空闲和总时长超时', () => {
    assert.ok(sender.includes('CHAT_FIRST_BYTE_TIMEOUT_MS = 60000'));
    assert.ok(sender.includes('CHAT_FIRST_TOKEN_TIMEOUT_MS = 60000'));
    assert.ok(sender.includes('CHAT_STREAM_IDLE_TIMEOUT_MS = 120000'));
    assert.ok(sender.includes('CHAT_TOTAL_TIMEOUT_MS = 600000'));
    // watchdog 必须提升到函数作用域声明(finally 才能清理), 不能只在 try 块内 const 声明
    assert.ok(sender.includes('let chatWatchdog = null;'));
    assert.ok(sender.includes('chatWatchdog = setInterval'));
    assert.ok(!sender.includes('const chatWatchdog = setInterval'));
    // 2026-08-28: the guard's create() must be invoked directly. The old alias
    // (`const chatRequestGuard = createChatRequestGuard`) crashed every send with
    // "chatRequestGuard.create is not a function", misreported as a CORS error.
    assert.ok(!sender.includes('const chatRequestGuard = createChatRequestGuard;'));
    assert.ok(sender.includes('const chatGuard = createChatRequestGuard({'));
    assert.ok(sender.includes('const markMeaningfulChatActivity = (content, reasoning) => {'));
    assert.ok(!sender.includes('lastChatActivityMs = Date.now();'));
    assert.ok(sender.includes('clearInterval(chatWatchdog);'));
    assert.ok(sender.includes('chatWatchdog = null;'));
    // Android WebView 偶尔不会在 abort 后及时结束 fetch/reader Promise，必须主动 race 超时。
    assert.ok(app.includes('const raceWithTimeout = async (operation, timeoutMs, onTimeout'));
    assert.ok(sender.includes('response = await raceWithTimeout('));
    assert.ok(sender.includes('reader.read(),'));
    assert.ok(sender.includes('response.text(),'));
    assert.ok(sender.includes('throw generationController.signal.reason || error;'));
    assert.ok(sender.includes("if (trimmedLine.startsWith('data:'))"));
    assert.ok(sender.includes("throw new Error('模型结束了流式响应，但没有返回正文或思维内容')"));
    assert.ok(chatGuardSource.includes("stage: 'timed_out_waiting_first_token'"));
    assert.ok(chatGuardSource.includes("stage: 'timed_out_streaming'"));
    const senderJs = readFileSync(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8');
    assert.ok(senderJs.includes('../modules/chat-request-guard.mjs'));
});

test('聊天向量召回超时后仍通过关键词与最近轮次注入记忆', () => {
    assert.ok(app.includes('MEMORY_CONTEXT_RECALL_TIMEOUT_MS = 20000'));
    assert.ok(app.includes('MEMORY_CONTEXT_RECALL_RETRY_DELAY_MS = 60000'));
    assert.ok(app.includes('const selectVectorMemoriesForChatContext = async (options = {}, generationSignal = null, diagnostic = null) => {'));
    assert.ok(app.includes("abortSafely(recallController, 'Memory recall timed out')"));
    assert.ok(app.includes('const selectVectorMemoriesLexicalFallback = (options = {}) => {'));
    assert.ok(app.includes('const memoryRecallFallback = recallFallbackSelect;'));
    assert.ok(app.includes('return memoryRecallFallback.select(vectorMemories, {'));
    assert.ok(memoryFallbackSource.includes("vectorRecallMode: 'lexical-fallback'"));
    assert.ok(app.includes("diagnostic?.stage('memory_recall_lexical_fallback')"));
    assert.ok(app.includes("diagnostic?.stage('memory_recall_circuit_fallback')"));
    assert.ok(app.includes('memoryRecallRetryAfter.set(recallBackendKey'));
    assert.ok(app.includes('return selectVectorMemoriesLexicalFallback(options);'));
    assert.ok(sender.includes("m.vectorRecallMode === 'lexical-fallback'"));
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(appJs.includes('./memory-recall-fallback.mjs'));
});

test('SSE 网络心跳不会刷新有效 token 活跃时间', () => {
    const streamStart = sender.indexOf('while (true) {', sender.indexOf('const reader = response.body.getReader();'));
    const streamEnd = sender.indexOf('flushNativeReasoning();', streamStart);
    const streamLoop = sender.slice(streamStart, streamEnd);
    assert.ok(streamLoop.includes('requestDiagnostic?.networkChunk(value?.byteLength || 0);'));
    assert.ok(streamLoop.includes('markMeaningfulChatActivity(rawContent, reasoning);'));
    assert.ok(!streamLoop.includes('lastMeaningfulChatActivityMs = Date.now();'));
});

test('聊天保存卡顿不会占住生成状态和读秒计时器', () => {
    const generateStart = sender.indexOf('const generateResponseCore = async');
    const finallyStart = sender.indexOf('            } finally {', generateStart);
    const finallyEnd = sender.indexOf('                const needsPostGenerationTurns', finallyStart);
    const finalizer = sender.slice(finallyStart, finallyEnd);

    assert.ok(finalizer.includes("saveChatHistoryNow().catch(error => console.error('Final chat save failed:', error));"));
    assert.ok(!finalizer.includes('await saveChatHistoryNow();'));
    assert.ok(finalizer.indexOf('clearInterval(waitTimer);') < finalizer.indexOf('isGenerating.value = false;'));
    assert.ok(sender.includes('const generateResponse = async (startTime = null, options = {}) => {'));
    assert.ok(sender.includes("console.error('Unhandled generation failure:', error);"));
    assert.ok(sender.includes('if (!isGenerating.value) return;'));
});

test('chat errors render as character replies and are excluded from model context', () => {
    assert.ok(app.includes('const createCharacterErrorReply ='));
    assert.ok(app.includes('isError: true'));
    assert.ok(app.includes('if (message.isError) return;'));
    assert.ok(sender.includes('chatHistory.value.push(createCharacterErrorReply(interruptLabel));'));
    assert.ok(sender.includes('chatHistory.value.push(createCharacterErrorReply(errorMessage));'));
    // 2026-08-05 真机回归: url 必须提升到函数作用域，catch 里 friendlyNetworkErrorMessage 才能拿到端点
    // 2026-08-08: 聊天供应商解耦后，端点取自聊天供应商而非设置页浏览的供应商
    assert.ok(sender.includes("const chatUrl = getChatProviderEndpoint('chat/completions');"));
    assert.ok(sender.includes('friendlyNetworkErrorMessage(error, chatUrl)'));
    assert.ok(!sender.includes('friendlyNetworkErrorMessage(error, url)'));
    const messageList = readFileSync(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8');
    assert.ok(messageList.includes("msg.isError ? 'bg-red-50/80 text-red-800 border border-red-300/50'"));
});

test('offline chat flow no longer pops toasts (UI template analysis + auto model fetch)', () => {
    // 变量分析失败只保留内联状态条，不再弹 toast
    // 2026-08-29 (Phase 3.0): the UI template analysis pipeline moved from
    // app.mjs to src/composables/useUiTemplatePipeline.mjs; assertions for
    // pipeline-internal text read from `uiTemplatePipeline` instead of `app`.
    assert.ok(uiTemplatePipeline.includes("const failUiTemplateAnalysis = (message, targetMessageId = null) => {"));
    assert.ok(uiTemplatePipeline.includes("markUiTemplateStatus('error', message, 0, targetMessageId);"));
    assert.ok(!uiTemplatePipeline.includes("showToast(message, 'error');"));
    // 自动拉取模型失败保持静默，只有手动拉取才弹 toast
    assert.ok(app.includes("if (isManual) showToast('\u83b7\u53d6\u6a21\u578b\u5931\u8d25: ' + error.message, 'error');"));
    // 变量分析失败提示以内联红条展示在设置页
    const uiHtml = readFileSync(new URL('../src/components/views/UiTemplatePanel.vue', import.meta.url), 'utf8');
    assert.ok(uiHtml.includes("uiTemplateUpdateStatus.state === 'error'"));
});

test('each debug build bumps version (1.9 -> 1.10 -> 1.11 ...) and exposes it in-app', () => {
    const versionProps = readFileSync(new URL('../android/version.properties', import.meta.url), 'utf8');
    const codeMatch = versionProps.match(/^versionCode=(\d+)$/m);
    const nameMatch = versionProps.match(/^versionName=(\d+\.\d+)$/m);
    assert.ok(codeMatch && Number(codeMatch[1]) >= 9, 'versionCode must be initialized at >= 9');
    assert.ok(nameMatch, 'versionName must look like 1.x');

    const buildGradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
    assert.ok(buildGradle.includes("file('../version.properties')"));
    assert.ok(buildGradle.includes('versionCode appVersionCode'));
    assert.ok(buildGradle.includes('versionName appVersionName'));

    const script = readFileSync(new URL('../scripts/build-android-debug.ps1', import.meta.url), 'utf8');
    assert.ok(script.includes('$nextVersionCode = $currentVersionCode + 1'));
    assert.ok(script.includes("$nextVersionName = '{0}.{1:D2}' -f $nextMajor, $nextMinor"));
    assert.ok(script.includes('Roleplay-Hub-$nextVersionName-debug.apk'));

    const releaseScript = readFileSync(new URL('../scripts/build-android-release.ps1', import.meta.url), 'utf8');
    assert.ok(releaseScript.includes('$releaseVersionCode = $currentVersionCode + 1'));
    assert.ok(releaseScript.includes("$releaseVersionName = '{0}.{1:D2}' -f $releaseMajor, $releaseMinor"));
    assert.ok(releaseScript.includes('Roleplay-Hub-$releaseVersionName-release.apk'));

    // 设置页展示版本号

    assert.ok(updateCheckerHtml.includes('v{{ appVersionName }}'));
    // Version display state lives in useUiState (Phase 2); app.mjs keeps the getInfo wiring
    assert.ok(uiState.includes('const appVersionName = ref'));
    assert.ok(app.includes('const uiState = useUiState();'));
    assert.ok(app.includes('await nativeApp.getInfo?.();'));
});

test('chat request retries transient failures (429/5xx/network) with backoff', () => {
    assert.ok(sender.includes('CHAT_MAX_ATTEMPTS = 3'));
    assert.ok(sender.includes('const sleepChatRetry = (attempt) =>'));
    assert.ok(sender.includes('for (let chatAttempt = 1; chatAttempt <= CHAT_MAX_ATTEMPTS; chatAttempt++)'));
    assert.ok(sender.includes('isRetryableChatHttpStatus(status) && chatAttempt < CHAT_MAX_ATTEMPTS'));
    assert.ok(sender.includes('isRetryableChatNetworkError(error) && chatAttempt < CHAT_MAX_ATTEMPTS'));
    assert.ok(sender.includes('isUserAbortError(error)'));
});

test('chat errors get friendly network hints and are truncated', () => {
    assert.ok(app.includes('const friendlyNetworkErrorMessage = (error, url = \'\') => {'));
    assert.ok(app.includes('\u68c0\u6d4b\u5230\u660e\u6587 HTTP'));   // ????? HTTP
    assert.ok(app.includes('CORS \u9650\u5236'));                        // CORS ??
    assert.ok(sender.includes('\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff08429\uff09')); // ???????429?
    assert.ok(sender.includes('const truncateErrorMessage = (message, maxLength = 600) => {'));
    assert.ok(sender.includes('truncateErrorMessage(friendlyNetworkErrorMessage(error, chatUrl))'));
    // 2026-08-28: the chat provider is pinned once per generation so URL,
    // Authorization header and diagnostics never drift from each other
    assert.ok(sender.includes('const chatProviderForRequest = getChatProvider();'));
    assert.ok(sender.includes("'Authorization': `Bearer ${chatProviderForRequest.apiKey}`"));
    // empty chat-provider key must surface a clear message instead of the
    // misleading "network request failed" TypeError branch
    assert.ok(sender.includes('未配置 API Key')); // ????? API Key
    // 2026-08-28: network errors are matched by message shape, not by TypeError
    // name — non-network TypeErrors (programming bugs) must surface verbatim
    assert.ok(!sender.includes("if (error?.name === 'TypeError') return true;"));
    assert.ok(!sender.includes("if (error?.name === 'TypeError' || /failed to fetch/i.test(message))"));
    assert.ok(sender.includes('/failed to fetch|network error|networkerror|networkrequestfailed|load failed/i'));
});

test('fetchModels has a 15s timeout', () => {
    assert.ok(app.includes('AbortSignal.timeout(15000)'));
});

test('chat model falls back to configured presets when legacy Web storage lacks settings.model', () => {
    assert.ok(app.includes('const resolveChatModel = () => ['));
    assert.ok(app.includes('settings.qualityModel,'));
    assert.ok(app.includes('const syncChatModelFromPresets = () => {'));
    // Phase 3.0: the loadData call site moved to useDataLoader.mjs
    assert.ok(dataLoaderSource.includes('syncChatModelFromPresets();'));
    assert.ok(sender.includes('const requestModel = syncChatModelFromPresets();'));
    assert.ok(sender.includes("showToast('请先在设置中选择聊天模型', 'error');"));
});

test('release debug flag is disabled in capacitor config', () => {
    const config = JSON.parse(capConfig);
    assert.equal(config.android.webContentsDebuggingEnabled, false);
});

test('NativeStoragePlugin still exposes clipboardRead for the paste fix', () => {
    assert.ok(java.includes('public void clipboardRead(PluginCall call)'));
});

test('memory requests have a 60s timeout and validate embedding dimensions', () => {
    assert.ok(app.includes('MEMORY_API_TIMEOUT_MS = 60000'));
    assert.ok(app.includes('const withTimeoutSignal = (signal, ms = MEMORY_API_TIMEOUT_MS) => {'));
    assert.ok(app.includes('const validateEmbeddingVectors = (vectors, expectedCount) => {'));
    assert.ok(app.includes('signal: withTimeoutSignal(signal)'));
    assert.ok(app.includes('\u5411\u91cf\u7ef4\u5ea6\u4e0e\u5df2\u6709\u8bb0\u5fc6\u4e0d\u4e00\u81f4')); // ????????????
});

test('UI template analysis is concurrency-throttled', () => {
    // Phase 3.0: pipeline moved to useUiTemplatePipeline.mjs
    assert.ok(uiTemplatePipeline.includes('UI_TEMPLATE_ANALYSIS_CONCURRENCY = 3'));
    // Phase 2.3: runWithConcurrency moved to utils.mjs; call site stays in the pipeline
    assert.ok(utils.includes('export const runWithConcurrency = async (items, limit, worker) => {'));
    assert.ok(uiTemplatePipeline.includes('await runWithConcurrency(templates, UI_TEMPLATE_ANALYSIS_CONCURRENCY, async (template) => {'));
});

test('request diagnostics export copies JSON to clipboard', () => {
    assert.ok(app.includes('const exportRequestDiagnostics = async () => {'));
    assert.ok(app.includes('const requestDiagnosticsCount = computed'));
    assert.ok(app.includes('const writeClipboardText = async (text) => {'));
    assert.ok(app.includes('requestDiagnosticsCount, exportRequestDiagnostics,'));
    assert.ok(java.includes('public void clipboardWrite(PluginCall call)'));
    assert.ok(java.includes('clipboard.setPrimaryClip(ClipData.newPlainText('));
});

test('usage view exposes a diagnostics export button', async () => {

    assert.ok(usagePanelHtml.includes('requestDiagnosticsCount'));
    assert.ok(usagePanelHtml.includes('exportRequestDiagnostics()'));
    assert.ok(usagePanelHtml.includes('\u590d\u5236\u8bca\u65ad\u4fe1\u606f')); // ??????
});

test('chat diagnostics record the pinned provider to spot mismatch with connection test', () => {
    // 2026-08-28: the connection test only probes the settings-page provider
    // (settings.apiUrl/apiKey) while chat uses the pinned chat provider; the
    // diagnostics payload must record which provider chat actually used.
    assert.ok(sender.includes('providerId: chatProviderForRequest.providerId,'));
    assert.ok(sender.includes('providerApiUrl: chatProviderForRequest.apiUrl,'));
    assert.ok(sender.includes('hasApiKey: !!chatProviderForRequest.apiKey'));
});
