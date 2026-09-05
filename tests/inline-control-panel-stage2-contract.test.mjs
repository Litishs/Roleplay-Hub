import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { filterBlockedStyleText, findUiTemplateUpdateBlock, isStandaloneRenderedContent, normalizeStyleFilterHit } from '../src/modules/style-filter.mjs';
import { formatLatestTokenCount } from '../src/modules/utils.mjs';

test('style filter strips blocked clichés and reports hits', () => {
  const hits = [];
  const out = filterBlockedStyleText('他极其冷静。他的眼中带着一种深沉的疲惫。他点了点头。', { collect: hits });
  assert.equal(out.includes('极其'), false);
  assert.equal(out.includes('带着一种'), false);
  assert.equal(out.includes('他点了点头'), true);
  assert.ok(hits.some(h => h.includes('极其')));
  assert.ok(hits.some(h => h.includes('带着一种')));
});

test('style filter never touches quoted dialogue', () => {
  const out = filterBlockedStyleText('“她极其冷静，不容置疑地说。”他退了出去。', {});
  assert.equal(out.includes('她极其冷静，不容置疑地说。'), true);
});

test('style filter passes through standalone rendered content and disabled state', () => {
  const html = '<div class="ui">\n<p>极其</p>\n</div>';
  assert.equal(filterBlockedStyleText(html, {}), html);
  const fenced = '```\n极其\n```';
  assert.equal(filterBlockedStyleText(fenced, {}), fenced);
  const plain = '极其冷静，不容置疑。';
  assert.equal(filterBlockedStyleText(plain, { enabled: false }), plain);
  assert.equal(isStandaloneRenderedContent('<!doctype html><html></html>'), true);
  assert.equal(isStandaloneRenderedContent('普通正文极其'), false);
});

test('ui-template update block tail is excluded from filtering', () => {
  const text = '他极其冷静。\n<ui_template_updates>[{"a":1}]</ui_template_updates>';
  const block = findUiTemplateUpdateBlock(text);
  assert.ok(block, 'update block should be found');
  assert.equal(block.index, text.indexOf('<ui_template_updates'));
  const out = filterBlockedStyleText(text, {});
  assert.equal(out.includes('<ui_template_updates>[{"a":1}]</ui_template_updates>'), true);
});

test('normalizeStyleFilterHit trims punctuation and bold markers', () => {
  assert.equal(normalizeStyleFilterHit('，**极其**'), '极其');
  assert.equal(normalizeStyleFilterHit('极其**；'), '极其**；');
  assert.equal(normalizeStyleFilterHit('  '), '');
});

test('formatLatestTokenCount renders compact k values', () => {
  assert.equal(formatLatestTokenCount(7180), '7.18k');
  assert.equal(formatLatestTokenCount(2450), '2.45k');
  assert.equal(formatLatestTokenCount(999), '999');
  assert.equal(formatLatestTokenCount(0), '0');
  assert.equal(formatLatestTokenCount(null), '0');
});

test('stage-2 settings defaults exist with upstream-parity values', async () => {
  const source = await readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8');
  assert.match(source, /reasoningEffort: '',\s*\/\/ inline panel/);
  assert.match(source, /styleFilterEnabled: true,\s*\/\/ inline panel/);
  assert.match(source, /showLatestUsageBar: false,\s*\/\/ inline panel/);
});

test('chat payload carries reasoning_effort only when set', async () => {
  const source = await readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8');
  assert.match(source, /\.\.\.\(settings\.reasoningEffort \? \{ reasoning_effort: settings\.reasoningEffort \} : \{\}\)/);
  // Style filter runs on the finalized assistant body in the success path
  assert.match(source, /import \{ filterBlockedStyleText \} from '\.\.\/modules\/style-filter\.mjs';/);
  assert.match(source, /if \(assistantMessage && settings\.styleFilterEnabled\) \{\s*const styleFilterHits = \[\];\s*assistantMessage\.content = filterBlockedStyleText\(/);
});

test('app.mjs defines the reasoning slider and latest-main-usage computed', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /const reasoningEffortOptions = \[[\s\S]*?value: 'none', label: '关闭'[\s\S]*?value: 'max', label: '最高（max）'[\s\S]*?value: '', label: '默认' \}\n        \];/);
  assert.match(source, /const reasoningEffortSlider = computed\(\{\s*get: \(\) => Math\.max\(0, reasoningEffortOptions\.findIndex\(option => option\.value === settings\.reasoningEffort\)\),\s*set: index => \{ settings\.reasoningEffort = reasoningEffortOptions\[index\]\?\.value \|\| ''; \}\s*\}\);/);
  assert.match(source, /const reasoningEffortLabel = computed\(\(\) => reasoningEffortOptions\[reasoningEffortSlider\.value\]\.label\);/);
  assert.match(source, /const latestMainTokenUsage = computed\(\(\) => \(\s*tokenUsageHistory\.value\.find\(entry => entry\.type === 'chat'\) \|\| null\s*\)\);/);
  // Runtime-only: style filter hits never persist to chat storage
  assert.match(source, /'styleFilterHits'/);
  // Exposed to appContext for MessageInput passthrough
  assert.match(source, /reasoningEffortSlider, reasoningEffortLabel, latestMainTokenUsage, showNoMemoryNeededModal/);
  assert.match(source, /formatLatestTokenCount, formatTokenAggregate/);
});

test('MessageInput panel hosts the stage-2 controls and usage bar', async () => {
  const messageInput = await readFile(new URL('../src/components/chat/MessageInput.vue', import.meta.url), 'utf8');
  // Reasoning effort slider (6 stops)
  assert.match(messageInput, /<span class="text-xs font-bold text-gray-500">推理强度<\/span>/);
  assert.match(messageInput, /v-model\.number="reasoningEffortSlider" type="range" min="0"\s*\r?\n\s*max="5" step="1" aria-label="推理强度"/);
  assert.match(messageInput, /\{\{ reasoningEffortLabel \}\}/);
  // New toggles
  assert.match(messageInput, /v-model="settings\.showLatestUsageBar"[\s\S]*?aria-label="最新用量"/);
  assert.match(messageInput, /v-model="settings\.styleFilterEnabled"[\s\S]*?aria-label="文风过滤"/);
  // Usage bar above the toolbar row
  assert.match(messageInput, /v-if="settings\.showLatestUsageBar && latestMainTokenUsage"/);
  assert.match(messageInput, /title="输入 Token"[\s\S]*?formatLatestTokenCount\(latestMainTokenUsage\.inputTokens\)/);
  assert.match(messageInput, /title="输出 Token"[\s\S]*?formatLatestTokenCount\(latestMainTokenUsage\.outputTokens\)/);
  assert.match(messageInput, /title="合计 Token"[\s\S]*?formatLatestTokenCount\(latestMainTokenUsage\.totalTokens\)/);
});

test('immersive-mode toggle re-reveals bubbles whose reveal class was wiped', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
  // A dedicated watcher re-observes unrevealed bubbles after the immersive flip:
  // Vue re-renders the rows and the class binding wipes the DOM-added reveal-active.
  assert.match(source, /watch\(\(\) => settings\.immersiveMode, async \(\) => \{\s*await nextTick\(\);[\s\S]*?scrollRevealObserver\.unobserve\(el\);\s*scrollRevealObserver\.observe\(el\);/);
});

test('request diagnostics snapshot records the reasoning effort param', async () => {
  const source = await readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8');
  assert.match(source, /temperature: settings\.temperature,\s*reasoning_effort: settings\.reasoningEffort \|\| undefined,/);
});
