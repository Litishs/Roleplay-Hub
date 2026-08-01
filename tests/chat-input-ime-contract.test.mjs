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
  assert.match(chatInput, /max-h-\[260px\] md:max-h-\[320px\]/);

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
  assert.match(source, /Math\.min\(Math\.max\(element\.scrollHeight, 44\), maxHeight\)/);
  assert.doesNotMatch(source, /watch\(userInput, \(\) =>/);
});
