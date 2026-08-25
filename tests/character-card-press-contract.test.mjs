import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, css] = await Promise.all([
    readFile(new URL('../src/components/views/CharacterPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8')
]);

test('index.html wires press animation handlers on both character card grids', () => {
    const mobileGrid = html.slice(html.indexOf('Mobile View (Grid)'), html.indexOf('Desktop View (Grid)'));
    const desktopGrid = html.slice(html.indexOf('Desktop View (Grid)'));
    for (const section of [mobileGrid, desktopGrid]) {
        assert.ok(section.includes('@pointerdown="beginCharacterCardPress"'));
        assert.ok(section.includes('@pointerup="endCharacterCardPress"'));
        assert.ok(section.includes('@pointercancel="endCharacterCardPress"'));
        assert.ok(section.includes('@pointerleave="endCharacterCardPress"'));
    }
});

test('app.js defines card press state and exposes handlers', () => {
    assert.ok(app.includes('const characterCardPressStates = new WeakMap();'));
    assert.ok(app.includes('const beginCharacterCardPress = (event) => {'));
    assert.ok(app.includes('const endCharacterCardPress = (event) => {'));
    assert.ok(app.includes('is-card-pressing'));
    assert.ok(app.includes('is-card-releasing'));
    assert.ok(app.includes('beginCharacterCardPress, endCharacterCardPress, toggleCharacterFavorite'));
});

test('styles.css provides press/release animations', () => {
    assert.ok(css.includes('.char-grid-item.is-card-pressing'));
    assert.ok(css.includes('transform: scale(0.94)'));
    assert.ok(css.includes('.char-grid-item.is-card-releasing'));
    assert.ok(css.includes('transform: scale(1)'));
});
