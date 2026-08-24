import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const loadScript = async (relativePath, contextValues = {}) => {
  const context = vm.createContext({ console, ...contextValues });
  context.window ||= {};
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\\n');
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
      draftSaveMs: 2000
    }
  );
});
