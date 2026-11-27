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
    assert.match(module, /dawn: \{ light: 'assets\/img\/bg-dawn-light\.svg', dark: 'assets\/img\/bg-dawn-dark\.svg' \}/);
    assert.match(module, /sea: \{ light: 'assets\/img\/bg-sea-light\.svg', dark: 'assets\/img\/bg-sea-dark\.svg' \}/);
    for (const file of ['bg-dawn-light', 'bg-dawn-dark', 'bg-sea-light', 'bg-sea-dark']) {
        const svg = await read(`assets/img/${file}.svg`);
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${file} is an SVG`);
        assert.ok(svg.length < 40 * 1024, `${file} stays small (${svg.length} bytes)`);
    }
});

test('legacy preset choices keep resolving after the 2026-11-27 rework', async () => {
    const module = await read('src/modules/page-background.mjs');
    // aurora/dune were replaced by dawn/sea; a choice persisted by an older
    // build must map to its successor instead of degrading to 'off'.
    assert.match(module, /const LEGACY_CHOICE_MAP = Object\.freeze\(\{ aurora: 'dawn', dune: 'sea' \}\);/);
    assert.match(module, /return LEGACY_CHOICE_MAP\[value\] \|\| 'off';/);
    assert.doesNotMatch(module, /'aurora', 'dune'/, 'the old ids are no longer advertised choices');
});

test('the settings row offers the reworked presets', async () => {
    const panel = await read('src/components/settings/AdvancedSettings.vue');
    assert.match(panel, /value: 'dawn', label: '霞暮'/);
    assert.match(panel, /value: 'sea', label: '幽澜'/);
    assert.doesNotMatch(panel, /value: 'aurora'|value: 'dune'/, 'the old option rows are gone');
});

test('the custom background is stored verbatim, with no size limit', async () => {
    const module = await read('src/modules/page-background.mjs');
    // 2026-11-26 review: no resize, no re-encode, no byte cap — the display
    // layer paints fill-first (cover), so any picture works as it is.
    assert.doesNotMatch(module, /MAX_EDGE|MAX_BYTES|JPEG_QUALITY/, 'the compression constants are gone');
    assert.doesNotMatch(module, /fitWithin|compressToJpeg/, 'the compression helpers are gone');
    assert.doesNotMatch(module, /createElement\('canvas'\)|toDataURL\(/, 'the image is never re-encoded');

    // The pipeline is a plain verbatim copy: read the file, write it, resolve it.
    assert.match(module, /const applyCustomBackground = async \(file\) => \{\s*if \(!file\) throw new Error\('没有选择图片'\);/);
    assert.match(module, /startsWith\('image\/'\)/, 'non-image files are still rejected');
    assert.match(module, /const dataUrl = await readAsDataUrl\(file\);\s*await writeCustomBackground\(dataUrl\);/);

    // The stored file keeps a fixed image name so the native webserver serves
    // an image/* mime; decoders sniff the real format from the magic bytes.
    assert.match(module, /BACKGROUND_FILE = 'page-background\.jpg'/);
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

test('the packaging step copies the preset images into dist', async () => {
    // They are referenced by URL, not imported, so Vite never emits them. The
    // dev server serves the tree directly, which hides the bug: the presets work
    // in the browser and 404 only in the packaged app.
    const script = await read('scripts/build-web.mjs');
    assert.match(script, /await copyToDist\('assets\/img'\)/, 'assets/img must be copied into dist');
});
