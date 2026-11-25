// conversation-summary.mjs — per-character "last message" summary used by the
// conversation list (home screen) and its wide-screen side column.
//
// The list must show a preview for every character, but chat histories are
// loaded per character on demand (one SQLite read per character would make the
// home screen O(n) reads). Instead each character keeps a tiny record:
//
//   summaries[characterUuid] = { messageId, at, preview, readAt }
//
// `at` doubles as the sort key, and `readAt` is what makes the unread dot
// honest: it is stamped while that character's chat is the open one, so the
// marker only appears for conversations the user has not looked at.
//
// Pure functions only; the caller owns persistence (AGENTS.md §2.1 pattern).

import { parseCot } from './utils.mjs';
import { stripMemoryCitations } from './memory-citation.mjs';

export const CONVERSATION_PREVIEW_MAX = 80;

const normaliseText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// buildConversationEntry(messages) — newest speakable line, or null when the
// conversation has nothing worth previewing yet.
export const buildConversationEntry = (messages, now = Date.now()) => {
    if (!Array.isArray(messages)) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (!message || (message.role !== 'assistant' && message.role !== 'user')) continue;
        // parseCot drops the <think>/CoT envelope and UI-template payloads, so a
        // reasoning-only turn never becomes the preview.
        const main = stripMemoryCitations(parseCot(String(message.content || ''), true).main || '');
        const text = normaliseText(main);
        if (!text) continue;
        return {
            messageId: String(message.id || ''),
            at: Number(message.timestamp) || now,
            preview: text.slice(0, CONVERSATION_PREVIEW_MAX)
        };
    }
    return null;
};

// shouldReplaceConversationEntry(existing, next) — avoid re-rendering and
// re-persisting when streaming produced the same preview for the same message.
export const shouldReplaceConversationEntry = (existing, next) => {
    if (!next) return false;
    if (!existing) return true;
    return existing.messageId !== next.messageId || existing.preview !== next.preview;
};

// mergeConversationEntry(summaries, key, next, { read }) — immutable update;
// returns the same object when nothing changed so callers can skip writes.
export const mergeConversationEntry = (summaries, key, next, options = {}) => {
    if (!key || !next) return summaries;
    const current = summaries[key] || null;
    // Opening a conversation stamps readAt; a save from a background character
    // must never mark it read.
    const readAt = options.read
        ? Math.max(Number(current?.readAt) || 0, next.at)
        : (Number(current?.readAt) || 0);
    const entryUnchanged = current && !shouldReplaceConversationEntry(current, next);
    if (entryUnchanged && Number(current.readAt) === readAt) {
        return summaries;
    }
    return {
        ...summaries,
        [key]: {
            ...(current || {}),
            ...next,
            readAt
        }
    };
};

// markConversationRead(summaries, key, at) — stamp readAt without touching the
// preview (used when a chat is opened).
export const markConversationRead = (summaries, key, at = Date.now()) => {
    if (!key) return summaries;
    const current = summaries[key];
    if (!current || Number(current.readAt) >= at) return summaries;
    return { ...summaries, [key]: { ...current, readAt: at } };
};

// sortConversations(characters, summaries, { activeIndex }) — conversations with
// history first (newest activity first), the rest keep their store order so a
// fresh install is never arbitrarily reshuffled.
export const sortConversations = (characters, summaries = {}) => {
    const active = [];
    const idle = [];
    (characters || []).forEach((char, index) => {
        if (!char) return;
        const summary = char.uuid ? summaries[char.uuid] : null;
        const item = { char, index, summary: summary || null };
        if (summary && Number(summary.at) > 0) active.push(item);
        else idle.push(item);
    });
    active.sort((a, b) => {
        const delta = Number(b.summary.at) - Number(a.summary.at);
        return delta !== 0 ? delta : a.index - b.index;
    });
    return [...active, ...idle];
};

// hasUnreadConversation(summary) — a dot only when something arrived after the
// last time that character's chat was open.
export const hasUnreadConversation = (summary) => {
    if (!summary) return false;
    const at = Number(summary.at) || 0;
    const readAt = Number(summary.readAt) || 0;
    return at > readAt;
};
