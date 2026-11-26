// M4 additions to the material contract: the page-background layer.
//
// Design record: documents/界面材质与页面底图工程方案.md §5.
//
// The user image is stored as a file in the app's private media/ directory,
// which the native backup packs wholesale — a background is personalised user
// data, so a backup is expected to carry it. Only the *choice* lives in settings.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the page background layer sits under the views and is theme-aware', async () => {
    const html = await read('index.html');
    // The layer must be a child of .app-main and come before .app-views, so the
    // views paint above it.
    const mainAt = html.indexOf('<div class="app-main');
    const bgAt = html.indexOf('<div class="page-bg"');
    const viewsAt = html.indexOf('<div class="app-views');
    assert.ok(mainAt >= 0 && bgAt > mainAt, 'the background lives inside .app-main');
    assert.ok(viewsAt > bgAt, 'the views come after the background so they paint above it');
    assert.match(html, /aria-hidden="true"/, 'the layer is decorative');

    const css = await read('assets/css/styles.css');
    const start = css.indexOf('.page-bg {');
    assert.ok(start > 0, 'the .page-bg rule must exist');
    const block = css.slice(start, css.indexOf('}', start));
    for (const declaration of ['position: absolute;', 'inset: 0;', 'z-index: 0;', 'pointer-events: none;',
        'opacity: 0;', 'background-size: cover;']) {
        assert.ok(block.includes(declaration), `.page-bg must declare ${declaration}`);
    }
    assert.match(css, /\.page-bg\.is-on \{\s*opacity: 1;/, 'it fades in only when a background is chosen');
    // The scrim is the contrast floor: arbitrary user photos must not break text.
    assert.match(css, /\.page-bg::after \{[\s\S]{0,140}background: rgba\(255, 255, 255, 0\.15\);/, 'light scrim');
    assert.match(css, /\[data-theme='dark'\] \.page-bg::after \{\s*background: rgba\(0, 0, 0, 0\.5\);/, 'dark scrim');
    // Presets ship theme-matched artwork, so they need a weaker scrim.
    assert.match(css, /\.page-bg\.is-preset::after \{\s*background: rgba\(255, 255, 255, 0\.06\);/);
    assert.match(css, /\[data-theme='dark'\] \.page-bg\.is-preset::after \{\s*background: rgba\(0, 0, 0, 0\.24\);/);
});

test('opaque view shells step aside only while a background is on', async () => {
    const css = await read('assets/css/styles.css');
    // Without this the artwork is invisible: .app-main and the list shells carry
    // their own opaque fill. The [data-page-bg] scope keeps the "off" state
    // byte-identical to the pre-M4 rendering.
    assert.match(css, /\[data-page-bg='on'\] \.app-main,[\s\S]{0,700}background-color: transparent !important;/);
    for (const shell of ['.conversation-list', '.management-view', '.tab-hub-view', '.chat-view-root']) {
        assert.ok(css.includes(`[data-page-bg='on'] ${shell}`), `${shell} must go transparent behind a background`);
    }

    const app = await read('src/modules/app.mjs');
    assert.match(app, /root\.dataset\.pageBg = 'on'/, 'the attribute is written when a background is active');
    assert.match(app, /delete root\.dataset\.pageBg/, 'and removed when it is not');
});

test('built-in presets ship one file per theme', async () => {
    const module = await read('src/modules/page-background.mjs');
    // A single light artwork would need a heavy overlay to survive dark mode;
    // two files let the artwork itself match the theme.
    assert.match(module, /aurora: \{ light: 'assets\/img\/bg-aurora-light\.svg', dark: 'assets\/img\/bg-aurora-dark\.svg' \}/);
    assert.match(module, /dune: \{ light: 'assets\/img\/bg-dune-light\.svg', dark: 'assets\/img\/bg-dune-dark\.svg' \}/);
    for (const file of ['bg-aurora-light', 'bg-aurora-dark', 'bg-dune-light', 'bg-dune-dark']) {
        const svg = await read(`assets/img/${file}.svg`);
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${file} is an SVG`);
        assert.ok(svg.length < 40 * 1024, `${file} stays small (${svg.length} bytes)`);
    }
});

test('the custom background is compressed to a bounded JPEG', async () => {
    const module = await read('src/modules/page-background.mjs');
    // Longest edge, not width: a portrait photo would otherwise stay huge.
    assert.match(module, /MAX_EDGE = 1080/);
    assert.match(module, /MAX_BYTES = 500 \* 1024/);
    assert.match(module, /const fitWithin = /);
    assert.match(module, /const longest = Math\.max\(safeWidth, safeHeight\);/);
    assert.match(module, /if \(longest <= maxEdge\) return/, 'small images are never upscaled');
    // Re-encoding as JPEG is what actually shrinks the file.
    assert.match(module, /toDataURL\('image\/jpeg'/);
    assert.match(module, /\[JPEG_QUALITY, 0\.65, 0\.5\]/, 'quality steps down when the cap is missed');

    // Pure geometry, testable without a DOM.
    const { fitWithin } = await import('../src/modules/page-background.mjs');
    assert.deepEqual(fitWithin(4000, 3000), { width: 1080, height: 810 });
    assert.deepEqual(fitWithin(3000, 4000), { width: 810, height: 1080 }, 'portrait scales on the long edge');
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 }, 'small images are never upscaled');
    assert.deepEqual(fitWithin(1080, 5000), { width: 233, height: 1080 });
});

test('the custom background is a file, and it travels with the backup', async () => {
    const module = await read('src/modules/page-background.mjs');
    // The image must never enter settings: the settings object is persisted
    // key-by-key on every autosave, so a data URL there would be rewritten
    // constantly and bloat the row.
    assert.match(module, /BACKGROUND_FILE = 'page-background\.jpg'/);
    assert.match(module, /Filesystem\.writeFile\(\{/);
    assert.match(module, /directory: DIRECTORY_DATA/);
    assert.doesNotMatch(module, /localStorage/, 'the image never goes through localStorage');

    // It lives in media/, which is exactly what the native backup packs: the
    // background is personalised user data, so a backup should carry it.
    assert.match(module, /BACKGROUND_DIRECTORY = 'media'/);
    const native = await read('android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java');
    assert.match(native, /MEDIA_DIRECTORY = "media";/);
    assert.match(native, /addDirectoryToZip\(zip, mediaDirectory, "media", hashes\)/, 'the backup packs media/ wholesale');
    assert.match(native, /copyDirectory\(restoredMedia, stagedMedia\)/, 'restore brings media/ back');

    // settings stores the choice only.
    const settingsState = await read('src/composables/useSettingsState.mjs');
    assert.match(settingsState, /pageBackground: 'off'/, 'the choice defaults to off');
});

test('the settings row opens the picker before committing to a custom image', async () => {
    const panel = await read('src/components/settings/AdvancedSettings.vue');
    assert.match(panel, /界面底图/, 'the row is labelled');
    // Picking 自定义图片 must open the file dialog first: committing the choice
    // before a file exists would blank the current background.
    assert.match(panel, /if \(value === 'custom'\) \{[\s\S]{0,120}pageBackgroundInput\.value\?\.click\(\);[\s\S]{0,60}return;/,
        'custom opens the picker instead of switching');
    assert.match(panel, /@change="handlePageBackgroundSelection"/);
    // Removing the image also deletes the file, so no orphan is left behind.
    assert.match(panel, /@click="clearPageBackground\(\)"/);

    const app = await read('src/modules/app.mjs');
    assert.match(app, /const clearPageBackground = async \(\) => \{[\s\S]{0,400}await removeCustomBackground\(\);/, 'clearing deletes the file');
    // A missing file (restored settings without the image) degrades to off.
    assert.match(app, /if \(!url\) \{\s*settings\.pageBackground = 'off';/, 'a missing file falls back to off');
});

test('the background choice and its URL travel through the app context', async () => {
    const app = await read('src/modules/app.mjs');
    const ctx = app.slice(app.indexOf('const __ctx = {'));
    for (const entry of ['pageBackgroundUrl', 'pageBackgroundIsPreset', 'selectCustomPageBackground', 'clearPageBackground']) {
        assert.ok(ctx.slice(0, 5000).includes(entry), `${entry} must be exposed on __ctx`);
    }
    // Presets are per-theme, so a theme change has to re-resolve the artwork.
    assert.match(app, /watch\(\(\) => resolveTheme\(\), \(\) => \{[\s\S]{0,120}if \(pageBackgroundIsPreset\.value\) applyPageBackground\(\);/);
});
