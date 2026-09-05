// style-filter — assistant reply style filter (Stage 2 inline panel feature).
// Ported from upstream STA1N (app.js filterBlockedStyleText, 2026-09-05):
// strips AI-cliché fragments ("文风过滤") from assistant bodies while leaving
// quoted dialogue, code blocks, HTML documents and UI-template update blocks
// untouched. Pure functions: the enable flag is injected by the caller so this
// module stays decoupled from settings state.
import { RPHubCardUtils } from './card-utils.mjs';

// Sentence-level clichés: whole sentence containing the trigger is removed.
const BLOCKED_STYLE_SENTENCE_PATTERN = /[^。！？!?\n]*(?:不容置疑|(?:不易|难以)(?:察觉|觉察)|(?:微|几)不可察|一抹|弧度|生理性|微微泛|因为用力|像在|风箱|手术刀|上扬|带着一种|语气很平|声音很平|(?:指尖|指节|指关节)[^。！？!?\n]*(?:发白|泛白)|像(?:是)?[^。！？!?\n]*?[，,]\s*又像(?:是)?|不是[^。！？!?\n]*?(?:而是|就是|[，,]\s*(?:是|(?:更|倒|反倒)?像是)))[^。！？!?\n]*(?:[。！？!?]+[”’」』】）)]*(?:\*\*|__)?)?/g;
// Standalone "N个字" word-count sentences.
const STANDALONE_WORD_COUNT_SENTENCE_PATTERN = /(^|[。！？!?\n]+[”’」』】）)]*)[ \t]*(?:\*\*|__)?(?:\d+|[零〇一二两三四五六七八九十百千万]+)个字[^。！？!?\n]*(?:[。！？!?]+[”’」』】）)]*(?:\*\*|__)?)?/gm;
// "指尖/指节发白" style clauses (comma-delimited, kept when mid-clause).
const PALE_FINGER_CLAUSE_PATTERN = /(?:^|[，,；;])[^，,。！？!?；;\n]*(?:指尖|指节|指关节)[^，,。！？!?；;\n]*(?:发白|泛白)[^，,。！？!?；;\n]*(?=$|[，,。！？!?；;\n])/gm;
// Clause-level clichés.
const BLOCKED_STYLE_CLAUSE_PATTERN = /(?:^|[，,；;])[^，,。！？!?；;\n*_]*(?:微微泛|因为用力|像在|风箱|手术刀|上扬|带着一种)[^，,。！？!?；;\n*_]*(?=(?:\*\*|__)?[ \t]*(?:$|[，,。！？!?；;\n]))/gm;
// Single-word cliché.
const BLOCKED_STYLE_WORD_PATTERN = /极其/g;
// Dialogue in “…” 『…』 "…" is never filtered.
const QUOTED_DIALOGUE_PATTERN = /(“[\s\S]*?”|『[\s\S]*?』|"[\s\S]*?")/g;
// Whole-message renders (HTML docs, fenced code, top-level elements) pass through.
const STANDALONE_RENDERED_CONTENT_PATTERN = /^(?:\s|<!--[\s\S]*?-->)*(?:```|<!doctype\b|<\?xml\b|<html\b|<(?:head|body|style|script|template|svg|canvas|iframe|div|section|article|aside|header|footer|main|nav|form|table|ul|ol|pre|p|img)\b)/i;
// Tail region managed by the UI template engine; never filtered.
const UI_TEMPLATE_UPDATES_TAIL_PATTERN = /<ui_template_updates\b[^>]*>[\s\S]*$/i;

export const isStandaloneRenderedContent = (text) => (
    STANDALONE_RENDERED_CONTENT_PATTERN.test(String(text || ''))
);

// Block starting at the last (upstream-parity) <ui_template_updates> open tag.
export const findUiTemplateUpdateBlock = (text) => {
    const source = String(text || '');
    const openTags = [...source.matchAll(/<ui_template_updates\b[^>]*>/gi)];
    if (!openTags.length) return null;
    const last = openTags[openTags.length - 1];
    const tail = source.slice(last.index).trimEnd();
    const inner = tail.match(/^<ui_template_updates\b[^>]*>([\s\S]*?)(?:<\/ui_template_updates>)?$/i);
    if (!inner) return null;
    const result = [tail, inner[1]];
    result.index = last.index;
    return result;
};

export const normalizeStyleFilterHit = (fragment) => String(fragment || '')
    .trim()
    .replace(/^[，,；;]\s*/, '')
    .replace(/^(?:\*\*|__)/, '')
    .replace(/(?:\*\*|__)$/, '')
    .trim();

// Filter blocked-style fragments out of `text`. Options:
// - enabled: master switch (caller passes settings.styleFilterEnabled)
// - collect: array receiving normalized removed fragments (for hit counters)
export const filterBlockedStyleText = (text, { enabled = true, collect = null } = {}) => {
    const source = String(text || '');
    if (!enabled) return source;
    if (isStandaloneRenderedContent(source)) return source;
    const removedFragments = [];
    const updateBlock = findUiTemplateUpdateBlock(source);
    const filterEnd = updateBlock?.index ?? source.length;
    const filtered = RPHubCardUtils.transformUnprotectedText(source.slice(0, filterEnd), part => part
        .split(QUOTED_DIALOGUE_PATTERN)
        .map((fragment, index) => index % 2 ? fragment : fragment
            .replace(STANDALONE_WORD_COUNT_SENTENCE_PATTERN, (match, prefix = '') => {
                removedFragments.push(match.slice(prefix.length).trim());
                return prefix;
            })
            .replace(BLOCKED_STYLE_SENTENCE_PATTERN, match => { removedFragments.push(match.trim()); return ''; })
            .replace(PALE_FINGER_CLAUSE_PATTERN, match => { removedFragments.push(match.trim()); return ''; })
            .replace(BLOCKED_STYLE_CLAUSE_PATTERN, match => { removedFragments.push(match.trim()); return ''; })
            .replace(BLOCKED_STYLE_WORD_PATTERN, match => { removedFragments.push(match); return ''; })
            .replace(/^[ \t]*[，,；;]+/gm, '')
            .replace(/[，,；;]{2,}/g, marks => marks.at(-1))
            .replace(/[，,；;]+([。！？!?])/g, '$1')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n'))
        .join(''));
    if (Array.isArray(collect)) {
        collect.push(...removedFragments.map(normalizeStyleFilterHit).filter(Boolean));
    }
    return filtered + source.slice(filterEnd);
};
