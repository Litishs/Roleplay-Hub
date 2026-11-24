import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Mobile UX baseline contract (2026-11-09 review, batch 1):
// 1. Data-entry overlays must never close on backdrop taps (mis-taps would
//    silently discard typed drafts or parsed import files).
// 2. Numeric and URL inputs must declare inputmode so Android opens the
//    right soft-keyboard layout.
// 3. Destructive / diagnostic buttons must meet the 44px minimum touch target.

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

test("data-entry overlays must not close on backdrop clicks", async () => {
  const modal = await read("src/components/common/ModalDialog.vue");
  // Story branch name editor is a form: backdrop taps must be inert.
  assert.doesNotMatch(
    modal,
    /@click\.self="showStoryBranchNameEditor\s*=\s*false"/,
    "story branch name editor must not dismiss on backdrop clicks"
  );
  // Explicit exits stay available: Cancel button + Save action.
  assert.match(modal, /@click="saveStoryBranchName"/, "story branch name editor must keep its save button");
  assert.match(modal, /showStoryBranchNameEditor = false/, "story branch name editor must keep an explicit close path");

  const worldInfo = await read("src/components/views/WorldInfoPanel.vue");
  // Import dialogs: backdrop dismissal would discard the parsed import file.
  assert.doesNotMatch(
    worldInfo,
    /<div class="fixed inset-0"\s+@click="cancelChatImport"><\/div>/,
    "chat import dialog backdrop must not be clickable"
  );
  assert.doesNotMatch(
    worldInfo,
    /<div class="fixed inset-0"\s+@click="cancelImportPreview"><\/div>/,
    "import preview backdrop must not be clickable"
  );
  // Explicit cancel buttons remain on both dialogs.
  assert.match(worldInfo, /@click="cancelChatImport" type="button"/, "chat import dialog must keep its cancel button");
  assert.match(worldInfo, /@click="cancelImportPreview" type="button"/, "import preview must keep its cancel button");
});

test("numeric and URL inputs declare inputmode for the right soft keyboard", async () => {
  const worldInfo = await read("src/components/views/WorldInfoPanel.vue");
  const numericInputs = worldInfo.match(/type="number" inputmode="numeric"/g) || [];
  assert.ok(
    numericInputs.length >= 7,
    `world info/regex/ui-template editors must declare inputmode="numeric" on number inputs (found ${numericInputs.length})`
  );
  assert.match(
    worldInfo,
    /editingRegex\.data\.regex" type="text" spellcheck="false" autocapitalize="off"/,
    "regex pattern input must disable spellcheck and autocapitalize"
  );

  const tts = await read("src/components/settings/TtsSettings.vue");
  assert.match(tts, /type="number" inputmode="numeric" v-model\.number="settings\.ttsMaxChars"/, "TTS max-chars input needs inputmode");
  assert.match(tts, /type="text" inputmode="url" v-model\.trim="settings\.ttsCloudBaseUrl"/, "TTS base URL input needs inputmode=url");

  const api = await read("src/components/settings/ApiConfig.vue");
  assert.match(api, /settings\.apiUrl" type="text" inputmode="url"/, "main API endpoint input needs inputmode=url");

  const plugins = await read("src/components/settings/PluginMarketplace.vue");
  assert.match(
    plugins,
    /setting\.type === 'number'" type="number" inputmode="decimal"/,
    "plugin numeric settings need inputmode=decimal"
  );
});

test("destructive and diagnostic buttons meet the 44px touch target", async () => {
  const memory = await read("src/components/views/MemoryPanel.vue");
  assert.match(
    memory,
    /inline-flex min-h-\[44px\] items-center gap-1 px-3 py-2 bg-white text-red-600/,
    "clear-and-rebuild memories button must be at least 44px tall"
  );

  const settings = await read("src/components/views/SettingsPanel.vue");
  const diagnosticsButtons = settings.match(/inline-flex min-h-\[44px\] items-center justify-center text-xs/g) || [];
  assert.ok(
    diagnosticsButtons.length >= 3,
    `diagnostics copy/export/clear buttons must be at least 44px tall (found ${diagnosticsButtons.length})`
  );
});

test("hit-expansion utilities and shared-class expansions exist in styles.css", async () => {
  const css = await read("assets/css/styles.css");
  // Generic pseudo-element hit expansion (visual size untouched).
  assert.match(css, /\.hit-expand::after\s*\{/, "hit-expand utility must exist");
  assert.match(css, /inset:\s*var\(--hit-out,\s*-6px\)/, "hit-expand must honor the --hit-out override");
  // Shared classes expand at the class level so every consumer benefits.
  assert.match(css, /\.item-action-button::after/, "item-action-button needs hit expansion");
  assert.match(css, /\.modal-close-button::after/, "modal-close-button needs hit expansion");
  assert.match(css, /\.settings-icon-button::after/, "settings-icon-button needs hit expansion");
  assert.match(css, /\.user-settings-toolbar \.settings-icon-button::after/, "toolbar icon button needs its own inset");
  assert.match(css, /\.pagination-button::after/, "pagination-button needs hit expansion");
  assert.match(css, /\.settings-help-trigger::after/, "settings-help-trigger needs hit expansion");
  assert.match(css, /\.message-action-button::after/, "message-action-button needs hit expansion");
  // Message action row: 34px buttons, 10px gap so 44px hit areas never overlap.
  assert.match(css, /\.message-action-bar \{[^}]*gap:\s*0\.625rem/, "message action bar gap must be 10px");
  assert.match(css, /\.message-action-button \{[^}]*width:\s*2\.125rem/, "message action buttons must be 34px");
  // Segmented switch options (non-slim) reach 44px.
  assert.match(
    css,
    /\.segmented-switch:not\(\.segmented-switch--slim\) \.segmented-switch__option \{[^}]*min-height:\s*2\.75rem/,
    "segmented switch options must be at least 44px tall"
  );
});

test("chat header and composer controls carry hit expansion", async () => {
  const html = await read("index.html");
  assert.match(html, /goBack[^>]*p-2\.5 -m-2\.5/, "the mobile back arrow must reach a 44px hit area");
  // The unused fullscreen button gave way to a world-info shortcut (2026-11-24):
  // the character's bound entries live on the 世界书 page, and Back returns to
  // the chat through the shared nav stack.
  assert.match(html, /@click="currentView = 'worldinfo'"[\s\S]{0,320}title="世界书" aria-label="查看世界书"/,
    "the chat header must open the world-info page");
  assert.doesNotMatch(html, /toggleChatFullscreen/, "the unused fullscreen button is gone from the chat header");
  assert.match(html, /clearChat"\s*\n?\s*class="p-2\.5/, "clear-chat must use real 44px padding");

  const composer = await read("src/components/chat/MessageInput.vue");
  const expanded = composer.match(/hit-expand/g) || [];
  assert.ok(expanded.length >= 8, `composer icon row must carry hit expansion (found ${expanded.length})`);
  assert.match(composer, /flex items-center gap-3">\s*<!-- Send Image Button -->|<!-- Left controls: SendImage \/ AutoImage -->\s*<div class="flex items-center gap-3">/,
    "composer toolbar cluster must space expanded hits apart (gap-3)");
  assert.match(composer, /hit-expand \[--hit-out:-12px\]/, "image chip remove button needs -12px expansion");
});

test("all range sliders use the touch-range class with track styling in styles.css", async () => {
  const css = await read("assets/css/styles.css");
  assert.match(css, /input\[type="range"\]\.touch-range \{[^}]*height:\s*2\.75rem/, "touch-range must be a 44px hit area");
  assert.match(css, /touch-range::-webkit-slider-runnable-track/, "track must move into a pseudo-element");
  assert.match(css, /\[data-theme='dark'\] input\[type="range"\]\.touch-range/, "dark theme must override track color");

  const expected = [
    ["src/components/chat/MessageInput.vue", 2],
    ["src/components/settings/AdvancedSettings.vue", 1],
    ["src/components/settings/ApiConfig.vue", 3],
    ["src/components/settings/TtsSettings.vue", 3],
    ["src/components/views/MemoryPanel.vue", 5],
    ["src/components/views/UiTemplatePanel.vue", 2],
    ["src/components/views/WorldInfoPanel.vue", 4],
  ];
  let total = 0;
  for (const [file, count] of expected) {
    const source = await read(file);
    const found = (source.match(/touch-range/g) || []).length;
    total += found;
    assert.strictEqual(found, count, `${file} must wire ${count} range inputs to touch-range`);
  }
  assert.strictEqual(total, 20, "all 20 range sliders must be touch-friendly");

  const stale = await Promise.all(expected.map(([file]) => read(file)));
  for (const source of stale) {
    assert.doesNotMatch(source, /h-1\.5 bg-gray-200 rounded-lg appearance-none|h-2 bg-gray-200 rounded-lg appearance-none/,
      "legacy slider styling (6-8px track) must be fully replaced");
  }
});

test("system back button dismisses overlays before navigating or minimizing", async () => {
  const app = await read("src/modules/app.mjs");
  assert.match(app, /const backOverlayStack = \[/, "back overlay stack must exist");
  assert.match(app, /const dismissTopOverlayForBack = \(\) => \{/, "dismiss helper must exist");
  // The handler must consult the overlay stack before the fullscreen/view branches.
  assert.match(
    app,
    /dismissTopOverlayForBack\(\)\) return;[\s\S]{0,120}isChatFullscreen\.value/,
    "back handler must dismiss overlays before the fullscreen branch"
  );
  // Editors and pickers must all be registered (audit A2 inventory).
  for (const flag of ["showConfirmModal", "showStoryBranchNameEditor", "showStoryBranchModal", "showContextViewerModal",
    "showModelSelector", "showExportModal", "showImportPreview", "showChatImportDialog",
    "showCharacterEditor", "showActiveToolEditor", "editingPreset", "editingUiTemplate",
    "editingRegex", "editingWorldInfo", "showNoMemoryNeededModal", "showChatModelSelector",
    "showInstructionPanel", "showDescriptionPanel"]) {
    assert.ok(app.includes(`[() => ${flag}`) || new RegExp(`\\[\\(\\) => !?${flag.replace("editing", "editing")}`).test(app),
      `back overlay stack must cover ${flag}`);
  }
});

test("list panels have empty states and the model selector splits loading from empty", async () => {
  const cases = [
    ["src/components/views/WorldInfoPanel.vue", "暂无世界书条目"],
    ["src/components/views/RegexPanel.vue", "暂无正则脚本"],
    ["src/components/views/ToolsPanel.vue", "暂无活跃工具"],
    ["src/components/views/PresetsPanel.vue", "暂无预设分组"],
  ];
  for (const [file, marker] of cases) {
    const source = await read(file);
    assert.match(source, new RegExp(marker), `${file} must render an empty state`);
  }

  const apiConfig = await read("src/composables/useApiConfig.mjs");
  assert.match(apiConfig, /const modelsLoading = ref\(false\);/, "modelsLoading ref must exist");
  assert.match(apiConfig, /modelsLoading,/, "modelsLoading must be exported from useApiConfig");

  const app = await read("src/modules/app.mjs");
  assert.match(app, /modelsLoading\.value = true;/, "model fetches must set modelsLoading");
  assert.match(app, /finally \{\s*modelsLoading\.value = false;\s*\}/, "model fetches must reset modelsLoading in finally");

  const modal = await read("src/components/common/ModalDialog.vue");
  assert.match(modal, /v-if="modelsLoading"/, "model selector must show a dedicated loading state");
  assert.match(modal, /v-else-if="filteredModels\.length === 0"/, "model selector must split the empty state");
  assert.doesNotMatch(modal, /未找到模型或正在加载/, "conflated loading/empty text must be gone");
});

test("message action bar stays on one line and never overflows the phone viewport", async () => {
  const css = await read("assets/css/styles.css");
  // Single line: the row is nowrap and capped to the viewport width.
  assert.match(css, /\.message-action-bar \{[^}]*flex-wrap:\s*nowrap/, "action bar must never wrap to a second line");
  assert.match(css, /\.message-action-bar \{[^}]*max-width:\s*calc\(100vw - 1rem\)/, "action bar must cap at the viewport width");

  const messageList = await read("src/components/chat/MessageList.vue");
  // 2026-11-11 redesign (maintainer verdict): the candidate switcher moved out
  // of the action bar onto the name row, so the bar holds actions only and
  // every action stays one tap away. No overflow menu, no collapsing.
  assert.match(messageList, /message-switcher', settings\.immersiveMode \? '' : 'ml-auto'/, "candidate switcher must ride the name row and right-align to the bubble");
  assert.match(messageList, /class="message-switcher-button"/, "switcher arrows use their own compact button");
  assert.match(css, /\.message-switcher-button \{[^}]*width:\s*1\.375rem/, "switcher arrows are 22px visuals");
  assert.match(css, /\.message-switcher-button::after \{[^}]*inset:\s*-11px/, "22px arrows still reach a 44px touch target");
  // The old in-bar switcher and the overflow popover are gone for good.
  assert.doesNotMatch(messageList, /aria-label="更多操作"/, "the overflow menu must stay removed (maintainer verdict)");
  assert.doesNotMatch(messageList, /message-action-button--desktop/, "actions must never be hidden per breakpoint");
  assert.doesNotMatch(css, /\.message-action-button--desktop/, "the desktop-only action class must stay removed");
  assert.doesNotMatch(css, /\.message-action-menu/, "the overflow popover styles must stay removed");
  // The bar hugs the bubble's left edge again (no avatar-gutter offset).
  assert.doesNotMatch(messageList, /message-action-bar--flush-start/, "action bar must align with the bubble, not the avatar gutter");
  assert.doesNotMatch(css, /message-action-bar--flush-start/, "flush-start offset must stay removed");
});

test("quick-settings popover closes on a chat-log tap", async () => {
  const messageList = await read("src/components/chat/MessageList.vue");
  assert.match(messageList, /@click="showChatModelSelector = false"/, "tapping the log dismisses the quick-settings popover");
});

test("dark theme remaps semantic pale tints globally", async () => {
  // Tailwind's pale surfaces need dark values, or badges/alerts become glowing
  // near-white blocks. The settings panels had scoped rules; this pins the
  // global mapping added for the rest of the app (2026-11-24).
  const css = await read("assets/css/styles.css");
  for (const cls of ["bg-primary-50", "bg-primary-100", "bg-red-50", "bg-yellow-50",
    "bg-green-50", "bg-purple-50", "bg-rose-50"]) {
    assert.ok(css.includes(`[data-theme='dark'] .${cls}`), `${cls} needs a dark value`);
  }
  assert.match(css, /\[data-theme='dark'\] \.text-red-600,[\s\S]{0,120}color: #fca5a5 !important;/);
  assert.match(css, /\[data-theme='dark'\] \.text-green-600,[\s\S]{0,120}color: #6ee7b7 !important;/);
  assert.match(css, /\[data-theme='dark'\] \.text-yellow-600,[\s\S]{0,120}color: #fbbf24 !important;/);
  assert.match(css, /\[data-theme='dark'\] \.text-purple-700 \{ color: #d8b4fe !important; \}/);
  assert.match(css, /\[data-theme='dark'\] \.border-red-200,[\s\S]{0,120}border-color: #713c46 !important;/);
});

test("icons share one stroke weight and header icon buttons one treatment", async () => {
  // 1.8 was used by the sidebar and the hub rows while the rest of the app
  // draws at 2; unify so the same glyph does not change weight per page.
  for (const file of ["src/components/common/SideNav.vue",
    "src/components/views/ExtensionsHubPanel.vue", "src/components/views/WorkshopHubPanel.vue"]) {
    assert.doesNotMatch(await read(file), /stroke-width="1\.8"/, `${file} keeps the 2px stroke`);
  }
  // Secondary icon buttons are one neutral block (home header + page headers),
  // with a dark value instead of the old white card.
  const css = await read("assets/css/styles.css");
  assert.match(css, /\.settings-icon-button \{[\s\S]{0,220}background: #f3f4f6;/);
  assert.match(css, /\[data-theme='dark'\] \.settings-icon-button \{[\s\S]{0,120}background: var\(--d-surface-2\);/);
  assert.match(css, /\.settings-icon-button:active \{[^}]*scale\(0\.96\)/);
  const home = await read("src/components/chat/ConversationList.vue");
  assert.equal((home.match(/class="settings-icon-button"/g) || []).length, 3, "home header uses the shared block");
});

test("motion and surface tokens drive the shared components", async () => {
  const css = await read("assets/css/styles.css");
  assert.match(css, /--motion-fast: 0\.15s;/);
  assert.match(css, /--motion-base: 0\.22s;/);
  assert.match(css, /--motion-slow: 0\.32s;/);
  assert.match(css, /--motion-standard: cubic-bezier\(0\.22, 1, 0\.36, 1\);/);
  assert.match(css, /\.bottom-tab__slider \{[\s\S]{0,800}transform var\(--motion-base\) var\(--motion-standard\)/);
  assert.match(css, /grid-template-rows var\(--motion-slow\) var\(--motion-standard\)/);
  assert.match(css, /animation: fadeIn var\(--motion-slow\) ease-out;/);
  assert.match(css, /animation: message-in-elegant var\(--motion-slow\)/);
  // Reduced motion now also stops the message/live animations.
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]{0,1600}\.animate-message-in,[\s\S]{0,500}animation: none !important;/);
  // One card recipe, no duplicated light/dark values per component.
  assert.match(css, /--surface-card-bg: #ffffff;/);
  assert.match(css, /\.settings-group-card \{[\s\S]{0,220}background: var\(--surface-card-bg\)/);
  assert.match(css, /\.tab-hub-card \{[\s\S]{0,800}background: var\(--surface-card-bg\)/);
  assert.match(css, /\.tab-hub-row-card \{[\s\S]{0,300}background: var\(--surface-card-bg\)/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.settings-group-card \{/);
  // Wide screens get one content column.
  assert.match(css, /\.management-view \{[\s\S]{0,220}max-width: 48rem;[\s\S]{0,120}margin-left: auto;/);
});

test("detail titles match the navigation names", async () => {
  assert.match(await read("src/components/views/PresetsPanel.vue"), /<settings-page-header title="预设" @back="goBack">/);
  assert.match(await read("src/components/views/RegexPanel.vue"), /<settings-page-header title="正则" @back="goBack">/);
});
