import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
const toggleSrc = (source.match(/const toggleChatFullscreen = async \(\) => \{[\s\S]*?\n        \};/) || [''])[0];

test('chat fullscreen exit branch is keyed on UI state, not the native element', () => {
    // Regression: in WebViews where requestFullscreen silently no-ops,
    // fullscreenElement never becomes truthy. The old guard
    // `if (getNativeFullscreenElement())` then made the toggle impossible to
    // exit once the layout fullscreen state was entered.
    assert.ok(toggleSrc.length > 0, 'toggleChatFullscreen is defined');
    assert.match(toggleSrc, /if \(isChatFullscreen\.value\) \{[\s\S]*?isChatFullscreen\.value = false;/);
    const uiGuard = toggleSrc.indexOf('if (isChatFullscreen.value)');
    const nativeGuard = toggleSrc.indexOf('if (getNativeFullscreenElement())');
    assert.ok(uiGuard !== -1 && nativeGuard !== -1 && uiGuard < nativeGuard, 'UI state guard precedes native element guard');
});

test('layout fullscreen is committed before the native request and survives its failure', () => {
    assert.ok(toggleSrc.indexOf('isChatFullscreen.value = true;') < toggleSrc.indexOf('await requestNativeFullscreen'));
    assert.match(toggleSrc, /catch \(err\) \{[\s\S]*?console\.error\('Request native fullscreen failed:/);
});

test('fullscreenchange listeners keep native and UI state in sync and are removed on unmount', () => {
    assert.match(source, /document\.addEventListener\('fullscreenchange', syncChatFullscreenState\)/);
    assert.match(source, /document\.addEventListener\('webkitfullscreenchange', syncChatFullscreenState\)/);
    assert.match(source, /document\.removeEventListener\('fullscreenchange', syncChatFullscreenState\)/);
});