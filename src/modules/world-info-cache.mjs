// world-info-cache — per-generation caches for the world-info scan.
//
// The scan used to rebuild the same strings on every entry: the joined
// scan-depth text, the lowercased text/key pair, and the compiled regex. On a
// card with many entries and a long history that is O(entries x depth) string
// work before every request. The cache lives for exactly one generation
// (create it at the start of generateResponseCore), so there is nothing to
// invalidate between requests.

export function compileWorldInfoRegex(pattern) {
    let source = String(pattern || '');
    let flags = 'i';
    if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
        const lastSlash = source.lastIndexOf('/');
        const potentialFlags = source.slice(lastSlash + 1);
        if (/^[dgimsuvy]*$/.test(potentialFlags)) {
            source = source.slice(1, lastSlash);
            flags = potentialFlags;
        }
    }
    flags = flags.replace(/g/g, '');
    if (!flags.includes('i')) flags += 'i';
    if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
    return new RegExp(source, flags);
}

export function createWorldInfoScanCache() {
    const scanTextByDepth = new Map();
    const lowerByText = new Map();
    const regexByPattern = new Map();
    let contentsRef = null;

    // Long histories produce a handful of distinct depths at most, so the
    // depth-keyed map stays tiny. The contents reference guard only protects
    // against accidental reuse across generations.
    const scanText = (depth, contents) => {
        if (contentsRef !== contents) {
            scanTextByDepth.clear();
            contentsRef = contents;
        }
        if (scanTextByDepth.has(depth)) return scanTextByDepth.get(depth);
        const text = contents.slice(-depth).join('\n');
        scanTextByDepth.set(depth, text);
        return text;
    };

    const lower = (value) => {
        const text = String(value ?? '');
        const cached = lowerByText.get(text);
        if (cached !== undefined) return cached;
        const lowered = text.toLowerCase();
        // Bounded so a pathological chat cannot grow this without limit.
        if (lowerByText.size >= 512) lowerByText.clear();
        lowerByText.set(text, lowered);
        return lowered;
    };

    // Invalid patterns resolve to null once per generation instead of throwing
    // on every key check.
    const regex = (pattern) => {
        const key = String(pattern || '');
        if (regexByPattern.has(key)) return regexByPattern.get(key);
        let compiled = null;
        try {
            compiled = compileWorldInfoRegex(key);
        } catch {
            compiled = null;
        }
        regexByPattern.set(key, compiled);
        return compiled;
    };

    return { scanText, lower, regex };
}