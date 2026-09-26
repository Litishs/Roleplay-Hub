// Contract tests for the Activity Journal schema v2 (4-layer plan, Phase B).
//
// Covers: per-record severity (defaults + fail() mapping + overrides), the
// session context fields (sessionId / uptimeMs / appVersion / buildType),
// breadcrumbs (ring cap, meta sanitization, runtime-only attach), the
// machine-readable export summary, the shareable short summary text, and
// back-compat hydration of v1 records.
//
// Same loading technique as tests/request-diagnostics.test.mjs: the module
// source runs in a vm context with mocked localStorage/sessionStorage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const buildContext = (values = new Map()) => {
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  };
  const sessionStorage = {
    getItem: key => null,
    setItem: () => { /* no-op */ },
    removeItem: () => { /* no-op */ },
    clear: () => { /* no-op */ }
  };
  const context = vm.createContext({
    window: {},
    crypto: webcrypto,
    TextEncoder,
    URL,
    location: { href: 'https://localhost/' },
    performance,
    localStorage,
    sessionStorage,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    console
  });
  context.globalThis = context;
  return { context, localStorage, sessionStorage };
};

const loadDiagnostics = async (values = new Map()) => {
  const { context, localStorage, sessionStorage } = buildContext(values);
  const source = await readFile(new URL('../src/modules/request-diagnostics.mjs', import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
  }).replace(/^export default\s+(\S+);\s*$/m, (_, name) => { return 'window.' + name + ' = ' + name + ';\nglobalThis.' + name + ' = ' + name + ';'; });
  vm.runInContext(cleanSource, context, { filename: 'request-diagnostics.mjs' });
  return { diagnostics: context.RPHRequestDiagnostics, context, localStorage, sessionStorage };
};

const flushPersist = async (localStorage) => {
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return localStorage;
};

test('schema v2: every record carries severity and the session context fields', async () => {
  const { diagnostics } = await loadDiagnostics();
  assert.equal(diagnostics.schemaVersion, 2);
  assert.equal(typeof diagnostics.setRecordMeta, 'function');
  assert.equal(typeof diagnostics.breadcrumb, 'function');
  assert.equal(typeof diagnostics.buildShortSummary, 'function');

  diagnostics.setRecordMeta({ appVersion: '2.63 (161)', buildType: 'release' });
  diagnostics.begin({ category: 'chat', action: 'generate' });
  const record = diagnostics.getLatest();
  assert.equal(record.severity, 'info');
  assert.ok(record.sessionId, 'sessionId generated lazily');
  assert.equal(record.appVersion, '2.63 (161)');
  assert.equal(record.buildType, 'release');
  assert.ok(Number.isFinite(record.uptimeMs) && record.uptimeMs >= 0);
  assert.equal(record.breadcrumbs.length, 0, 'business records carry no breadcrumb trail');

  // sessionId is stable across records within one session.
  diagnostics.begin({ category: 'tool', action: 'batch' });
  assert.equal(diagnostics.getLatest().sessionId, record.sessionId);
});

test('severity mapping: runtime=error, cancelled=info, timed_out/failed=warn, explicit override wins', async () => {
  const { diagnostics } = await loadDiagnostics();

  diagnostics.begin({ category: 'runtime', action: 'window_error' });
  diagnostics.getLatest();
  // runtime records: severity stays 'error' through the fail path
  const runtimeRecord = diagnostics.getAll()[0];
  assert.equal(runtimeRecord.severity, 'error');

  const cancel = diagnostics.begin({ category: 'chat', action: 'generate' });
  cancel.fail({ name: 'AbortError', message: 'aborted by user' });
  assert.equal(diagnostics.getLatest().severity, 'info');

  const timeout = diagnostics.begin({ category: 'chat', action: 'generate' });
  timeout.fail({ name: 'AbortError', message: 'request timed out' });
  assert.equal(diagnostics.getLatest().severity, 'warn');

  const failure = diagnostics.begin({ category: 'tool', action: 'batch' });
  failure.fail(new Error('tool exploded'));
  assert.equal(diagnostics.getLatest().severity, 'warn');

  const override = diagnostics.begin({ category: 'chat', action: 'generate' });
  override.fail(new Error('bad'), { severity: 'fatal' });
  assert.equal(diagnostics.getLatest().severity, 'fatal', 'explicit fail() override wins');

  const pre = diagnostics.begin({ category: 'chat', action: 'generate', severity: 'warn' });
  assert.equal(diagnostics.getLatest().severity, 'warn', 'begin() severity option is honored');
  pre.complete();
  assert.equal(diagnostics.getLatest().severity, 'warn');

  // An explicit begin() severity survives fail() without an explicit override
  // (device regression: the crash transcription's 'fatal' was being clobbered).
  const fatal = diagnostics.begin({ category: 'runtime', action: 'native_crash', severity: 'fatal' });
  fatal.fail({ name: 'Crash', message: 'boom' });
  assert.equal(diagnostics.getLatest().severity, 'fatal', 'begin severity must survive fail()');
});

test('breadcrumbs: ring capped at 8, meta sanitized to identifier-safe strings', async () => {
  const { diagnostics } = await loadDiagnostics();
  for (let i = 0; i < 12; i++) {
    diagnostics.breadcrumb('view_change', { to: `view_${i}`, note: '角色名测试' });
  }
  diagnostics.begin({ category: 'runtime', action: 'unhandled_rejection' });
  const runtimeRecord = diagnostics.getLatest();

  assert.ok(runtimeRecord.breadcrumbs.length <= 8, 'breadcrumb ring is capped at 8');
  const last = runtimeRecord.breadcrumbs[runtimeRecord.breadcrumbs.length - 1];
  assert.equal(last.name, 'view_change');
  assert.equal(last.meta.to, 'view_11', 'newest breadcrumb retained');
  assert.equal(last.meta.note, undefined, 'CJK free text is stripped from breadcrumb meta');

  // Business records never carry the trail.
  diagnostics.begin({ category: 'chat', action: 'generate' });
  assert.equal(diagnostics.getLatest().breadcrumbs.length, 0);
});

test('buildExportPayload summary: category/severity distribution, topErrors, suppressedCount', async () => {
  const values = new Map();
  const { diagnostics, context } = await loadDiagnostics(values);
  context.RPHRuntimeErrorStats = { recordCount: 2, suppressedCount: 7 };

  const ok = diagnostics.begin({ category: 'chat', action: 'generate' });
  ok.complete();
  const bad1 = diagnostics.begin({ category: 'chat', action: 'generate' });
  bad1.fail(new Error('HTTP 429'));
  const bad2 = diagnostics.begin({ category: 'chat', action: 'generate' });
  bad2.fail(new Error('HTTP 429'));
  const boom = diagnostics.begin({ category: 'runtime', action: 'window_error' });
  boom.fail({ name: 'TypeError', message: 'boom' });

  const envelope = diagnostics.buildExportPayload({ appVersion: '2.63 (161)', buildType: 'release' });
  assert.equal(envelope.summary.recordsByCategory.chat, 3);
  assert.equal(envelope.summary.recordsByCategory.runtime, 1);
  assert.equal(envelope.summary.severityCounts.info, 1);
  assert.equal(envelope.summary.severityCounts.warn, 2);
  assert.equal(envelope.summary.severityCounts.error, 1);
  assert.equal(envelope.summary.suppressedCount, 7, 'suppressed count read from runtime error stats');
  assert.equal(envelope.summary.topErrors[0].count, 2);
  assert.equal(envelope.summary.topErrors[0].message, 'HTTP 429');
  assert.ok(envelope.summary.topErrors.length <= 5);
});

test('buildShortSummary: at most 10 lines, version header, error lines or clean notice', async () => {
  const { diagnostics, context } = await loadDiagnostics();
  context.RPHRuntimeErrorStats = { suppressedCount: 0 };
  diagnostics.setRecordMeta({ appVersion: '2.63 (161)', buildType: 'release' });

  // Clean buffer → no-error variant.
  diagnostics.begin({ category: 'chat', action: 'generate' }).complete();
  const clean = diagnostics.buildShortSummary();
  const cleanLines = clean.split('\n');
  assert.ok(cleanLines.length <= 10, 'short summary stays within 10 lines');
  assert.ok(cleanLines[0].includes('Roleplay Hub 2.63 (161)'), 'first line carries app version');
  assert.ok(cleanLines[0].includes('release'), 'first line carries build type');
  assert.ok(clean.includes('无异常记录'));

  // Failing records → top errors listed.
  const bad = diagnostics.begin({ category: 'chat', action: 'generate' });
  bad.fail(new Error('HTTP 500'));
  diagnostics.begin({ category: 'runtime', action: 'vue_error' }).fail({ name: 'TypeError', message: 't.select is not a function' });
  const dirty = diagnostics.buildShortSummary();
  const dirtyLines = dirty.split('\n');
  assert.ok(dirtyLines.length <= 10);
  assert.ok(dirty.includes('异常 Top3:'));
  assert.ok(dirty.includes('[chat] generate ×1: HTTP 500'));
  assert.ok(dirty.includes('severity:'));
});

test('breadcrumb sources are wired: view switch, provider switch, generation start', async () => {
  const [app, sender] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(app, /watch\(\(\) => currentView\.value, \(view\) => \{\s*RPHRequestDiagnostics\?\.breadcrumb\?\.\('view_change'/);
  assert.match(app, /watch\(\(\) => settings\.chatProviderId, \(providerId\) => \{[\s\S]*?RPHRequestDiagnostics\?\.breadcrumb\?\.\('provider_switch'/);
  assert.match(app, /setRecordMeta\?\.\(\{\s*appVersion:/, 'app.mjs stamps journal records with the build info');
  assert.match(sender, /RPHRequestDiagnostics\?\.breadcrumb\?\.\('generation_start'/);
});

test('v1 records hydrate with v2 defaults (severity info, empty session fields)', async () => {
  const values = new Map();
  const legacyRecord = {
    schemaVersion: 1,
    id: 'legacy-1',
    category: 'chat',
    action: 'generate',
    startedAt: '2026-09-01 10:00:00',
    durationMs: 1200,
    result: 'ok',
    scope: {},
    inputs: [],
    behaviors: [],
    outputs: {
      contentChars: 10, reasoningChars: 0, totalChars: 10, hash: null,
      streamContentChars: 10, streamReasoningChars: 0,
      finalContentChars: 10, finalReasoningChars: 0, postprocessSteps: []
    },
    error: null,
    stages: [{ stage: 'started', elapsedMs: 0 }],
    compat: null
  };
  values.set('rph_activity_journal_v1', JSON.stringify([legacyRecord]));

  const { diagnostics } = await loadDiagnostics(values);
  const record = diagnostics.getAll().find(r => r.id === 'legacy-1');
  assert.ok(record, 'v1 record hydrates');
  assert.equal(record.severity, 'info', 'missing severity defaults to info');
  assert.equal(record.sessionId, '');
  assert.equal(record.uptimeMs, 0);
  assert.equal(record.appVersion, '');
  assert.equal(record.buildType, 'web');
  assert.equal(record.breadcrumbs.length, 0);
});
