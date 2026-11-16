// Contract test: v6 memory ledger (L1).
//
// The ledger is append-only and content-addressed: covers invalidation,
// upward stale propagation, turn projection (render-time only), GC and
// legacy adoption are all pure functions and are tested without storage or
// network mocks (v6 design doc §4/§6/§11/§17).
import assert from 'node:assert/strict';
import test from 'node:test';
import { HASH_VERSION } from '../src/modules/content-hash.mjs';
import {
    LEDGER_VERSION,
    adoptLegacySummaries,
    appendEntry,
    createEmptyLedger,
    filterLedgerForBranch,
    invalidateEntries,
    makeDigestEntry,
    normalizeEntry,
    normalizeLedger,
    projectCoveredRanges,
    pruneFoldedEntries,
    pruneRewrittenStaleEntries,
    rangesToDoneBatches,
    propagateStaleUpward
} from '../src/modules/memory-ledger.mjs';

const cover = (id, h) => ({ id, h });

const makeLedger = (...entries) => ({
    ...createEmptyLedger(),
    entries: entries.map(entry => normalizeEntry(entry))
});

test('ledger entry: normalize fills the schema and drops malformed data', () => {
    const entry = normalizeEntry({
        id: 'e1',
        kind: 'digest',
        covers: [{ id: 'm1', h: 'hash1' }, { id: '', h: 'x' }],
        base: ['e0', ''],
        text: '摘要',
        meta: { at: 5, model: 'm', tokens: 7 }
    });
    assert.equal(entry.id, 'e1');
    assert.equal(entry.kind, 'digest');
    assert.equal(entry.level, 0);
    assert.deepEqual(entry.covers, [cover('m1', 'hash1')], 'malformed covers dropped');
    assert.deepEqual(entry.base, ['e0']);
    assert.equal(entry.meta.stale, false);
    assert.equal(entry.meta.folded, false);
    assert.equal(normalizeEntry({ covers: [] }), null, 'entries without id are dropped');
    assert.equal(normalizeEntry(null), null);
});

test('ledger: hashVersion mismatch is a controlled full invalidation', () => {
    assert.equal(LEDGER_VERSION, 1);
    const stale = { version: 1, hashVersion: HASH_VERSION + 1, updatedAt: 9, entries: [{ id: 'old', covers: [] }] };
    const normalized = normalizeLedger(stale);
    assert.deepEqual(normalized.entries, []);
    assert.equal(normalized.hashVersion, HASH_VERSION);
    assert.equal(normalizeLedger(null), null);
    assert.equal(normalizeLedger({ entries: 'nope' }), null);
    const kept = normalizeLedger({ version: 1, hashVersion: HASH_VERSION, entries: [{ id: 'a', covers: [] }] });
    assert.equal(kept.entries.length, 1);
});

test('ledger: append never rewrites an existing entry', () => {
    const ledger = createEmptyLedger();
    const first = makeDigestEntry({ id: 'e1', covers: [cover('m1', 'h1')], text: 'first' });
    appendEntry(ledger, first);
    const snapshot = JSON.parse(JSON.stringify(ledger.entries[0]));
    appendEntry(ledger, makeDigestEntry({ id: 'e2', covers: [cover('m2', 'h2')], text: 'second' }));
    assert.deepEqual(ledger.entries[0], snapshot, 'earlier entry untouched');
    // Re-appending the same id is a no-op (append-only identity).
    appendEntry(ledger, makeDigestEntry({ id: 'e1', covers: [cover('m9', 'h9')], text: 'overwrite attempt' }));
    assert.equal(ledger.entries.length, 2);
    assert.equal(ledger.entries[0].text, 'first');
});

test('ledger: covers invalidation is exact (missing message / hash change)', () => {
    const ledger = makeLedger(
        { id: 'keep', covers: [cover('m1', 'h1')] },
        { id: 'hash-changed', covers: [cover('m2', 'old')] },
        { id: 'gone', covers: [cover('missing', 'h')] },
        { id: 'both', covers: [cover('m1', 'h1'), cover('missing', 'h')] }
    );
    const liveIndex = new Map([['m1', 'h1'], ['m2', 'new']]);
    const changed = invalidateEntries(ledger, liveIndex);
    assert.equal(changed, 3);
    const stale = Object.fromEntries(ledger.entries.map(entry => [entry.id, entry.meta.stale]));
    assert.deepEqual(stale, { keep: false, 'hash-changed': true, gone: true, both: true });
});

test('ledger: covers:[] is never invalidated (pin semantics)', () => {
    const ledger = makeLedger({ id: 'pin', kind: 'pin', covers: [], text: '用户置顶' });
    assert.equal(invalidateEntries(ledger, new Map()), 0);
    assert.equal(ledger.entries[0].meta.stale, false);
    assert.equal(propagateStaleUpward(ledger), 0);
});

test('ledger: stale propagates upward through base chains', () => {
    const ledger = makeLedger(
        { id: 'l0', covers: [cover('m1', 'old')] },
        { id: 'l1a', level: 1, base: ['l0'], covers: [cover('m1', 'old')] },
        { id: 'l1b', level: 1, base: [], covers: [cover('m2', 'h2')] },
        { id: 'l2', level: 2, base: ['l1a', 'l1b'] }
    );
    // l0 and l1a cover the changed message directly; l2 only through base.
    assert.equal(invalidateEntries(ledger, new Map([['m2', 'h2']])), 2);
    const changed = propagateStaleUpward(ledger);
    assert.equal(changed, 1, 'l2 goes stale through its base chain');
    const stale = Object.fromEntries(ledger.entries.map(entry => [entry.id, entry.meta.stale]));
    assert.deepEqual(stale, { l0: true, l1a: true, l1b: false, l2: true });
});

test('ledger: covered ranges project from live turn numbers and skip stale entries', () => {
    const ledger = makeLedger(
        { id: 'a', covers: [cover('m1', 'h1'), cover('m4', 'h4')] },
        { id: 'b', covers: [cover('m2', 'h2')], meta: { stale: true } },
        { id: 'c', kind: 'fact', covers: [cover('m3', 'h3')] }
    );
    const liveTurnIndex = new Map([['m1', 1], ['m2', 2], ['m3', 3], ['m4', 4]]);
    // Exact union of covered turns: m2 (stale) and m3 (fact) do not count,
    // and turns 2-3 stay uncovered between the two covered turns.
    assert.deepEqual(projectCoveredRanges(ledger, liveTurnIndex), [{ fromTurn: 1, toTurn: 1 }, { fromTurn: 4, toTurn: 4 }]);
    assert.deepEqual(rangesToDoneBatches([{ fromTurn: 1, toTurn: 4 }]), [{ fromTurn: 1, toTurn: 4, status: 'done' }]);
});

test('ledger: adopted union entries never paint over failed holes', () => {
    // Regression (acceptance finding): the level-1 legacy entry carries the
    // union of all done ranges. A min/max projection would turn 1-2 + 5-5
    // into 1-5 and the failed batch 3-4 would never be retried.
    const covers = [cover('u1', 'h'), cover('a1', 'h'), cover('u2', 'h'), cover('a2', 'h'), cover('u5', 'h'), cover('a5', 'h')];
    const ledger = makeLedger(
        { id: 'early', covers },
        { id: 'legacy', level: 1, covers }
    );
    const liveTurnIndex = new Map([['u1', 1], ['a1', 1], ['u2', 2], ['a2', 2], ['u5', 5], ['a5', 5]]);
    assert.deepEqual(projectCoveredRanges(ledger, liveTurnIndex), [{ fromTurn: 1, toTurn: 2 }, { fromTurn: 5, toTurn: 5 }]);
});

test('ledger: GC removes stale entries only after their turns were rewritten', () => {
    const liveTurnIndex = new Map([['m1', 1], ['m2', 2], ['m3', 3], ['m4', 4]]);
    const ledger = makeLedger(
        { id: 'rewritten', covers: [cover('m1', 'old')], meta: { stale: true } },
        { id: 'unrewritten', covers: [cover('m2', 'old')], meta: { stale: true } },
        { id: 'fresh1', covers: [cover('m1', 'new')] },
        { id: 'fresh2', covers: [cover('m3', 'h3')] }
    );
    const removed = pruneRewrittenStaleEntries(ledger, liveTurnIndex);
    assert.equal(removed, 1);
    assert.deepEqual(ledger.entries.map(entry => entry.id).sort(), ['fresh1', 'fresh2', 'unrewritten']);
    // A stale entry whose messages are all gone keeps its text: it is the
    // only surviving record of that history.
    ledger.entries.push(normalizeEntry({ id: 'orphan', covers: [cover('gone', 'h')], meta: { stale: true } }));
    pruneRewrittenStaleEntries(ledger, liveTurnIndex);
    assert.ok(ledger.entries.some(entry => entry.id === 'orphan'));
});

test('ledger: folded entries are capped by age', () => {
    const ledger = createEmptyLedger();
    for (let index = 0; index < 5; index += 1) {
        const entry = makeDigestEntry({ id: `f${index}`, covers: [], text: `t${index}`, at: 100 + index });
        entry.meta.folded = true;
        appendEntry(ledger, entry);
    }
    assert.equal(pruneFoldedEntries(ledger, 3), 2);
    assert.deepEqual(ledger.entries.map(entry => entry.id), ['f2', 'f3', 'f4']);
});

test('ledger: legacy adoption resolves done ranges into coverage entries', () => {
    const turnCovers = new Map([
        [1, [cover('u1', 'h1'), cover('a1', 'h1a')]],
        [2, [cover('u2', 'h2'), cover('a2', 'h2a')]],
        [5, [cover('u5', 'h5'), cover('a5', 'h5a')]]
    ]);
    let seq = 0;
    const makeId = () => `legacy-${++seq}`;
    const entries = adoptLegacySummaries({
        summaries: {
            long: '旧长期',
            short: '旧短期',
            batches: [
                { fromTurn: 1, toTurn: 2, status: 'done' },
                { fromTurn: 3, toTurn: 4, status: 'failed' },
                { fromTurn: 5, toTurn: 6, status: 'done' }
            ]
        },
        turnCovers,
        makeId,
        now: 42
    });
    // Two placeholder coverage entries (1-2, 5-6) + one level-1 text entry.
    assert.equal(entries.length, 3);
    const placeholders = entries.filter(entry => entry.level === 0);
    assert.equal(placeholders.length, 2);
    assert.ok(placeholders.every(entry => entry.text === '' && entry.meta.legacy));
    const partial = placeholders.find(entry => entry.covers.some(c => c.id === 'u5'));
    assert.equal(partial.meta.stale, true, 'partially resolved range is marked stale');
    const textEntry = entries.find(entry => entry.level === 1);
    assert.equal(textEntry.text, '旧长期\n\n旧短期');
    assert.ok(textEntry.covers.length >= 4, 'covers take the union of resolved done ranges');
});

test('ledger: adoption keeps long/short text when no coverage resolves', () => {
    const entries = adoptLegacySummaries({
        summaries: { long: '只有文本', short: '', batches: [] },
        turnCovers: new Map(),
        makeId: () => 'legacy-text',
        now: 1
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 1);
    assert.deepEqual(entries[0].covers, []);
    assert.equal(entries[0].text, '只有文本');
});

test('ledger: branch filter keeps only entries whose covers all survived', () => {
    const ledger = makeLedger(
        { id: 'early', covers: [cover('m1', 'h1')] },
        { id: 'crosses-fork', covers: [cover('m1', 'h1'), cover('m3', 'h3')] },
        { id: 'late', covers: [cover('m3', 'h3')] },
        { id: 'folded-early', level: 1, covers: [cover('m2', 'h2')] },
        { id: 'pin', kind: 'pin', covers: [], text: '置顶' }
    );
    const child = filterLedgerForBranch(ledger, new Set(['m1', 'm2']));
    assert.deepEqual(child.entries.map(entry => entry.id).sort(), ['early', 'folded-early', 'pin']);
    // The child gets its own mutable copy of the surviving entries.
    child.entries.find(entry => entry.id === 'early').meta.stale = true;
    assert.equal(ledger.entries.find(entry => entry.id === 'early').meta.stale, false);
});
test('ledger: adoption does not duplicate short text already inside long', () => {
    // Recovery from a projection: short is a suffix of long in L1, so the
    // merged legacy entry must keep the text once.
    const entries = adoptLegacySummaries({
        summaries: { long: '早期事件\n\n最近事件', short: '最近事件', batches: [] },
        turnCovers: new Map(),
        makeId: () => 'legacy-text',
        now: 1
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, '早期事件\n\n最近事件');
});
