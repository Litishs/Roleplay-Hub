// memory-ledger — append-only ledger of derived memory entries (v6 L1)
//
// The ledger is the single derived store for the memory subsystem. Entries
// are immutable once appended: text/covers/base never change, only
// meta.stale / meta.folded bookkeeping flags do. Identity comes from
// content (covers = consumed message ids + content hashes), never from
// turn numbers — turn ranges are recomputed from live messages at view
// time (design doc §3.2 / §5.3).
//
// Pure module: no storage, no network, no Vue. Contract locks:
// tests/memory-ledger-contract.test.mjs.

import { HASH_VERSION } from './content-hash.mjs';

export const LEDGER_VERSION = 1;
export const ENTRY_KINDS = Object.freeze(['digest', 'fact', 'pin']);
export const FOLDED_ENTRY_LIMIT = 200;

const asCount = (value, fallback = 0) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const normalizeCover = (rawCover) => {
    if (!rawCover || typeof rawCover !== 'object') return null;
    const id = String(rawCover.id || '').trim();
    const h = String(rawCover.h || '').trim();
    return id && h ? { id, h } : null;
};

export const normalizeEntry = (rawEntry) => {
    if (!rawEntry || typeof rawEntry !== 'object') return null;
    const id = String(rawEntry.id || '').trim();
    if (!id) return null;
    const meta = rawEntry.meta && typeof rawEntry.meta === 'object' ? rawEntry.meta : {};
    return {
        id,
        kind: ENTRY_KINDS.includes(rawEntry.kind) ? rawEntry.kind : 'digest',
        level: asCount(rawEntry.level),
        covers: (Array.isArray(rawEntry.covers) ? rawEntry.covers : []).map(normalizeCover).filter(Boolean),
        base: (Array.isArray(rawEntry.base) ? rawEntry.base : [])
            .map(entryId => String(entryId || '').trim())
            .filter(Boolean),
        text: String(rawEntry.text || ''),
        meta: {
            at: asCount(meta.at),
            model: String(meta.model || ''),
            tokens: asCount(meta.tokens),
            stale: meta.stale === true,
            folded: meta.folded === true,
            legacy: meta.legacy === true
        }
    };
};

export const createEmptyLedger = () => ({
    version: LEDGER_VERSION,
    hashVersion: HASH_VERSION,
    updatedAt: 0,
    entries: []
});

// A stored ledger whose hashVersion no longer matches is a *controlled*
// full invalidation: every cover hash was computed under an older
// normalization definition, so nothing can be verified. Source messages
// stay on device, so reconciliation simply rebuilds from raw text
// (design doc §4 / §16 risk 4).
export const normalizeLedger = (rawLedger) => {
    if (!rawLedger || typeof rawLedger !== 'object' || !Array.isArray(rawLedger.entries)) return null;
    if (asCount(rawLedger.hashVersion) !== HASH_VERSION) return createEmptyLedger();
    return {
        version: LEDGER_VERSION,
        hashVersion: HASH_VERSION,
        updatedAt: asCount(rawLedger.updatedAt),
        entries: rawLedger.entries.map(normalizeEntry).filter(Boolean)
    };
};

export const makeDigestEntry = ({ id, covers = [], text = '', level = 0, base = [], model = '', tokens = 0, at = Date.now(), legacy = false }) => normalizeEntry({
    id,
    kind: 'digest',
    level,
    covers,
    base,
    text,
    meta: { at, model, tokens, stale: false, folded: false, legacy }
});

export const findEntry = (ledger, entryId) => (Array.isArray(ledger?.entries)
    ? ledger.entries.find(entry => entry.id === entryId) || null
    : null);

export const appendEntry = (ledger, rawEntry) => {
    const entry = normalizeEntry(rawEntry);
    if (!entry) return null;
    // Append-only: an id that already exists is never rewritten.
    const existing = findEntry(ledger, entry.id);
    if (existing) return existing;
    ledger.entries.push(entry);
    ledger.updatedAt = entry.meta.at || Date.now();
    return entry;
};

// --- Staleness -------------------------------------------------------------

export const coverBroken = (cover, liveIndex) => !liveIndex.has(cover.id)
    || String(liveIndex.get(cover.id)) !== cover.h;

// Reconcile step 1: pure local invalidation, no network. covers:[] is the
// natural encoding of "pinned / never invalidated": an empty set can never
// mismatch (design doc §4).
export const invalidateEntries = (ledger, liveIndex) => {
    let changed = 0;
    for (const entry of ledger.entries) {
        if (entry.meta.stale || entry.covers.length === 0) continue;
        if (entry.covers.some(cover => coverBroken(cover, liveIndex))) {
            entry.meta.stale = true;
            changed += 1;
        }
    }
    return changed;
};

// level>0 entries fold lower levels through base[]; a stale base taints
// everything that consumed it (design doc §6.1 step 1).
export const propagateStaleUpward = (ledger) => {
    const staleIds = new Set(ledger.entries.filter(entry => entry.meta.stale).map(entry => entry.id));
    let changed = 0;
    let pass = true;
    while (pass) {
        pass = false;
        for (const entry of ledger.entries) {
            if (entry.meta.stale || entry.level <= 0 || entry.base.length === 0) continue;
            if (!entry.base.some(entryId => staleIds.has(entryId))) continue;
            entry.meta.stale = true;
            staleIds.add(entry.id);
            changed += 1;
            pass = true;
        }
    }
    return changed;
};

// --- Turn projection (render time only) ------------------------------------

// liveTurnIndex maps message id -> turn number of the current live
// snapshot. Turn numbers are positional and are never persisted: deleting
// a floor shifts every later turn, and covers are content-addressed
// precisely so that shift is harmless (design doc §5.3).
export const projectEntryTurns = (entry, liveTurnIndex) => {
    const turns = [];
    for (const cover of entry.covers) {
        const turn = liveTurnIndex.get(cover.id);
        if (Number.isFinite(turn)) turns.push(turn);
    }
    return turns;
};

export const projectCoveredRanges = (ledger, liveTurnIndex) => {
    const ranges = [];
    for (const entry of ledger.entries) {
        if (entry.kind !== 'digest' || entry.meta.stale || entry.covers.length === 0) continue;
        const turns = projectEntryTurns(entry, liveTurnIndex);
        if (turns.length === 0) continue;
        ranges.push({ fromTurn: Math.min(...turns), toTurn: Math.max(...turns) });
    }
    return ranges;
};

// The v4 hole computation consumes done batches; ledger coverage is
// projected into the same shape so computePendingBatch is reused as-is.
export const rangesToDoneBatches = (ranges) => ranges.map(range => ({ ...range, status: 'done' }));

// --- GC --------------------------------------------------------------------

// A stale entry whose hole was rewritten is pure redundancy: delete it.
// Entries whose covers are entirely gone keep their text — there is
// nothing left to regenerate from and the summary is the only record
// (design doc §17 Q2).
export const pruneRewrittenStaleEntries = (ledger, liveTurnIndex) => {
    const coveredTurns = new Set();
    for (const entry of ledger.entries) {
        if (entry.kind !== 'digest' || entry.meta.stale || entry.covers.length === 0) continue;
        for (const turn of projectEntryTurns(entry, liveTurnIndex)) coveredTurns.add(turn);
    }
    const before = ledger.entries.length;
    ledger.entries = ledger.entries.filter(entry => {
        if (!entry.meta.stale) return true;
        const turns = projectEntryTurns(entry, liveTurnIndex);
        if (turns.length === 0) return true;
        return turns.some(turn => !coveredTurns.has(turn));
    });
    return before - ledger.entries.length;
};

// Folded entries stay for traceability (base[] can be expanded in the UI)
// but the ledger must stay bounded: keep the newest FOLDED_ENTRY_LIMIT.
export const pruneFoldedEntries = (ledger, limit = FOLDED_ENTRY_LIMIT) => {
    const folded = ledger.entries.filter(entry => entry.meta.folded);
    if (folded.length <= limit) return 0;
    const dropIds = new Set(folded
        .sort((a, b) => a.meta.at - b.meta.at)
        .slice(0, folded.length - limit)
        .map(entry => entry.id));
    const before = ledger.entries.length;
    ledger.entries = ledger.entries.filter(entry => !dropIds.has(entry.id));
    return before - ledger.entries.length;
};

// --- Legacy adoption (v4 -> v6) --------------------------------------------

const collectDoneRanges = (batches) => (Array.isArray(batches) ? batches : [])
    .filter(batch => batch && batch.status === 'done')
    .map(batch => [asCount(batch.fromTurn), asCount(batch.toTurn)])
    .filter(([fromTurn, toTurn]) => fromTurn >= 1 && toTurn >= fromTurn)
    .sort((a, b) => a[0] - b[0]);

// turnCovers: Map<turnNumber, [{id, h}]> of the live snapshot.
// v4 stored only batch ranges plus final long/short text (no per-batch
// snapshots), so:
//   - each done range becomes a text-less digest entry carrying coverage,
//     so the hole computation does not resummarize old history;
//   - the long/short text becomes one level=1 entry so an upgraded user
//     keeps their memory (design doc §11);
//   - a range with unreachable messages is marked stale so the hole-fill
//     mechanism regenerates whatever is still live.
export const adoptLegacySummaries = ({ summaries, turnCovers, makeId, now = Date.now() }) => {
    const entries = [];
    const covered = [];
    for (const [fromTurn, toTurn] of collectDoneRanges(summaries?.batches)) {
        const covers = [];
        let resolvedTurns = 0;
        for (let turn = fromTurn; turn <= toTurn; turn += 1) {
            const turnCover = turnCovers.get(turn);
            if (!turnCover || turnCover.length === 0) continue;
            resolvedTurns += 1;
            covers.push(...turnCover);
        }
        if (resolvedTurns === 0) continue;
        const entry = makeDigestEntry({ id: makeId(), covers, text: '', at: now, legacy: true });
        if (resolvedTurns < toTurn - fromTurn + 1) entry.meta.stale = true;
        covered.push(...covers);
        entries.push(entry);
    }
    const combined = [String(summaries?.long || '').trim(), String(summaries?.short || '').trim()]
        .filter(Boolean)
        .join('\n\n');
    if (combined) {
        // covers:[] when the covered history is gone — the text is the only
        // surviving record, so it must never be invalidated into oblivion.
        entries.push(makeDigestEntry({ id: makeId(), covers: covered, text: combined, level: 1, at: now, legacy: true }));
    }
    return entries;
};

// --- Branch filtering (design doc §7, consumed by L2) ----------------------

// An entry survives a fork iff every message it consumed survived. Pins
// (covers:[]) follow the branch by definition. Structural guarantee: text
// produced from post-fork floors cannot leak into the child ledger.
export const filterLedgerForBranch = (ledger, survivorIds) => {
    const survivors = survivorIds instanceof Set ? survivorIds : new Set(survivorIds || []);
    return {
        ...ledger,
        updatedAt: Date.now(),
        entries: ledger.entries
            .filter(entry => entry.covers.length === 0 || entry.covers.every(cover => survivors.has(cover.id)))
            .map(entry => ({ ...entry, covers: entry.covers.map(cover => ({ ...cover })), meta: { ...entry.meta } }))
    };
};