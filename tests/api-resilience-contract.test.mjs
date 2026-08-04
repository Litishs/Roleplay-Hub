import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    assert.ok(app.includes('const chatWatchdog = setInterval'));
    assert.ok(app.includes("abortSafely(abortController.value, 'Generation timed out')"));
    assert.ok(app.includes('lastChatActivityMs = Date.now();'));
    assert.ok(app.includes('if (chatWatchdog) clearInterval(chatWatchdog);'));
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
    assert.ok(app.includes('truncateErrorMessage(friendlyNetworkErrorMessage(error, url))'));
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
