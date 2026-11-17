// memory-view — pure fold of the ledger into injectable blocks (v6 L1)
//
// buildMemoryView(ledger, liveTurnIndex, settings) is a pure function: no
// storage, no network, no Vue reactivity, no globals. That is what makes
// branch/edit/delete scenarios unit-testable without mocks (design doc §5).
//
// L1 scope: digest folding (long/short/toc + a batches projection the
// unmodified MemoryPanel keeps rendering). pins and card are part of the
// output shape but stay empty until L4 moves fact/pin entries into the
// ledger. Budgets use deliberately loose L1 defaults — tightening happens
// in L5 (design doc §17 Q7) so upgraded users do not see summaries
// abruptly shrink.
//
// Contract locks: tests/memory-view-contract.test.mjs.

import { estimateTokens } from './utils.mjs';
import { extractVectorQueryTerms } from './memory-utils.mjs';

export const VIEW_DEFAULTS = Object.freeze({
    longBudget: 12000,
    shortBudget: 12000,
    tocBudget: 4000,
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
        .filter(entry => entry.kind === 'digest' && isVisible(entry))
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

    const longText = truncateToBudget(digests.map(item => item.text).join('\n\n'), config.longBudget);
    const shortCount = Math.max(1, Math.floor(config.shortDigestCount));
    const shortText = truncateToBudget(
        digests.slice(Math.max(0, digests.length - shortCount)).map(item => item.text).join('\n\n'),
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

    const pins = entries
        .filter(entry => entry.kind === 'pin' && isVisible(entry))
        .map(entry => String(entry.text || '').trim())
        .filter(Boolean);

    return {
        pins,
        long: longText,
        short: shortText,
        card: { characters: [], openPlots: [] },
        toc,
        batches,
        tokens: {
            long: estimateTokens(longText),
            short: estimateTokens(shortText),
            toc: tocTokens
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
        if (entry.kind !== 'digest' || entry.meta.stale || entry.covers.length === 0) continue;
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