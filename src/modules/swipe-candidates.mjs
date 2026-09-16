// swipe-candidates.mjs — pure data operations for the swipe candidate model
// (末楼 AI 消息多候选：重新生成追加候选而非覆盖，见 documents/swipe候选重掷工程方案.md)
//
// Data model (assistant messages only):
//   msg.swipes = [{ content, reasoning, uiTemplateBlocks?, uiTemplateTurn?, timing? }, ...]
//   msg.activeSwipeIndex = 0..swipes.length-1
//
// Invariants maintained here (§3.2 of the design doc):
// - Mirror: msg.content === msg.swipes[msg.activeSwipeIndex].content (reasoning likewise)
// - Pairing: swipes and activeSwipeIndex exist together; the index stays in bounds
// - The candidate cap is read from RPHRuntimePolicy (limits.swipeMaxCandidates); never hardcoded here.
//
// Pure functions only — no Vue / storage dependencies, directly testable via node --test
// (AGENTS.md §2.1 standard module pattern). No globalThis export needed (no cross-page consumers).

import { RPHRuntimePolicy } from './runtime-policy.mjs';

const getSwipeMaxCandidates = () => {
    const value = Number(RPHRuntimePolicy?.limits?.swipeMaxCandidates);
    return Number.isFinite(value) && value >= 2 ? value : 5;
};

const cloneCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return { content: '', reasoning: '' };
    const cloned = {
        content: String(candidate.content ?? ''),
        reasoning: String(candidate.reasoning ?? '')
    };
    if (candidate.uiTemplateBlocks !== undefined) {
        cloned.uiTemplateBlocks = JSON.parse(JSON.stringify(candidate.uiTemplateBlocks));
    }
    if (candidate.uiTemplateTurn !== undefined) {
        cloned.uiTemplateTurn = JSON.parse(JSON.stringify(candidate.uiTemplateTurn));
    }
    if (candidate.timing !== undefined) {
        cloned.timing = candidate.timing && typeof candidate.timing === 'object'
            ? JSON.parse(JSON.stringify(candidate.timing))
            : candidate.timing;
    }
    return cloned;
};

const readStoredSwipes = (message) => {
    if (!message || typeof message !== 'object') return null;
    if (!Array.isArray(message.swipes) || message.swipes.length === 0) return null;
    return message.swipes;
};

// initSwipes(message): lazily turn a legacy single-candidate message into the swipe model.
// Mirrors the current content/reasoning as swipes[0]. Returns true when it initialized.
export function initSwipes(message) {
    if (!message || typeof message !== 'object' || message.role !== 'assistant') return false;
    if (Array.isArray(message.swipes) && message.swipes.length > 0) {
        if (!Number.isInteger(message.activeSwipeIndex) || message.activeSwipeIndex < 0 || message.activeSwipeIndex >= message.swipes.length) {
            message.activeSwipeIndex = 0;
        }
        return false;
    }
    message.swipes = [{ content: String(message.content ?? ''), reasoning: String(message.reasoning ?? '') }];
    message.activeSwipeIndex = 0;
    return true;
}

// captureActiveCandidate(message, extra): lazy-capture hook — write the live mirror
// (msg.content / msg.reasoning) back into the active slot, then merge optional extra
// fields (uiTemplateBlocks / uiTemplateTurn / timing). Call this BEFORE any pruning,
// and when a candidate is about to leave the active position.
export function captureActiveCandidate(message, extra = {}) {
    if (!message || typeof message !== 'object') return null;
    initSwipes(message);
    const swipes = readStoredSwipes(message);
    const index = Math.max(0, Math.min(Number(message.activeSwipeIndex) || 0, swipes.length - 1));
    const candidate = swipes[index];
    candidate.content = String(message.content ?? '');
    candidate.reasoning = String(message.reasoning ?? '');
    if ('uiTemplateBlocks' in extra) {
        if (extra.uiTemplateBlocks === undefined) delete candidate.uiTemplateBlocks;
        else candidate.uiTemplateBlocks = JSON.parse(JSON.stringify(extra.uiTemplateBlocks));
    }
    if ('uiTemplateTurn' in extra) {
        if (extra.uiTemplateTurn === undefined) delete candidate.uiTemplateTurn;
        else candidate.uiTemplateTurn = JSON.parse(JSON.stringify(extra.uiTemplateTurn));
    }
    if ('timing' in extra) {
        if (extra.timing === undefined) delete candidate.timing;
        else candidate.timing = extra.timing && typeof extra.timing === 'object'
            ? JSON.parse(JSON.stringify(extra.timing))
            : extra.timing;
    }
    return candidate;
}

// appendSwipeCandidate(message, candidate, maxCandidates): push a new candidate,
// FIFO-evict the oldest beyond the cap, clamp activeSwipeIndex, and keep the mirror
// untouched (the caller assigns msg.content / msg.reasoning afterwards).
// Returns the number of evicted candidates (0 or 1).
export function appendSwipeCandidate(message, candidate, maxCandidates) {
    if (!message || typeof message !== 'object') return 0;
    initSwipes(message);
    const cap = Number.isFinite(Number(maxCandidates)) && Number(maxCandidates) >= 2
        ? Number(maxCandidates)
        : getSwipeMaxCandidates();
    const swipes = message.swipes;
    swipes.push(cloneCandidate(candidate));
    let evicted = 0;
    while (swipes.length > cap) {
        swipes.shift();
        evicted++;
    }
    if (!Number.isInteger(message.activeSwipeIndex) || message.activeSwipeIndex < 0 || message.activeSwipeIndex >= swipes.length) {
        message.activeSwipeIndex = swipes.length - 1;
    }
    return evicted;
}

// normalizeSwipes(message): repair pairing invariant violations on loaded/legacy data.
// Broken pairing (missing/empty swipes, or an out-of-bounds/non-numeric index) degrades
// to a single candidate anchored on the mirror content — the displayed truth (§6.1).
export function normalizeSwipes(message) {
    if (!message || typeof message !== 'object') return;
    if (!Array.isArray(message.swipes) || message.swipes.length === 0) {
        if (message.swipes !== undefined) delete message.swipes;
        if (message.activeSwipeIndex !== undefined) delete message.activeSwipeIndex;
        return;
    }
    const rawIndex = message.activeSwipeIndex;
    const indexValid = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < message.swipes.length;
    if (!indexValid) {
        const mirrorContent = String(message.content ?? '');
        const mirrorReasoning = String(message.reasoning ?? '');
        const fallback = (mirrorContent || mirrorReasoning)
            ? { content: mirrorContent, reasoning: mirrorReasoning }
            : cloneCandidate(message.swipes[0]);
        message.swipes = [fallback];
        message.activeSwipeIndex = 0;
        message.content = fallback.content;
        message.reasoning = fallback.reasoning;
        return;
    }
    message.swipes = message.swipes.map(cloneCandidate);
    const active = message.swipes[rawIndex];
    message.content = String(active?.content ?? '');
    message.reasoning = String(active?.reasoning ?? '');
}

// swipeMaxCandidates(): the effective cap for callers (tests / app wiring).
export function swipeMaxCandidates() {
    return getSwipeMaxCandidates();
}
