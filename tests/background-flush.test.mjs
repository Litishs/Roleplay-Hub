// Contract tests for the background flush pipeline: when the app is hidden
// or backgrounded, every pending persistence queue must be flushed before
// Android can kill the WebView renderer of a cached process — anything still
// in a debounce window or write queue at that moment is lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

test('flushAllPendingWrites orchestrates every pending persistence queue', () => {
    const from = app.indexOf('const flushAllPendingWrites = () => {');
    const to = app.indexOf('_flushInFlight = run().finally', from);
    assert.ok(from >= 0 && to > from, 'flush orchestrator exists');
    const body = app.slice(from, to);
    // Global kv state (characters/settings/presets/...) — 1s debounce.
    assert.match(body, /debouncedSave\.flush\(\)/);
    // Memory settings — 500ms debounce timer.
    assert.match(body, /_memorySettingsSaveTimer/);
    assert.match(body, /saveMemorySettingsNow\(\)/);
    // Token usage history + plugin marketplace write queues.
    assert.match(body, /tokenUsageSaveQueue/);
    assert.match(body, /pluginRegistry\.flushPersist/);
    // Chat history + active streaming draft (the previous background path).
    assert.match(body, /persistSingleDraft\(activeDraft\)/);
    assert.match(body, /flushPendingChatHistorySave\(\)/);
    // Scoped classic memories only when dirty (no unchanged-blob rewrites).
    // v6 L3: the vector memories queue was removed with the embedding stack.
    assert.match(body, /if \(_classicMemoriesDirty\)/);
    assert.match(body, /saveClassicMemoriesNow\(\)/);
    assert.doesNotMatch(body, /saveMemoriesNow\(\)/);
    // Concurrent triggers (appStateChange + visibilitychange) share one pass.
    assert.match(body, /if \(_flushInFlight\) return _flushInFlight/);
});

test('appStateChange background and resume both run the flush', () => {
    const from = app.indexOf("nativeAppStateListener = await nativeApp.addListener('appStateChange'");
    const to = app.indexOf('nativeBackButtonListener = await nativeApp.addListener', from);
    assert.ok(from >= 0 && to > from, 'appStateChange listener exists');
    const listener = app.slice(from, to);
    assert.equal(
        (listener.match(/flushAllPendingWrites\(\)/g) || []).length, 2,
        'background hide + resume catch-up both flush'
    );
    // The old inline chat-only background path must not come back.
    assert.doesNotMatch(listener, /Background chat save failed/);
});

test('web hide signals (visibilitychange/pagehide) also trigger the flush', () => {
    const from = app.indexOf("document.addEventListener('visibilitychange'");
    const to = app.indexOf('await loadData();', from);
    assert.ok(from >= 0 && to > from, 'hide-signal wiring exists before loadData');
    const wiring = app.slice(from, to);
    assert.match(wiring, /document\.visibilityState === 'hidden'/);
    assert.match(wiring, /window\.addEventListener\('pagehide'/);
    assert.equal(
        (wiring.match(/flushAllPendingWrites\(\)/g) || []).length, 2,
        'both web-standard hide signals flush'
    );
});

test('classic memory mutations mark the scope dirty only after a completed load', () => {
    const classicFrom = app.indexOf('watch(classicMemories, () => {');
    assert.ok(classicFrom >= 0, 'classic memories dirty watcher exists');
    const classicChunk = app.slice(classicFrom, classicFrom + 220);
    assert.match(classicChunk, /if \(_classicMemoriesLoaded\) _classicMemoriesDirty = true;/);
    assert.match(classicChunk, /flush: 'sync'/);
    // v6 L3: the vector memories watcher/save path is gone.
    assert.ok(!app.includes('watch(memories, () => {'));
    assert.ok(!app.includes('const saveMemoriesNow = async () => {'));
});

test('classic memory saves clear the dirty flag up front and re-mark it on failure', () => {
    const classicFrom = app.indexOf('const saveClassicMemoriesNow = async () => {');
    const classicTo = app.indexOf('const persistAvatarMedia', classicFrom);
    assert.ok(classicFrom >= 0 && classicTo > classicFrom);
    assert.match(app.slice(classicFrom, classicTo), /_classicMemoriesDirty = false;/);
    assert.match(app.slice(classicFrom, classicTo), /_classicMemoriesDirty = true;/);
});
