// Contract tests for the narrow-screen tab shell (2026-11-23).
//
// The navigation model is a pure module (src/modules/tab-navigation.mjs) wired
// into app.mjs through a single watcher on currentView. These tests pin both
// the rules and the wiring, so a refactor cannot silently change where Back
// lands. Design record: documents/移动端底部标签栏导航工程方案.md.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NAV_STACK_LIMIT, TAB_ORDER, isTabRoot, recordViewChange, tabOfView } from '../src/modules/tab-navigation.mjs';

const ROOT = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, ROOT), 'utf8')).replace(/\r\n/g, '\n');

test('every view belongs to exactly one of the four tabs', () => {
  assert.deepEqual([...TAB_ORDER], ['home', 'workshop', 'ext', 'settings']);
  const expected = {
    home: ['home', 'chat', 'characters'],
    workshop: ['workshop', 'generator', 'square', 'novel'],
    ext: ['ext', 'memory', 'presets', 'worldinfo', 'regex', 'uitemplates', 'tools', 'plugins'],
    settings: ['settings', 'usage']
  };
  for (const [tab, views] of Object.entries(expected)) {
    for (const view of views) assert.equal(tabOfView(view), tab, `${view} belongs to ${tab}`);
  }
  for (const tab of TAB_ORDER) assert.ok(isTabRoot(tab), `${tab} is a tab root`);
  assert.equal(isTabRoot('chat'), false, 'the chat is a detail view');
  assert.equal(tabOfView('unknown-view'), 'home', 'an unmapped view falls back to 会话');
});

test('opening a detail view records the page it was opened from', () => {
  assert.deepEqual(recordViewChange([], 'ext', 'presets'), [{ view: 'presets', from: 'ext' }]);

  const opened = [{ view: 'chat', from: 'home' }];
  assert.deepEqual(
    recordViewChange(opened, 'chat', 'characters'),
    [{ view: 'chat', from: 'home' }, { view: 'characters', from: 'chat' }],
    'a detail opened from another detail stacks on top of it'
  );
});

test('landing on a tab root clears the stack and a no-op change keeps it', () => {
  const stack = [{ view: 'chat', from: 'home' }, { view: 'characters', from: 'chat' }];
  assert.deepEqual(recordViewChange(stack, 'characters', 'home'), []);
  assert.equal(recordViewChange(stack, 'characters', 'characters'), stack, 'same view returns the same array');
});

test('returning to the entry underneath does not record a second time', () => {
  // goBack() pops first, then changes the view: the watcher sees `to` as the
  // new top entry and must leave the stack alone.
  const afterPop = [{ view: 'chat', from: 'home' }];
  assert.equal(recordViewChange(afterPop, 'characters', 'chat'), afterPop);
});

test('a lateral jump from an unrelated page restarts from the real origin', () => {
  const stale = [{ view: 'presets', from: 'ext' }];
  assert.deepEqual(recordViewChange(stale, 'chat', 'tools'), [{ view: 'tools', from: 'chat' }]);
});

test('the stack is capped so sidebar jumps cannot grow it without bound', () => {
  let stack = [];
  let view = 'home';
  for (let index = 0; index < NAV_STACK_LIMIT + 5; index += 1) {
    const next = `detail-${index}`;
    stack = recordViewChange(stack, view, next);
    view = next;
  }
  assert.equal(stack.length, NAV_STACK_LIMIT);
  assert.equal(stack[0].view, 'detail-5', 'the oldest origin is dropped first');
  assert.equal(stack[stack.length - 1].view, `detail-${NAV_STACK_LIMIT + 4}`);
});

test('chat → character manager → chat keeps a walkable history', () => {
  // selectCharacter() writes currentView directly, so the second chat is a new
  // entry on top of the manager, not a jump back to the first one.
  let stack = recordViewChange([], 'home', 'chat');
  stack = recordViewChange(stack, 'chat', 'characters');
  stack = recordViewChange(stack, 'characters', 'chat');
  assert.deepEqual(stack.map((entry) => entry.view), ['chat', 'characters', 'chat']);
  assert.deepEqual(stack.map((entry) => entry.from), ['home', 'chat', 'characters']);
});

test('app.mjs maintains the Back stack through one watcher on currentView', async () => {
  const app = await read('src/modules/app.mjs');
  assert.match(app, /import \{ isTabRoot, recordViewChange, tabOfView \} from '\.\/tab-navigation\.mjs';/);
  assert.match(app, /watch\(currentView, \(to, from\) => \{\s*navStack\.value = recordViewChange\(navStack\.value, from, to\);\s*(?:\/\/[^\n]*\n\s*)*if \(!isTabRoot\(to\)\) isRootTextFocused\.value = false;\s*\}\);/);
  assert.match(app, /const goBack = \(\) => \{[\s\S]{0,200}currentView\.value = entry \? entry\.from : tabOfView\(currentView\.value\);/);
  assert.match(app, /const switchTab = tab => \{\s*navStack\.value = \[\];\s*currentView\.value = tab;\s*\};/);
  assert.match(app, /const isTabRootView = computed\(\(\) => isTabRoot\(currentView\.value\)\);/);
  assert.match(app, /const activeTab = computed\(\(\) => tabOfView\(currentView\.value\)\);/);

  // Templates reach the helpers through the shared app context.
  const ctxStart = app.indexOf('const __ctx = {');
  assert.ok(ctxStart > 0, 'app context object must exist');
  const ctx = app.slice(ctxStart, ctxStart + 200000);
  for (const name of ['goBack', 'switchTab', 'isTabRootView', 'activeTab']) {
    assert.match(ctx, new RegExp(`\\b${name}\\b`), `app context must expose ${name}`);
  }
});

test('nav state is declared in useUiState', async () => {
  const uiState = await read('src/composables/useUiState.mjs');
  assert.match(uiState, /const navStack = ref\(\[\]\);/);
  assert.match(uiState, /const isRootTextFocused = ref\(false\);/);
  const returned = uiState.slice(uiState.indexOf('return {'));
  assert.match(returned, /\bnavStack,/, 'navStack must be returned by the composable');
  assert.match(returned, /\bisRootTextFocused,/, 'isRootTextFocused must be returned by the composable');
});

test('system back walks overlays, fullscreen and detail views before leaving a tab', async () => {
  const app = await read('src/modules/app.mjs');
  assert.match(
    app,
    /if \(dismissTopOverlayForBack\(\)\) return;[\s\S]{0,400}isChatFullscreen\.value\) \{[\s\S]{0,200}toggleChatFullscreen\(\);[\s\S]{0,200}!isTabRoot\(currentView\.value\)\) \{[\s\S]{0,200}goBack\(\);[\s\S]{0,200}switchTab\('home'\);[\s\S]{0,200}minimizeApp\(\);/,
    'order must be: overlay stack → fullscreen → goBack() → 会话 tab → minimize'
  );
  assert.doesNotMatch(app, /currentView\.value = 'home';\s*\} else \{\s*await nativeApp\.minimizeApp\(\)/,
    'detail views must no longer jump straight to 会话');
});

test('a focused text field on a tab-root page hides the tab bar', async () => {
  const app = await read('src/modules/app.mjs');
  assert.match(app, /const handleRootTextFocusIn = \(event\) => \{[\s\S]{0,300}isRootTextFocused\.value = true;/);
  assert.match(app, /const handleRootTextFocusOut = \(\) => \{[\s\S]{0,300}isRootTextFocused\.value = false;/);
  assert.match(app, /document\.addEventListener\('focusin', handleRootTextFocusIn\);/);
  assert.match(app, /document\.addEventListener\('focusout', handleRootTextFocusOut\);/);
  assert.match(app, /document\.removeEventListener\('focusin', handleRootTextFocusIn\);/);
  assert.match(app, /document\.removeEventListener\('focusout', handleRootTextFocusOut\);/);
  // Only text entry counts: tapping a button or a switch must not hide the bar.
  assert.match(app, /ROOT_TEXT_INPUT_SELECTOR = '[^']*input:not\(\[type="checkbox"\]\)[^']*textarea[^']*contenteditable/);
});
