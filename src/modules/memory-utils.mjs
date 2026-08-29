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

export const toScoredVectorMemory = (scored) => ({
            ...scored.memory,
            vectorRawScore: scored.vectorRawScore,
            vectorLexicalHits: scored.vectorLexicalHits,
            vectorLexicalTerms: scored.vectorLexicalTerms,
            vectorScore: scored.vectorScore
        });

export const sortVectorMemoriesByTime = (items) => {
            const orderNumber = (value, fallback) => {
                if (value === null || value === undefined || value === '') return fallback;
                const number = Number(value);
                return Number.isFinite(number) ? number : fallback;
            };

            return [...items].sort((a, b) => {
                const aTurn = orderNumber(a.turn, Number.MAX_SAFE_INTEGER);
                const bTurn = orderNumber(b.turn, Number.MAX_SAFE_INTEGER);
                const turnDiff = aTurn - bTurn;
                if (turnDiff !== 0) return turnDiff;

                const aSequence = orderNumber(a.sequence, 0);
                const bSequence = orderNumber(b.sequence, 0);
                const sequenceDiff = aSequence - bSequence;
                if (sequenceDiff !== 0) return sequenceDiff;

                return (b.vectorScore || 0) - (a.vectorScore || 0);
            });
        };

export const getVectorLexicalMatch = (memory, queryTerms) => {
            if (!queryTerms.length) return { hits: 0, boost: 0, matched: [] };
            const text = String(`${memory.sourceText || ''}\n${memory.summary || ''}`).toLowerCase();
            const matched = queryTerms.filter(term => text.includes(term.toLowerCase()));
            return {
                hits: matched.length,
                boost: Math.min(0.08, matched.length * 0.015),
                matched
            };
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
            const terms = new Set();

            normalized.split(/\s+/).filter(Boolean).forEach(part => {
                if (/^[A-Za-z0-9_]{2,}$/.test(part)) {
                    terms.add(part.toLowerCase());
                    return;
                }

                const han = part.replace(/[^\p{Script=Han}]/gu, '');
                if (han.length >= 2) {
                    for (let size = Math.min(4, han.length); size >= 2; size--) {
                        for (let i = 0; i <= han.length - size; i++) {
                            const term = han.slice(i, i + size);
                            if (!stopTerms.has(term)) terms.add(term);
                        }
                    }
                } else if (han.length === 1 && !stopTerms.has(han)) {
                    terms.add(han);
                }
            });

            return Array.from(terms)
                .filter(term => term.length > 0 && !stopTerms.has(term))
                .sort((a, b) => b.length - a.length)
                .slice(0, 20);
        };

export const normalizeVectorMemoryFingerprintText = (text) => {
            return String(text || '')
                .replace(/\s+/g, '')
                .replace(/[，。、“”‘’：；！？,.!?;:"'`~]/g, '');
        };

export const mergeSmallMemoryParagraphs = (paragraphs, maxLength) => {
            const merged = [];
            let current = null;

            const flush = () => {
                if (!current) return;
                merged.push(current);
                current = null;
            };

            paragraphs.forEach((paragraph, index) => {
                const text = String(paragraph || '').trim();
                if (!text) return;

                const paragraphNo = index + 1;
                if (!current) {
                    current = { text, start: paragraphNo, end: paragraphNo };
                    return;
                }

                const candidateText = `${current.text}\n\n${text}`;
                if (candidateText.length <= maxLength) {
                    current.text = candidateText;
                    current.end = paragraphNo;
                    return;
                }

                flush();
                current = { text, start: paragraphNo, end: paragraphNo };
            });

            flush();
            return merged;
        };

export const splitLongMemoryParagraph = (paragraph, maxLength) => {
            const text = String(paragraph || '').trim();
            if (!text) return [];
            if (text.length <= maxLength) return [text];

            const parts = [];
            let remaining = text;
            while (remaining.length > maxLength) {
                const windowText = remaining.slice(0, maxLength);
                const breakAt = Math.max(
                    windowText.lastIndexOf('。'),
                    windowText.lastIndexOf('！'),
                    windowText.lastIndexOf('？'),
                    windowText.lastIndexOf('.'),
                    windowText.lastIndexOf('!'),
                    windowText.lastIndexOf('?'),
                    windowText.lastIndexOf('\n')
                );
                const cutAt = breakAt > Math.floor(maxLength * 0.55) ? breakAt + 1 : maxLength;
                parts.push(remaining.slice(0, cutAt).trim());
                remaining = remaining.slice(cutAt).trim();
            }
            if (remaining) parts.push(remaining);
            return parts.filter(Boolean);
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

export const shouldSuppressStandardVectorMemoryRecall = () => false;

export const yieldMemoryStorageWork = () => new Promise(resolve => setTimeout(resolve, 0));

export const isEmbeddingLike = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

export const getMemoryVectorExtractedKey = (uuid) => {
            const safeUuid = uuid || 'global';
            return `${safeUuid}:vectorExtracted`;
        };

export const getMemoryEmptyTurnsKey = (uuid) => {
            const safeUuid = uuid || 'global';
            return `${safeUuid}:vector`;
        };

export const normalizeKeepFloors = (value, min, max, fallback) => {
            const floors = Number(value);
            if (!Number.isFinite(floors)) return fallback;
            return Math.max(min, Math.min(max, Math.round(floors / 2) * 2));
        };
