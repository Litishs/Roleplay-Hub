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
    COMPACT_FANOUT,
    COMPACT_FANOUT_MAX,
    COMPACT_FANOUT_MIN,
    FACT_KIND_CHARACTER,
    FACT_KIND_PLOT,
    LEDGER_VERSION,
    PIN_ENABLED_LIMIT,
    PIN_TEXT_LIMIT,
    adoptLegacyProfile,
    adoptLegacySummaries,
    appendEntry,
    appendProfileFacts,
    applyCompaction,
    countEnabledPins,
    createEmptyLedger,
    filterLedgerForBranch,
    invalidateEntries,
    makeDigestEntry,
    makeFactEntry,
    makePinEntry,
    normalizeEntry,
    normalizeLedger,
    projectCoveredRanges,
    pruneFoldedEntries,
    pruneRewrittenStaleEntries,
    rangesToDoneBatches,
    propagateStaleUpward,
    releaseOrphanedFolds,
    selectCompactionGroup,
    validatePinText
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

// --- v6 L4: fact / pin entries --------------------------------------------

test('ledger facts: makeFactEntry keeps the dedup key and manual flag', () => {
    const entry = makeFactEntry({
        id: 'f1',
        factKind: FACT_KIND_CHARACTER,
        factKey: '安娜',
        text: '受伤',
        covers: [cover('m1', 'h')],
        at: 5
    });
    assert.equal(entry.kind, 'fact');
    assert.equal(entry.meta.factKind, FACT_KIND_CHARACTER);
    assert.equal(entry.meta.factKey, '安娜');
    assert.equal(entry.meta.manual, false);
    assert.equal(entry.meta.enabled, true);
    assert.deepEqual(entry.covers, [cover('m1', 'h')]);
    const legacy = normalizeEntry({
        id: 'f2',
        kind: 'fact',
        covers: [],
        meta: { factKind: 'plot', factKey: '寻药', factStatus: 'closed', factDeadline: '三日后', manual: true }
    });
    assert.equal(legacy.meta.factStatus, 'closed');
    assert.equal(legacy.meta.factDeadline, '三日后');
    assert.equal(legacy.meta.manual, true);
});

test('ledger facts: profile delta appends and folds the previous row for a key', () => {
    const ledger = createEmptyLedger();
    let seq = 0;
    const makeId = () => `f${++seq}`;
    const coversA = [cover('m1', 'h1')];
    const coversB = [cover('m2', 'h2')];
    const first = appendProfileFacts(ledger, {
        characters: [{ name: '安娜', status: '受伤' }],
        openPlots: [{ summary: '寻药', status: 'open', deadline: '三日后' }]
    }, { covers: coversA, makeId, at: 1 });
    assert.equal(first, 2);
    const firstChar = ledger.entries.find(entry => entry.meta.factKind === 'character');
    assert.deepEqual(firstChar.covers, coversA);

    // Same key re-affirmed in a later batch: append (freshness = covers),
    // fold the previous row. Duplicate keys inside one batch collapse.
    const second = appendProfileFacts(ledger, {
        characters: [{ name: '安娜', status: '受伤' }, { name: '安娜', status: '痊愈' }],
        openPlots: []
    }, { covers: coversB, makeId, at: 2 });
    assert.equal(second, 1, 'deduped to one character row');
    const rows = ledger.entries.filter(entry => entry.meta.factKind === 'character');
    assert.equal(rows.filter(entry => !entry.meta.folded).length, 1);
    assert.equal(rows.find(entry => !entry.meta.folded).text, '痊愈');
    assert.deepEqual(rows.find(entry => !entry.meta.folded).covers, coversB);
    assert.equal(rows.filter(entry => entry.meta.folded).length, 1);
    // A key missing from this batch keeps its previous visible row.
    assert.equal(ledger.entries.filter(entry => entry.meta.factKind === 'plot' && !entry.meta.folded).length, 1);
});

test('ledger facts: manual lock skips automatic merges for the key', () => {
    const ledger = createEmptyLedger();
    appendEntry(ledger, makeFactEntry({
        id: 'manual',
        factKind: FACT_KIND_CHARACTER,
        factKey: '安娜',
        text: '被囚',
        covers: [],
        manual: true
    }));
    const appended = appendProfileFacts(ledger, {
        characters: [{ name: '安娜', status: '痊愈' }]
    }, { covers: [cover('m1', 'h')], makeId: () => 'auto', at: 2 });
    assert.equal(appended, 0);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].text, '被囚');
});

test('ledger facts: a blank character status is not treated as an update', () => {
    const ledger = createEmptyLedger();
    const appended = appendProfileFacts(ledger, {
        characters: [{ name: '安娜', status: '  ' }],
        openPlots: [{ summary: '' }]
    }, { covers: [], makeId: () => 'x' });
    assert.equal(appended, 0);
    assert.equal(ledger.entries.length, 0);
});

test('ledger facts: legacy profile adopts as unlocked covers:[] rows', () => {
    let seq = 0;
    const entries = adoptLegacyProfile({
        profile: {
            characters: [{ name: '安娜', status: '受伤' }],
            openPlots: [{ summary: '寻药', status: 'open', deadline: '三日后' }],
            relations: [{ from: 'a', to: 'b', relation: 'x' }]
        },
        makeId: () => `l${++seq}`,
        now: 9
    });
    assert.equal(entries.length, 2);
    assert.ok(entries.every(entry => entry.meta.legacy && !entry.meta.manual && entry.covers.length === 0));
    const plot = entries.find(entry => entry.meta.factKind === FACT_KIND_PLOT);
    assert.equal(plot.meta.factDeadline, '三日后');
    assert.equal(plot.text, '寻药');
    assert.equal(entries.some(entry => entry.meta.factKind === 'relation'), false);
});

test('ledger: profileAdopted survives normalization and branch filtering', () => {
    const raw = { version: 1, hashVersion: HASH_VERSION, entries: [], profileAdopted: true };
    assert.equal(normalizeLedger(raw).profileAdopted, true);
    assert.equal(createEmptyLedger().profileAdopted, false);
    const child = filterLedgerForBranch({ ...createEmptyLedger(), profileAdopted: true }, []);
    assert.equal(child.profileAdopted, true);
});

test('ledger pins: text limits and enabled counting', () => {
    assert.equal(PIN_TEXT_LIMIT, 500);
    assert.equal(PIN_ENABLED_LIMIT, 10);
    assert.equal(validatePinText('  '), '手动记忆内容不能为空');
    assert.equal(validatePinText('甲'.repeat(PIN_TEXT_LIMIT + 1)).includes(String(PIN_TEXT_LIMIT)), true);
    assert.equal(validatePinText('记住'), '');
    const ledger = createEmptyLedger();
    appendEntry(ledger, makePinEntry({ id: 'p1', text: '甲', at: 1 }));
    appendEntry(ledger, makePinEntry({ id: 'p2', text: '乙', enabled: false, at: 2 }));
    appendEntry(ledger, makePinEntry({ id: 'p3', text: '  ', at: 3 }));
    assert.equal(countEnabledPins(ledger), 1, 'disabled and blank pins do not count');
    assert.equal(ledger.entries[0].covers.length, 0);
    assert.equal(ledger.entries[0].meta.enabled, true);
});

// --- v6 L5: hierarchical compaction (design doc §9.1) ----------------------

const turnIndexForIds = (...ids) => new Map(ids.map((id, index) => [id, index + 1]));

const digestBatch = (count) => Array.from({ length: count }, (_, index) => makeDigestEntry({
    id: `e${index + 1}`,
    covers: [cover(`m${index + 1}`, 'h')],
    text: `段${index + 1}`,
    at: index + 1
}));

test('ledger compaction: over-full level folds the oldest fanout group', () => {
    assert.equal(COMPACT_FANOUT, 5);
    assert.equal(COMPACT_FANOUT_MIN, 4);
    assert.equal(COMPACT_FANOUT_MAX, 8);
    const liveIndex = turnIndexForIds('m1', 'm2', 'm3', 'm4', 'm5', 'm6');
    const six = makeLedger(...digestBatch(6));
    const group = selectCompactionGroup(six, liveIndex, { fanout: 5 });
    assert.equal(group.level, 0);
    assert.deepEqual(group.entries.map(entry => entry.id), ['e1', 'e2', 'e3', 'e4', 'e5'],
        'the newest entry stays flat so the short window keeps fresh detail');
    // Exactly at the threshold nothing folds.
    assert.equal(selectCompactionGroup(makeLedger(...digestBatch(5)), liveIndex, { fanout: 5 }), null);
    // A custom fanout is honored (the panel slider range).
    assert.equal(selectCompactionGroup(six, liveIndex, { fanout: 8 }), null);
});

test('ledger compaction: group order follows story position, not append order', () => {
    const entries = digestBatch(6);
    const reordered = makeLedger(entries[2], entries[0], entries[1], entries[3], entries[4], entries[5]);
    const liveIndex = turnIndexForIds('m1', 'm2', 'm3', 'm4', 'm5', 'm6');
    const group = selectCompactionGroup(reordered, liveIndex, { fanout: 5 });
    assert.deepEqual(group.entries.map(entry => entry.id), ['e1', 'e2', 'e3', 'e4', 'e5'],
        'stale rewrites append out of order; the fold must still take the oldest span');
});

test('ledger compaction: stale / folded / text-less / uncovered entries never count', () => {
    const entries = digestBatch(5);
    const base = [
        { ...entries[0], meta: { ...entries[0].meta, stale: true } },
        { ...entries[1], meta: { ...entries[1].meta, folded: true } },
        { ...entries[2], text: '   ' },
        { ...entries[3], covers: [] },
        ...entries.slice(4)
    ];
    const liveIndex = turnIndexForIds('m1', 'm2', 'm3', 'm4', 'm5');
    assert.equal(selectCompactionGroup(makeLedger(...base), liveIndex, { fanout: 5 }), null,
        'only one foldable entry remains, below the threshold');
    // Pins and facts are not digest folds.
    const ledger = makeLedger(
        makePinEntry({ id: 'p1', text: '自由文本', at: 1 }),
        makeFactEntry({
            id: 'f1',
            factKind: FACT_KIND_CHARACTER,
            factKey: '甲',
            text: '状态',
            covers: [cover('m1', 'h')],
            at: 1
        })
    );
    assert.equal(selectCompactionGroup(ledger, liveIndex, { fanout: 2 }), null);
});

test('ledger compaction: apply appends the parent, unions covers and folds sources', () => {
    const liveIndex = turnIndexForIds('m1', 'm2', 'm3', 'm4', 'm5', 'm6');
    const ledger = makeLedger(...digestBatch(6));
    const group = selectCompactionGroup(ledger, liveIndex, { fanout: 5 });
    const parent = applyCompaction(ledger, {
        entries: group.entries,
        text: '  压实的长期要点  ',
        id: 'fold-1',
        at: 50
    });
    assert.ok(parent);
    assert.equal(parent.kind, 'digest');
    assert.equal(parent.level, 1);
    assert.equal(parent.text, '压实的长期要点');
    assert.deepEqual(parent.base, ['e1', 'e2', 'e3', 'e4', 'e5']);
    assert.deepEqual(parent.covers.map(item => item.id), ['m1', 'm2', 'm3', 'm4', 'm5']);
    assert.ok(ledger.entries.filter(entry => parent.base.includes(entry.id)).every(entry => entry.meta.folded));
    assert.equal(ledger.entries.find(entry => entry.id === 'e6').meta.folded, false);
    // Duplicate id (would break append-only): nothing changes.
    const foldedBefore = ledger.entries.filter(entry => entry.meta.folded).length;
    assert.equal(applyCompaction(ledger, { entries: group.entries, text: '再来一次', id: 'fold-1' }), null);
    assert.equal(ledger.entries.filter(entry => entry.meta.folded).length, foldedBefore);
    // Empty body never creates a fold row.
    assert.equal(applyCompaction(ledger, { entries: group.entries, text: '  ', id: 'fold-2' }), null);
});

test('ledger compaction: duplicated covers are unioned without repeats', () => {
    const liveIndex = turnIndexForIds('m1', 'm2');
    const a = makeDigestEntry({ id: 'a', covers: [cover('m1', 'h'), cover('m2', 'h')], text: '甲', at: 1 });
    const b = makeDigestEntry({ id: 'b', covers: [cover('m2', 'h')], text: '乙', at: 2 });
    const ledger = makeLedger(a, b);
    const parent = applyCompaction(ledger, { entries: [a, b], text: '合并', id: 'fold' });
    assert.deepEqual(parent.covers.map(item => item.id), ['m1', 'm2']);
    assert.equal(parent.level, 1, 'level = max child level + 1');
    assert.ok(liveIndex.has('m2'), 'sanity');
});

test('ledger compaction: a stale parent releases its folded children', () => {
    const liveIndex = turnIndexForIds('m1', 'm2');
    const ledger = makeLedger(...digestBatch(2));
    const parent = applyCompaction(ledger, { entries: ledger.entries.slice(), text: '合并', id: 'fold' });
    assert.equal(parent.level, 1);
    assert.equal(releaseOrphanedFolds(ledger), 0, 'live parent keeps children folded');
    parent.meta.stale = true;
    assert.equal(releaseOrphanedFolds(ledger), 2, 'stale parent no longer represents them');
    assert.ok(ledger.entries.every(entry => entry.kind !== 'digest' || entry.meta.folded === false));
    assert.ok(liveIndex.has('m1'), 'sanity');
    // Fact folds are superseded by a newer key row, not by base[] — untouched.
    const factLedger = makeLedger(
        makeFactEntry({ id: 'f1', factKind: FACT_KIND_CHARACTER, factKey: '甲', text: '旧', covers: [], at: 1 })
    );
    factLedger.entries[0].meta.folded = true;
    assert.equal(releaseOrphanedFolds(factLedger), 0);
    assert.equal(factLedger.entries[0].meta.folded, true);
});

test('ledger compaction: branch filtering releases folds whose parent was cut', () => {
    const ledger = makeLedger(...digestBatch(2));
    const parent = applyCompaction(ledger, { entries: ledger.entries.slice(), text: '合并', id: 'fold' });
    assert.ok(parent);
    // The fork keeps m1 only: e2 dies, the parent (covers m1+m2) dies, e1
    // survives and must rejoin injection instead of staying folded.
    const child = filterLedgerForBranch(ledger, new Set(['m1']));
    assert.equal(child.entries.some(entry => entry.level === 1), false);
    assert.equal(child.entries.find(entry => entry.id === 'e2'), undefined);
    assert.equal(child.entries.find(entry => entry.id === 'e1').meta.folded, false);
    // The source ledger is untouched (branch copies are detached).
    assert.equal(ledger.entries.find(entry => entry.id === 'e1').meta.folded, true);
});
