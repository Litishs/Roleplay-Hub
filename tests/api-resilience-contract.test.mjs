import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const [app, capConfig, java] = await Promise.all([
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url), 'utf8')
]);

test('API URL normalization is unified and handles trailing slashes', () => {
    assert.ok(app.includes('const getApiEndpoint = (path) => {'));
    assert.ok(app.includes("replace(/\\/+$/, '')"));
    assert.ok(app.includes("replace(/^\\/+/, '')"));
    assert.ok(app.includes('const getOpenAICompatUrl = (endpoint) => getApiEndpoint(endpoint);'));
});

test('chat request has first-byte and stream-idle timeouts', () => {
    assert.ok(app.includes('CHAT_FIRST_BYTE_TIMEOUT_MS = 60000'));
    assert.ok(app.includes('CHAT_STREAM_IDLE_TIMEOUT_MS = 120000'));
    // watchdog 必须提升到函数作用域声明(finally 才能清理), 不能只在 try 块内 const 声明
    assert.ok(app.includes('let chatWatchdog = null;'));
    assert.ok(app.includes('chatWatchdog = setInterval'));
    assert.ok(!app.includes('const chatWatchdog = setInterval'));
    assert.ok(app.includes("abortSafely(abortController.value, 'Generation timed out')"));
    assert.ok(app.includes('lastChatActivityMs = Date.now();'));
    assert.ok(app.includes('clearInterval(chatWatchdog);'));
    assert.ok(app.includes('chatWatchdog = null;'));
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
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes("msg.isError ? 'bg-red-50/80 text-red-800 border border-red-300/50'"));
});

test('offline chat flow no longer pops toasts (UI template analysis + auto model fetch)', () => {
    // 变量分析失败只保留内联状态条，不再弹 toast
    assert.ok(app.includes("const failUiTemplateAnalysis = (message, targetMessageId = null) => {"));
    assert.ok(app.includes("markUiTemplateStatus('error', message, 0, targetMessageId);"));
    assert.ok(!app.includes("showToast(message, 'error');"));
    // 自动拉取模型失败保持静默，只有手动拉取才弹 toast
    assert.ok(app.includes("if (isManual) showToast('\u83b7\u53d6\u6a21\u578b\u5931\u8d25: ' + error.message, 'error');"));
    // 变量分析失败提示以内联红条展示在设置页
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes("uiTemplateUpdateStatus.state === 'error'"));
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
    assert.ok(script.includes('Roleplay-Hub-$nextVersionName-debug.apk'));

    // 设置页展示版本号
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes('v{{ appVersionName }}'));
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
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes('requestDiagnosticsCount'));
    assert.ok(html.includes('exportRequestDiagnostics()'));
    assert.ok(html.includes('\u590d\u5236\u8bca\u65ad\u4fe1\u606f')); // ??????
});
