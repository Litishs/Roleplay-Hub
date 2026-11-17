// memory-utils.mjs — pure helpers extracted from app.mjs (Phase 2.3).

// ---- Extracted from app.mjs setup() (Phase 2.3 utility extraction) ----
export const getTimelineCharCount = (text) => Array.from(String(text || '')).length;

export const factPreviewText = (fact) => {
            if (!fact) return '';
            switch (fact.kind) {
                case 'entity':
                    return String(fact.name || '');
                case 'relation':
                    return `${fact.from || ''} → ${fact.relKind || fact.kind || ''} → ${fact.to || ''}`;
                case 'event':
                    return `[第${fact.sourceTurn || '?'}轮] ${String(fact.summary || '')}`;
                case 'state':
                    return `${fact.subject || ''}·${fact.aspect || ''}：${String(fact.value || '')}`;
                case 'plot':
                    return String(fact.summary || '');
                case 'quote':
                    return `${fact.speaker || ''}：「${String(fact.text || '')}」`;
                case 'arc':
                    return `第${fact.startTurn || '?'}-${fact.endTurn || '?'}轮剧情弧`;
                case 'audit':
                    return `审计:${String(fact.action || '')}`;
                case 'meta':
                    return '元数据';
                default:
                    return '';
            }
        };

export const extractVectorQueryTerms = (text) => {
            const normalized = String(text || '')
                .replace(/[^\p{Script=Han}A-Za-z0-9_]+/gu, ' ')
                .trim();
            if (!normalized) return [];

            const stopTerms = new Set([
                '是不是', '有没有', '为什么', '怎么样', '怎么办', '什么', '这个', '那个',
                '还是', '还在', '还会', '了吗', '吗', '呢', '啊', '吧', '的', '了', '我', '你', '她', '他'
            ]);
            // Terms are grouped by n-gram size and capped per group. A plain
            // "longest 20" cut dropped every 2-gram on longer CJK runs (a
            // 16-char run alone yields 13 4-grams + 14 3-grams), so a query
            // like "查雪夜的线索" could no longer match the distilled digest
            // that says 雪夜 — recall silently returned nothing. Bigrams are
            // the workhorses on distilled text; longer grams add precision.
            const groups = new Map();
            const addTerm = (term, size) => {
                if (!term || stopTerms.has(term)) return;
                if (!groups.has(size)) groups.set(size, new Set());
                groups.get(size).add(term);
            };
            const PER_GROUP_LIMIT = 24;
            const TOTAL_LIMIT = 60;

            normalized.split(/\s+/).filter(Boolean).forEach(part => {
                if (/^[A-Za-z0-9_]{2,}$/.test(part)) {
                    addTerm(part.toLowerCase(), 9);
                    return;
                }

                const han = part.replace(/[^\p{Script=Han}]/gu, '');
                if (han.length >= 2) {
                    for (let size = Math.min(4, han.length); size >= 2; size--) {
                        for (let i = 0; i <= han.length - size; i++) {
                            addTerm(han.slice(i, i + size), size);
                        }
                    }
                } else if (han.length === 1) {
                    addTerm(han, 1);
                }
            });

            const ordered = [];
            [9, 4, 3, 2, 1].forEach(size => {
                const group = groups.get(size);
                if (!group) return;
                ordered.push(...Array.from(group).slice(0, PER_GROUP_LIMIT));
            });
            return Array.from(new Set(ordered)).slice(0, TOTAL_LIMIT);
        };

export const getClassicMemoryKey = (sourceAssistantIds, turn = 0) => {
            const ids = Array.isArray(sourceAssistantIds) ? sourceAssistantIds.filter(Boolean) : [];
            return ids.length > 0 ? ids.join('|') : `turn:${Number(turn) || 0}`;
        };

export const trimMemoryText = (text, maxLength = 1800) => {
            const cleanText = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
            if (cleanText.length <= maxLength) return cleanText;
            return `${cleanText.slice(0, maxLength)}...`;
        };

export const normalizeKeepFloors = (value, min, max, fallback) => {
            const floors = Number(value);
            if (!Number.isFinite(floors)) return fallback;
            return Math.max(min, Math.min(max, Math.round(floors / 2) * 2));
        };
