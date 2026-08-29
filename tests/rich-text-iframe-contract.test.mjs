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
  assert.match(source, /if \(this\.hasAttribute\('data-rph-fixed-height'\)\) return/);
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
