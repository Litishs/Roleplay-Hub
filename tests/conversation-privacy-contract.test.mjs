// Contract tests for the conversation-list privacy mode (2026-11-25).
//
// The eye button sits next to the card-import action. While the mode is on,
// every row is blurred; holding a row peeks at it and releasing hides it
// again. The switch persists with the app settings, so a restart keeps the
// list hidden. These tests pin the wiring, the gesture bookkeeping and the
// CSS that actually hides the content.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, ROOT), 'utf8')).replace(/\r\n/g, '\n');

test('privacyMode is a persisted setting, defaulting to off', async () => {
  const settingsState = await read('src/composables/useSettingsState.mjs');
  assert.match(
    settingsState,
    /themeMode: 'system',\s*(?:\/\/[^\n]*\n\s*)*privacyMode: false,/,
    'the default lives next to the other display preferences'
  );
  const returned = settingsState.slice(settingsState.indexOf('return {'));
  assert.match(returned, /\bsettings,/, 'settings is returned by the composable');

  // Persistence rides on the settings object itself: loaded key-by-key and
  // written as one kv entry under the deep autosave watch.
  const app = await read('src/modules/app.mjs');
  assert.match(app, /\['settings', settings\],/);
  assert.match(app, /watch\(\[characters, settings,/, 'the deep autosave watch includes settings');
  assert.match(app, /const __ctx = \{/, 'app context must expose the settings used by the list');
  const ctx = app.slice(app.indexOf('const __ctx = {'));
  assert.match(ctx.slice(0, 4000), /\bsettings\b/, 'privacyMode travels through the shared app context');
});

test('the eye button sits after the import action and reflects the state', async () => {
  const list = await read('src/components/chat/ConversationList.vue');
  const header = list.slice(list.indexOf('<header'), list.indexOf('</header>'));
  const importAt = header.indexOf('aria-label="导入角色卡"');
  const privacyAt = header.indexOf('privacy-toggle');
  assert.ok(importAt > 0 && privacyAt > importAt, 'the privacy button follows the import button');
  assert.match(header, /@click="togglePrivacyMode"/);
  assert.match(header, /:aria-pressed="privacyOn \? 'true' : 'false'"/);
  assert.match(header, /:title="privacyOn \? '关闭隐私模式' : '隐私模式'"/);
  // Open eye = rows visible, slashed eye = rows hidden.
  assert.match(header, /<svg v-if="!privacyOn"/);
  assert.match(header, /M2\.036 12\.322/, 'open-eye glyph');
  assert.match(header, /<svg v-else/);
  assert.match(header, /M3\.98 8\.223/, 'slashed-eye glyph');
  // Active tint is a state style, not a different button shape.
  assert.match(header, /class="settings-icon-button privacy-toggle"/);
  assert.match(header, /:class="\{ 'is-active': privacyOn \}"/);
});

test('rows are blurred only while the mode is on and not peeked', async () => {
  const list = await read('src/components/chat/ConversationList.vue');
  assert.match(list, /:class="\[compact \? 'conversation-list--compact' : '', privacyOn \? 'is-private' : ''\]"/);
  assert.match(list, /isRedacted\(item\) \? 'is-redacted' : ''/);
  assert.match(list, /const isRedacted = \(item\) => privacyOn\.value && revealedKey\.value !== rowKey\(item\);/);
  // Every visible piece of a row carries a hook for the blur rules; the unread
  // dot stays outside them so activity remains visible while hiding content.
  for (const hook of ['avatar-media', 'name', 'time', 'preview', 'status']) {
    assert.ok(list.includes(`conversation-row__${hook}`), `row content exposes ${hook}`);
  }
  assert.match(list, /class="conversation-row__unread absolute right-0 top-0/);
});

test('a held press peeks at one row and does not open the chat', async () => {
  const list = await read('src/components/chat/ConversationList.vue');
  assert.match(list, /@pointerdown="startPeek\(item, \$event\)"/);
  for (const handler of ['@pointerup="releasePeek"', '@pointerleave="endPeek"', '@pointercancel="endPeek"', '@pointermove="movePeek"']) {
    assert.ok(list.includes(handler), `row wires ${handler}`);
  }
  assert.match(list, /const LONG_PRESS_MS = 260;/);
  assert.match(list, /const PEEK_MOVE_TOLERANCE = 8;/);
  // A tap shorter than the threshold opens the chat; only a completed peek
  // reveals content.
  assert.match(list, /const startPeek = \(item, event\) => \{\s*if \(!privacyOn\.value\) return;\s*if \(event\?\.isPrimary === false\) return;/);
  assert.match(list, /revealedKey\.value = peekKey;\s*(?:\/\/[^\n]*\n\s*)*suppressClickKey = peekKey;/);
  assert.match(list, /const endPeek = \(\) => \{[\s\S]{0,200}revealedKey\.value = null;/);
  assert.match(list, /Math\.abs\(event\.clientX - peekStart\.x\) > PEEK_MOVE_TOLERANCE/);
  // Releasing after a peek must not fall through to the row's click.
  assert.match(list, /if \(suppressClickKey && suppressClickKey === rowKey\(item\)\) \{\s*suppressClickKey = null;\s*return;\s*\}/);
  // Turning the mode off (or on) never leaves a row readable.
  assert.match(list, /ctx\.settings\.privacyMode = !ctx\.settings\.privacyMode;[\s\S]{0,200}revealedKey\.value = null;/);
  // The WebView context menu would expose the blurred avatar again.
  assert.match(list, /const onRowContextMenu = \(event\) => \{[\s\S]{0,200}if \(privacyOn\.value\) event\.preventDefault\(\);/);
});

test('releasing a peek re-blurs after 0.35s and never eats a normal tap', async () => {
  const list = await read('src/components/chat/ConversationList.vue');
  assert.match(list, /const PEEK_REBLUR_MS = 350;/);
  // Release keeps the row readable for the delay, then clears the reveal only
  // if no newer peek has taken over.
  assert.match(
    list,
    /const releasePeek = \(\) => \{\s*if \(!peekKey\) return;[\s\S]{0,400}if \(revealedKey\.value !== key\) return;\s*clearTimeout\(reblurTimer\);\s*reblurTimer = setTimeout\(\(\) => \{\s*reblurTimer = 0;\s*if \(revealedKey\.value === key\) revealedKey\.value = null;\s*\}, PEEK_REBLUR_MS\);/
  );
  // The pointerleave that follows a touch release must not cut the delay short.
  assert.match(list, /const endPeek = \(\) => \{\s*\/\/[^\n]*\n\s*if \(!peekKey\) return;/);
  // The suppression has no expiry timer any more: a long hold used to outlive
  // the 700ms guard, and the release then opened the chat.
  assert.doesNotMatch(list, /suppressClickTimer/);
  // A new press clears stale suppression, so the next tap opens normally.
  assert.match(list, /A new press starts a new gesture: suppression only ever applies to the\s*\/\/ click that ends the gesture which revealed the row\.\n\s*suppressClickKey = null;/);
  // A normal tap (released before the threshold) carries no suppression.
  assert.match(list, /if \(revealedKey\.value !== key\) return;/);
});

test('styles: blur hides the row content, keeps the unread dot and tints the toggle', async () => {
  const css = await read('assets/css/styles.css');
  assert.match(css, /\.conversation-row\.is-redacted \.conversation-row__avatar-media \{\s*filter: blur\(9px\);/);
  assert.match(css, /\.conversation-row\.is-redacted \.conversation-row__name,\s*\.conversation-row\.is-redacted \.conversation-row__time,\s*\.conversation-row\.is-redacted \.conversation-row__preview,\s*\.conversation-row\.is-redacted \.conversation-row__status \{\s*filter: blur\(6px\);\s*opacity: 0\.5;/);
  assert.doesNotMatch(css, /\.is-redacted[^{]*conversation-row__unread/, 'the unread dot stays crisp');
  assert.match(css, /\.conversation-list\.is-private \.conversation-row \{\s*-webkit-touch-callout: none;\s*user-select: none;/);
  assert.match(css, /\.settings-icon-button\.privacy-toggle\.is-active \{\s*background: rgba\(59, 130, 246, 0\.14\);\s*color: #2563eb;/);
  assert.match(css, /\[data-theme='dark'\] \.settings-icon-button\.privacy-toggle\.is-active \{[\s\S]{0,120}color: #93c5fd;/);
});