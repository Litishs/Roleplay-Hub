import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, updateCheckerHtml, releaseNotesHtml, app, checker, java, uiState] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/UpdateChecker.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/ReleaseNotesModal.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/update-checker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java", import.meta.url), "utf8"),
    readFile(new URL("../src/composables/useUiState.mjs", import.meta.url), "utf8"),
]);

// RoleplayDatabase.java holds the SQLite upgrade handler used to verify that an
// in-app APK upgrade never wipes persisted user data.
const databaseJava = await readFile(
    new URL("../android/app/src/main/java/com/roleplayhub/app/RoleplayDatabase.java", import.meta.url),
    "utf8"
);

test("index.html uses Vite module entry point", () => {
    assert.ok(html.includes('<script type="module" src="/src/main.js">'), "Vite module entry should be present");
});

test("update-checker.js fetches release body for display", () => {
    assert.match(checker, /export { compareVersions, checkForUpdate/);
    assert.match(checker, /export { compareVersions, checkForUpdate/);
    assert.match(checker, /checkForUpdate/);
    assert.match(checker, /downloadApk/);
    assert.match(checker, /saveAndInstallApk/);
    assert.match(checker, /Litishs\/Roleplay-Hub/);
    // Latest release body (GitHub release notes) must be surfaced for display
    assert.match(checker, /body:\s*data\.body\s*\|\|\s*""/);
});

test("app.js renders release notes and shows them in the modal", () => {
    assert.match(app, /const checkForUpdates = async/);
    assert.match(app, /const downloadAndInstallUpdate = async/);
    assert.match(app, /RPHUpdateChecker/);
    // Release body is converted to sanitized HTML and shown via the release-notes modal
    assert.match(app, /const renderReleaseNotesHtml/);
    assert.match(app, /DOMPurify\.sanitize/);
    assert.match(app, /showReleaseNotesModal\(/);
    assert.match(app, /result\.release\.body/);
    // ReleaseNotesModal component is registered and mounted
    assert.match(app, /import ReleaseNotesModal from/);
    assert.match(app, /'release-notes-modal': ReleaseNotesModal/);
    assert.match(html, /<release-notes-modal><\/release-notes-modal>/);
    // Update display state lives in useUiState (Phase 2); app.mjs keeps the logic
    assert.match(uiState, /const latestVersionName = ref/);
    assert.match(uiState, /const downloadingUpdate = ref/);
    assert.match(uiState, /const downloadProgress = ref/);
    assert.match(uiState, /const releaseNotesModal = ref/);
    assert.match(uiState, /const showReleaseNotesModal =/);
    assert.match(app, /const uiState = useUiState\(\);/);
    assert.match(app, /checkForUpdates, checkingUpdate, updateAvailable, updateInfo, latestVersionName, downloadingUpdate, downloadProgress, downloadAndInstallUpdate,/);
    assert.match(app, /releaseNotesModal, showReleaseNotesModal, renderReleaseNotesHtml,/);
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

test("ReleaseNotesModal.vue renders sanitized release notes with update/later actions", () => {
    assert.match(releaseNotesHtml, /v-if="releaseNotesModal\.show"/);
    assert.match(releaseNotesHtml, /v-html="releaseNotesModal\.html"/);
    assert.match(releaseNotesHtml, /releaseNotesModal\.onConfirm/);
    assert.match(releaseNotesHtml, /releaseNotesModal\.onCancel/);
    assert.match(releaseNotesHtml, /发现新版本/);
});

test("auto-update installs APK without wiping user data", () => {
    // installApk launches the system package installer via ACTION_VIEW — it never
    // touches app storage, so a same-package APK upgrade preserves user data.
    assert.match(java, /public void installApk/);
    assert.match(java, /FileProvider\.getUriForFile/);
    assert.match(java, /Intent\.ACTION_VIEW/);
    assert.match(java, /application\/vnd\.android\.package-archive/);
    // The SQLite upgrade handler only adds tables; it never drops or clears data.
    assert.match(databaseJava, /void onUpgrade\(SQLiteDatabase/);
    assert.ok(!/DROP TABLE/.test(databaseJava), 'onUpgrade must not drop tables');
    assert.ok(!/DELETE FROM/.test(databaseJava), 'database must not delete rows on upgrade');
});
