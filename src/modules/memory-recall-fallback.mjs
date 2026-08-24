const getSearchText = (memory) => String([
    memory?.sourceText,
    memory?.summary,
    memory?.paragraph
].filter(Boolean).join('\n')).toLowerCase();

const defaultFingerprint = (memory) => String(
    memory?.vectorChunkId
    || memory?.id
    || `${memory?.turn || ''}:${memory?.sequence || ''}:${memory?.paragraph || memory?.summary || ''}`
);

const select = (memories, options = {}) => {
    const items = Array.isArray(memories) ? memories.filter(Boolean) : [];
    const terms = Array.isArray(options.queryTerms)
        ? options.queryTerms.map(term => String(term || '').trim().toLowerCase()).filter(Boolean)
        : [];
    const topK = Math.max(1, Math.trunc(Number(options.topK) || 1));
    const getFingerprint = typeof options.getFingerprint === 'function'
        ? options.getFingerprint
        : defaultFingerprint;
    const maxTurn = Math.max(1, ...items.map(memory => Number(memory.turn) || 0));

    const ranked = items.map(memory => {
        const text = getSearchText(memory);
        const matched = terms.filter(term => text.includes(term));
        const recency = Math.max(0, Number(memory.turn) || 0) / maxTurn;
        return {
            ...memory,
            vectorRawScore: null,
            vectorLexicalHits: matched.length,
            vectorLexicalTerms: matched,
            vectorScore: Math.min(0.99, 0.25 + matched.length * 0.1 + recency * 0.05),
            vectorRecallMode: 'lexical-fallback'
        };
    }).sort((a, b) => {
        const hitDiff = b.vectorLexicalHits - a.vectorLexicalHits;
        if (hitDiff !== 0) return hitDiff;
        return (Number(b.turn) || 0) - (Number(a.turn) || 0);
    });

    const selected = [];
    const seen = new Set();
    for (const memory of ranked) {
        const fingerprint = String(getFingerprint(memory) || '');
        if (!fingerprint || seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        selected.push(memory);
        if (selected.length >= topK) break;
    }
    return selected;
};

export { select };
