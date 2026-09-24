import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('regex-generated srcdoc frames are rebuilt as controlled executable frames', async () => {
  // 2026-08-29 (Phase 2.2): renderMarkdown moved to useTemplateRenderer
  const source = await readFile(new URL('../src/composables/useTemplateRenderer.mjs', import.meta.url), 'utf8');

  assert.match(source, /const sanitizeWithControlledSrcdocFrames = \(rawMarkup\) =>/);
  assert.match(source, /querySelectorAll\('iframe\[srcdoc\]'\)/);
  assert.match(source, /html: sourceFrame\.getAttribute\('srcdoc'\)/);
  assert.match(source, /Number\.parseFloat\(sourceFrame\.getAttribute\('height'\)/);
  assert.match(source, /data-rph-srcdoc-frame/);
  assert.match(source, /FORBID_TAGS: \[\.\.\.\(cleanConfig\.FORBID_TAGS \|\| \[\]\), 'iframe'\]/);
  assert.match(source, /placeholder\.replaceWith\(createIframe\(frameSource\.html, \{/);
  assert.match(source, /let html = sanitizeWithControlledSrcdocFrames\(marked\.parse\(processed\)\)/);
  assert.match(source, /const result = sanitizeWithControlledSrcdocFrames\(processed\)/);
});

test('controlled frames retain the app sandbox and lifecycle class', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

  assert.match(source, /iframe\.className = `w-full bg-white block executable-html-frame/);
  assert.match(source, /iframe\.setAttribute\('sandbox', htmlIframeSandbox\)/);
  assert.match(source, /iframe\.srcdoc = buildExecutableHtmlDocument\(rawHtml\)/);
  assert.match(source, /Math\.min\(1200, Math\.max\(240, requestedHeight\)\)/);
  assert.match(source, /const fixedHeight = hasFixedHeight && Number\.isFinite\(requestedHeight\)/);
  assert.match(source, /data-rph-fixed-height/);
});

test('card frames are cross-origin: the sandbox withholds same-origin and navigation escapes', async () => {
  // srcdoc 文档默认继承父文档的源；一旦同时给出 allow-scripts + allow-same-origin，
  // 沙箱就完全失效，卡片脚本可直达 parent 的 RPHStorage / Capacitor 插件桥。
  // 角色卡是以 PNG/JSON 在社区流转的外部输入，这三个标志必须保持缺席。
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
  const sandbox = source.match(/const htmlIframeSandbox = '([^']*)'/)?.[1];

  assert.ok(sandbox, 'htmlIframeSandbox should be a literal string');
  assert.doesNotMatch(sandbox, /allow-same-origin/);
  assert.doesNotMatch(sandbox, /allow-top-navigation/);
  assert.doesNotMatch(sandbox, /allow-popups-to-escape-sandbox/);
  assert.match(sandbox, /allow-scripts/);

  // 跨源之后宿主读不到 contentDocument/contentWindow.document，这些用法不得复活。
  assert.doesNotMatch(source, /contentWindow\.document/);
  assert.doesNotMatch(source, /iframe\.contentDocument/);
});

test('host validates every card frame message against a real frame window', async () => {
  const [app, utils] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/utils.mjs', import.meta.url), 'utf8')
  ]);

  // 卡片侧：高度/焦点/triggerSlash 一律经 postMessage 上报，不再碰 parent 和 frameElement。
  // 只看注入到卡片里的 shim 正文，免得断言被同文件的注释误伤。
  const shim = utils.slice(utils.indexOf('const scriptShim = `'), utils.indexOf('let content = rawHtml'));
  assert.ok(shim, 'scriptShim block should be locatable');
  assert.match(utils, /export const EXECUTABLE_FRAME_CHANNEL = 'rph-executable-frame'/);
  assert.match(shim, /window\.parent\.postMessage\(payload, '\*'\)/);
  assert.match(shim, /postToHost\(\{ type: 'height', value: newHeight \}\)/);
  assert.match(shim, /postToHost\(\{ type: 'focus', editable: true \}\)/);
  assert.match(shim, /postToHost\(\{ type: 'slash', command: String\(text\) \}\)/);
  assert.doesNotMatch(shim, /window\.parent\.triggerSlash/);
  assert.doesNotMatch(shim, /window\.frameElement/);

  // 宿主侧：先认通道，再把 event.source 反查回真实在树的卡片 iframe，查不到就丢弃。
  assert.match(app, /data\.source !== EXECUTABLE_FRAME_CHANNEL\) return/);
  assert.match(app, /const findExecutableFrameByWindow = \(sourceWindow\) =>/);
  assert.match(app, /if \(frame\.contentWindow === sourceWindow\) return frame/);
  assert.match(app, /const frame = findExecutableFrameByWindow\(event\.source\);\s*if \(!frame\) return;/);
  assert.match(app, /window\.addEventListener\('message', handleExecutableFrameMessage\)/);

  // 自报高度和注入指令都是不可信输入，必须封顶。
  assert.match(app, /Math\.min\(EXECUTABLE_FRAME_MAX_HEIGHT, Math\.round\(height\)\)/);
  assert.match(app, /\.slice\(0, EXECUTABLE_FRAME_MAX_SLASH_LENGTH\)/);
  assert.match(app, /if \(frame\.hasAttribute\('data-rph-fixed-height'\)\) return;/);
});

test('the full app context is not published to window in release builds', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

  assert.match(source, /if \(import\.meta\.env\?\.DEV\) window\.__RPH__ = __ctx;/);
  // 工坊页（第一方同源 iframe）仍依赖 window.parent.RPHStorage，这条不能一起砍掉。
  assert.match(source, /window\.RPHStorage = RPHStorage;/);
});

test('HTML card detection covers common block tags in fenced code blocks', async () => {
  // 2026-08-29 (Phase 2.2): HTML block detection moved to useTemplateRenderer
  const source = await readFile(new URL('../src/composables/useTemplateRenderer.mjs', import.meta.url), 'utf8');

  assert.match(source, /const htmlBlockStartPattern = /);
  assert.match(source, /section\|article\|aside\|header\|footer\|nav\|main\|form\|fieldset\|ul\|ol\|li/);
  assert.match(source, /const matchesHtmlBlockStart = \(text\) => htmlBlockStartPattern\.test\(String\(text \|\| ''\)\)/);
  assert.match(source, /matchesHtmlBlockStart\(blockContent\)/);
  assert.match(source, /const startsWithBlockHtml = matchesHtmlBlockStart\(trimmed\)/);
  assert.match(source, /const looksLikeHtml = matchesHtmlBlockStart\(rawHtml\)/);
  assert.match(source, /const rawHtml = p\.textContent \|\| ''/);
});
