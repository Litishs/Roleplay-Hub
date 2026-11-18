// memory-ledger — append-only ledger of derived memory entries (v6 L1)
//
// The ledger is the single derived store for the memory subsystem. Entries
// are immutable once appended: text/covers/base never change, only meta
// bookkeeping flags do (stale/folded, plus manual/enabled and the fact key
// fields added in L4). Identity comes from content (covers = consumed
// message ids + content hashes), never from turn numbers — turn ranges are
// recomputed from live messages at view time (design doc §3.2 / §5.3).
//
// Pure module: no storage, no network, no Vue. Contract locks:
// tests/memory-ledger-contract.test.mjs.

import { HASH_VERSION } from './content-hash.mjs';

export const LEDGER_VERSION = 1;
export const ENTRY_KINDS = Object.freeze(['digest', 'fact', 'pin']);
export const FOLDED_ENTRY_LIMIT = 200;
export const FACT_KIND_CHARACTER = 'character';
export const FACT_KIND_PLOT = 'plot';
// v5 M2 UX limits: the pin layer is user-authored content, so it is bounded
// by count and per-entry length instead of a token budget (design doc §10).
export const PIN_TEXT_LIMIT = 500;
export const PIN_ENABLED_LIMIT = 10;

const asCount = (value, fallback = 0) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const normalizeFactKind = (value) => (
    value === FACT_KIND_CHARACTER || value === FACT_KIND_PLOT ? value : ''
);

const normalizeFactStatus = (value) => (value === 'closed' ? 'closed' : value === 'open' ? 'open' : '');

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
            legacy: meta.legacy === true,
            // Fact/pin bookkeeping (L4). These are mutable flags, not text:
            // the entry body itself stays append-only.
            manual: meta.manual === true,
            enabled: meta.enabled !== false,
            factKind: normalizeFactKind(meta.factKind),
            factKey: String(meta.factKey || '').trim(),
            factStatus: normalizeFactStatus(meta.factStatus),
            factDeadline: String(meta.factDeadline || '').trim()
        }
    };
};

export const createEmptyLedger = () => ({
    version: LEDGER_VERSION,
    hashVersion: HASH_VERSION,
    updatedAt: 0,
    entries: [],
    // Set once after the v4 info card was adopted as fact entries. Kept on
    // the ledger (not inferred from entries) so a later GC can never
    // resurrect a profile the user deleted (design doc §11).
    profileAdopted: false
});

// A stored ledger whose hashVersion no longer matches is a *controlled*
// full invalidation: every cover hash was computed under an older
// normalization definition, so nothing can be verified. Source messages
// stay on device, so reconciliation simply rebuilds from raw text
// (design doc §4 / §16 risk 4).
// Normalization is in-place on purpose: the reconciler holds the ledger
// across a multi-minute model call, and manual pin/fact CRUD mutates the same
// object. Returning a detached copy here would let the next save overwrite a
// user edit made while a batch was in flight.
export const normalizeLedger = (rawLedger) => {
    if (!rawLedger || typeof rawLedger !== 'object' || !Array.isArray(rawLedger.entries)) return null;
    if (asCount(rawLedger.hashVersion) !== HASH_VERSION) return createEmptyLedger();
    rawLedger.version = LEDGER_VERSION;
    rawLedger.hashVersion = HASH_VERSION;
    rawLedger.updatedAt = asCount(rawLedger.updatedAt);
    rawLedger.entries = rawLedger.entries.map(normalizeEntry).filter(Boolean);
    rawLedger.profileAdopted = rawLedger.profileAdopted === true;
    return rawLedger;
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

// A fact is one projected info-card row (character status or open plot).
// covers is the batch that produced it; an empty covers set is the manual
// lock (never invalidated by timeline edits, design doc §10).
export const makeFactEntry = ({
    id,
    factKind,
    factKey,
    text = '',
    status = '',
    deadline = '',
    covers = [],
    base = [],
    manual = false,
    legacy = false,
    model = '',
    tokens = 0,
    at = Date.now()
}) => normalizeEntry({
    id,
    kind: 'fact',
    level: 0,
    covers,
    base,
    text,
    meta: {
        at,
        model,
        tokens,
        stale: false,
        folded: false,
        legacy,
        manual,
        factKind,
        factKey,
        factStatus: status,
        factDeadline: deadline
    }
});

// Pins are user-authored: only user CRUD writes them, never reconcile.
export const makePinEntry = ({ id, text = '', enabled = true, at = Date.now() }) => normalizeEntry({
    id,
    kind: 'pin',
    level: 0,
    covers: [],
    base: [],
    text,
    meta: { at, enabled }
});

export const findEntry = (ledger, entryId) => (Array.isArray(ledger?.entries)
    ? ledger.entries.find(entry => entry.id === entryId) || null
    : null);

export const factGroupKey = (factKind, factKey) => `${factKind}:${String(factKey || '').trim()}`;

const isSameFactGroup = (entry, factKind, factKey) => (
    entry.kind === 'fact'
    && entry.meta.factKind === factKind
    && entry.meta.factKey === String(factKey || '').trim()
);

// Merging a fact never rewrites the old row: the previous visible entry for
// the same dedup key is folded (kept for traceability) and a new immutable
// entry is appended (design doc §10).
export const foldFactsForKey = (ledger, factKind, factKey) => {
    let changed = 0;
    for (const entry of ledger.entries) {
        if (entry.meta.folded || !isSameFactGroup(entry, factKind, factKey)) continue;
        entry.meta.folded = true;
        changed += 1;
    }
    return changed;
};

export const hasLiveManualFact = (ledger, factKind, factKey) => ledger.entries.some(entry => (
    !entry.meta.folded
    && !entry.meta.stale
    && entry.meta.manual === true
    && entry.covers.length === 0
    && isSameFactGroup(entry, factKind, factKey)
));

const asTrimmedText = (value) => String(value ?? '').trim();

// Turn the model's per-batch profile delta into immutable fact entries.
// Unchanged rows are still appended: covers carry the freshness of the
// batch that just re-affirmed them (design doc §5.4 / §10). Rows locked by
// the user (manual, covers:[]) are skipped, exactly like v5's merge skip.
export const appendProfileFacts = (ledger, profileData, {
    covers = [],
    at = Date.now(),
    model = '',
    makeId
} = {}) => {
    if (!profileData || typeof profileData !== 'object' || typeof makeId !== 'function') return 0;
    const incoming = new Map();

    (Array.isArray(profileData.characters) ? profileData.characters : []).forEach(rawCharacter => {
        const name = asTrimmedText(rawCharacter?.name);
        const status = asTrimmedText(rawCharacter?.status);
        // An empty status would blank a known character in the projection;
        // treat it as "no information" rather than a real update.
        if (!name || !status) return;
        incoming.set(factGroupKey(FACT_KIND_CHARACTER, name), {
            factKind: FACT_KIND_CHARACTER,
            factKey: name,
            text: status,
            status: '',
            deadline: ''
        });
    });

    (Array.isArray(profileData.openPlots) ? profileData.openPlots : []).forEach(rawPlot => {
        const summary = asTrimmedText(rawPlot?.summary);
        if (!summary) return;
        incoming.set(factGroupKey(FACT_KIND_PLOT, summary), {
            factKind: FACT_KIND_PLOT,
            factKey: summary,
            text: summary,
            status: rawPlot?.status === 'closed' ? 'closed' : 'open',
            deadline: asTrimmedText(rawPlot?.deadline)
        });
    });

    let appended = 0;
    incoming.forEach(fact => {
        if (hasLiveManualFact(ledger, fact.factKind, fact.factKey)) return;
        foldFactsForKey(ledger, fact.factKind, fact.factKey);
        appendEntry(ledger, makeFactEntry({
            id: makeId(),
            covers,
            at,
            model,
            ...fact
        }));
        appended += 1;
    });
    return appended;
};

// Adopt the v4 memory_profile key as fact entries. Legacy rows keep covers:[]
// so the text survives until the next batch supersedes it; they are not
// marked manual, so a fresh auto fact can take the key over.
export const adoptLegacyProfile = ({ profile, makeId, now = Date.now() } = {}) => {
    if (!profile || typeof profile !== 'object' || typeof makeId !== 'function') return [];
    const entries = [];
    (Array.isArray(profile.characters) ? profile.characters : []).forEach(rawCharacter => {
        const name = asTrimmedText(rawCharacter?.name);
        const status = asTrimmedText(rawCharacter?.status);
        if (!name || !status) return;
        entries.push(makeFactEntry({
            id: makeId(),
            factKind: FACT_KIND_CHARACTER,
            factKey: name,
            text: status,
            covers: [],
            legacy: true,
            at: now
        }));
    });
    (Array.isArray(profile.openPlots) ? profile.openPlots : []).forEach(rawPlot => {
        const summary = asTrimmedText(rawPlot?.summary);
        if (!summary) return;
        entries.push(makeFactEntry({
            id: makeId(),
            factKind: FACT_KIND_PLOT,
            factKey: summary,
            text: summary,
            status: rawPlot?.status === 'closed' ? 'closed' : 'open',
            deadline: asTrimmedText(rawPlot?.deadline),
            covers: [],
            legacy: true,
            at: now
        }));
    });
    return entries;
};

// --- Pins ------------------------------------------------------------------

export const normalizePinText = (value) => String(value ?? '').trim();

export const validatePinText = (value) => {
    const text = normalizePinText(value);
    if (!text) return '手动记忆内容不能为空';
    if (text.length > PIN_TEXT_LIMIT) return `单条手动记忆不能超过 ${PIN_TEXT_LIMIT} 字`;
    return '';
};

export const countEnabledPins = (ledger) => (Array.isArray(ledger?.entries)
    ? ledger.entries.filter(entry => entry.kind === 'pin'
        && !entry.meta.folded
        && entry.meta.enabled !== false
        && normalizePinText(entry.text)).length
    : 0);

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

// Coverage is the *union of the individual covered turns*, not the min/max
// span of each entry: the adopted legacy entry carries the union of all
// done ranges, so a min/max projection would paint over failed holes and
// the hole-fill mechanism would never retry them (design doc §6.1 step 2).
// Contiguous runs are merged so computePendingBatch sees done-range shape.
export const projectCoveredRanges = (ledger, liveTurnIndex) => {
    const coveredTurns = new Set();
    for (const entry of ledger.entries) {
        if (entry.kind !== 'digest' || entry.meta.stale) continue;
        for (const cover of entry.covers) {
            const turn = liveTurnIndex.get(cover.id);
            if (Number.isFinite(turn)) coveredTurns.add(turn);
        }
    }
    const turns = Array.from(coveredTurns).sort((a, b) => a - b);
    const ranges = [];
    for (const turn of turns) {
        const last = ranges[ranges.length - 1];
        if (last && turn <= last.toTurn + 1) {
            last.toTurn = Math.max(last.toTurn, turn);
        } else {
            ranges.push({ fromTurn: turn, toTurn: turn });
        }
    }
    return ranges;
};

// The v4 hole computation consumes done batches; ledger coverage is
// projected into the same shape so computePendingBatch is reused as-is.
export const rangesToDoneBatches = (ranges) => ranges.map(range => ({ ...range, status: 'done' }));

// --- Compaction (design doc §9.1) ------------------------------------------

// LSM-style fanout: when a level holds more than COMPACT_FANOUT visible
// entries, the oldest group is folded into one level+1 entry. The threshold
// is user-tunable (4–8) and clamped by the settings normalizer.
export const COMPACT_FANOUT = 5;
export const COMPACT_FANOUT_MIN = 4;
export const COMPACT_FANOUT_MAX = 8;

// Fold-eligible digests: active entries that carry text and still own live
// coverage. Text-less legacy coverage markers contribute nothing to a fold;
// covers:[] legacy text must never become stale-able by being merged into a
// parent (it is the only surviving record, design doc §11).
const isFoldable = (entry) => entry.kind === 'digest'
    && !entry.meta.stale
    && !entry.meta.folded
    && entry.covers.length > 0
    && String(entry.text || '').trim().length > 0;

// Selection is deterministic: lowest over-full level first, oldest group
// first, so repeated triggers converge on the same shape. liveTurnIndex
// orders the group by story position — append order is not story order once
// stale ranges have been rewritten (design doc §5.3).
export const selectCompactionGroup = (ledger, liveTurnIndex, { fanout = COMPACT_FANOUT } = {}) => {
    const threshold = Math.max(2, Math.floor(Number(fanout) || COMPACT_FANOUT));
    const byLevel = new Map();
    for (const entry of ledger.entries) {
        if (!isFoldable(entry)) continue;
        const level = asCount(entry.level);
        if (!byLevel.has(level)) byLevel.set(level, []);
        byLevel.get(level).push(entry);
    }
    const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    for (const level of levels) {
        const candidates = byLevel.get(level);
        if (candidates.length <= threshold) continue;
        const sorted = [...candidates].sort((a, b) => {
            const turnsA = projectEntryTurns(a, liveTurnIndex);
            const turnsB = projectEntryTurns(b, liveTurnIndex);
            const startA = turnsA.length ? Math.min(...turnsA) : Infinity;
            const startB = turnsB.length ? Math.min(...turnsB) : Infinity;
            return (startA - startB) || (a.meta.at - b.meta.at);
        });
        return { level, entries: sorted.slice(0, threshold) };
    }
    return null;
};

// Appends the level+1 fold entry and marks its sources folded in the same
// synchronous step (one save follows). The parent is written first: a crash
// between the model call and persistence leaves the ledger flat, never a
// fold whose sources disappeared (design doc §6.1 step 4).
export const applyCompaction = (ledger, { entries, text, id, model = '', at = Date.now() }) => {
    const sources = Array.isArray(entries) ? entries.filter(Boolean) : [];
    const body = String(text || '').trim();
    if (sources.length === 0 || !body) return null;
    if (findEntry(ledger, id)) return null;
    const covers = [];
    const seen = new Set();
    const base = [];
    let level = 0;
    for (const entry of sources) {
        base.push(entry.id);
        level = Math.max(level, asCount(entry.level));
        for (const cover of entry.covers) {
            if (seen.has(cover.id)) continue;
            seen.add(cover.id);
            covers.push({ ...cover });
        }
    }
    const parent = appendEntry(ledger, makeDigestEntry({
        id,
        covers,
        text: body,
        level: level + 1,
        base,
        model,
        at
    }));
    if (!parent) return null;
    for (const entry of sources) entry.meta.folded = true;
    return parent;
};

// --- GC --------------------------------------------------------------------

// Invariant: folded means "a live parent lists me in base[]". When that
// parent turns stale (edit/delete) or is pruned, its children would stay
// hidden with nothing representing them, so they are unfolded — the ledger
// falls back to a flat shape for that range and the next pass re-compacts it
// (design doc §9.1 rollback boundary). Fact folds are excluded: they are
// superseded by a newer row of the same key, not by a base[] parent.
export const releaseOrphanedFolds = (ledger) => {
    // Multi-level chains matter: a folded parent still represents its
    // children — the content lives on in the grandparent. Only a *stale*
    // parent (or a pruned one) breaks the guarantee.
    const liveParents = new Set();
    for (const entry of ledger.entries) {
        if (entry.meta.stale || entry.base.length === 0) continue;
        for (const baseId of entry.base) liveParents.add(baseId);
    }
    let changed = 0;
    for (const entry of ledger.entries) {
        if (entry.kind !== 'digest' || !entry.meta.folded) continue;
        if (liveParents.has(entry.id)) continue;
        entry.meta.folded = false;
        changed += 1;
    }
    return changed;
};

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
    const longText = String(summaries?.long || '').trim();
    const shortText = String(summaries?.short || '').trim();
    // The L1 projection keeps short as a suffix of long, so a recovery run
    // would otherwise inject the recent digests twice.
    const combined = [longText, shortText && !longText.includes(shortText) ? shortText : '']
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
    const child = {
        ...ledger,
        updatedAt: Date.now(),
        entries: ledger.entries
            .filter(entry => entry.covers.length === 0 || entry.covers.every(cover => survivors.has(cover.id)))
            .map(entry => ({ ...entry, covers: entry.covers.map(cover => ({ ...cover })), meta: { ...entry.meta } }))
    };
    // A fold parent whose span crosses the fork point is filtered away while
    // some children survive; release them so the child branch never hides
    // content behind a parent that only exists in the old branch (§9.1).
    releaseOrphanedFolds(child);
    return child;
};