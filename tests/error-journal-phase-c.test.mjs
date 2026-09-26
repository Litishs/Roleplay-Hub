// Contract tests for the diagnostics 4-layer plan Phase C (capture + UX).
//
// Covers: non-Error privacy downgrade, the index.html early-error buffer and
// its replay, the iframe card-error bridge in BOTH card-utils flavors (ESM +
// UMD), the native last-crash layer (writer/exception handler/WebView client/
// plugin methods), TTS journal wiring, the failure-toast export entry, the
// settings failure list, and the once-per-crash startup notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createRuntimeErrorTracker, installGlobalErrorHandlers } from '../src/modules/global-error-handler.mjs';

const readSource = async (relativePath) => (
    await readFile(new URL(relativePath, import.meta.url), 'utf8')
);

const createMockJournal = () => {
    const calls = [];
    return {
        calls,
        begin({ category, action } = {}) {
            const handle = {
                behaviors: [],
                failedWith: undefined,
                behavior(entry) { this.behaviors.push(entry); },
                fail(error) { this.failedWith = error; }
            };
            calls.push({ category, action, handle });
            return handle;
        }
    };
};

test('non-Error rejections longer than 64 chars or multiline are downgraded to len+hash markers', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });

    // Short single-line strings stay verbatim (enum-ish error codes).
    tracker.recordUnhandledRejection({ reason: 'QUOTA_EXCEEDED' });
    assert.equal(journal.calls[0].handle.failedWith.message, 'QUOTA_EXCEEDED');

    // A long rejected string that may embed user text must not reach the journal.
    const userText = `角色名：泻火的同桌。正文：${'x'.repeat(300)}`;
    tracker.recordUnhandledRejection({ reason: userText });
    const stored = journal.calls[1].handle.failedWith.message;
    assert.match(stored, /^<omitted:len=\d+;hash=[0-9a-f]{8}>$/, 'long non-Error text is replaced by a marker');
    assert.ok(!stored.includes('泻火'), 'no plaintext fragment survives');

    // Multiline values are withheld even when short.
    tracker.recordUnhandledRejection({ reason: 'line1\nline2' });
    assert.match(journal.calls[2].handle.failedWith.message, /^<omitted:len=/);

    // The marker is stable per content so dedup keeps working.
    tracker.recordUnhandledRejection({ reason: userText });
    assert.equal(journal.calls.length, 3, 'same omitted text deduplicates');
});

test('index.html buffers early errors and app.mjs replays them before mount', async () => {
    const [indexHtml, app] = await Promise.all([
        readSource('../index.html'),
        readSource('../src/modules/app.mjs')
    ]);
    assert.ok(indexHtml.includes('__rphEarlyErrors'), 'early error buffer exists');
    assert.ok(indexHtml.includes("'unhandledrejection'"), 'buffer captures both sinks');
    assert.match(app, /const earlyErrors = window\.__rphEarlyErrors;/, 'app.mjs reads the buffer');
    assert.match(app, /delete window\.__rphEarlyErrors;/, 'buffer is dropped after replay');
    const replayIndex = app.indexOf('__rphEarlyErrors');
    const installIndex = app.indexOf('installGlobalErrorHandlers(__app);');
    const mountIndex = app.indexOf("__app.mount('#app');");
    assert.ok(replayIndex > installIndex && installIndex < mountIndex, 'replay happens after install, before mount');
});

test('card-error bridge exists in BOTH card-utils flavors and is same-origin only', async () => {
    const [esm, umd] = await Promise.all([
        readSource('../src/modules/card-utils.mjs'),
        readSource('../assets/js/card-utils.js')
    ]);
    for (const [label, source] of [['ESM', esm], ['UMD', umd]]) {
        assert.ok(source.includes("'rph:card-error'"), `${label} bridge message type present`);
        assert.ok(source.includes('installCardErrorReporter'), `${label} reporter (iframe side) present`);
        assert.ok(source.includes('installCardErrorBridge'), `${label} parent listener present`);
        assert.ok(source.includes('window.parent === window'), `${label} reporter skips the top-level frame`);
        assert.match(source, /event\.origin !== window\.location\.origin/, `${label} parent listener checks origin`);
        assert.ok(source.includes("action: 'card_error'"), `${label} records into the journal as card_error`);
    }
});

test('native last-crash layer: writer, exception handler, WebView client, plugin methods', async () => {
    const [writer, reporter, client, mainActivity, plugin] = await Promise.all([
        readSource('../android/app/src/main/java/com/roleplayhub/app/CrashFileWriter.java'),
        readSource('../android/app/src/main/java/com/roleplayhub/app/CrashReporter.java'),
        readSource('../android/app/src/main/java/com/roleplayhub/app/CrashReportingWebViewClient.java'),
        readSource('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java'),
        readSource('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java')
    ]);
    assert.ok(writer.includes('last-crash.json'), 'crash file name');
    assert.ok(writer.includes('MESSAGE_MAX = 500'), 'message is clamped');
    assert.ok(!writer.includes('StackTrace'), 'no stack trace is persisted');
    assert.ok(writer.includes('noteAppStart'), 'uptime base is noted at real app start');
    assert.match(mainActivity, /CrashFileWriter\.noteAppStart\(\);/, 'MainActivity notes the app start');
    assert.ok(reporter.includes('previous.uncaughtException(thread, throwable)'), 'handler chains to the previous one');
    assert.ok(client.includes('extends BridgeWebViewClient'), 'client subclasses the Capacitor client');
    assert.match(client, /onRenderProcessGone[\s\S]*?return false;/, 'render-process-gone keeps default termination');
    assert.match(mainActivity, /Thread\.setDefaultUncaughtExceptionHandler\(new CrashReporter\(/, 'MainActivity installs the handler');
    assert.match(mainActivity, /new CrashReportingWebViewClient\(/, 'MainActivity installs the WebView client');
    assert.match(plugin, /public void readLastCrash\(PluginCall call\)/, 'plugin exposes readLastCrash');
    assert.match(plugin, /public void clearLastCrash\(PluginCall call\)/, 'plugin exposes clearLastCrash');
});

test('TTS engines record failures into the journal without the spoken text', async () => {
    const [systemEngine, cloudEngine] = await Promise.all([
        readSource('../src/modules/tts-engine.mjs'),
        readSource('../src/modules/tts-cloud-engine.mjs')
    ]);
    assert.match(systemEngine, /category: 'tts', action: 'system_speak'/);
    assert.match(systemEngine, /chars: safeText\.length/, 'chars only, never the text');
    assert.match(systemEngine, /journalRecord\?\.fail\?\.\(error\)/);
    assert.match(cloudEngine, /category: 'tts', action: 'cloud_speech'/);
    assert.match(cloudEngine, /journalRecord\?\.fail\?\.\(\{ name: 'AbortError', message: 'stopped by user' \}\)/);
    assert.match(cloudEngine, /chunks: chunks\.length/, 'chunk count recorded, not text');
});

test('failure toasts carry the diagnostics export action', async () => {
    const [app, sender, toastComponent] = await Promise.all([
        readSource('../src/modules/app.mjs'),
        readSource('../src/composables/useMessageSender.mjs'),
        readSource('../src/components/common/ToastNotification.vue')
    ]);
    assert.match(app, /const showToast = \(message, type = 'info', duration = 2000, action = null\)/, 'showToast accepts an action');
    assert.match(app, /const buildDiagnosticsToastAction = \(\) => \(\{\s*label: '导出诊断'/, 'export action builder exists');
    assert.match(app, /const dismissToast = \(id\)/, 'dismissToast exposed for the toast component');
    assert.match(app, /buildDiagnosticsToastAction,\s*\n\s*\}\);/, 'action builder passed into useMessageSender deps');
    assert.match(sender, /showToast\('生成失败', 'error', 5000, buildDiagnosticsToastAction\?\.\(\)\)/, 'failure path wires the export entry');
    assert.match(sender, /showToast\('生成超时', 'error', 5000, buildDiagnosticsToastAction\?\.\(\)\)/, 'timeout path wires the export entry');
    assert.match(toastComponent, /onToastAction\(toast\)/, 'toast component renders the action button');
    assert.match(toastComponent, /ctx\?\.dismissToast\?\.\(toast\.id\)/, 'action click dismisses the toast');
});

test('settings page: failure list, copy-summary button, and startup crash notice are wired', async () => {
    const [app, settingsPanel] = await Promise.all([
        readSource('../src/modules/app.mjs'),
        readSource('../src/components/views/SettingsPanel.vue')
    ]);
    assert.match(app, /const diagnosticsFailureRecords = computed/, 'failure list computed exists');
    assert.match(app, /r\.result !== 'ok' && r\.result !== 'pending'/, 'non-ok records only');
    assert.match(app, /DIAGNOSTICS_SEVERITY_RANK\[a\.severity\]/, 'worst severity first');
    assert.match(app, /const copyDiagnosticsSummary = async/, 'copy-summary handler exists');
    assert.match(app, /buildShortSummary/, 'uses the journal short summary');
    assert.match(app, /const maybeShowLastCrashNotice = async/, 'crash notice handler exists');
    assert.match(app, /await maybeShowLastCrashNotice\(\);/, 'notice wired into onMounted');
    assert.match(app, /clearLastCrash\?\.\(\)/, 'notice acknowledged by clearing the crash file');
    assert.match(app, /action: isRenderGone \? 'render_process_gone' : 'native_crash'/, 'crash transcribed as fatal record');

    assert.match(settingsPanel, /最近异常 \(\{\{ diagnosticsFailureRecords\.length \}\}\)/, 'failure list rendered');
    assert.match(settingsPanel, /copyDiagnosticsSummary/, 'copy-summary button rendered');
    assert.match(settingsPanel, /diagnosticsSeverityDotClass\(record\.severity\)/, 'severity dot classes');
    assert.match(settingsPanel, /diagnosticsShowAll = !diagnosticsShowAll/, 'expand/collapse toggle');
});
