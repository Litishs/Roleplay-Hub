// Contract for the 2026-11-26 review pass on the advanced settings panel:
//
// - the four switches form a two-column grid (also on phones) with the label
//   on the left and the switch on the right, and every switch uses the
//   primary blue instead of the indigo accent;
// - the parameters grid pairs 界面字体 with 外观主题 in one row and puts the
//   page background in the row below, with the font-size slider compressed to
//   the narrow column next to it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the advanced switches are a two-column grid with the label left of the switch', async () => {
    const panel = await read('src/components/settings/AdvancedSettings.vue');
    assert.match(panel,
        /<!-- Settings Toggles Grid: always two columns; label left, switch right\. -->\s*<div class="grid grid-cols-2 gap-3">/,
        'the grid is two columns on phones too');

    const labelBlocks = panel.match(/<label[\s\S]*?<\/label>/g) || [];
    for (const key of ['autoFetchModels', 'stream', 'useCharacterBackground', 'immersiveMode']) {
        const block = labelBlocks.find((text) => text.includes(`settings.${key}`));
        assert.ok(block, `the ${key} row exists`);
        const labelAt = block.indexOf('flex-1 min-w-0');
        const inputAt = block.indexOf('settings-toggle-input');
        assert.ok(labelAt >= 0 && labelAt < inputAt, `${key}: label on the left, switch on the right`);
        assert.match(block, /<div class="settings-toggle"><\/div>/, `${key} uses the base (primary blue) switch`);
    }
});

test('the indigo switch variant is fully retired in favour of the primary blue', async () => {
    for (const path of ['src/components/settings/AdvancedSettings.vue', 'src/components/settings/TtsSettings.vue']) {
        const source = await read(path);
        assert.doesNotMatch(source, /settings-toggle--indigo/, `${path} dropped the indigo modifier`);
    }
    const css = await read('assets/css/styles.css');
    assert.doesNotMatch(css, /settings-toggle--indigo/, 'the indigo variant rule is removed');
    // The base checked state is the primary blue both panels now fall back to.
    assert.match(css, /\.settings-toggle-input:checked \+ \.settings-toggle \{\s*background: #2563eb;/);
});

test('the parameters grid pairs font/theme and compresses the font-size column', async () => {
    const panel = await read('src/components/settings/AdvancedSettings.vue');
    // Row one: 界面字体 + 外观主题 side by side, on phones too (no md: prefix).
    assert.match(panel, /<div class="grid grid-cols-2 gap-4">[\s\S]{0,2000}外观主题/,
        'font family and theme share the first row');

    // Row two: the font-size slider (now half-width) next to the page background.
    const rowTwoAt = panel.indexOf('<div class="grid grid-cols-2 gap-4 mt-4">');
    assert.ok(rowTwoAt > 0, 'the second row is a two-column grid');
    const rowTwo = panel.slice(rowTwoAt);
    const sizeAt = rowTwo.indexOf('对话字体大小');
    const backgroundAt = rowTwo.indexOf('界面底图');
    assert.ok(sizeAt > 0 && backgroundAt > sizeAt, 'font size comes before the page background');
    assert.doesNotMatch(panel, /md:col-span-2/, 'the background no longer spans the full width');
    // The label row survives the narrow card: the label never wraps mid-word.
    assert.match(panel, /flex flex-wrap items-center justify-between gap-y-1 mb-3/);

    // No size limit any more; the display layer fills (cover) automatically.
    assert.doesNotMatch(panel, /长边不超过|自动压缩/);
    assert.match(panel, /不限尺寸，自动填充铺满/);
});
