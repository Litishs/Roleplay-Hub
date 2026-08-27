import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const [app, chatGuardSource, memoryFallbackSource, capConfig, java] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/chat-request-guard.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/memory-recall-fallback.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url), 'utf8')
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

test('聊天请求按首包、首有效 token、有效流空闲和总时长超时', () => {
    assert.ok(app.includes('CHAT_FIRST_BYTE_TIMEOUT_MS = 60000'));
    assert.ok(app.includes('CHAT_FIRST_TOKEN_TIMEOUT_MS = 60000'));
    assert.ok(app.includes('CHAT_STREAM_IDLE_TIMEOUT_MS = 120000'));
    assert.ok(app.includes('CHAT_TOTAL_TIMEOUT_MS = 600000'));
    // watchdog 必须提升到函数作用域声明(finally 才能清理), 不能只在 try 块内 const 声明
    assert.ok(app.includes('let chatWatchdog = null;'));
    assert.ok(app.includes('chatWatchdog = setInterval'));
    assert.ok(!app.includes('const chatWatchdog = setInterval'));
    assert.ok(app.includes('const chatRequestGuard = createChatRequestGuard;'));
    assert.ok(app.includes('const chatGuard = chatRequestGuard.create({'));
    assert.ok(app.includes('const markMeaningfulChatActivity = (content, reasoning) => {'));
    assert.ok(!app.includes('lastChatActivityMs = Date.now();'));
    assert.ok(app.includes('clearInterval(chatWatchdog);'));
    assert.ok(app.includes('chatWatchdog = null;'));
    // Android WebView 偶尔不会在 abort 后及时结束 fetch/reader Promise，必须主动 race 超时。
    assert.ok(app.includes('const raceWithTimeout = async (operation, timeoutMs, onTimeout'));
    assert.ok(app.includes('response = await raceWithTimeout('));
    assert.ok(app.includes('reader.read(),'));
    assert.ok(app.includes('response.text(),'));
    assert.ok(app.includes('throw generationController.signal.reason || error;'));
    assert.ok(app.includes("if (trimmedLine.startsWith('data:'))"));
    assert.ok(app.includes("throw new Error('模型结束了流式响应，但没有返回正文或思维内容')"));
    assert.ok(chatGuardSource.includes("stage: 'timed_out_waiting_first_token'"));
    assert.ok(chatGuardSource.includes("stage: 'timed_out_streaming'"));
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(appJs.includes('./chat-request-guard.mjs'));
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
    assert.ok(app.includes("m.vectorRecallMode === 'lexical-fallback'"));
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(appJs.includes('./memory-recall-fallback.mjs'));
});

test('SSE 网络心跳不会刷新有效 token 活跃时间', () => {
    const streamStart = app.indexOf('while (true) {', app.indexOf('const reader = response.body.getReader();'));
    const streamEnd = app.indexOf('flushNativeReasoning();', streamStart);
    const streamLoop = app.slice(streamStart, streamEnd);
    assert.ok(streamLoop.includes('requestDiagnostic?.networkChunk(value?.byteLength || 0);'));
    assert.ok(streamLoop.includes('markMeaningfulChatActivity(rawContent, reasoning);'));
    assert.ok(!streamLoop.includes('lastMeaningfulChatActivityMs = Date.now();'));
});

test('聊天保存卡顿不会占住生成状态和读秒计时器', () => {
    const generateStart = app.indexOf('const generateResponseCore = async');
    const finallyStart = app.indexOf('            } finally {', generateStart);
    const finallyEnd = app.indexOf('                const needsPostGenerationTurns', finallyStart);
    const finalizer = app.slice(finallyStart, finallyEnd);

    assert.ok(finalizer.includes("saveChatHistoryNow().catch(error => console.error('Final chat save failed:', error));"));
    assert.ok(!finalizer.includes('await saveChatHistoryNow();'));
    assert.ok(finalizer.indexOf('clearInterval(waitTimer);') < finalizer.indexOf('isGenerating.value = false;'));
    assert.ok(app.includes('const generateResponse = async (startTime = null, options = {}) => {'));
    assert.ok(app.includes("console.error('Unhandled generation failure:', error);"));
    assert.ok(app.includes('if (!isGenerating.value) return;'));
});

test('chat errors render as character replies and are excluded from model context', () => {
    assert.ok(app.includes('const createCharacterErrorReply ='));
    assert.ok(app.includes('isError: true'));
    assert.ok(app.includes('if (message.isError) return;'));
    assert.ok(app.includes('chatHistory.value.push(createCharacterErrorReply(interruptLabel));'));
    assert.ok(app.includes('chatHistory.value.push(createCharacterErrorReply(errorMessage));'));
    // 2026-08-05 真机回归: url 必须提升到函数作用域，catch 里 friendlyNetworkErrorMessage 才能拿到端点
    // 2026-08-08: 聊天供应商解耦后，端点取自聊天供应商而非设置页浏览的供应商
    assert.ok(app.includes("const chatUrl = getChatProviderEndpoint('chat/completions');"));
    assert.ok(app.includes('friendlyNetworkErrorMessage(error, chatUrl)'));
    assert.ok(!app.includes('friendlyNetworkErrorMessage(error, url)'));
    const messageList = readFileSync(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8');
    assert.ok(messageList.includes("msg.isError ? 'bg-red-50/80 text-red-800 border border-red-300/50'"));
});

test('offline chat flow no longer pops toasts (UI template analysis + auto model fetch)', () => {
    // 变量分析失败只保留内联状态条，不再弹 toast
    assert.ok(app.includes("const failUiTemplateAnalysis = (message, targetMessageId = null) => {"));
    assert.ok(app.includes("markUiTemplateStatus('error', message, 0, targetMessageId);"));
    assert.ok(!app.includes("showToast(message, 'error');"));
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
    assert.ok(releaseScript.includes('$releaseVersionCode = [int](([math]::Floor($currentVersionCode / 10) + 1) * 10)'));
    assert.ok(releaseScript.includes("$releaseVersionName = '{0}.{1:D2}' -f $releaseMajor, $releaseMinor"));
    assert.ok(releaseScript.includes('Roleplay-Hub-$releaseVersionName-release.apk'));

    // 设置页展示版本号

    assert.ok(updateCheckerHtml.includes('v{{ appVersionName }}'));
    assert.ok(app.includes('const appVersionName = ref'));
    assert.ok(app.includes('await nativeApp.getInfo?.();'));
});

test('chat request retries transient failures (429/5xx/network) with backoff', () => {
    assert.ok(app.includes('CHAT_MAX_ATTEMPTS = 3'));
    assert.ok(app.includes('const sleepChatRetry = (attempt) =>'));
    assert.ok(app.includes('for (let chatAttempt = 1; chatAttempt <= CHAT_MAX_ATTEMPTS; chatAttempt++)'));
    assert.ok(app.includes('isRetryableChatHttpStatus(status) && chatAttempt < CHAT_MAX_ATTEMPTS'));
    assert.ok(app.includes('isRetryableChatNetworkError(error) && chatAttempt < CHAT_MAX_ATTEMPTS'));
    assert.ok(app.includes('isUserAbortError(error)'));
});

test('chat errors get friendly network hints and are truncated', () => {
    assert.ok(app.includes('const friendlyNetworkErrorMessage = (error, url = \'\') => {'));
    assert.ok(app.includes('\u68c0\u6d4b\u5230\u660e\u6587 HTTP'));   // ????? HTTP
    assert.ok(app.includes('CORS \u9650\u5236'));                        // CORS ??
    assert.ok(app.includes('\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff08429\uff09')); // ???????429?
    assert.ok(app.includes('const truncateErrorMessage = (message, maxLength = 600) => {'));
    assert.ok(app.includes('truncateErrorMessage(friendlyNetworkErrorMessage(error, chatUrl))'));
});

test('fetchModels has a 15s timeout', () => {
    assert.ok(app.includes('AbortSignal.timeout(15000)'));
});

test('chat model falls back to configured presets when legacy Web storage lacks settings.model', () => {
    assert.ok(app.includes('const resolveChatModel = () => ['));
    assert.ok(app.includes('settings.qualityModel,'));
    assert.ok(app.includes('const syncChatModelFromPresets = () => {'));
    assert.ok(app.includes('syncChatModelFromPresets();'));
    assert.ok(app.includes('const requestModel = syncChatModelFromPresets();'));
    assert.ok(app.includes("showToast('请先在设置中选择聊天模型', 'error');"));
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
    assert.ok(app.includes('UI_TEMPLATE_ANALYSIS_CONCURRENCY = 3'));
    assert.ok(app.includes('const runWithConcurrency = async (items, limit, worker) => {'));
    assert.ok(app.includes('await runWithConcurrency(templates, UI_TEMPLATE_ANALYSIS_CONCURRENCY, async (template) => {'));
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
