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
