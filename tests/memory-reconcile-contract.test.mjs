// Contract test: v6 memory reconciler (L1).
//
// reconcile() is the single writer of the ledger. These locks cover the
// properties the whole design leans on: idempotency, append-per-batch,
// stale-first hole filling, single-flight mutual exclusion and abort
// semantics (v6 design doc §6 / §6.3 / §6.4 / §15).
import assert from 'node:assert/strict';
import test from 'node:test';
import { HASH_VERSION, canonicalMessageHash } from '../src/modules/content-hash.mjs';
import { createMemoryReconciler } from '../src/modules/memory-reconcile.mjs';
import { makeDigestEntry, makePinEntry } from '../src/modules/memory-ledger.mjs';

// Fake live snapshot builder: turnTexts[i] = { user, assistant, userId?, assistantId? }.
const createLive = (turnTexts) => {
    const liveIndex = new Map();
    const liveTurnIndex = new Map();
    const turnCovers = new Map();
    const turns = [];
    turnTexts.forEach((texts, index) => {
        const turn = index + 1;
        const covers = [];
        const add = (id, text) => {
            const hash = canonicalMessageHash(text);
            liveIndex.set(id, hash);
            liveTurnIndex.set(id, turn);
            covers.push({ id, h: hash });
        };
        add(texts.userId || `u${turn}`, texts.user);
        add(texts.assistantId || `a${turn}`, texts.assistant);
        turnCovers.set(turn, covers);
        turns.push({ turn, userText: texts.user, assistantText: texts.assistant });
    });
    return { turns, turnCount: turnTexts.length, liveIndex, liveTurnIndex, turnCovers };
};

const makeTurns = (count, prefix = 'T') => Array.from({ length: count }, (_, index) => ({
    user: `${prefix}${index + 1} 用户`,
    assistant: `${prefix}${index + 1} 回复`
}));

// Ids must be unique across harnesses: a colliding append would hit the
// append-only guard and the batch would never be written (see the guard
// test below).
let globalIdSeq = 0;

const createHarness = ({
    live,
    legacy = null,
    legacyProfile = null,
    legacyFragments = null,
    settings = {},
    failOnCall = 0,
    gated = false,
    profile = null,
    compactFold = null,
    compactionFails = false,
    compactionGated = false
}) => {
    let ledger = null;
    let controller = null;
    let releaseGate = () => {};
    let releaseCompactionGate = () => {};
    const gate = gated ? new Promise(resolve => { releaseGate = resolve; }) : null;
    const compactionGate = compactionGated ? new Promise(resolve => { releaseCompactionGate = resolve; }) : null;
    const saves = [];
    const progress = [];
    const calls = [];
    const compactionCalls = [];
    const deps = {
        getSettings: () => ({ enabled: true, keepFloors: 4, summaryBatchSize: 2, classicModel: 'test-model', ...settings }),
        getScopeId: () => 'scope-a',
        getLedger: () => ledger,
        setLedger: (next) => { ledger = next; },
        loadLegacySummaries: () => legacy,
        loadLegacyProfile: () => legacyProfile,
        loadLegacyFragments: async () => legacyFragments,
        saveLedgerNow: async (scopeId, data) => { saves.push(JSON.parse(JSON.stringify(data))); },
        buildLiveSnapshot: () => live,
        requestBatchDigest: async (batch, signal, context) => {
            calls.push({ batch, context });
            if (gate) await gate;
            if (signal?.aborted) {
                const error = new Error('aborted');
                error.name = 'AbortError';
                throw error;
            }
            if (failOnCall > 0 && calls.length === failOnCall) throw new Error('api down');
            return { digest: `摘要 ${batch.fromTurn}-${batch.toTurn}`, profile };
        },
        requestCompaction: async (group, signal) => {
            compactionCalls.push(group);
            if (compactionGate) await compactionGate;
            if (signal?.aborted) {
                const error = new Error('aborted');
                error.name = 'AbortError';
                throw error;
            }
            if (compactionFails) throw new Error('fold api down');
            return { digest: compactFold || `压实 L${group.level}` };
        },
        applyProjection: () => {},
        setProgress: (value) => progress.push(value),
        clearProgress: () => { progress.push(null); },
        setAbortController: (value) => { controller = value; },
        releaseAbortController: () => { controller = null; },
        makeId: () => `entry-${++globalIdSeq}`,
        now: () => 1000 + globalIdSeq
    };
    const reconciler = createMemoryReconciler(deps);
    return {
        reconciler,
        deps,
        getLedger: () => ledger,
        saves,
        progress,
        calls,
        compactionCalls,
        getController: () => controller,
        releaseGate,
        releaseCompactionGate
    };
};

test('reconcile: disabled memory or missing scope is a no-op', async () => {
    const disabled = createHarness({ live: createLive(makeTurns(8)), settings: { enabled: false } });
    assert.deepEqual(await disabled.reconciler.reconcile({}), { processed: 0, folded: 0, reason: 'disabled' });
    assert.equal(disabled.calls.length, 0);
});

test('reconcile: fills holes batch by batch and appends one entry per batch', async () => {
    const live = createLive(makeTurns(8));
    const harness = createHarness({ live });
    const result = await harness.reconciler.reconcile({});
    assert.deepEqual(result, { processed: 2, folded: 0, reason: 'processed' });
    assert.deepEqual(harness.calls.map(call => call.batch), [
        { fromTurn: 1, toTurn: 2 },
        { fromTurn: 3, toTurn: 4 }
    ]);
    const ledger = harness.getLedger();
    assert.equal(ledger.entries.length, 2);
    assert.equal(ledger.entries[0].text, '摘要 1-2');
    assert.equal(ledger.entries[0].kind, 'digest');
    assert.deepEqual(ledger.entries[0].covers.map(c => c.id).sort(), ['a1', 'a2', 'u1', 'u2']);
    assert.match(ledger.entries[0].covers[0].h, /^[0-9a-f]{8}$/);
    // Per-batch persistence: a crash mid-run loses at most the in-flight batch.
    assert.ok(harness.saves.some(save => save.entries.length === 1));
    assert.equal(harness.saves[harness.saves.length - 1].entries.length, 2);
    // The "so far" anchor of the second call is the tail of the first digest.
    assert.equal(harness.calls[1].context.contextLine, '摘要 1-2');
    assert.equal(harness.calls[0].context.contextLine, '');
});

test('reconcile: idempotent — a second run makes no API call and does not touch entries', async () => {
    const harness = createHarness({ live: createLive(makeTurns(8)) });
    await harness.reconciler.reconcile({});
    const callsAfterFirst = harness.calls.length;
    const snapshot = JSON.stringify(harness.getLedger().entries);
    const second = await harness.reconciler.reconcile({});
    assert.deepEqual(second, { processed: 0, folded: 0, reason: 'no-pending' });
    assert.equal(harness.calls.length, callsAfterFirst);
    assert.equal(JSON.stringify(harness.getLedger().entries), snapshot);
});

test('reconcile: stale ranges are re-filled and pruned afterwards', async () => {
    const turns = makeTurns(8);
    const harness = createHarness({ live: createLive(turns) });
    await harness.reconciler.reconcile({});
    assert.equal(harness.calls.length, 2);
    // Simulate an edit of turn 3: its canonical text changes → the entry
    // covering turns 3-4 goes stale and its range becomes a hole.
    const edited = createLive(turns.map((turn, index) => (index === 2 ? { ...turn, user: '改写后的用户' } : turn)));
    // Second pass: isolate release + refill from re-compaction so the
    // unfold behaviour is observable on its own.
    const second = createHarness({ live: edited, settings: { compactionEnabled: false } });
    second.deps.setLedger(JSON.parse(JSON.stringify(harness.getLedger())));
    const result = await second.reconciler.reconcile({});
    assert.equal(result.processed, 1);
    assert.deepEqual(second.calls[0].batch, { fromTurn: 3, toTurn: 4 }, 'hole-filling rewrites exactly the stale range');
    const entries = second.getLedger().entries;
    assert.equal(entries.length, 2, 'the rewritten stale entry was pruned, not kept alongside its replacement');
    assert.ok(entries.every(entry => entry.meta.stale === false));
    // The replacement covers the edited message with its new hash.
    const replacement = entries.find(entry => entry.covers.some(cover => cover.id === 'u3'));
    for (const cover of replacement.covers) {
        assert.equal(cover.h, edited.liveIndex.get(cover.id), `cover ${cover.id} re-hashed from live text`);
    }
});

test('reconcile: API failure leaves the ledger untouched and reports failure', async () => {
    const harness = createHarness({ live: createLive(makeTurns(8)), failOnCall: 1 });
    const result = await harness.reconciler.reconcile({});
    assert.deepEqual(result, { processed: 0, folded: 0, reason: 'failed' });
    assert.equal(harness.getLedger().entries.length, 0);
    assert.ok(harness.progress.some(item => item && item.status === 'failed'));
});

test('reconcile: single flight — concurrent triggers run once, pending reruns after', async () => {
    const harness = createHarness({ live: createLive(makeTurns(8)), gated: true });
    const first = harness.reconciler.reconcile({});
    // Give the first run time to reach the gated API call.
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await harness.reconciler.reconcile({});
    assert.deepEqual(second, { processed: 0, folded: 0, reason: 'busy' }, 'concurrent trigger does not start a second writer');
    harness.releaseGate();
    const result = await first;
    assert.equal(result.processed, 2, 'the pending trigger was replayed as a second pass');
    // First pass took 1-2, the pending pass took 3-4: two calls total.
    assert.equal(harness.calls.length, 2);
});

test('reconcile: abort discards the pending trigger and stops appending', async () => {
    const harness = createHarness({ live: createLive(makeTurns(8)), gated: true });
    const first = harness.reconciler.reconcile({});
    await new Promise(resolve => setTimeout(resolve, 0));
    await harness.reconciler.reconcile({}); // sets pending
    harness.getController().abort();
    harness.releaseGate();
    const result = await first;
    assert.deepEqual(result, { processed: 0, folded: 0, reason: 'aborted' });
    assert.equal(harness.calls.length, 1, 'pending pass was dropped on abort (§6.4)');
    assert.equal(harness.getLedger().entries.length, 0);
});

test('reconcile: force fills a partial tail batch that auto mode skips', async () => {
    const settings = { keepFloors: 4, summaryBatchSize: 3 };
    const auto = createHarness({ live: createLive(makeTurns(8)), settings });
    const autoResult = await auto.reconciler.reconcile({});
    // windowedOut = 4: [1,3] fills, [4,4] is below batch size in auto mode.
    assert.equal(autoResult.processed, 1);
    const forced = createHarness({ live: createLive(makeTurns(8)), settings });
    const forcedResult = await forced.reconciler.reconcile({ force: true });
    assert.equal(forcedResult.processed, 2);
    assert.deepEqual(forced.calls.map(call => call.batch), [
        { fromTurn: 1, toTurn: 3 },
        { fromTurn: 4, toTurn: 4 }
    ]);
});

test('reconcile: legacy summaries are adopted before the first fill', async () => {
    const live = createLive(makeTurns(8));
    const legacy = { long: '旧长期', short: '旧短期', batches: [{ fromTurn: 1, toTurn: 2, status: 'done' }] };
    const harness = createHarness({ live, legacy });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.reason, 'processed');
    const ledger = harness.getLedger();
    // Placeholder coverage entry + level-1 legacy text entry + the new batch.
    const placeholder = ledger.entries.find(entry => entry.level === 0 && entry.text === '');
    assert.ok(placeholder, 'adopted coverage entry exists');
    assert.deepEqual(placeholder.covers.map(c => c.id).sort(), ['a1', 'a2', 'u1', 'u2']);
    const legacyText = ledger.entries.find(entry => entry.level === 1);
    assert.equal(legacyText.text, '旧长期\n\n旧短期');
    // The adopted coverage means the first new batch starts after it.
    assert.deepEqual(harness.calls[0].batch, { fromTurn: 3, toTurn: 4 });
});

test('reconcile: adopted entries replace a missing ledger only once', async () => {
    const live = createLive(makeTurns(8));
    const legacy = { long: '旧长期', short: '', batches: [{ fromTurn: 1, toTurn: 2, status: 'done' }] };
    const harness = createHarness({ live, legacy });
    await harness.reconciler.reconcile({});
    const entryCount = harness.getLedger().entries.length;
    await harness.reconciler.reconcile({});
    assert.equal(harness.getLedger().entries.length, entryCount, 'no double adoption');
});
test('reconcile: profile delta becomes fact entries in the same save as the digest', async () => {
    const live = createLive(makeTurns(8));
    const harness = createHarness({
        live,
        profile: { characters: [{ name: '甲', status: '受伤' }], openPlots: [] }
    });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.reason, 'processed');
    const ledger = harness.getLedger();
    assert.equal(ledger.entries.filter(entry => entry.kind === 'digest').length, 2);
    const facts = ledger.entries.filter(entry => entry.kind === 'fact');
    assert.equal(facts.length, 2, 'one fact appended per batch (the later one folds the earlier)');
    assert.equal(facts.filter(entry => !entry.meta.folded).length, 1);
    assert.equal(facts.find(entry => !entry.meta.folded).text, '受伤');
    assert.deepEqual(
        facts.find(entry => !entry.meta.folded).covers.map(cover => cover.id).sort(),
        ['a3', 'a4', 'u3', 'u4'],
        'freshness comes from the batch that produced it'
    );
    // Digest and fact share the persistence point: no half-written card.
    assert.ok(harness.saves.some(save => save.entries.some(entry => entry.kind === 'digest')
        && save.entries.some(entry => entry.kind === 'fact')));
});

test('reconcile: legacy info card is adopted once as fact entries', async () => {
    const live = createLive(makeTurns(8));
    const harness = createHarness({
        live,
        legacyProfile: {
            characters: [{ name: '安娜', status: '受伤' }],
            openPlots: [{ summary: '寻药', status: 'open', deadline: '三日后' }]
        }
    });
    await harness.reconciler.reconcile({});
    const ledger = harness.getLedger();
    assert.equal(ledger.profileAdopted, true);
    const adopted = ledger.entries.filter(entry => entry.kind === 'fact');
    assert.equal(adopted.length, 2);
    assert.ok(adopted.every(entry => entry.covers.length === 0 && entry.meta.legacy));
    // A second pass neither re-adopts nor duplicates.
    await harness.reconciler.reconcile({});
    assert.equal(harness.getLedger().entries.filter(entry => entry.kind === 'fact').length, 2);
});

test('reconcile: a manually locked fact is never overwritten by a batch', async () => {
    const live = createLive(makeTurns(8));
    const harness = createHarness({
        live,
        profile: { characters: [{ name: '安娜', status: '自动状态' }], openPlots: [] }
    });
    harness.deps.setLedger({
        version: 1,
        hashVersion: HASH_VERSION,
        updatedAt: 0,
        profileAdopted: true,
        entries: [{
            id: 'manual',
            kind: 'fact',
            level: 0,
            covers: [],
            base: [],
            text: '用户锁定状态',
            meta: {
                at: 1, stale: false, folded: false, legacy: false,
                manual: true, enabled: true,
                factKind: 'character', factKey: '安娜', factStatus: '', factDeadline: ''
            }
        }]
    });
    await harness.reconciler.reconcile({});
    const rows = harness.getLedger().entries.filter(entry => entry.kind === 'fact' && entry.meta.factKey === '安娜');
    assert.equal(rows.length, 1, 'no auto fact is appended for a locked key');
    assert.equal(rows[0].text, '用户锁定状态');
});

test('reconcile: pins in the ledger do not block legacy summary adoption', async () => {
    const live = createLive(makeTurns(8));
    const legacy = { long: '旧长期', short: '', batches: [{ fromTurn: 1, toTurn: 2, status: 'done' }] };
    const harness = createHarness({ live, legacy });
    harness.deps.setLedger({
        version: 1,
        hashVersion: HASH_VERSION,
        updatedAt: 0,
        profileAdopted: true,
        entries: [makePinEntry({ id: 'pin', text: '用户置顶', at: 1 })]
    });
    await harness.reconciler.reconcile({});
    const ledger = harness.getLedger();
    assert.ok(ledger.entries.some(entry => entry.kind === 'pin'), 'the pin survives');
    assert.ok(ledger.entries.some(entry => entry.kind === 'digest' && entry.text === '旧长期'),
        'the legacy long text is adopted despite the pin');
    assert.deepEqual(harness.calls[0].batch, { fromTurn: 3, toTurn: 4 },
        'adopted coverage prevents resummarizing turns 1-2');
});

test('reconcile: a send before the sweep reaches the scope still adopts shards', async () => {
    // Race window: reconcile step 0 adopts first and creates digests, so the
    // boot sweep's digest guard would skip the shards forever. Step 0 must
    // adopt them in the same window.
    const live = createLive(makeTurns(6));
    const legacy = { long: '旧长期', short: '', batches: [] };
    const legacyFragments = [
        { summary: '第2轮段落', turn: 2, vectorMemory: true },
        { summary: '历史已删段落', turn: 40, vectorMemory: true }
    ];
    const harness = createHarness({ live, legacy, legacyFragments });
    await harness.reconciler.reconcile({});
    const ledger = harness.getLedger();
    const shard = ledger.entries.find(entry => entry.text === '第2轮段落');
    assert.ok(shard, 'the shard text is adopted by step 0');
    assert.deepEqual(shard.covers, live.turnCovers.get(2), 'turn 2 resolves to live covers');
    const gone = ledger.entries.find(entry => entry.text === '历史已删段落');
    assert.deepEqual(gone.covers, [], 'unreachable turn keeps covers empty');
    assert.ok(ledger.entries.some(entry => entry.kind === 'digest' && entry.text === '旧长期'));
    // A second pass must not re-adopt: digests exist now.
    const before = ledger.entries.length;
    await harness.reconciler.reconcile({});
    assert.equal(harness.getLedger().entries.length, before, 'no double adoption');
});

// --- v6 L5: hierarchical compaction (design doc §9.1 / §9.2) ---------------

test('reconcile compaction: over-full level folds once and persists the fold', async () => {
    // 16 turns, keepFloors 4, batch 2 => 6 level-0 digests (fanout 5).
    const harness = createHarness({ live: createLive(makeTurns(16)), compactFold: '压实的长期要点' });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.processed, 6);
    assert.equal(result.folded, 1);
    assert.equal(harness.compactionCalls.length, 1);
    assert.equal(harness.compactionCalls[0].level, 1);
    assert.equal(harness.compactionCalls[0].entries.length, 5, 'input size is the fanout, not the history');
    assert.deepEqual(harness.compactionCalls[0].entries.map(item => [item.fromTurn, item.toTurn]), [
        [1, 2], [3, 4], [5, 6], [7, 8], [9, 10]
    ]);
    const ledger = harness.getLedger();
    const parent = ledger.entries.find(entry => entry.level === 1);
    assert.ok(parent, 'the fold entry exists');
    assert.equal(parent.text, '压实的长期要点');
    assert.equal(parent.base.length, 5);
    assert.deepEqual(parent.covers.map(cover => cover.id).sort(),
        ['a1', 'a10', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9',
            'u1', 'u10', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'].sort());
    assert.equal(ledger.entries.filter(entry => entry.meta.folded).length, 5);
    // Per-fold persistence: the fold is on disk before the next pass.
    assert.ok(harness.saves.some(save => save.entries.some(entry => entry.level === 1)));
    // The newest batch and the fold parent stay active.
    assert.equal(ledger.entries.filter(entry => entry.kind === 'digest' && !entry.meta.folded).length, 2);
});

test('reconcile compaction: cascades to the next level when that level fills up', async () => {
    // 20 turns => 8 level-0 digests; fanout 2 forces a level-1 then level-2 fold.
    const harness = createHarness({
        live: createLive(makeTurns(20)),
        settings: { compactionFanout: 2 }
    });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.processed, 8);
    assert.equal(result.folded, 4, 'three level-0 folds plus one level-1 fold');
    const ledger = harness.getLedger();
    assert.equal(ledger.entries.filter(entry => entry.level === 2 && !entry.meta.folded).length, 1);
    assert.equal(ledger.entries.filter(entry => entry.level === 1 && !entry.meta.folded).length, 1);
    assert.equal(ledger.entries.filter(entry => entry.level === 0 && !entry.meta.folded).length, 2);
    // The level-2 fold consumes level-1 entries through base[].
    const top = ledger.entries.find(entry => entry.level === 2 && !entry.meta.folded);
    assert.equal(top.base.length, 2);
    assert.ok(top.base.every(id => ledger.entries.find(entry => entry.id === id)?.level === 1));
});

test('reconcile compaction: the setting switch turns the ledger back to flat', async () => {
    const harness = createHarness({
        live: createLive(makeTurns(16)),
        settings: { compactionEnabled: false }
    });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.processed, 6);
    assert.equal(result.folded, 0);
    assert.equal(harness.compactionCalls.length, 0);
    assert.equal(harness.getLedger().entries.filter(entry => entry.meta.folded).length, 0);
});

test('reconcile compaction: manual trigger folds even when automatic is off', async () => {
    const harness = createHarness({
        live: createLive(makeTurns(16)),
        settings: { compactionEnabled: false }
    });
    const result = await harness.reconciler.reconcile({ compact: true });
    assert.equal(result.folded, 1);
    assert.equal(harness.compactionCalls.length, 1);
});

test('reconcile compaction: a fold API failure leaves the ledger flat, run still succeeds', async () => {
    const harness = createHarness({
        live: createLive(makeTurns(16)),
        compactionFails: true
    });
    const result = await harness.reconciler.reconcile({});
    assert.equal(result.reason, 'processed');
    assert.equal(result.folded, 0);
    assert.equal(harness.getLedger().entries.filter(entry => entry.meta.folded).length, 0,
        'children are only folded after the parent is safely appended');
});

test('reconcile compaction: an abort during the fold never leaves a half-folded group', async () => {
    const harness = createHarness({
        live: createLive(makeTurns(16)),
        compactionGated: true
    });
    const first = harness.reconciler.reconcile({});
    // Wait until all six batches are written and the fold call is in flight.
    for (let tick = 0; tick < 200 && (harness.getLedger()?.entries?.length || 0) < 6; tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    harness.getController().abort();
    harness.releaseCompactionGate();
    const result = await first;
    assert.equal(result.folded, 0);
    assert.equal(harness.getLedger().entries.filter(entry => entry.meta.folded).length, 0);
    assert.equal(harness.getLedger().entries.some(entry => entry.level >= 1), false);
});

test('reconcile compaction: an edit unfolds the stale parent children and refills the hole', async () => {
    const turns = makeTurns(16);
    const first = createHarness({ live: createLive(turns), compactFold: '合并长期' });
    await first.reconciler.reconcile({});
    assert.equal(first.getLedger().entries.filter(entry => entry.meta.folded).length, 5);
    // Edit one message inside the folded span.
    const edited = createLive(turns.map((turn, index) => (
        index === 0 ? { ...turn, user: '改写后的开场' } : turn
    )));
    // Second pass: isolate release + refill from re-compaction so the
    // unfold behaviour is observable on its own.
    const second = createHarness({ live: edited, settings: { compactionEnabled: false } });
    second.deps.setLedger(JSON.parse(JSON.stringify(first.getLedger())));
    const result = await second.reconciler.reconcile({});
    assert.equal(result.processed, 1, 'only the edited range is regenerated');
    assert.deepEqual(second.calls[0].batch, { fromTurn: 1, toTurn: 2 });
    const ledger = second.getLedger();
    assert.equal(ledger.entries.filter(entry => entry.meta.stale).length, 0,
        'the stale parent/child were pruned after the rewrite');
    assert.equal(ledger.entries.some(entry => entry.level >= 1), false,
        'the fold was released; the ledger is flat for that range');
    assert.equal(ledger.entries.filter(entry => entry.meta.folded).length, 0,
        'surviving siblings were unfolded instead of staying invisible');
    assert.equal(ledger.entries.length, 6, 'regenerated batch + five surviving batches');
});

test('reconcile: a completed adoption notifies the UI exactly once (§20)', async () => {
    const live = createLive(makeTurns(8));
    const legacy = { long: '旧长期', short: '', batches: [{ fromTurn: 1, toTurn: 2, status: 'done' }] };
    const notifications = [];
    const harness = createHarness({ live, legacy });
    harness.deps.notifyAdoption = (ledger) => notifications.push(ledger.entries.length);
    await harness.reconciler.reconcile({});
    assert.deepEqual(notifications, [2], 'one notice carrying the adopted ledger');
    // A second run adopts nothing and stays silent.
    await harness.reconciler.reconcile({});
    assert.equal(notifications.length, 1);
});
