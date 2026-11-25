// memory-citation — [M12] markers in assistant replies (2026-11-25)
//
// The model is asked to append the ref of the memory entry a sentence builds
// on (see MEMORY_CITATION_INSTRUCTION). Rendering turns each marker into a
// clickable chip that opens the "判断依据" modal; everything that leaves the
// chat (prompt history, memory extraction, TTS, previews, clipboard, editor)
// strips the markers first.
//
// Pure module: no DOM assumptions beyond the document passed in, no storage,
// no Vue. Contract locks: tests/memory-citation-contract.test.mjs.

export const MEMORY_CITATION_PATTERN = /\[M(\d{1,6})\]/g;
const MEMORY_CITATION_SPLIT = /((?:\[M\d{1,6}\])+)/;
const PLACEHOLDER_OPEN = '\uE000';
const PLACEHOLDER_CLOSE = '\uE001';

// Ref markers must never reach the model as history (they would encourage
// fake citations and inflate the prompt), memory extraction, TTS or clipboard.
export const stripMemoryCitations = (text) => String(text ?? '').replace(MEMORY_CITATION_PATTERN, '');

// Display regexes rewrite square brackets (state labels etc.). Swap markers
// for private-use placeholders while regexes run so a script cannot mangle
// them, then restore.
export const protectCitations = (text) => String(text ?? '')
    .replace(/\[M(\d{1,6})\]/g, `${PLACEHOLDER_OPEN}M$1${PLACEHOLDER_CLOSE}`);

export const restoreCitations = (text) => String(text ?? '')
    .replace(new RegExp(`${PLACEHOLDER_OPEN}M(\\d{1,6})${PLACEHOLDER_CLOSE}`, 'g'), '[M$1]');

export const MEMORY_CITATION_INSTRUCTION = [
    '<memory_citation>',
    '上下文里以 [M编号] 开头的 assistant 消息是对应轮次的总结记忆；<memory_entry> / <memory_toc> 里的 M 编号指的是同一套记忆。',
    '正文凡承接、呼应或依据某条记忆里的事件、承诺、伏笔、关系或状态，都在该句句末标点之后紧跟其编号，例如“……她终于兑现了那晚的约定。[M12]”；同时依据多条时连写，如“[M3][M12]”。',
    '只引用上下文中实际出现过的编号，不得编造；同一编号在一次回复中只标一次，标在最直接承接它的那句之后；与记忆无关的句子不标注，也不要在正文里解释或复述记忆内容。',
    '上下文里没有出现任何 M 编号时，忽略本条规则，不要输出任何编号。',
    '</memory_citation>'
].join('\n');

export const MEMORY_CITATION_COT_LINE = '- 若上下文里出现 [M编号] 总结记忆，主动找出本轮能承接的记忆并记下编号（如 M12），写到对应剧情时在句末标注；每个编号只标一次。';

const SKIP_PARENTS = 'pre, code, a, button, script, style, textarea';
const BLOCK_TAG_PATTERN = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DETAILS|DIV|DL|FIELDSET|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|IFRAME|LI|MAIN|NAV|OL|P|PRE|SCRIPT|SECTION|STYLE|TABLE|UL)$/;

// Replies that start with block-level HTML are not wrapped in <p> by the
// renderer, and the message container lays out each top-level child as its own
// block — a bare "[M12]" would drift onto its own line. Group the inline run
// around the marker into a paragraph first.
const wrapLooseCitationText = (documentNode) => {
    const body = documentNode.body;
    const isInline = (node) => node && (node.nodeType === 3
        || (node.nodeType === 1 && !BLOCK_TAG_PATTERN.test(node.tagName)));
    [...body.childNodes].forEach((node) => {
        if (node.parentNode !== body || node.nodeType !== 3 || !/[\[［]\s*M\d/.test(node.nodeValue)) return;
        let start = node;
        let end = node;
        while (isInline(start.previousSibling)) start = start.previousSibling;
        while (isInline(end.nextSibling)) end = end.nextSibling;
        const paragraph = documentNode.createElement('p');
        start.before(paragraph);
        for (let current = start, next; current; current = next) {
            next = current === end ? null : current.nextSibling;
            paragraph.append(current);
        }
    });
};

// Turn [M12] into a chip that carries the ref number (D-B: show exactly what
// the model wrote; the modal adds the turn label and the memory text).
export const decorateMemoryCitations = (documentNode) => {
    if (!documentNode || !documentNode.body) return false;
    wrapLooseCitationText(documentNode);

    const walker = documentNode.createTreeWalker(documentNode.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!MEMORY_CITATION_SPLIT.test(node.nodeValue)) continue;
        if (node.parentElement?.closest(SKIP_PARENTS)) continue;
        textNodes.push(node);
    }
    // MEMORY_CITATION_SPLIT has no /g flag, so test() does not advance state.
    textNodes.forEach((node) => {
        const fragment = documentNode.createDocumentFragment();
        const parts = node.nodeValue.split(MEMORY_CITATION_SPLIT);
        parts.forEach((part, index) => {
            if (index % 2 === 0) {
                if (part) fragment.append(part);
                return;
            }
            const refs = part.match(/\d+/g) || [];
            const cite = documentNode.createElement('button');
            cite.type = 'button';
            cite.className = 'memory-cite';
            cite.dataset.memoryRefs = refs.join(',');
            cite.setAttribute('aria-label', `查看判断依据：M${refs.join('、M')}`);
            cite.textContent = refs.join(',');
            fragment.append(cite);
        });
        node.replaceWith(fragment);
    });

    return textNodes.length > 0;
};

export const decorateMemoryCitationsHtml = (html) => {
    const source = String(html ?? '');
    if (!source.includes('[M')) return source;
    const documentNode = new DOMParser().parseFromString(source, 'text/html');
    return decorateMemoryCitations(documentNode) ? documentNode.body.innerHTML : source;
};

// Resolve the refs carried by a click into modal rows. Entries removed by
// compaction/GC stay visible as missing instead of silently disappearing.
export const buildMemoryCitationItems = (refs, entries) => {
    const list = (Array.isArray(refs) ? refs : String(refs || '').split(','))
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0);
    const byRef = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const ref = Number(entry?.ref) || 0;
        if (ref > 0 && !byRef.has(ref)) byRef.set(ref, entry);
    });
    return list.map((ref) => {
        const entry = byRef.get(ref) || null;
        return {
            ref,
            missing: !entry,
            text: entry ? String(entry.text || '') : ''
        };
    });
};