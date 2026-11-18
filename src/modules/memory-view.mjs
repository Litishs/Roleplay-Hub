// memory-view — pure fold of the ledger into injectable blocks (v6 L1)
//
// buildMemoryView(ledger, liveTurnIndex, settings) is a pure function: no
// storage, no network, no Vue reactivity, no globals. That is what makes
// branch/edit/delete scenarios unit-testable without mocks (design doc §5).
//
// Output: digest folding (long/short/toc + the batches projection the
// panel keeps rendering), the pin layer and the info-card projection
// (L4, design doc §10). L5 tightens the three budgets so the hard
// truncation below is a real injection bound (design doc §5.2 / §17 Q7);
// long/short/card values match the v4-era targets users already know.
//
// Contract locks: tests/memory-view-contract.test.mjs.

import { estimateTokens } from './utils.mjs';
import { extractVectorQueryTerms } from './memory-utils.mjs';
import { PIN_ENABLED_LIMIT } from './memory-ledger.mjs';

export const VIEW_DEFAULTS = Object.freeze({
    longBudget: 600,
    shortBudget: 1000,
    tocBudget: 300,
    cardBudget: 800,
    shortDigestCount: 4
});

// Lexical auto-recall (v6 L3 §8.2): the query is the latest user input plus
// the head of the previous assistant reply. Ranking is deliberately the v4
// fallback idea — hit count first, then recency — applied to distilled
// digest text instead of raw fragments.
export const RECALL_DEFAULTS = Object.freeze({
    recallLimit: 3,
    recallBudget: 1400
});

const truncateToBudget = (text, budget) => {
    const value = String(text || '');
    if (!value) return '';
    if (!Number.isFinite(budget) || budget <= 0) return value;
    if (estimateTokens(value) <= budget) return value;
    // Proportional first cut, then shrink until the *token* estimate (the
    // same one the injection budget uses) fits — CJK and latin text have
    // different char/token ratios, so a fixed char cap would overshoot.
    const totalTokens = estimateTokens(value);
    let cut = value.slice(0, Math.max(1, Math.floor(value.length * ((budget - 1) / totalTokens))));
    while (cut.length > 1 && estimateTokens(`${cut}…`) > budget) {
        cut = cut.slice(0, cut.length - Math.max(1, Math.ceil(cut.length * 0.05)));
    }
    return `${cut.trimEnd()}…`;
};

const formatTurnLabel = (fromTurn, toTurn) => {
    if (!fromTurn) return '历史';
    return fromTurn === toTurn ? `第 ${fromTurn} 轮` : `第 ${fromTurn}–${toTurn} 轮`;
};

// liveTurnIndex: Map<messageId, turnNumber> of the current live snapshot.
// Entries whose covers no longer resolve are treated as invisible here
// (cheap defensive check, no hashes); reconcile owns the authoritative
// staleness decision.
export const buildMemoryView = (ledger, liveTurnIndex, settings = {}) => {
    const config = { ...VIEW_DEFAULTS, ...(settings && typeof settings === 'object' ? settings : {}) };
    const turnIndex = liveTurnIndex instanceof Map ? liveTurnIndex : new Map();
    const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];

    const isVisible = (entry) => {
        if (entry.meta.stale) return false;
        if (entry.covers.length === 0) return true;
        return entry.covers.every(cover => turnIndex.has(cover.id));
    };
    const resolveTurns = (entry) => {
        const turns = [];
        for (const cover of entry.covers) {
            const turn = turnIndex.get(cover.id);
            if (Number.isFinite(turn)) turns.push(turn);
        }
        return turns;
    };

    const digests = entries
        // Folded digests are represented by their level+1 parent. Including
        // them would inject the same span twice (L5 / design doc §9.1).
        .filter(entry => entry.kind === 'digest' && !entry.meta.folded && isVisible(entry))
        .map(entry => {
            const turns = resolveTurns(entry);
            return {
                entry,
                text: String(entry.text || '').trim(),
                fromTurn: turns.length ? Math.min(...turns) : 0,
                toTurn: turns.length ? Math.max(...turns) : 0
            };
        })
        // Text-less adopted coverage entries carry no injectable content.
        .filter(item => item.text)
        // Story order: turn projection first (append order is regenerated
        // out of order when stale ranges are rewritten).
        .sort((a, b) => (a.fromTurn - b.fromTurn) || (a.entry.meta.at - b.entry.meta.at));

    // long/short split (design doc §5.1 / §9.1): short carries the recent
    // level-0 batches (fresh detail), long carries everything else — the
    // folded higher levels plus older batches not yet compacted. The two
    // sets are disjoint; the L1 projection intentionally let short be a
    // suffix of long, which double-injected the same text.
    const level0 = digests.filter(item => (Number(item.entry.level) || 0) === 0);
    const shortPool = level0.length > 0 ? level0 : digests;
    const shortCount = Math.max(1, Math.floor(config.shortDigestCount));
    const shortItems = shortPool.slice(Math.max(0, shortPool.length - shortCount));
    const shortIds = new Set(shortItems.map(item => item.entry.id));
    const longItems = digests.filter(item => !shortIds.has(item.entry.id));
    const longText = truncateToBudget(longItems.map(item => item.text).join('\n\n'), config.longBudget);
    const shortText = truncateToBudget(
        shortItems.map(item => item.text).join('\n\n'),
        config.shortBudget
    );

    const toc = [];
    let tocTokens = 0;
    for (const item of digests) {
        const summary = item.text.length > 120 ? `${item.text.slice(0, 119).trimEnd()}…` : item.text;
        const tokens = estimateTokens(summary);
        if (tocTokens + tokens > config.tocBudget) break;
        tocTokens += tokens;
        toc.push({
            label: formatTurnLabel(item.fromTurn, item.toTurn),
            entryId: item.entry.id,
            level: Number(item.entry.level) || 0,
            summary,
            tokens
        });
    }

    // Projection consumed by the unchanged MemoryPanel (batch chips and the
    // story timeline read fromTurn/toTurn/status).
    const batches = digests.map(item => ({
        fromTurn: item.fromTurn,
        toTurn: item.toTurn,
        status: 'done',
        at: item.entry.meta.at
    }));

    // Pins are user-authored and never invalidated by timeline edits
    // (covers:[]). Disabled pins stay in the ledger but out of the prompt.
    const pins = entries
        .filter(entry => entry.kind === 'pin' && isVisible(entry) && entry.meta.enabled !== false)
        .map(entry => ({
            text: String(entry.text || '').trim(),
            at: Number(entry.meta.at) || 0
        }))
        .filter(item => item.text)
        .sort((a, b) => a.at - b.at)
        .slice(0, PIN_ENABLED_LIMIT)
        .map(item => item.text);

    // Info-card projection (design doc §10): one row per dedup key, newest
    // non-stale/non-folded fact wins; a manual (locked) fact wins over any
    // auto fact for the same key. lastSeenTurn is a render-time projection of
    // the still-live covers, so freshness is exact rather than a heuristic.
    const factGroups = new Map();
    for (const entry of entries) {
        if (entry.kind !== 'fact' || !isVisible(entry) || entry.meta.folded) continue;
        const factKind = entry.meta.factKind;
        const factKey = String(entry.meta.factKey || '').trim();
        if (!factKind || !factKey) continue;
        const turns = resolveTurns(entry);
        const candidate = {
            entry,
            factKind,
            factKey,
            lastSeenTurn: turns.length ? Math.max(...turns) : 0,
            at: Number(entry.meta.at) || 0
        };
        const group = factGroups.get(`${factKind}:${factKey}`);
        if (!group) {
            factGroups.set(`${factKind}:${factKey}`, candidate);
            continue;
        }
        const groupManual = group.entry.meta.manual === true;
        const candidateManual = entry.meta.manual === true;
        if (candidateManual && !groupManual) {
            factGroups.set(`${factKind}:${factKey}`, candidate);
        } else if (candidateManual === groupManual && candidate.at >= group.at) {
            factGroups.set(`${factKind}:${factKey}`, candidate);
        }
    }
    const characterRows = [];
    const plotRows = [];
    factGroups.forEach(({ entry, factKind, factKey, lastSeenTurn, at }) => {
        const common = {
            entryId: entry.id,
            lastSeenTurn,
            manual: entry.meta.manual === true,
            legacy: entry.meta.legacy === true,
            at
        };
        if (factKind === 'character') {
            const row = { ...common, name: factKey, status: String(entry.text || '').trim() };
            characterRows.push({ row, cost: estimateTokens(`${row.name} ${row.status}`) });
        } else {
            const row = {
                ...common,
                summary: factKey,
                status: entry.meta.factStatus === 'closed' ? 'closed' : 'open',
                deadline: String(entry.meta.factDeadline || '').trim()
            };
            plotRows.push({ row, cost: estimateTokens(`${row.summary} ${row.deadline}`) });
        }
    });

    // cardBudget backstop (design doc §5.2): the per-key projection is
    // bounded by the number of live keys, but a pathological card (dozens
    // of plots) must still hit a hard cap. Locked rows win, then the
    // freshest rows; overflow rows are dropped whole rather than cut
    // mid-sentence, and at least one row is always kept.
    const rankCardRows = (rows) => [...rows].sort((a, b) => (
        (Number(b.row.manual) - Number(a.row.manual))
        || ((b.row.lastSeenTurn || 0) - (a.row.lastSeenTurn || 0))
        || ((b.row.at || 0) - (a.row.at || 0))
    ));
    const applyCardBudget = (rows) => {
        const ranked = rankCardRows(rows);
        if (!Number.isFinite(config.cardBudget) || config.cardBudget <= 0) {
            return {
                rows: ranked.map(item => item.row),
                tokens: ranked.reduce((sum, item) => sum + item.cost, 0)
            };
        }
        const kept = [];
        let used = 0;
        for (const item of ranked) {
            if (kept.length > 0 && used + item.cost > config.cardBudget) continue;
            used += item.cost;
            kept.push(item);
        }
        return { rows: kept.map(item => item.row), tokens: used };
    };
    const characters = applyCardBudget(characterRows);
    const openPlots = applyCardBudget(plotRows);
    const card = { characters: characters.rows, openPlots: openPlots.rows };

    return {
        pins,
        long: longText,
        short: shortText,
        card,
        toc,
        batches,
        tokens: {
            long: estimateTokens(longText),
            short: estimateTokens(shortText),
            toc: tocTokens,
            card: characters.tokens + openPlots.tokens
        },
        budgets: {
            long: config.longBudget,
            short: config.shortBudget,
            toc: config.tocBudget,
            card: config.cardBudget
        }
    };
};

// buildMemoryRecall — pure lexical selection over visible digest entries.
// settings.excludedTurns: turns still inside the raw-context window; an
// entry whose every covered turn is retained adds nothing to the prompt.
export const buildMemoryRecall = (ledger, liveTurnIndex, queryText, settings = {}) => {
    const config = { ...RECALL_DEFAULTS, ...(settings && typeof settings === 'object' ? settings : {}) };
    const turnIndex = liveTurnIndex instanceof Map ? liveTurnIndex : new Map();
    const excludedTurns = config.excludedTurns instanceof Set ? config.excludedTurns : new Set();
    const terms = extractVectorQueryTerms(queryText);
    if (terms.length === 0) return [];

    const lowerTerms = terms.map(term => term.toLowerCase());
    const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
    const scored = [];
    for (const entry of entries) {
        // Folded entries are already represented by their parent; returning
        // both would spend the recall budget twice on the same span.
        if (entry.kind !== 'digest' || entry.meta.stale || entry.meta.folded || entry.covers.length === 0) continue;
        const turns = [];
        let visible = true;
        for (const cover of entry.covers) {
            if (!turnIndex.has(cover.id)) { visible = false; break; }
            turns.push(turnIndex.get(cover.id));
        }
        if (!visible || turns.length === 0) continue;
        if (turns.every(turn => excludedTurns.has(turn))) continue;
        const text = String(entry.text || '').trim();
        if (!text) continue;
        const haystack = text.toLowerCase();
        const hits = lowerTerms.filter(term => haystack.includes(term)).length;
        if (hits === 0) continue;
        scored.push({
            entry,
            text,
            hits,
            fromTurn: Math.min(...turns),
            toTurn: Math.max(...turns)
        });
    }

    scored.sort((a, b) => (b.hits - a.hits) || (b.toTurn - a.toTurn));
    const limit = Math.max(1, Math.floor(config.recallLimit));
    const picked = [];
    let usedTokens = 0;
    for (const item of scored) {
        if (picked.length >= limit) break;
        const tokens = estimateTokens(item.text);
        if (picked.length > 0 && usedTokens + tokens > config.recallBudget) continue;
        usedTokens += tokens;
        picked.push({
            entryId: item.entry.id,
            level: Number(item.entry.level) || 0,
            fromTurn: item.fromTurn,
            toTurn: item.toTurn,
            text: item.text,
            score: item.hits
        });
    }
    return picked;
};