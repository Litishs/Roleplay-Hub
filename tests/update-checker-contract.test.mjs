import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, updateCheckerHtml, app, checker, java, uiState] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/UpdateChecker.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/update-checker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java", import.meta.url), "utf8"),
    readFile(new URL("../src/composables/useUiState.mjs", import.meta.url), "utf8"),
]);

test("index.html uses Vite module entry point", () => {
    assert.ok(html.includes('<script type="module" src="/src/main.js">'), "Vite module entry should be present");
});

test("update-checker.js exports UMD interface", () => {
    assert.match(checker, /export { compareVersions, checkForUpdate/);
    assert.match(checker, /export { compareVersions, checkForUpdate/);
    assert.match(checker, /checkForUpdate/);
    assert.match(checker, /downloadApk/);
    assert.match(checker, /saveAndInstallApk/);
    assert.match(checker, /Litishs\/Roleplay-Hub/);
});

test("app.js wires checkForUpdates and exposes state", () => {
    assert.match(app, /const checkForUpdates = async/);
    assert.match(app, /const downloadAndInstallUpdate = async/);
    assert.match(app, /RPHUpdateChecker/);
    // Update display state lives in useUiState (Phase 2); app.mjs keeps the logic
    assert.match(uiState, /const latestVersionName = ref/);
    assert.match(uiState, /const downloadingUpdate = ref/);
    assert.match(uiState, /const downloadProgress = ref/);
    assert.match(app, /const uiState = useUiState\(\);/);
    assert.match(app, /checkForUpdates, checkingUpdate, updateAvailable, updateInfo, latestVersionName, downloadingUpdate, downloadProgress, downloadAndInstallUpdate,/);
});

test("app.js has silent auto-check on startup", () => {
    assert.match(app, /setTimeout\(function\(\)/);
    assert.match(app, /checkForUpdates\(false\)/);
    assert.match(app, /5000\)/);
});

test("UpdateChecker.vue shows version info, check button, and update button", () => {
    assert.match(updateCheckerHtml, /@click="checkForUpdates\(true\)"/);
    assert.match(updateCheckerHtml, /:disabled="checkingUpdate"/);
    assert.match(updateCheckerHtml, /v-if="latestVersionName"/);
    assert.match(updateCheckerHtml, /v-if="updateAvailable"/);
    assert.match(updateCheckerHtml, /@click="downloadAndInstallUpdate"/);
    assert.match(updateCheckerHtml, /downloadProgress/);
});

test("NativeStoragePlugin has installApk method", () => {
    assert.match(java, /public void installApk/);
    assert.match(java, /FileProvider\.getUriForFile/);
    assert.match(java, /Intent\.ACTION_VIEW/);
    assert.match(java, /application\/vnd\.android\.package-archive/);
});
