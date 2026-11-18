// memory-reconcile — the single writer of the memory ledger (v6 L1)
//
// reconcile() is idempotent and convergent: local invalidation → hole
// computation over non-stale covers → one model call per batch → append
// one immutable digest entry plus its fact entries → persist immediately
// → GC. Running it twice yields the same ledger, so a crash or abort can
// only lose the in-flight batch (design doc §6 / §10).
//
// Single-flight (design doc §6.4): one run per scope at a time; triggers
// that arrive during a run set a pending flag and the run repeats once at
// the end. Aborts always discard pending work — they only come from scope
// switches / clear-rebuild, where the scope itself changed.
//
// Factory with injected deps: no storage, fetch or Vue imports here.
// Contract locks: tests/memory-reconcile-contract.test.mjs.

import { computePendingBatch } from './memory-summary.mjs';
import {
    adoptLegacyProfile,
    adoptLegacySummaries,
    applyCompaction,
    appendEntry,
    appendProfileFacts,
    createEmptyLedger,
    invalidateEntries,
    makeDigestEntry,
    normalizeLedger,
    projectCoveredRanges,
    projectEntryTurns,
    propagateStaleUpward,
    pruneFoldedEntries,
    pruneRewrittenStaleEntries,
    rangesToDoneBatches,
    releaseOrphanedFolds,
    selectCompactionGroup
} from './memory-ledger.mjs';

const MAX_BATCHES_PER_RUN = 200;
const MAX_PASSES_PER_RUN = 8;
const MAX_COMPACTIONS_PER_RUN = 8;
const CONTEXT_TAIL_CHARS = 200;

export function createMemoryReconciler(deps) {
    const scopeStates = new Map();

    const stateFor = (scopeId) => {
        let state = scopeStates.get(scopeId);
        if (!state) {
            state = { running: false, pending: null };
            scopeStates.set(scopeId, state);
        }
        return state;
    };

    const now = () => (typeof deps.now === 'function' ? deps.now() : Date.now());

    // One-line "so far" anchor for an otherwise independent batch: the tail
    // of the most recent digest (closest to the batch start). Keeps the
    // per-batch input size constant instead of feeding cumulative text.
    const buildContextLine = (ledger, liveTurnIndex) => {
        let bestText = '';
        let bestTurn = -1;
        for (const entry of ledger.entries) {
            if (entry.kind !== 'digest' || entry.meta.stale) continue;
            const text = String(entry.text || '').trim();
            if (!text) continue;
            const turns = projectEntryTurns(entry, liveTurnIndex);
            const topTurn = turns.length ? Math.max(...turns) : 0;
            if (topTurn > bestTurn) {
                bestTurn = topTurn;
                bestText = text;
            }
        }
        if (!bestText) return '';
        return bestText.length > CONTEXT_TAIL_CHARS ? `…${bestText.slice(-CONTEXT_TAIL_CHARS)}` : bestText;
    };

    const collectBatchCovers = (live, batch) => {
        const covers = [];
        for (let turn = batch.fromTurn; turn <= batch.toTurn; turn += 1) {
            const turnCover = live.turnCovers.get(turn);
            if (turnCover && turnCover.length > 0) covers.push(...turnCover);
        }
        return covers;
    };

    // Step 4 (design doc §9.1): fold over-full levels into a higher level.
    // Optional by design: a disabled switch or a failed API call leaves the
    // ledger flat for that range and the next pass retries. Each fold is
    // persisted immediately, so a crash can only replay the model call —
    // never persist a half-folded group.
    const runCompaction = async ({ scopeId, ledger, live, settings, signal, force }) => {
        if (typeof deps.requestCompaction !== 'function') return 0;
        if (!force && settings.compactionEnabled === false) return 0;
        let folded = 0;
        while (folded < MAX_COMPACTIONS_PER_RUN) {
            if (signal?.aborted) break;
            if (deps.getScopeId() !== scopeId) break;
            const group = selectCompactionGroup(ledger, live.liveTurnIndex, {
                fanout: settings.compactionFanout
            });
            if (!group) break;
            const entries = group.entries.map(entry => {
                const turns = projectEntryTurns(entry, live.liveTurnIndex);
                return {
                    entryId: entry.id,
                    level: entry.level,
                    fromTurn: turns.length ? Math.min(...turns) : 0,
                    toTurn: turns.length ? Math.max(...turns) : 0,
                    text: String(entry.text || '').trim()
                };
            });
            let parsed = null;
            try {
                parsed = await deps.requestCompaction({ level: group.level + 1, entries }, signal);
            } catch (error) {
                if (error?.name === 'AbortError') break;
                console.error('Memory compaction failed:', error);
                break;
            }
            const text = String(parsed?.digest || '').trim();
            if (!text) break;
            const before = ledger.entries.length;
            const parent = applyCompaction(ledger, {
                entries: group.entries,
                text,
                id: deps.makeId(),
                model: String(settings.classicModel || ''),
                at: now()
            });
            if (!parent || ledger.entries.length === before) {
                console.error('Memory reconcile: compaction not appended');
                break;
            }
            folded += 1;
            deps.setLedger(ledger);
            deps.applyProjection?.(ledger, live);
            await deps.saveLedgerNow(scopeId, ledger);
        }
        return folded;
    };

    const runPass = async (scopeId, force, compact, signal) => {
        const settings = deps.getSettings() || {};
        const live = deps.buildLiveSnapshot();
        const current = deps.getLedger();
        const ledger = normalizeLedger(current) || createEmptyLedger();
        if (current !== ledger) deps.setLedger(ledger);
        let dirty = false;

        // 0. Legacy adoption: only when no digest coverage exists yet. Pins and
        // facts may already be in the ledger (L4) without implying that the
        // v4 summary layer was adopted.
        const hasDigestEntries = ledger.entries.some(entry => entry.kind === 'digest');
        if (!hasDigestEntries && typeof deps.loadLegacySummaries === 'function') {
            const adopted = adoptLegacySummaries({
                summaries: deps.loadLegacySummaries(),
                turnCovers: live.turnCovers,
                makeId: deps.makeId,
                now: now()
            });
            if (adopted.length > 0) {
                adopted.forEach(entry => appendEntry(ledger, entry));
                dirty = true;
            }
        }
        // v4 info card -> fact entries. Guarded by a ledger flag, not by
        // "no fact entries": otherwise a GC pass could resurrect a profile
        // the user deleted (design doc §11).
        if (!ledger.profileAdopted && typeof deps.loadLegacyProfile === 'function') {
            const legacyProfile = deps.loadLegacyProfile();
            const hasLegacyRows = Boolean(legacyProfile && (
                (Array.isArray(legacyProfile.characters) && legacyProfile.characters.length > 0)
                || (Array.isArray(legacyProfile.openPlots) && legacyProfile.openPlots.length > 0)
            ));
            if (hasLegacyRows) {
                const adoptedFacts = adoptLegacyProfile({
                    profile: legacyProfile,
                    makeId: deps.makeId,
                    now: now()
                });
                adoptedFacts.forEach(entry => appendEntry(ledger, entry));
                ledger.profileAdopted = true;
                if (adoptedFacts.length > 0) dirty = true;
            }
        }

        // 1. Invalidation: pure local, synchronous, no API.
        let invalidated = invalidateEntries(ledger, live.liveIndex);
        invalidated += propagateStaleUpward(ledger);
        // A stale parent no longer represents its folded children: unfold
        // them immediately so injection never loses a range between the
        // invalidation and the next compaction pass (design doc §9.1).
        if (invalidated > 0) releaseOrphanedFolds(ledger);
        if (invalidated > 0) dirty = true;
        if (dirty) {
            deps.applyProjection?.(ledger, live);
            await deps.saveLedgerNow(scopeId, ledger);
        }

        // 2/3. Hole computation and batch filling (one model call per batch).
        const pendingState = { keepFloors: settings.keepFloors, batchSize: settings.summaryBatchSize };
        let processed = 0;
        let firstBatch = null;
        let lastBatch = null;
        let reason = 'no-pending';
        while (processed < MAX_BATCHES_PER_RUN) {
            if (signal?.aborted) return { processed, folded: 0, reason: 'aborted' };
            if (deps.getScopeId() !== scopeId) return { processed, folded: 0, reason: 'aborted' };
            const batch = computePendingBatch(
                rangesToDoneBatches(projectCoveredRanges(ledger, live.liveTurnIndex)),
                live.turnCount,
                pendingState,
                { force }
            );
            if (!batch) break;
            const covers = collectBatchCovers(live, batch);
            // Defensive: a batch with no addressable message cannot be
            // covered content-addressed; leave the hole for a later run.
            if (covers.length === 0) break;

            firstBatch = firstBatch || batch;
            lastBatch = batch;
            deps.setProgress?.({ ...batch, status: 'running' }, false);
            let parsed = null;
            try {
                parsed = await deps.requestBatchDigest(batch, signal, {
                    turns: live.turns.filter(turn => turn.turn >= batch.fromTurn && turn.turn <= batch.toTurn),
                    contextLine: buildContextLine(ledger, live.liveTurnIndex)
                });
            } catch (error) {
                if (error?.name === 'AbortError') {
                    deps.clearProgress?.();
                    return { processed, folded: 0, reason: 'aborted' };
                }
                deps.setProgress?.({ ...batch, status: 'failed' });
                console.error('Memory reconcile failed:', error);
                return { processed, folded: 0, reason: 'failed' };
            }
            if (!parsed?.digest) {
                deps.setProgress?.({ ...batch, status: 'failed' });
                return { processed, folded: 0, reason: 'failed' };
            }

            const beforeAppend = ledger.entries.length;
            appendEntry(ledger, makeDigestEntry({
                id: deps.makeId(),
                covers,
                text: parsed.digest,
                model: String(settings.classicModel || ''),
                at: now()
            }));
            if (ledger.entries.length === beforeAppend) {
                // Append-only guard hit (duplicate entry id): never spin on
                // the same hole — leave it for a later run.
                console.error('Memory reconcile: duplicate entry id, batch not appended');
                break;
            }
            // L4: the batch's profile delta becomes immutable fact entries in
            // the same write as the digest. One save = digest and card can
            // never disagree after a crash (design doc §6.1 / §10).
            appendProfileFacts(ledger, parsed.profile, {
                covers,
                at: now(),
                model: String(settings.classicModel || ''),
                makeId: deps.makeId
            });
            deps.setLedger(ledger);
            deps.applyProjection?.(ledger, live);
            await deps.saveLedgerNow(scopeId, ledger);
            processed += 1;
        }
        if (processed > 0 && firstBatch && lastBatch) {
            deps.setProgress?.({ fromTurn: firstBatch.fromTurn, toTurn: lastBatch.toTurn, status: 'done' });
            reason = 'processed';
        }

        // 4. Compaction (design doc §9.1): fold over-full levels. Runs even
        // when no new batch was written — a manual trigger may only compact.
        const folded = await runCompaction({ scopeId, ledger, live, settings, signal, force: compact });

        // 5. GC: stale entries already rewritten are removed; orphaned folds
        // released (their parent vanished); folded cap.
        const pruned = pruneRewrittenStaleEntries(ledger, live.liveTurnIndex)
            + releaseOrphanedFolds(ledger)
            + pruneFoldedEntries(ledger);
        if (pruned > 0) {
            deps.setLedger(ledger);
            deps.applyProjection?.(ledger, live);
            await deps.saveLedgerNow(scopeId, ledger);
        }
        return { processed, folded, reason };
    };

    const reconcile = async (options = {}) => {
        const settings = deps.getSettings() || {};
        if (!settings.enabled) return { processed: 0, folded: 0, reason: 'disabled' };
        const scopeId = deps.getScopeId();
        if (!scopeId) return { processed: 0, folded: 0, reason: 'no-scope' };
        const state = stateFor(scopeId);
        if (state.running) {
            state.pending = state.pending || { force: false, compact: false };
            state.pending.force = state.pending.force || options.force === true;
            state.pending.compact = state.pending.compact || options.compact === true;
            return { processed: 0, folded: 0, reason: 'busy' };
        }
        state.running = true;
        let processed = 0;
        let folded = 0;
        let reason = 'no-pending';
        const abortController = new AbortController();
        deps.setAbortController?.(abortController);
        try {
            let force = options.force === true;
            let compact = options.compact === true;
            for (let pass = 0; pass < MAX_PASSES_PER_RUN; pass += 1) {
                state.pending = null;
                const result = await runPass(scopeId, force, compact, abortController.signal);
                processed += result.processed;
                folded += result.folded;
                reason = result.reason;
                if (result.reason === 'failed' || result.reason === 'aborted') break;
                const pending = state.pending;
                if (!pending) break;
                force = force || pending.force === true;
                compact = compact || pending.compact === true;
            }
            return { processed, folded, reason };
        } finally {
            state.running = false;
            // Aborts only come from scope switches / clear-rebuild: drop any
            // pending trigger too (design doc §6.4).
            state.pending = null;
            deps.releaseAbortController?.(abortController);
        }
    };

    return { reconcile };
}