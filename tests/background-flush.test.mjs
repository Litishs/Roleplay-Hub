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
    // Scoped memories only when dirty (no unchanged-blob rewrites).
    assert.match(body, /if \(_memoriesDirty\)/);
    assert.match(body, /if \(_classicMemoriesDirty\)/);
    assert.match(body, /saveMemoriesNow\(\)/);
    assert.match(body, /saveClassicMemoriesNow\(\)/);
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

test('memory mutations mark the scope dirty only after a completed load', () => {
    const from = app.indexOf('watch(memories, () => {');
    assert.ok(from >= 0, 'memories dirty watcher exists');
    const chunk = app.slice(from, from + 200);
    assert.match(chunk, /if \(_memoriesLoaded\) _memoriesDirty = true;/);
    assert.match(chunk, /flush: 'sync'/, 'sync flush excludes load-time assignments');

    const classicFrom = app.indexOf('watch(classicMemories, () => {');
    assert.ok(classicFrom >= 0, 'classic memories dirty watcher exists');
    const classicChunk = app.slice(classicFrom, classicFrom + 220);
    assert.match(classicChunk, /if \(_classicMemoriesLoaded\) _classicMemoriesDirty = true;/);
    assert.match(classicChunk, /flush: 'sync'/);
});

test('memory saves clear the dirty flag up front and re-mark it on failure', () => {
    const from = app.indexOf('const saveMemoriesNow = async () => {');
    const to = app.indexOf('const saveClassicMemoriesNow', from);
    assert.ok(from >= 0 && to > from);
    assert.match(app.slice(from, to), /_memoriesDirty = false;/);
    assert.match(app.slice(from, to), /_memoriesDirty = true;/);

    const classicFrom = app.indexOf('const saveClassicMemoriesNow = async () => {');
    const classicTo = app.indexOf('const persistAvatarMedia', classicFrom);
    assert.ok(classicFrom >= 0 && classicTo > classicFrom);
    assert.match(app.slice(classicFrom, classicTo), /_classicMemoriesDirty = false;/);
    assert.match(app.slice(classicFrom, classicTo), /_classicMemoriesDirty = true;/);
});
