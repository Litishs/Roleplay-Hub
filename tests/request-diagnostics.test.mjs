import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const loadDiagnostics = async () => {
  const values = new Map();
  const sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const context = vm.createContext({
    crypto: webcrypto,
    TextEncoder,
    URL,
    location: { href: 'https://localhost/' },
    performance,
    sessionStorage,
    Date,
    Math,
    setTimeout
  });
  context.globalThis = context;
  const source = await readFile(new URL('../assets/js/request-diagnostics.js', import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: 'request-diagnostics.js' });
  return context.RPHRequestDiagnostics;
};

const waitForFingerprint = async diagnostics => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (diagnostics.getLatest()?.request?.fingerprintReady) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

test('request diagnostics records hashes and timing without prompt contents', async () => {
  const diagnostics = await loadDiagnostics();
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
  await waitForFingerprint(diagnostics);

  const record = diagnostics.getLatest();
  const serialized = JSON.stringify(record);
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
  assert.ok(!serialized.includes('private system prompt'));
  assert.ok(!serialized.includes('private user message'));
  assert.ok(!serialized.includes('hidden reasoning'));
  assert.ok(!serialized.includes('visible answer'));
});

test('请求诊断可在记忆召回前启动并更新最终请求指纹', async () => {
  const diagnostics = await loadDiagnostics();
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
  await waitForFingerprint(diagnostics);

  const record = diagnostics.getLatest();
  const serialized = JSON.stringify(record);
  assert.equal(record.status, 'pending');
  assert.equal(record.stage, 'memory_recall_lexical_fallback');
  assert.equal(record.request.messageCount, 1);
  assert.equal(record.timings.promptBuildMs, 37);
  assert.match(record.request.payloadSha256, /^[a-f0-9]{64}$/);
  assert.ok(!serialized.includes('private final prompt'));
});

test('请求诊断区分超时与用户取消', async () => {
  const diagnostics = await loadDiagnostics();
  const tracker = diagnostics.start({ url: '/chat/completions', payload: {} });
  const error = new DOMException('Generation first token timed out', 'AbortError');
  tracker.fail(error);
  assert.equal(diagnostics.getLatest().status, 'timed_out');
  assert.equal(diagnostics.getLatest().stage, 'timed_out');
});

test('request diagnostics keeps only ten records and exposes clones', async () => {
  const diagnostics = await loadDiagnostics();
  for (let index = 0; index < 12; index += 1) {
    diagnostics.start({ url: '/chat/completions', payload: { model: `model-${index}`, messages: [] } });
  }
  const records = diagnostics.getAll();
  assert.equal(records.length, 10);
  assert.equal(records[0].request.model, 'model-2');
  records[0].request.model = 'mutated';
  assert.equal(diagnostics.getAll()[0].request.model, 'model-2');
});
