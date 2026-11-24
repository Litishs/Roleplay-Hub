// Contract tests for the narrow-screen tab shell (2026-11-23).
//
// The navigation model is a pure module (src/modules/tab-navigation.mjs) wired
// into app.mjs through a single watcher on currentView. These tests pin both
// the rules and the wiring, so a refactor cannot silently change where Back
// lands. Design record: documents/移动端底部标签栏导航工程方案.md.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { sep } from 'node:path';
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

  // Templates reach the helpers through the shared app context. Everything the
  // tab bar reads must really travel through it: a flag that is declared and
  // consumed but never exposed fails silently (isRootTextFocused did, and the
  // bar stopped hiding for the keyboard until a browser run caught it).
  const ctxStart = app.indexOf('const __ctx = {');
  assert.ok(ctxStart > 0, 'app context object must exist');
  const ctx = app.slice(ctxStart, app.indexOf('\n        };', ctxStart));
  assert.ok(ctx.length > 1000, 'app context object must have a body');
  const tabBar = await read('src/components/common/BottomTabBar.vue');
  const readByTabBar = [...new Set(tabBar.slice(0, tabBar.indexOf('<script>'))
    .match(/\bisTabRootView\b|\bisRootTextFocused\b|\bactiveTab\b|\bswitchTab\b|\bgoBack\b/g) || [])];
  assert.ok(readByTabBar.includes('isRootTextFocused'), 'the tab bar reads the text-focus flag');
  for (const name of ['goBack', ...readByTabBar]) {
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

test('index.html wraps the views in one box and mounts the tab shell', async () => {
  const html = await read('index.html');
  assert.match(html, /<div class="app-views flex-1 min-h-0 flex flex-col relative" :class="\{ 'has-tab-bar': isTabRootView \}">/);
  const viewsStart = html.indexOf('<div class="app-views');
  const viewsEnd = html.indexOf('</div>', html.indexOf('<extensions-hub-panel'));
  const bar = html.indexOf('<bottom-tab-bar></bottom-tab-bar>');
  assert.ok(viewsStart > 0 && viewsEnd > viewsStart && bar > viewsEnd, 'the tab bar must come after the views box');
  // The tab roots stay mounted like the home view, so a detail view can later
  // slide in over a root that is still painted.
  assert.match(html, /<workshop-hub-panel v-show="currentView === 'workshop'"><\/workshop-hub-panel>/);
  assert.match(html, /<extensions-hub-panel v-show="currentView === 'ext'"><\/extensions-hub-panel>/);
  assert.ok(html.indexOf(`<div v-show="currentView === 'home'"`) > viewsStart, 'the home view lives inside the views box');
  assert.match(html, /<side-nav><\/side-nav>/, 'wide screens keep the left sidebar');
});

test('the tab bar shows the four tabs in order, only on tab roots', async () => {
  const bar = await read('src/components/common/BottomTabBar.vue');
  assert.match(bar, /v-show="isTabRootView && !isRootTextFocused"/);
  assert.match(bar, /class="bottom-tab-bar" aria-label="主导航"/);
  assert.match(bar, /@click="switchTab\(tab\.id\)"/);
  assert.match(bar, /:aria-current="activeTab === tab\.id \? 'page' : undefined"/);
  assert.match(bar, /import \{ TAB_ORDER \} from "\.\.\/\.\.\/modules\/tab-navigation\.mjs";/);
  assert.match(bar, /const tabs = TAB_ORDER\.map\(id => \(\{ id, \.\.\.TAB_META\[id\] \}\)\);/);
  const labels = [...bar.matchAll(/^ {4}(home|workshop|ext|settings): \{\n\s+label: '([^']+)'/gm)].map((match) => `${match[1]}=${match[2]}`);
  assert.deepEqual(labels, ['home=会话', 'workshop=工坊', 'ext=扩展', 'settings=设置']);
});

const entryOrder = (source) => [...source.matchAll(/view: '([a-z]+)', label: '([^']+)'/g)].map((match) => match[1]);

test('the 扩展 tab lists the six destinations in the chosen order', async () => {
  const hub = await read('src/components/views/ExtensionsHubPanel.vue');
  assert.match(hub, /v-show="currentView === 'ext'" class="management-view tab-hub-view"/);
  assert.match(hub, /<settings-page-header title="扩展" :back="false"><\/settings-page-header>/);
  assert.match(hub, /@click="currentView = entry\.view"/);
  const list = hub.slice(hub.indexOf('const ENTRIES = ['), hub.indexOf('];', hub.indexOf('const ENTRIES = [')));
  assert.deepEqual(entryOrder(list), ['memory', 'presets', 'worldinfo', 'regex', 'uitemplates', 'tools']);
  // The drawer's status cues move with their entries.
  assert.match(hub, /entry\.view === 'memory' && memoryMigrationBadge/);
  assert.match(hub, /entry\.view === 'uitemplates' && uiTemplateUpdateStatus\.state === 'running'/);
  // Every other row reports live state instead of a placeholder: the count or
  // name comes from the same state the detail page renders.
  for (const source of ['ctx.memoryTocEntries', 'ctx.presetGroups', 'ctx.worldInfo',
    'ctx.regexScripts', 'ctx.currentUiTemplates', 'ctx.activeTools']) {
    assert.ok(hub.includes(source), `the hub status reads ${source}`);
  }
  assert.match(hub, /v-else class="tab-hub-status__text">\{\{ statusFor\(entry\.view\) \}\}<\/span>/);
  // The plugin marketplace stays behind the same flag as the sidebar's entry,
  // and is appended only while that flag is on.
  assert.match(hub, /const pluginsMarketEnabled = false;/);
  assert.match(hub, /const entries = pluginsMarketEnabled \? \[\.\.\.ENTRIES, PLUGIN_ENTRY\] : ENTRIES;/);
  assert.doesNotMatch(hub, /text-(red|green|amber|emerald|rose|violet|sky)-\d/, 'icons stay monochrome');
});

test('the 工坊 tab lists the three online workshops as separate cards', async () => {
  const hub = await read('src/components/views/WorkshopHubPanel.vue');
  assert.match(hub, /v-show="currentView === 'workshop'" class="management-view tab-hub-view"/);
  assert.match(hub, /<settings-page-header title="工坊" :back="false"><\/settings-page-header>/);
  // Reference 2026-11-24: one card per workshop, each with its tinted icon
  // tile, instead of the single settings card used by 扩展.
  assert.match(hub, /<div class="tab-hub-cards">/);
  assert.match(hub, /class="tab-hub-card" @click="currentView = entry\.view"/);
  assert.match(hub, /class="tab-hub-card__icon"/);
  assert.deepEqual(entryOrder(hub), ['generator', 'square', 'novel']);
});

test('hub panels register the page header they use locally', async () => {
  // The root app's `components` option only resolves the root template. A panel
  // that writes <settings-page-header> without importing it renders no title
  // (and logs a Vue warning) — caught in the browser on 2026-11-24.
  for (const file of ['WorkshopHubPanel', 'ExtensionsHubPanel']) {
    const hub = await read(`src/components/views/${file}.vue`);
    assert.match(hub, /import SettingsPageHeader from "\.\.\/common\/SettingsPageHeader\.vue";/, `${file} imports the header`);
    assert.match(hub, /components: \{ SettingsPageHeader \}/, `${file} registers the header`);
  }
});

test('the tab shell components are registered synchronously', async () => {
  const app = await read('src/modules/app.mjs');
  for (const name of ['BottomTabBar', 'WorkshopHubPanel', 'ExtensionsHubPanel']) {
    assert.match(app, new RegExp(`import ${name} from '\.\./components/(common|views)/${name}\.vue';`));
  }
  assert.match(app, /SideNav, BottomTabBar, WorkshopHubPanel, ExtensionsHubPanel, ToastNotification/);
  assert.match(app, /'bottom-tab-bar': BottomTabBar,/);
  assert.match(app, /'workshop-hub-panel': WorkshopHubPanel,/);
  assert.match(app, /'extensions-hub-panel': ExtensionsHubPanel,/);
});

test('SettingsPageHeader leads detail pages with a Back arrow and can drop it on roots', async () => {
  const header = await read('src/components/common/SettingsPageHeader.vue');
  assert.match(header, /<button v-if="back" type="button" @click="\$emit\('back'\)" class="settings-back-button" aria-label="返回">/);
  assert.match(header, /back: \{ type: Boolean, default: true \}/);
  assert.match(header, /emits: \['back'\]/);
});

test('styles: overlay tab bar with variable colours, dark override and view reservation', async () => {
  const css = await read('assets/css/styles.css');
  assert.match(css, /:root \{[^}]*--tab-bar-h: 4\.25rem;/);
  // The base rule starts its own line; the fullscreen and dark rules also end
  // with this selector and must not be picked up instead.
  const barStart = css.search(/^ {8}\.bottom-tab-bar \{/m);
  assert.ok(barStart > 0, 'the tab bar rule must exist');
  const barBlock = css.slice(barStart, css.indexOf('}', barStart));
  for (const declaration of ['position: absolute;', 'bottom: 0;', 'height: var(--tab-bar-h);',
    'background: var(--tab-bar-bg);', '--tab-bar-active: #2563eb;']) {
    assert.ok(barBlock.includes(declaration), `the tab bar must declare ${declaration}`);
  }
  assert.match(css, /\[data-theme='dark'\] \.bottom-tab-bar \{[\s\S]{0,300}--tab-bar-active: #93c5fd;/);
  assert.match(css, /@media \(max-width: 767\.98px\) \{\s*\.app-views\.has-tab-bar \{\s*padding-bottom: var\(--tab-bar-h\);\s*\}\s*\}/);
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.bottom-tab-bar \{\s*display: none !important;/);
  assert.match(css, /\.app-native-fullscreen \.bottom-tab-bar,/);
});

test('the sidebar is desktop-only and keeps every desktop destination', async () => {
  const nav = await read('src/components/common/SideNav.vue');
  assert.match(nav, /class="app-sidebar hidden md:flex /);
  assert.doesNotMatch(nav, /mobile-overlay|closeMobileMenu|toggleMobileMenu/);
  for (const view of ['home', 'memory', 'uitemplates', 'usage', 'generator', 'square', 'novel',
    'presets', 'worldinfo', 'regex', 'tools', 'settings']) {
    assert.ok(nav.includes(`currentView = '${view}'`), `the sidebar still lists ${view}`);
  }
});

test('detail page headers lead with the shared Back helper', async () => {
  const html = await read('index.html');
  assert.match(html, /<button v-if="!isChatFullscreen" @click="goBack" aria-label="返回"/, 'chat header');
  assert.doesNotMatch(html, /icon-menu/, 'the drawer menu icon is gone');

  const list = await read('src/components/chat/ConversationList.vue');
  assert.doesNotMatch(list, /toggleMobileMenu|打开导航/, 'the home header no longer opens a drawer');

  const characters = await read('src/components/views/CharacterPanel.vue');
  assert.match(characters, /<button @click="goBack"[\s\S]{0,220}aria-label="返回">/);

  const plugins = await read('src/components/views/PluginsPanel.vue');
  assert.match(plugins, /@click="goBack" class="settings-back-button"/);

  for (const file of ['MemoryPanel', 'PresetsPanel', 'RegexPanel', 'ToolsPanel', 'UiTemplatePanel',
    'WorldInfoPanel', 'UsageStatsPanel', 'GeneratorPanel', 'SquarePanel', 'NovelPanel']) {
    const panel = await read(`src/components/views/${file}.vue`);
    assert.match(panel, /@back="goBack"/, `${file} must handle the header's back event`);
  }

  // 设置 is a tab root: nothing to go back to, so its title has no leading button.
  const settings = await read('src/components/views/SettingsPanel.vue');
  assert.doesNotMatch(settings, /mobile-menu-button|toggleMobileMenu/);
});

test('the embedded workshop pages keep their floating Back tab', async () => {
  const embedded = await read('src/components/common/EmbeddedViewContent.vue');
  assert.match(embedded, /<button type="button" @click="\$emit\('back'\)" aria-label="返回"/);
  assert.match(embedded, /emits: \['load', 'back'\]/);
  assert.doesNotMatch(embedded, /'menu'/);
});

test('styles: hub rows keep their description line on phones', async () => {
  // Phones hide the description line on settings rows to keep them compact.
  // Hub rows are links whose names alone say little, so they opt back in — and
  // so do the 工坊 cards, which are not link rows.
  const css = await read('assets/css/styles.css');
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]{0,2400}\.tab-hub-view \.settings-link-row \.settings-accordion-description,\s*\.tab-hub-view \.tab-hub-card \.settings-accordion-description \{\s*display: block;/);
  // Two lines need the standard pitch; pinning it also stops the hairline
  // borders from making the rows differ by a pixel.
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]{0,2400}\.tab-hub-view \.settings-link-row \{\s*min-height: 3\.5rem;/);
  for (const file of ['WorkshopHubPanel', 'ExtensionsHubPanel']) {
    const hub = await read(`src/components/views/${file}.vue`);
    assert.match(hub, /class="settings-accordion-description">\{\{ entry\.description \}\}<\/span>/, `${file} renders a description`);
  }
});

test('styles: hub cards and status carry the reference layout in both themes', async () => {
  const css = await read('assets/css/styles.css');
  const cardStart = css.search(/^ {8}\.tab-hub-card \{/m);
  assert.ok(cardStart > 0, 'the hub card rule must exist');
  const cardBlock = css.slice(cardStart, css.indexOf('}', cardStart));
  for (const declaration of ['grid-template-columns: 2.75rem minmax(0, 1fr) 1rem;',
    'min-height: 4.75rem;', 'border-radius: 0.75rem;', 'background: var(--hub-card-bg);']) {
    assert.ok(cardBlock.includes(declaration), `the hub card must declare ${declaration}`);
  }
  // 44px tinted tile, so the workshop glyphs read as tiles rather than rows.
  assert.match(css, /\.tab-hub-card__icon \{[\s\S]{0,200}width: 2\.75rem;[\s\S]{0,60}height: 2\.75rem;/);
  assert.match(css, /\.tab-hub-card__icon \{[\s\S]{0,260}background: var\(--hub-icon-bg\);[\s\S]{0,60}color: var\(--hub-icon-fg\);/);
  // Right-hand status text: bold, single line, and ellipsised so a long custom
  // preset group name cannot widen the row.
  const statusStart = css.search(/^ {8}\.tab-hub-status__text \{/m);
  assert.ok(statusStart > 0, 'the status rule must exist');
  const statusBlock = css.slice(statusStart, css.indexOf('}', statusStart));
  for (const declaration of ['max-width: 7rem;', 'font-weight: 700;', 'text-overflow: ellipsis;', 'white-space: nowrap;']) {
    assert.ok(statusBlock.includes(declaration), `the status must declare ${declaration}`);
  }
  // Accent and surfaces are variables; dark mode swaps values only.
  assert.match(css, /\.tab-hub-view \{[\s\S]{0,300}--hub-icon-bg: rgba\(59, 130, 246, 0\.12\);/);
  assert.match(css, /\[data-theme='dark'\] \.tab-hub-view \{[\s\S]{0,300}--hub-card-bg: #18212c;[\s\S]{0,200}--hub-icon-fg: #93c5fd;/);
});

test('styles: the back arrow is a 44px target and no drawer rule survives', async () => {
  const css = await read('assets/css/styles.css');
  const start = css.search(/^ {8}\.settings-back-button \{/m);
  assert.ok(start > 0, 'the back button rule must exist');
  const block = css.slice(start, css.indexOf('}', start));
  assert.match(block, /width: 2\.75rem;/);
  assert.match(block, /height: 2\.75rem;/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]{0,400}\.settings-back-button \{\s*display: none;/);
  assert.match(css, /\[data-theme='dark'\] \.settings-back-button \{/);
  assert.doesNotMatch(css, /\.mobile-overlay|\.mobile-sidebar-open|\.mobile-menu-button/);
});

test('nothing of the drawer is left in the app sources', async () => {
  const extra = ['index.html', 'assets/css/styles.css'];
  const files = (await readdir(new URL('src/', ROOT), { recursive: true }))
    .filter((file) => /\.(vue|mjs|js)$/.test(file))
    .map((file) => `src/${String(file).split(sep).join('/')}`);
  assert.ok(files.length > 50, `expected the whole source tree, found ${files.length} files`);
  const paths = [...files, ...extra];
  const sources = await Promise.all(paths.map(read));
  const drawer = /toggleMobileMenu|closeMobileMenu|setMobileSidebarOpen|isMobileSidebarOpen|mobile-sidebar-open|mobile-overlay|mobile-menu-button/;
  for (let index = 0; index < sources.length; index += 1) {
    assert.doesNotMatch(sources[index], drawer, `${paths[index]} still references the drawer`);
  }
});

test('settings: 用量统计 is a link row in the data group, hidden on wide screens', async () => {
  const settings = await read('src/components/views/SettingsPanel.vue');
  const dataGroup = settings.slice(settings.indexOf('aria-labelledby="settings-group-data"'), settings.indexOf('<UpdateChecker />'));
  assert.ok(dataGroup.length > 0, 'the data group must exist');
  const triggerAt = dataGroup.indexOf('aria-controls="local-data-panel"');
  const usageAt = dataGroup.indexOf('@click="currentView = \'usage\'"');
  assert.ok(triggerAt > 0, 'the local-data accordion is in the data group');
  assert.ok(usageAt > triggerAt, 'the usage row follows the local-data accordion');
  const usageRow = dataGroup.slice(usageAt, dataGroup.indexOf('</button>', usageAt));
  assert.match(usageRow, /settings-accordion-trigger settings-link-row settings-link-row--narrow/);
  assert.match(usageRow, /settings-accordion-title">用量统计</);
  assert.match(usageRow, /d="M9 5l7 7-7 7"/, 'a right chevron marks it as a link, not an accordion');
  // Exactly one way in on narrow screens; the sidebar keeps its own on wide ones.
  assert.equal(settings.split(`currentView = 'usage'`).length - 1, 1);
  assert.match(await read('src/components/common/SideNav.vue'), /currentView = 'usage'/, 'wide screens keep the sidebar entry');

  // The hide rule lives in styles.css (see the cascade note there), not as a utility.
  const css = await read('assets/css/styles.css');
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]{0,600}\.settings-link-row--narrow \{\s*display: none;/);
  assert.match(css, /\.settings-accordion \+ \.settings-link-row \{/);
  assert.match(css, /\[data-theme='dark'\] \.settings-accordion \+ \.settings-link-row \{/);
});
