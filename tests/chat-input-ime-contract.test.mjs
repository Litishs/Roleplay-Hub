import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('chat input uses a textarea with IME-safe handlers', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8')
  ]);

  const chatInput = html.match(/<textarea[\s\S]*?ref="inputBox"><\/textarea>/)?.[0] || '';
  assert.ok(chatInput, 'chat input should be a textarea for reliable IME composition on Android WebView');
  assert.doesNotMatch(chatInput, /<div contenteditable="plaintext-only"/);
  assert.match(chatInput, /@compositionstart="handleChatCompositionStart"/);
  assert.match(chatInput, /@compositionend="handleChatCompositionEnd"/);
  assert.match(chatInput, /@keydown="handleChatInputKeydown"/);
  assert.match(chatInput, /@paste="handleChatInputPaste"/);
  assert.match(chatInput, /placeholder=/);
  assert.match(chatInput, /max-h-\[56px\] md:max-h-\[64px\]/);

  assert.match(source, /const handleChatInput = \(event\) => \{\s*if \(event\?\.isComposing \|\| chatInputComposing\) return;/);
  assert.match(source, /const handleChatCompositionStart = \(\) => \{[\s\S]*?if \(chatInputResizeRaf\) \{[\s\S]*?cancelAnimationFrame\(chatInputResizeRaf\)/);
  assert.match(source, /const prepareChatInputSend = \(event\) =>/);
  assert.match(source, /const content = syncChatInputFromElement\(\)\.trim\(\)/);
  assert.match(source, /const handleChatInputBlur = \(event\) => \{\s*prepareChatInputSend\(event\)/);
  assert.match(source, /if \(inputBox\.value\) \{\s*if \(typeof inputBox\.value\.value === 'string'\) inputBox\.value\.value = '';/);
  assert.doesNotMatch(source, /watch\(userInput, \(\) =>/);
  assert.match(source, /handleChatInputPaste, prepareChatInputSend/);
  assert.match(html, /@pointerdown="prepareChatInputSend" @click="sendMessage"/);
  assert.doesNotMatch(html, /:disabled="!userInput\.trim\(\)"/);
});

test('chat input reads textarea value, pastes plain text, and auto-resizes', async () => {
  const source = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');

  assert.match(source, /const syncChatInputFromElement = \(element = inputBox\.value\) => \{[\s\S]*?typeof element\.value === 'string' \? element\.value/);
  assert.match(source, /const handleChatInputPaste = \(event\) => \{[\s\S]*?getData\('text\/plain'\)[\s\S]*?document\.execCommand\('insertText', false, text\)/);
  assert.match(source, /const resizeChatInputElement = \(element = inputBox\.value\) => \{\s*if \(!element\) return;\s*if \(element\.tagName === 'TEXTAREA'\)/);
  // 单行高度交给内容 + CSS min-h 决定，不再强制 44px 下限，避免输入框偏高
  assert.match(source, /Math\.min\(element\.scrollHeight, maxHeight\)/);
  assert.doesNotMatch(source, /Math\.max\(element\.scrollHeight, 44\)/);
  // 内容超出最大高度时视图跟随到末行（光标可见），不让新输入被遮挡；
  // 并用 rAF 补一次以兼容 Android WebView overflow 切换当帧不可滚动的问题
  assert.match(source, /if \(overflow\) \{\s*element\.scrollTop = element\.scrollHeight[\s\S]*?requestAnimationFrame\(\(\) => \{\s*element\.scrollTop = element\.scrollHeight/);
  assert.doesNotMatch(source, /watch\(userInput, \(\) =>/);
});


test('chat input Enter inserts newline, Ctrl/Cmd+Enter sends', async () => {
  const source = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');

  // 回车不再触发发送：不再有 shiftKey 短路后直接 preventDefault + sendMessage 的旧逻辑
  assert.doesNotMatch(source, /if \(event\.shiftKey\) return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?sendMessage\(\);/);
  // 保留 IME 组合守卫
  assert.match(source, /if \(event\.isComposing \|\| chatInputComposing \|\| event\.keyCode === 229\) return;/);
  // Ctrl/Cmd+Enter 发送
  assert.match(source, /if \(event\.ctrlKey \|\| event\.metaKey\) \{\s*event\.preventDefault\(\);\s*syncChatInputFromElement\(event\.currentTarget \|\| inputBox\.value\);\s*sendMessage\(\);/);
});