import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Phase 4.3 startup performance: the critical path to first chat paint is
// loadData() -> session restore. Everything display-only (quota/model/status
// probes, author notice, embedding autoload) runs after it, and loadData's
// storage reads are issued as one parallel batch.

const read = (url) => readFile(url, 'utf8').then((s) => s.replace(/\r\n/g, '\n'));

test('useDataLoader batches all storage reads into a single Promise.all', async () => {
    const src = await read(new URL('../src/composables/useDataLoader.mjs', import.meta.url));
    // strip comment lines so the deprecated recent_times note does not match
    const code = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.ok(code.includes('await Promise.all(['), 'storage reads are issued as one parallel batch');
    const awaitedReads = code.match(/await\s+getStoredValue\(/g) || [];
    assert.equal(awaitedReads.length, 0, `no per-key awaited reads remain (found ${awaitedReads.length})`);
    const batchedReads = code.match(/\n\s+getStoredValue\('/g) || [];
    assert.ok(batchedReads.length >= 19, `all reads live in the parallel batch (found ${batchedReads.length})`);
});

test('author-notice check runs after session restore (non-blocking for chat paint)', async () => {
    const app = await read(new URL('../src/modules/app.mjs', import.meta.url));
    const restoreIdx = app.indexOf('// Restore Last Active Session');
    const noticeIdx = app.indexOf("getStoredValue('author_notice_seen')");
    assert.ok(restoreIdx > 0, 'restore marker present');
    assert.ok(noticeIdx > restoreIdx, 'author notice check must come after the restore chain');
});

test('display-only network probes run after the restore chain', async () => {
    const app = await read(new URL('../src/modules/app.mjs', import.meta.url));
    const restoreIdx = app.indexOf('// Restore Last Active Session');
    const afterRestore = app.slice(restoreIdx);
    for (const marker of ['fetchQuota();', 'fetchAllConfiguredProviderModels();', 'checkAllStatuses();']) {
        assert.ok(afterRestore.includes(marker), `${marker} must run after session restore`);
    }
});

test('local embedding autoload is deferred off the startup chain and idle-scheduled', async () => {
    const app = await read(new URL('../src/modules/app.mjs', import.meta.url));
    const defIdx = app.indexOf('const scheduleLocalEmbeddingAutoload = () => {');
    assert.ok(defIdx > 0, 'embedding autoload scheduler must be defined in app.mjs');
    const callIdx = app.indexOf('scheduleLocalEmbeddingAutoload();');
    assert.ok(callIdx > defIdx, 'embedding autoload scheduler must be invoked after its definition');
    const scheduler = app.slice(defIdx, callIdx);
    assert.ok(scheduler.includes('requestIdleCallback'),
        'scheduler must prefer a browser idle slot before loading the WASM weights');
    assert.match(scheduler, /if \(isConversationBusy\.value\)/,
        'scheduler must defer the load while a conversation is generating');
    assert.match(scheduler, /setTimeout\(attempt, 2000\)/,
        'scheduler must retry after a delay while the conversation stays busy');
    assert.ok(!scheduler.includes('setTimeout(() => { ensureLocalEmbeddingReady(); }, 3000)'),
        'the fixed 3s embedding timer must be gone');
});
