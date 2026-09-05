import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Phase 4.3 startup performance: the main page must not pay for the UMD Vue
// runtime (the Vite bundle ships its own esm-bundler Vue) and vendor globals
// must be deferred so body parsing / first paint is not blocked. The workshop
// page (character/index.html) is not Vite-built and still needs UMD Vue.

test('main index.html does not load the UMD Vue global', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/<script[^>]+vue\.global\.prod\.js/.test(html), 'main index.html must not load assets/vendor/vue.global.prod.js');
});

test('main index.html defers vendor globals so first paint is not blocked', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const file of ['marked.umd.js', 'purify.min.js', 'Sortable.min.js']) {
    const tag = html.split('\n').find((line) => line.includes(file));
    assert.ok(tag, `index.html must load ${file}`);
    assert.match(tag, /<script\s+defer\s/, `${file} must be loaded with defer`);
  }
});

test('main index.html still boots the Vite app module after vendor globals', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const moduleIdx = html.indexOf('<script type="module" src="/src/main.js">');
  assert.ok(moduleIdx >= 0, 'index.html must keep the /src/main.js module script');
  const lastVendorIdx = html.lastIndexOf('Sortable.min.js');
  assert.ok(lastVendorIdx >= 0 && lastVendorIdx < moduleIdx, 'vendor globals must precede the app module script');
});

test('character workshop page keeps loading UMD Vue (not Vite-built)', async () => {
  const html = await readFile(new URL('../character/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('assets/vendor/vue.global.prod.js'), 'character/index.html must keep loading UMD Vue');
});
