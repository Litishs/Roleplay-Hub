// content-hash — content-addressed identity for the memory ledger (v6 L1)
//
// canonicalMemoryText is the single normalization definition shared by
// covers.h hashes and the summarizeBatch input. Only deterministic,
// content-only strippers are allowed on this path: state-dependent
// strippers (stripDisabledImageGenContext keys off isAutoImageGenEnabled)
// must never enter it, otherwise toggling a setting would invalidate the
// whole ledger (design doc §16 risk 4).
//
// contentHash is FNV-1a 32-bit over UTF-16 code units: synchronous and
// allocation-free. crypto.subtle is async and far too heavy for a
// per-message staleness check, so it is deliberately not used.
//
// Contract locks: tests/content-hash-contract.test.mjs.

import { parseCot, stripUiTemplateContextInjection } from './utils.mjs';

export const HASH_VERSION = 1;

// Mirrors UI_TEMPLATE_UPDATES_*_STRIP_PATTERN in app.mjs. The content-hash
// contract test locks both spellings so the two copies cannot drift.
const UI_TEMPLATE_UPDATES_STRIP_PATTERN = /<ui_template_updates\b[^>]*>[\s\S]*?<\/ui_template_updates>/gi;
const UI_TEMPLATE_UPDATES_OPEN_STRIP_PATTERN = /<ui_template_updates\b[^>]*>[\s\S]*$/i;

export const stripUiTemplateUpdateBlock = (text) => String(text || '')
    .replace(UI_TEMPLATE_UPDATES_STRIP_PATTERN, '')
    .replace(UI_TEMPLATE_UPDATES_OPEN_STRIP_PATTERN, '')
    .trimEnd();

const readContent = (messageOrText) => (typeof messageOrText === 'string'
    ? messageOrText
    : String(messageOrText?.content ?? ''));

// parseCot splits CoT, main text and a trailing [系统指令] block out of a
// message. Canonical text keeps main + sys and drops CoT: thinking output
// is not story content, so editing it must not stale a digest.
export const canonicalMemoryText = (messageOrText) => {
    const raw = readContent(messageOrText);
    if (!raw) return '';
    const parsed = parseCot(raw);
    const merged = parsed.sys ? `${parsed.main}\n\n[系统指令:\n${parsed.sys}]` : parsed.main;
    return stripUiTemplateUpdateBlock(stripUiTemplateContextInjection(merged)).trim();
};

export const contentHash = (text) => {
    const value = String(text ?? '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const HASH_CACHE_LIMIT = 4096;
const hashCache = new Map();

// Reconcile re-hashes every live message on each run (design doc §16 risk
// 3). A content string identifies its hash uniquely, so a bounded cache
// keyed by raw content removes the parseCot + FNV cost for untouched
// messages. Never call this from render or per-save paths.
export const canonicalMessageHash = (messageOrText) => {
    const raw = readContent(messageOrText);
    if (!raw) return contentHash('');
    const cached = hashCache.get(raw);
    if (cached !== undefined) return cached;
    const hash = contentHash(canonicalMemoryText(raw));
    if (hashCache.size >= HASH_CACHE_LIMIT) {
        const oldestKey = hashCache.keys().next().value;
        if (oldestKey !== undefined) hashCache.delete(oldestKey);
    }
    hashCache.set(raw, hash);
    return hash;
};

export const clearHashCache = () => { hashCache.clear(); };