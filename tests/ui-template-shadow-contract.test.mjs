import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('UI template blocks render via <ui-template-frame> instead of raw v-html', async () => {
  const html = await read('index.html');

  assert.match(html, /<ui-template-frame :html="html"><\/ui-template-frame>/);
  assert.match(html, /<ui-template-frame :html="renderEditingUiTemplatePreview\(\)"><\/ui-template-frame>/);
  assert.doesNotMatch(html, /ui-template-render" @click="handleUiTemplateClick"\s*v-html="html"/);
  assert.doesNotMatch(html, /ui-template-preview[\s\S]*?v-html="renderEditingUiTemplatePreview\(\)"/);
});

test('index.html loads Vite module entry point', async () => {
  const html = await read('index.html');
  assert.ok(html.includes('<script type="module" src="/src/main.js">'), 'Vite module entry should be present');
});

test('renderUiTemplateHtml returns plain template HTML, no iframe wrapper', async () => {
  const source = await read('src/modules/app.mjs');

  assert.match(source, /const renderUiTemplateHtml = \(template\) => \{\s*if \(!template \|\| !template\.htmlTemplate\) return '';\s*const variables = template\.variableState \|\| \{\};\s*return renderUiTemplateString\(stripUiTemplateCodeFence\(template\.htmlTemplate\), variables\);/);
  assert.doesNotMatch(source, /renderUiTemplateHtml = \(template\) => \{[\s\S]*?renderExecutableHtmlFrame\(/);
  assert.doesNotMatch(source, /renderUiTemplateHtml = \(template\) => \{[\s\S]*?<iframe/);
});

test('handleUiTemplateClick walks composedPath for data-slash inside shadow DOM', async () => {
  const source = await read('src/modules/app.mjs');

  assert.match(source, /const handleUiTemplateClick = \(event\) => \{[\s\S]*?event\.composedPath \? event\.composedPath\(\) : \[event\.target\][\s\S]*?path\.find\(node => node\?\.getAttribute\?\.\('data-slash'\)\)/);
});

test('app.js registers UiTemplateFrame from window.RPHUiTemplateFrame', async () => {
  const source = await read('src/modules/app.mjs');

  assert.match(source, /UiTemplateFrame: UiTemplateFrame/);
});

test('ui-template-frame.js provides shadow render utilities', async () => {
  const source = await read('src/modules/ui-template-frame.mjs');

  assert.match(source, /export { UiTemplateFrame, UiTemplateFrameUtil };/);
  assert.match(source, /const splitUiTemplateHtml = \(html\) =>/);
  assert.match(source, /const createUiTemplateDocShim = \(shadowRoot, bodyWrap\) =>/);
  assert.match(source, /const runUiTemplateScripts = \(docShim, scripts, shadowRoot\) =>/);
  assert.match(source, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.match(source, /new Function\(\s*'document', 'window',\s*'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout',\s*'MutationObserver', 'ResizeObserver',\s*executable \+ collect\s*\)/);
  assert.match(source, /getElementById: \(id\) =>/);
  assert.match(source, /execCommand: \(\.\.\.args\) => realDocument\.execCommand\(\.\.\.args\)/);
  assert.match(source, /get body\(\) \{ return bodyWrap; \}/);
  assert.match(source, /html,body selectors rewritten|rewriteRootSelectors|\.template-root/);
  assert.match(source, /if \(\/<iframe\[\\s>\]\/i\.test\(html\)\)/);
});

test('ui-template-frame.js wires inline event delegation to instance scope', async () => {
  const source = await read('src/modules/ui-template-frame.mjs');

  assert.match(source, /const instanceScopes = new WeakMap\(\);/);
  assert.match(source, /const extractTopLevelNames = \(code\) =>/);
  assert.match(source, /return \[' \+ names\.map\(n => 'typeof ' \+ n \+ '!=="undefined"\?' \+ n \+ ':undefined'\)\.join\(','\) \+ '\];/);
  assert.match(source, /if \(shadowRoot\) instanceScopes\.set\(shadowRoot, scope\);/);
  assert.match(source, /scope\.document = docShim;/);
  assert.match(source, /const runInlineHandler = \(scope, element, code\) =>/);
  assert.match(source, /new Function\('with\(arguments\[0\]\)\{ return \(' \+ code \+ '\); \}'\)/);
  assert.match(source, /has\(\) \{ return true; \}/);
  assert.match(source, /const INLINE_EVENTS = \['click', 'change', 'input'\];/);
  assert.match(source, /root\.addEventListener\(eventType, this\._inlineDelegate, true\);/);
  assert.match(source, /runInlineHandler,\s*\n\s*extractTopLevelNames,\s*\n\s*instanceScopes/);
  assert.match(source, /cleanupShadowRoot,\s*\n\s*\};/);
  // captureInput=false ????? Shadow DOM IME ???
  assert.doesNotMatch(source, /setupImeBridge/);
  assert.doesNotMatch(source, /_imeCleanup/);
  assert.doesNotMatch(source, /this\.teardownImeBridge\(\)/);
});

test('ui-template-frame.js cleans up template timers and observers on rebuild/unmount', async () => {
  const source = await read('src/modules/ui-template-frame.mjs');

  assert.match(source, /const shadowCleanup = new WeakMap\(\);/);
  assert.match(source, /const cleanupShadowRoot = \(shadowRoot\) => \{/);
  assert.match(source, /cleanup\.timers\.forEach\(id => \{/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /prop === 'setInterval' \|\| prop === 'setTimeout'/);
  assert.match(source, /prop === 'MutationObserver' \|\| prop === 'ResizeObserver'/);
  assert.match(source, /class TrackedUiTemplateObserver extends BaseObserver/);
  assert.match(source, /beforeUnmount\(\) \{\s*\n\s*cleanupShadowRoot\(this\.\$el\?\.shadowRoot\);/);
  assert.match(source, /cleanupShadowRoot\(root\);\s*\n\s*this\._shadowRendered = true;/);
});

test('app.js tracks card iframe/shadow focus without IME proxy', async () => {
  const source = await read('src/modules/app.mjs');

  assert.match(source, /const ensureIframeFocusTracker = \(iframe\) =>/);
  assert.match(source, /const computeExternalFocus = \(\) =>/);
  assert.doesNotMatch(source, /setupIframeImeBridge/);
  assert.doesNotMatch(source, /IME_PROXY_ATTR/);
});
