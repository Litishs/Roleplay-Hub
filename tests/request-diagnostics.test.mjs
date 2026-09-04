import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const buildContext = (values = new Map(), sessionValues = new Map()) => {
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  };
  const sessionStorage = {
    getItem: key => sessionValues.get(key) ?? null,
    setItem: (key, value) => sessionValues.set(key, value),
    removeItem: key => sessionValues.delete(key),
    clear: () => sessionValues.clear()
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

const loadDiagnostics = async (values = new Map(), sessionValues = new Map()) => {
  const { context, localStorage, sessionStorage } = buildContext(values, sessionValues);
  const source = await readFile(new URL('../src/modules/request-diagnostics.mjs', import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
  }).replace(/^export default\s+(\S+);\s*$/m, (_, name) => { return 'window.' + name + ' = ' + name + ';\nglobalThis.' + name + ' = ' + name + ';'; });
  vm.runInContext(cleanSource, context, { filename: 'request-diagnostics.mjs' });
  return { diagnostics: context.RPHRequestDiagnostics, localStorage, sessionStorage };
};

const flushPersist = async (localStorage) => {
  // persist() is debounced by 40 ms; flush with a couple of macroticks.
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return localStorage;
};

const waitForFingerprint = async (diagnostics, localStorage, attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (diagnostics.getLatest()?.request?.fingerprintReady) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  // One final flush so all prior persist() debounces settle.
  await flushPersist(localStorage);
};

test('request diagnostics records hashes and timing without prompt contents (legacy start compat)', async () => {
  const values = new Map();
  const { diagnostics, localStorage } = await loadDiagnostics(values);
  const tracker = diagnostics.start({
    url: 'https://api.example.com/v1/chat/completions',
    promptBuildMs: 12,
    payload: {
      model: 'test-model',
      messages: [
        { role: 'system', content: 'private system prompt' },
        { role: 'user', content: 'private user message' }
      ],
      temperature: 1,
      stream: true
    }
  });
  tracker.stage('waiting_headers');
  tracker.responseHeaders(200, 'text/event-stream; charset=utf-8');
  tracker.stage('streaming');
  tracker.networkChunk(128);
  tracker.reasoning('hidden reasoning');
  tracker.content('visible answer');
  tracker.complete({ inputTokens: 20, outputTokens: 10 });
  await waitForFingerprint(diagnostics, localStorage);

  const record = diagnostics.getLatest();
  const serialized = JSON.stringify(record);
  // Legacy contract fields still present on top level via projection:
  assert.equal(record.status, 'completed');
  assert.equal(record.endpoint, 'https://api.example.com/v1/chat/completions');
  assert.equal(record.request.messageCount, 2);
  assert.equal(record.request.fingerprintReady, true);
  assert.match(record.request.payloadSha256, /^[a-f0-9]{64}$/);
  assert.match(record.request.messages[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.response.reasoningCharacters, 16);
  assert.equal(record.response.contentCharacters, 14);
  assert.equal(record.response.networkBytes, 128);
  assert.deepEqual(Array.from(record.stageHistory, item => item.stage), ['preparing', 'waiting_headers', 'streaming', 'completed']);
  // New activity fields projected alongside legacy ones:
  assert.equal(record.category, 'chat');
  assert.equal(record.action, 'generate');
  assert.equal(record.result, 'ok');
  assert.equal(record.outputs.streamContentChars, 14);
  assert.equal(record.outputs.streamReasoningChars, 16);
  assert.equal(record.outputs.finalContentChars, 14);
  assert.equal(record.outputs.finalReasoningChars, 16);
  assert.ok(!serialized.includes('private system prompt'));
  assert.ok(!serialized.includes('private user message'));
  assert.ok(!serialized.includes('hidden reasoning'));
  assert.ok(!serialized.includes('visible answer'));
});

test('legacy request diagnostics can refresh payload after memory-recall stage', async () => {
  const values = new Map();
  const { diagnostics, localStorage } = await loadDiagnostics(values);
  const tracker = diagnostics.start({
    url: '/chat/completions',
    payload: { model: 'test-model', messages: [], stream: true }
  });
  tracker.stage('memory_recall');
  tracker.stage('memory_recall_lexical_fallback');
  tracker.request({
    model: 'test-model',
    messages: [{ role: 'user', content: 'private final prompt' }],
    stream: true
  }, 37);
  await waitForFingerprint(diagnostics, localStorage);

  const record = diagnostics.getLatest();
  const serialized = JSON.stringify(record);
  assert.equal(record.status, 'pending');
  assert.equal(record.stage, 'memory_recall_lexical_fallback');
  assert.equal(record.request.messageCount, 1);
  assert.equal(record.timings.promptBuildMs, 37);
  assert.match(record.request.payloadSha256, /^[a-f0-9]{64}$/);
  assert.ok(!serialized.includes('private final prompt'));
});

test('legacy request diagnostics classifies timeout vs user cancel correctly', async () => {
  const { diagnostics } = await loadDiagnostics();
  const tracker = diagnostics.start({ url: '/chat/completions', payload: {} });
  const error = new DOMException('Generation first token timed out', 'AbortError');
  tracker.fail(error);
  assert.equal(diagnostics.getLatest().status, 'timed_out');
  assert.equal(diagnostics.getLatest().stage, 'timed_out');
  // Unified `result` mirrors the compat status.
  assert.equal(diagnostics.getLatest().result, 'timed_out');

  const tracker2 = diagnostics.start({ url: '/chat/completions', payload: {} });
  const cancelErr = new DOMException('User cancelled', 'AbortError');
  tracker2.fail(cancelErr);
  assert.equal(diagnostics.getLatest().result, 'cancelled');
  assert.equal(diagnostics.getLatest().status, 'cancelled');

  const tracker3 = diagnostics.start({ url: '/chat/completions', payload: {} });
  tracker3.fail(new TypeError('failed to fetch'));
  assert.equal(diagnostics.getLatest().result, 'failed');
});

test('activity journal ring buffer keeps 30 records and uses localStorage key', async () => {
  const values = new Map();
  const { diagnostics, localStorage } = await loadDiagnostics(values);
  for (let index = 0; index < 33; index += 1) {
    diagnostics.begin({ category: 'tool', action: `act-${index}` }).complete();
  }
  await flushPersist(localStorage);
  assert.equal(diagnostics.maxRecords, 30);
  assert.equal(diagnostics.getAll().length, 30);
  assert.equal(diagnostics.getAll()[0].action, 'act-3');
  assert.equal(diagnostics.getAll()[29].action, 'act-32');

  // Mutating returned clone must not affect internal records.
  const snap = diagnostics.getAll();
  snap[0].action = 'mutated';
  assert.equal(diagnostics.getAll()[0].action, 'act-3');

  // Persisted storage matches public key and length.
  const raw = localStorage.getItem(diagnostics.storageKey);
  assert.ok(!!raw);
  assert.equal(diagnostics.storageKey, 'rph_activity_journal_v1');
  const stored = JSON.parse(raw);
  assert.equal(stored.length, 30);
});

test('legacy provider metadata is preserved via start() compat projection', async () => {
  const { diagnostics } = await loadDiagnostics();
  diagnostics.start({
    url: 'https://api.deepseek.com/v1/chat/completions',
    payload: { model: 'deepseek-v4-flash', messages: [] },
    providerId: 'deepseek',
    providerApiUrl: 'https://api.deepseek.com',
    hasApiKey: true
  });
  const record = diagnostics.getLatest();
  assert.equal(record.provider.id, 'deepseek');
  assert.equal(record.provider.apiUrl, 'https://api.deepseek.com');
  assert.equal(record.provider.hasApiKey, true);
  diagnostics.start({ url: '/chat/completions', payload: {} });
  assert.equal(diagnostics.getLatest().provider.id, '');
  assert.equal(diagnostics.getLatest().provider.hasApiKey, null);
});

// P0#2 regression: useMessageSender previously nested providerId /
// providerApiUrl / hasApiKey inside the `payload` object (so the same blob
// could later be forwarded to fingerprint builders).  buildCompatShell used
// to read only the top-level options, so provider came out as
// { id: "", apiUrl: "", hasApiKey: null } on real-device exports.  Accept
// payload-nested or top-level placement; top-level wins if both supplied.
test('legacy provider metadata is read from payload-nested fields (P0#2 regression)', async () => {
  const { diagnostics } = await loadDiagnostics();
  diagnostics.start({
    url: 'https://api.deepseek.com/v1/chat/completions',
    requestType: 'chat',
    payload: {
      model: 'deepseek-v4-flash',
      temperature: 1,
      stream: true,
      messages: [],
      providerId: 'deepseek',
      providerApiUrl: 'https://api.deepseek.com',
      hasApiKey: true
    }
  });
  const record = diagnostics.getLatest();
  assert.equal(record.provider.id, 'deepseek');
  assert.equal(record.provider.apiUrl, 'https://api.deepseek.com');
  assert.equal(record.provider.hasApiKey, true);
  // hasApiKey=false (key NOT configured) is a useful diagnostic signal and
  // must NOT be flattened to null / '' just because the value is falsy.
  diagnostics.start({
    url: 'https://example.invalid/v1/chat/completions',
    payload: {
      model: 'x',
      messages: [],
      providerId: 'custom',
      providerApiUrl: 'https://example.invalid',
      hasApiKey: false
    }
  });
  const unconfigured = diagnostics.getLatest();
  assert.equal(unconfigured.provider.id, 'custom');
  assert.equal(unconfigured.provider.apiUrl, 'https://example.invalid');
  assert.equal(unconfigured.provider.hasApiKey, false);
});

// P0#1 regression: scope must be whitelist-filtered + value-sanitized so any
// caller that slips in character display names, CJK personaliased tags,
// emoji etc. never ends up in the exported JSON.  Two levels of defense:
//   (A) unknown keys are silently dropped from the scope object;
//   (B) allowed string values are stripped to [A-Za-z0-9_-] and capped at
//       64 characters, which is enough for any UUID / message id / chatScope
//       but converts character names (CJK + emoji) to "".
test('scope is whitelist-filtered and character-name leaks are stripped (P0#1 regression)', async () => {
  const { diagnostics } = await loadDiagnostics();
  const handle = diagnostics.begin({
    category: 'chat',
    action: 'generate',
    scope: {
      characterId: '8df1dfa5-2445-48d8-a945-c3234eb21451',
      // This field is NOT in the allowlist — must be dropped entirely.
      characterName: '主动帮你泻火的同桌V2🍇',
      // Another non-allowlist free-form key — must also be dropped.
      characterDisplayName: '同桌',
      chatScopeId: '8df1dfa5-2445-48d8-a945-c3234eb21451',
      assistantMessageId: 'db290425-d32a-4f5a-b5bd-4599ae4cb0ca',
      // numeric-only key (0..1024) is kept for tool records.
      activeToolDepth: 2,
      // If a caller accidentally writes a CJK string into a supposedly-id
      // field, the char filter collapses it to "" (not leaked, not kept
      // partially as '').
      userId: '这也不应该出现',
      'secret-field-should-never-appear': 'oops'
    }
  });
  handle.complete();
  const record = diagnostics.getLatest();
  const allowedKeys = ['characterId', 'chatScopeId', 'assistantMessageId', 'activeToolDepth'];
  assert.deepEqual(Object.keys(record.scope).sort(), allowedKeys.sort());
  // Identifiers that were already safe pass through unchanged.
  assert.equal(record.scope.characterId, '8df1dfa5-2445-48d8-a945-c3234eb21451');
  assert.equal(record.scope.chatScopeId, '8df1dfa5-2445-48d8-a945-c3234eb21451');
  assert.equal(record.scope.assistantMessageId, 'db290425-d32a-4f5a-b5bd-4599ae4cb0ca');
  assert.equal(record.scope.activeToolDepth, 2);
  // Defense-in-depth: even if someone later adds a CJK key to the allowlist
  // (hopefully not!), the char filter would collapse the value to "".
  const serialized = JSON.stringify(record.scope);
  assert.ok(!serialized.includes('同桌'), 'CJK character display name leaked into scope');
  assert.ok(!serialized.includes('🍇'), 'emoji leaked into scope');
  assert.ok(!serialized.includes('secret-field-should-never-appear'), 'unknown scope key leaked');
});

test('new unified API: begin exposes category/action/scope, behaviors append to chain, output records streams/final', async () => {
  const { diagnostics } = await loadDiagnostics();
  const handle = diagnostics.begin({
    category: 'memory',
    action: 'recall',
    scope: { characterId: 'ch-1', chatScopeId: 'room-42' }
  });
  handle.input({ kind: 'recall_query', chars: 20, summary: '最近关于天气的记忆' });
  handle.behavior({ name: 'vector_memory_recall', meta: { backend: 'local', topK: 10 }, result: 'ok', chars: 120 });
  handle.behavior({ name: 'tool_memory_add', meta: { status: 'error' }, result: 'failed', summary: '写入被限流' });
  handle.behavior({ name: 'ui_template_analysis', meta: { model: 'gpt-x' }, result: 'skipped' });
  handle.output({
    streamContentChars: 380,
    streamReasoningChars: 1200,
    finalContentChars: 320,
    finalReasoningChars: 1200,
    postprocessStep: { name: 'parseCot', beforeChars: 380, afterChars: 360 },
    postprocessStep2: undefined
  });
  handle.stage('applying_regex');
  handle.output({ postprocessStep: { name: 'regex_replace', beforeChars: 360, afterChars: 320 } });
  handle.complete();

  const record = diagnostics.getLatest();
  assert.equal(record.category, 'memory');
  assert.equal(record.action, 'recall');
  assert.equal(record.scope.characterId, 'ch-1');
  assert.equal(record.scope.chatScopeId, 'room-42');
  assert.equal(record.result, 'ok');
  assert.equal(record.inputs.length, 1);
  assert.equal(record.inputs[0].kind, 'recall_query');
  assert.equal(record.inputs[0].chars, 20);
  // Summary is kept, but truncated if needed (20 chars is fine here).
  assert.ok(typeof record.inputs[0].summary === 'string');
  assert.equal(record.behaviors.length, 3);
  assert.equal(record.behaviors[0].name, 'vector_memory_recall');
  assert.equal(record.behaviors[0].result, 'ok');
  assert.equal(record.behaviors[0].meta.backend, 'local');
  assert.equal(record.behaviors[0].meta.topK, 10);
  assert.equal(record.behaviors[1].result, 'failed');
  assert.equal(record.behaviors[2].result, 'skipped');
  assert.equal(record.outputs.streamContentChars, 380);
  assert.equal(record.outputs.streamReasoningChars, 1200);
  assert.equal(record.outputs.finalContentChars, 320);
  assert.equal(record.outputs.postprocessSteps.length, 2);
  assert.equal(record.outputs.postprocessSteps[0].name, 'parseCot');
  assert.equal(record.outputs.postprocessSteps[1].afterChars, 320);
  assert.ok(record.stages.some(s => s.stage === 'applying_regex'));
  assert.ok(Number.isFinite(record.durationMs) && record.durationMs >= 0);

  // Zero plaintext: private strings (not passed in at all) must be absent.
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes('private system prompt'));
  assert.ok(!serialized.includes('private user message'));
  assert.ok(!serialized.includes('hidden reasoning'));
  assert.ok(!serialized.includes('visible answer'));

  // behavior summary truncation:
  const longHandle = diagnostics.begin({ category: 'chat', action: 'generate' });
  longHandle.behavior({ name: 'x', summary: 'a'.repeat(200) });
  longHandle.complete();
  const r2 = diagnostics.getLatest();
  assert.equal(r2.behaviors[0].summary.length, 81); // 80 + ellipsis
  assert.ok(r2.behaviors[0].summary.endsWith('…'));
});

test('fail() populates error.stage and error.message (truncated)', async () => {
  const { diagnostics } = await loadDiagnostics();
  const h = diagnostics.begin({ category: 'update', action: 'check' });
  h.stage('downloading_apk');
  h.fail(new Error('下载失败: connection reset by peer at read() call with code ECONNRESET on socket to upstream and more words to exceed a 80-character limit by a large margin'));
  const r = diagnostics.getLatest();
  assert.equal(r.result, 'failed');
  assert.equal(r.error.stage, 'downloading_apk');
  assert.ok(typeof r.error.message === 'string' && r.error.message.length <= 81);
});

test('buildExportPayload includes schemaVersion/exportedAt/appVersion/buildType/records', async () => {
  const { diagnostics } = await loadDiagnostics();
  diagnostics.begin({ category: 'chat', action: 'generate' }).complete();
  diagnostics.begin({ category: 'tts', action: 'speak' }).complete();

  const envelope = diagnostics.buildExportPayload({ appVersion: '2.27', buildType: 'android-capacitor' });
  assert.equal(envelope.schemaVersion, 1);
  assert.match(envelope.exportedAt, /^\d{4}-\d{2}-\d{2} \d{2}/);
  assert.equal(envelope.appVersion, '2.27');
  assert.equal(envelope.buildType, 'android-capacitor');
  assert.equal(envelope.recordCount, 2);
  assert.equal(Array.isArray(envelope.records), true);
  assert.equal(envelope.records.length, 2);
  assert.equal(envelope.records[0].category, 'chat');
  assert.equal(envelope.records[1].category, 'tts');
});

test('schemaVersion and storageKey constants are exposed on public API', async () => {
  const { diagnostics } = await loadDiagnostics();
  assert.equal(diagnostics.schemaVersion, 1);
  assert.equal(diagnostics.storageKey, 'rph_activity_journal_v1');
  assert.equal(diagnostics.maxRecords, 30);
  assert.equal(typeof diagnostics.begin, 'function');
  assert.equal(typeof diagnostics.start, 'function');
  assert.equal(typeof diagnostics.getAll, 'function');
  assert.equal(typeof diagnostics.getLatest, 'function');
  assert.equal(typeof diagnostics.clear, 'function');
  assert.equal(typeof diagnostics.buildExportPayload, 'function');
});

test('persistence: written records survive reload via localStorage, legacy sessionStorage data is migrated', async () => {
  // Seed legacy sessionStorage with an old-style snapshot.
  const sessionValues = new Map();
  const legacyRecords = [];
  for (let i = 0; i < 3; i++) {
    legacyRecords.push({
      id: `old-${i}`,
      startedAt: new Date(i * 1000).toISOString(),
      status: i === 2 ? 'completed' : 'failed',
      stage: i === 2 ? 'completed' : 'streaming',
      stageHistory: [{ stage: 'preparing', elapsedMs: 0 }, { stage: i === 2 ? 'completed' : 'streaming', elapsedMs: 10 }],
      requestType: i === 1 ? 'tool_continuation' : 'chat',
      endpoint: 'https://api.example.com/v1/chat/completions',
      provider: { id: 'x', apiUrl: 'https://api.example.com', hasApiKey: true },
      request: {
        model: 'old-model', temperature: 1, stream: true,
        messageCount: 2, totalCharacters: 100,
        payloadSha256: 'a'.repeat(64), fingerprintReady: true, promptBuildMs: 5,
        messages: [
          { role: 'user', hasName: false, characters: 50, sha256: 'b'.repeat(64) }
        ]
      },
      response: {
        httpStatus: i === 2 ? 200 : 500, contentType: 'text/event-stream',
        networkBytes: 400, reasoningCharacters: 30 + i, contentCharacters: 70 + i,
        usage: null, errorName: i === 2 ? '' : 'ServerError'
      },
      timings: {
        promptBuildMs: 5, responseHeadersMs: 20, firstNetworkChunkMs: 30,
        firstReasoningMs: 40, firstContentMs: 50, completedMs: i === 2 ? 100 : null
      }
    });
  }
  sessionValues.set('rph_request_diagnostics_v1', JSON.stringify(legacyRecords));

  const values = new Map();
  const { diagnostics, localStorage, sessionStorage } = await loadDiagnostics(values, sessionValues);
  await flushPersist(localStorage);

  // Migration: all 3 records loaded, projected with legacy + new fields.
  assert.equal(diagnostics.getAll().length, 3);
  const migrated = diagnostics.getAll()[2];
  assert.equal(migrated.category, 'chat');
  assert.equal(migrated.action, 'generate');
  assert.equal(migrated.result, 'ok');
  assert.equal(migrated.outputs.streamContentChars, 72);
  assert.equal(migrated.outputs.streamReasoningChars, 32);
  assert.equal(migrated.endpoint, 'https://api.example.com/v1/chat/completions');
  assert.equal(migrated.provider.id, 'x');
  assert.equal(migrated.response.httpStatus, 200);
  assert.equal(migrated.request.messageCount, 2);
  // Legacy sessionStorage bucket cleared after migration.
  assert.equal(sessionStorage.getItem('rph_request_diagnostics_v1'), null);
  // New localStorage bucket has the data.
  assert.ok(!!localStorage.getItem('rph_activity_journal_v1'));

  // A second fresh load reads from new localStorage correctly (round-trip).
  const values2 = new Map(values); // copy stored state
  const { diagnostics: diagnostics2 } = await loadDiagnostics(values2, new Map());
  assert.equal(diagnostics2.getAll().length, 3);
  assert.equal(diagnostics2.getAll()[2].request.messageCount, 2);
});

test('getLatest returns null and getAll returns [] when journal is empty', async () => {
  const { diagnostics } = await loadDiagnostics();
  assert.equal(diagnostics.getLatest(), null);
  assert.equal(Array.isArray(diagnostics.getAll()), true);
  assert.equal(diagnostics.getAll().length, 0);
  diagnostics.clear();
  assert.equal(diagnostics.getLatest(), null);
  assert.equal(diagnostics.getAll().length, 0);
});
