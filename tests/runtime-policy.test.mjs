import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const loadScript = async (relativePath, contextValues = {}) => {
  const context = vm.createContext({ console, ...contextValues });
  context.window ||= {};
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
  }).replace(/^export default\s+(\S+);\s*$/m, (_, name) => { return 'window.' + name + ' = ' + name + ';\nglobalThis.' + name + ' = ' + name + ';'; });
  vm.runInContext(cleanSource, context, { filename: relativePath });
  return context;
};

test('chat window never mounts more than 40 of 1000 messages', async () => {
  const context = await loadScript('src/modules/runtime-policy.mjs');
  const policy = context.window.RPHRuntimePolicy;
  const start = policy.getChatWindow(1000, 0, 1000);
  const middle = policy.getChatWindow(1000, 475, 1000);
  const tail = policy.getChatWindow(1000, 999, 1000);

  for (const range of [start, middle, tail]) {
    assert.ok(range.end - range.start <= 40);
    assert.ok(range.start >= 0);
    assert.ok(range.end <= 1000);
  }
});

test('render cache is a true LRU capped at 100 entries', async () => {
  const context = await loadScript('src/modules/runtime-policy.mjs');
  const { LruCache } = context.window.RPHRuntimePolicy;
  const cache = new LruCache(100);

  for (let index = 0; index < 100; index += 1) cache.set(index, `value-${index}`);
  assert.equal(cache.get(0), 'value-0');
  cache.set(100, 'value-100');

  assert.equal(cache.size, 100);
  assert.equal(cache.has(0), true);
  assert.equal(cache.has(1), false);
});

test('runtime limits match the APK performance contract', async () => {
  const context = await loadScript('src/modules/runtime-policy.mjs');
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.window.RPHRuntimePolicy.limits)),
    {
      chatInitial: 20,
      chatBatch: 10,
      chatMaximum: 40,
      renderCache: 100,
      activeIframes: 3,
      streamFlushMs: 50,
      draftSaveMs: 2000,
      frameMaxHeight: 4000,
      frameSlashMaxLength: 2000,
      parseCotCache: 100,
      requestTimeout: {
        firstByteMs: 60000,
        firstTokenMs: 60000,
        streamIdleMs: 120000,
        totalMs: 600000
      },
      requestTimeoutMinSeconds: 10,
      requestTimeoutMaxSeconds: 1800
    }
  );
});

test('resolveRequestTimeouts: defaults, clamping and legal passthrough', async () => {
  const context = await loadScript('src/modules/runtime-policy.mjs');
  const { resolveRequestTimeouts } = context.window.RPHRuntimePolicy;

  // 无配置 → 全部回退默认毫秒值（vm 沙盒返回的对象需 JSON 归一化到宿主 realm 再比较）
  assert.deepEqual(JSON.parse(JSON.stringify(resolveRequestTimeouts({}))), {
    firstByteMs: 60000,
    firstTokenMs: 60000,
    streamIdleMs: 120000,
    totalMs: 600000
  });
  assert.deepEqual(JSON.parse(JSON.stringify(resolveRequestTimeouts())), JSON.parse(JSON.stringify(resolveRequestTimeouts({}))));

  // 合法值（秒）→ 毫秒透传
  assert.deepEqual(JSON.parse(JSON.stringify(resolveRequestTimeouts({
    requestFirstByteTimeout: 90,
    requestFirstTokenTimeout: 300,
    requestStreamIdleTimeout: 150,
    requestTotalTimeout: 900
  }))), {
    firstByteMs: 90000,
    firstTokenMs: 300000,
    streamIdleMs: 150000,
    totalMs: 900000
  });

  // 越界值 clamp 到 [10, 1800] 秒；非数字回退默认
  const clamped = resolveRequestTimeouts({
    requestFirstByteTimeout: 1,
    requestFirstTokenTimeout: 99999,
    requestStreamIdleTimeout: 'abc',
    requestTotalTimeout: -5
  });
  assert.equal(clamped.firstByteMs, 10000);   // 1s → clamp 到最小 10s
  assert.equal(clamped.firstTokenMs, 1800000); // 99999s → clamp 到最大 1800s
  assert.equal(clamped.streamIdleMs, 120000);  // 非法 → 回退默认 120s
  assert.equal(clamped.totalMs, 10000);        // -5s → clamp 到最小 10s
});
