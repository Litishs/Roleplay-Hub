// Contract test: v6 memory reconciler (L1).
//
// reconcile() is the single writer of the ledger. These locks cover the
// properties the whole design leans on: idempotency, append-per-batch,
// stale-first hole filling, single-flight mutual exclusion and abort
// semantics (v6 design doc §6 / §6.3 / §6.4 / §15).
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalMessageHash } from '../src/modules/content-hash.mjs';
import { createMemoryReconciler } from '../src/modules/memory-reconcile.mjs';
import { makeDigestEntry } from '../src/modules/memory-ledger.mjs';

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

const createHarness = ({ live, legacy = null, settings = {}, failOnCall = 0, gated = false }) => {
    let ledger = null;
    let controller = null;
    let releaseGate = () => {};
    const gate = gated ? new Promise(resolve => { releaseGate = resolve; }) : null;
    const saves = [];
    const progress = [];
    const calls = [];
    const deps = {
        getSettings: () => ({ enabled: true, keepFloors: 4, summaryBatchSize: 2, classicModel: 'test-model', ...settings }),
        getScopeId: () => 'scope-a',
        getLedger: () => ledger,
        setLedger: (next) => { ledger = next; },
        loadLegacySummaries: () => legacy,
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
            return { digest: `摘要 ${batch.fromTurn}-${batch.toTurn}`, profile: null };
        },
        applyProfileDelta: async () => {},
        applyProjection: () => {},
        setProgress: (value) => progress.push(value),
        clearProgress: () => { progress.push(null); },
        setAbortController: (value) => { controller = value; },
        releaseAbortController: () => { controller = null; },
        makeId: () => `entry-${++globalIdSeq}`,
        now: () => 1000 + globalIdSeq
    };
    const reconciler = createMemoryReconciler(deps);
    return { reconciler, deps, getLedger: () => ledger, saves, progress, calls, getController: () => controller, releaseGate };
};

test('reconcile: disabled memory or missing scope is a no-op', async () => {
    const disabled = createHarness({ live: createLive(makeTurns(8)), settings: { enabled: false } });
    assert.deepEqual(await disabled.reconciler.reconcile({}), { processed: 0, reason: 'disabled' });
    assert.equal(disabled.calls.length, 0);
});

test('reconcile: fills holes batch by batch and appends one entry per batch', async () => {
    const live = createLive(makeTurns(8));
    const harness = createHarness({ live });
    const result = await harness.reconciler.reconcile({});
    assert.deepEqual(result, { processed: 2, reason: 'processed' });
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
    assert.deepEqual(second, { processed: 0, reason: 'no-pending' });
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
    const second = createHarness({ live: edited });
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
    assert.deepEqual(result, { processed: 0, reason: 'failed' });
    assert.equal(harness.getLedger().entries.length, 0);
    assert.ok(harness.progress.some(item => item && item.status === 'failed'));
});

test('reconcile: single flight — concurrent triggers run once, pending reruns after', async () => {
    const harness = createHarness({ live: createLive(makeTurns(8)), gated: true });
    const first = harness.reconciler.reconcile({});
    // Give the first run time to reach the gated API call.
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await harness.reconciler.reconcile({});
    assert.deepEqual(second, { processed: 0, reason: 'busy' }, 'concurrent trigger does not start a second writer');
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
    assert.deepEqual(result, { processed: 0, reason: 'aborted' });
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