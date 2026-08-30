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

const [buildInfoJava, mainActivityJava] = await Promise.all([
    readFile(new URL("../android/app/src/main/java/com/roleplayhub/app/BuildInfoPlugin.java", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/java/com/roleplayhub/app/MainActivity.java", import.meta.url), "utf8"),
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
    assert.match(checker, /checkForUpdate/);
    assert.match(checker, /downloadApk/);
    assert.match(checker, /saveAndInstallApk/);
    assert.match(checker, /Litishs\/Roleplay-Hub/);
    // Latest release body (GitHub release notes) must be surfaced for display
    assert.match(checker, /body:\s*data\.body\s*\|\|\s*""/);
});

test("app.js renders release notes inline for the settings-footer card", () => {
    assert.match(app, /const checkForUpdates = async/);
    assert.match(app, /const downloadAndInstallUpdate = async/);
    assert.match(app, /RPHUpdateChecker/);
    // Release body is converted to sanitized HTML for the inline update card
    assert.match(app, /const renderReleaseNotesHtml/);
    assert.match(app, /DOMPurify\.sanitize/);
    assert.match(app, /updateInfo\.value = result\.release/);
    // The modal no longer exists: release notes render inline, not via a modal
    assert.ok(!/showReleaseNotesModal/.test(app), "release-notes modal helper removed");
    assert.ok(!/releaseNotesModal/.test(app), "release-notes modal state removed");
    // Update display state lives in useUiState (Phase 2); app.mjs keeps the logic
    assert.match(uiState, /const latestVersionName = ref/);
    assert.match(uiState, /const downloadingUpdate = ref/);
    assert.match(uiState, /const downloadProgress = ref/);
    assert.match(app, /const uiState = useUiState\(\);/);
    assert.match(app, /checkForUpdates, checkingUpdate, updateAvailable, updateInfo, latestVersionName, downloadingUpdate, downloadProgress, downloadAndInstallUpdate,/);
    assert.match(app, /updateNoticeDismissedToday, dismissUpdateNoticeToday, renderReleaseNotesHtml,/);
});

test("app.js startup auto-check is silent (no modal) and restores today's dismiss flag", () => {
    assert.match(app, /setTimeout\(async function\(\)/);
    assert.match(app, /checkForUpdates\(false\)/);
    assert.match(app, /update_notice_dismiss_date/);
    assert.match(app, /5000\)/);
});

test("app.js offers a per-day dismiss that persists the date", () => {
    assert.match(app, /const dismissUpdateNoticeToday =/);
    assert.match(app, /setStoredValue\('update_notice_dismiss_date'/);
    assert.match(uiState, /const updateNoticeDismissedToday = ref/);
});

test("build type (release/debug) is bridged from native to the version footer", () => {
    // Native side exposes the build type
    assert.match(buildInfoJava, /@CapacitorPlugin\(name = "BuildInfo"\)/);
    assert.match(buildInfoJava, /public void getBuildType\(PluginCall call\)/);
    assert.match(buildInfoJava, /ApplicationInfo\.FLAG_DEBUGGABLE/);
    // Plugin is registered in MainActivity
    assert.match(mainActivityJava, /registerPlugin\(BuildInfoPlugin\.class\)/);
    // JS reads it into useUiState and exposes it to the template
    assert.match(uiState, /const appBuildType = ref/);
    assert.match(app, /appBuildType\.value = String\(typeResult\?\.buildType/);
    assert.match(app, /appVersionName, appVersionCode, appBuildType, checkForUpdates/);
});

test("UpdateChecker.vue shows an inline update card with dismiss + install, plus version footer", () => {
    // Inline announcement card gates on update availability and today's dismiss
    assert.match(updateCheckerHtml, /v-if="updateAvailable && !updateNoticeDismissedToday"/);
    assert.match(updateCheckerHtml, /@click="dismissUpdateNoticeToday"/);
    assert.match(updateCheckerHtml, /v-html="renderReleaseNotesHtml\(updateInfo && updateInfo\.body\)"/);
    // The update button must invoke download with no event argument so the
    // retry-count default (2) is not clobbered by the click event object.
    assert.match(updateCheckerHtml, /@click="downloadAndInstallUpdate\(\)"/);
    assert.match(updateCheckerHtml, /downloadProgress/);
    // Footer still has the manual check button and build type
    assert.match(updateCheckerHtml, /@click="checkForUpdates\(true\)"/);
    assert.match(updateCheckerHtml, /v-if="appBuildType"/);
    assert.match(updateCheckerHtml, /\(\{\{ appBuildType \}\}\)<\/span>/);
});

test("release notes modal component is fully removed from the app", () => {
    assert.ok(!/ReleaseNotesModal/.test(app), "no ReleaseNotesModal import in app.mjs");
    assert.ok(!/release-notes-modal/.test(app), "no release-notes-modal registration in app.mjs");
    assert.ok(!html.includes('<release-notes-modal>'), "index.html no longer mounts release-notes-modal");
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
