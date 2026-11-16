// Contract test: v6 memory view (L1).
//
// buildMemoryView must be a pure function (no storage / network / Vue) and
// derive everything from the ledger + the current live turn projection:
// long/short folding, TOC labels, the MemoryPanel batches projection and
// budget truncation (v6 design doc §5).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMemoryView, VIEW_DEFAULTS } from '../src/modules/memory-view.mjs';
import { estimateTokens } from '../src/modules/utils.mjs';

const viewSource = await readFile(new URL('../src/modules/memory-view.mjs', import.meta.url), 'utf8');

const digest = (id, text, covers, meta = {}) => ({
    id,
    kind: 'digest',
    level: 0,
    covers,
    base: [],
    text,
    meta: { at: 0, model: '', tokens: 0, stale: false, folded: false, legacy: false, ...meta }
});

const turnIndexFor = (turns) => new Map(turns.flatMap(([id, turn]) => [[id, turn]]));

test('memory view: module is pure (no I/O, no Vue, no globals)', () => {
    assert.ok(!viewSource.includes('localStorage'));
    assert.ok(!viewSource.includes('fetch('));
    assert.ok(!viewSource.includes("from 'vue'"));
    assert.ok(!viewSource.includes('indexedDB'));
    assert.ok(!viewSource.includes('setTimeout'));
});

test('memory view: long folds all digests, short takes the newest window', () => {
    const ledger = {
        entries: [
            digest('e1', '甲段', [{ id: 'u1', h: 'h' }]),
            digest('e2', '乙段', [{ id: 'u2', h: 'h' }]),
            digest('e3', '丙段', [{ id: 'u3', h: 'h' }]),
            digest('e4', '丁段', [{ id: 'u4', h: 'h' }])
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4]]), { shortDigestCount: 2 });
    assert.equal(view.long, '甲段\n\n乙段\n\n丙段\n\n丁段', 'story order old -> new');
    assert.equal(view.short, '丙段\n\n丁段');
    assert.deepEqual(view.batches.map(b => [b.fromTurn, b.toTurn, b.status]), [[1, 1, 'done'], [2, 2, 'done'], [3, 3, 'done'], [4, 4, 'done']]);
    assert.deepEqual(view.toc.map(item => item.label), ['第 1 轮', '第 2 轮', '第 3 轮', '第 4 轮']);
    assert.equal(view.toc[0].entryId, 'e1');
});

test('memory view: stale / vanished / text-less entries never reach the prompt', () => {
    const ledger = {
        entries: [
            digest('live', '保留', [{ id: 'u1', h: 'h' }]),
            digest('stale', '失效', [{ id: 'u2', h: 'h' }], { stale: true }),
            digest('vanished', '消息已删', [{ id: 'gone', h: 'h' }]),
            digest('adopted-coverage', '', [{ id: 'u3', h: 'h' }], { legacy: true })
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3]]));
    assert.equal(view.long, '保留');
    assert.equal(view.short, '保留');
    assert.deepEqual(view.batches.map(b => b.fromTurn), [1], 'coverage-only legacy rows stay out of the panel projection');
});

test('memory view: budgets hard-truncate long/short/toc', () => {
    const longText = '甲'.repeat(200);
    const ledger = { entries: [digest('e1', longText, [{ id: 'u1', h: 'h' }])] };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1]]), { longBudget: 10, shortBudget: 10, tocBudget: 1 });
    // Truncation is enforced against the same token estimate the prompt
    // budget uses, so CJK text cannot overshoot a fixed char cap.
    assert.ok(estimateTokens(view.long) <= 10, 'long truncated to the token budget');
    assert.ok(view.long.endsWith('…'));
    assert.ok(estimateTokens(view.short) <= 10);
    assert.deepEqual(view.toc, [], 'toc rows beyond the budget are dropped');
    assert.equal(VIEW_DEFAULTS.longBudget > 0, true);
});

test('memory view: turn labels re-project from live data (no persisted skew)', () => {
    const ledger = { entries: [digest('e1', '内容', [{ id: 'u9', h: 'h' }])] };
    const before = buildMemoryView(ledger, turnIndexFor([['u9', 3]]));
    const after = buildMemoryView(ledger, turnIndexFor([['u9', 2]]));
    assert.equal(before.toc[0].label, '第 3 轮');
    assert.equal(after.toc[0].label, '第 2 轮', 'a deleted floor shifts the label without touching storage');
    assert.equal(before.batches[0].fromTurn, 3);
    assert.equal(after.batches[0].fromTurn, 2);
});

test('memory view: pins project by kind and never go through digests', () => {
    const ledger = {
        entries: [
            { id: 'p1', kind: 'pin', level: 0, covers: [], base: [], text: '置顶记忆', meta: { at: 1, stale: false, folded: false } },
            { id: 'p2', kind: 'pin', level: 0, covers: [], base: [], text: '', meta: { at: 2, stale: false, folded: false } }
        ]
    };
    const view = buildMemoryView(ledger, new Map());
    assert.deepEqual(view.pins, ['置顶记忆'], 'empty pins are dropped');
    assert.deepEqual(view.card, { characters: [], openPlots: [] });
    assert.equal(view.long, '');
});

test('memory view: empty ledger folds to an empty view', () => {
    const view = buildMemoryView(null, null);
    assert.equal(view.long, '');
    assert.equal(view.short, '');
    assert.deepEqual(view.toc, []);
    assert.deepEqual(view.batches, []);
    assert.deepEqual(view.pins, []);
    assert.deepEqual(view.tokens, { long: 0, short: 0, toc: 0 });
});