// Built-in plugin: semantic dialogue search (first plugin in the Plugin
// Marketplace).
//
// Indexes the most recent N messages of the current chat with the on-device
// embedding model (RPHLocalEmbedding, bge-small-zh); the model's natural-
// language question is embedded the same way, ranked by cosine similarity,
// and the most relevant verbatim fragments are returned. Complements the
// keyword tool (tool_grep, exact match): fits "the meaning was said but the
// exact words are gone" retrieval.
//
// Design constraints:
//  - The index lives in memory only, isolated per chat scope (rebuilt on chat
//    switch); vectors are not persisted — Phase 1 trades "sufficient
//    correctness" for zero migration cost; vector persistence waits for a
//    vector column on chat_messages.
//  - Embedding and ranking dependencies are fully injected (embedTexts /
//    getMessages / getScopeId): the host passes real implementations, tests
//    pass fakes — one code path for both.
import { definePlugin, PLUGIN_PERMISSIONS } from '../plugin-api.mjs';
import { parseCot } from '../../modules/utils.mjs';

const DEFAULT_INDEX_SIZE = 200;
const MIN_INDEX_SIZE = 50;
const MAX_INDEX_SIZE = 1000;
const SNIPPET_MAX_CHARS = 600;
const EMBED_BATCH_SIZE = 16;
const RESULT_COUNT_MAX = 20;

const ROLE_LABELS = { user: '用户', assistant: 'AI', system: '系统' };

const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
};

const normalizeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const excerptForEmbedding = (message) => {
    const parsed = parseCot(message.content || '');
    const main = normalizeWhitespace(parsed.main || message.content || '');
    return main.slice(0, SNIPPET_MAX_CHARS);
};

// Vectors are L2-normalized by the embedding pipeline, so cosine similarity is the dot product.
const dotProduct = (a, b) => {
    let sum = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) sum += a[i] * b[i];
    return sum;
};

export const createSemanticSearchPlugin = ({ getMessages, getScopeId, embedTexts }) => {
    // Index state lives in the factory closure: each plugin instance is
    // independent, so tests need no cleanup hooks.
    let indexScope = null;
    const index = new Map();

    // Build / incrementally complete the index and return the retrieval
    // targets (with position and role metadata).
    // Only missing entries get embedded: messages added while streaming are
    // filled in incrementally on the next call.
    const ensureIndexed = async (ctx, signal) => {
        const scopeId = String(ctx?.getScopeId?.() || 'default');
        if (indexScope !== scopeId) {
            index.clear();
            indexScope = scopeId;
        }

        const settings = ctx?.getSettings?.() || {};
        const indexSize = clampNumber(settings.indexSize, MIN_INDEX_SIZE, MAX_INDEX_SIZE, DEFAULT_INDEX_SIZE);
        const sourceMessages = (ctx?.getMessages?.() || [])
            .filter(message => message && typeof message.content === 'string'
                && (message.role === 'user' || message.role === 'assistant'))
            .slice(-indexSize);

        const targets = [];
        sourceMessages.forEach((message, position) => {
            const text = excerptForEmbedding(message);
            if (!text) return;
            targets.push({
                id: message.id || `pos:${position}`,
                text,
                turn: position + 1,
                role: message.role,
                speaker: message.name || ''
            });
        });

        const missing = targets.filter(target => !index.has(target.id));
        for (let start = 0; start < missing.length; start += EMBED_BATCH_SIZE) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const batch = missing.slice(start, start + EMBED_BATCH_SIZE);
            const vectors = await embedTexts(batch.map(target => target.text), signal);
            batch.forEach((target, offset) => index.set(target.id, vectors[offset]));
        }
        return targets;
    };

    return definePlugin({
        id: 'rph-semantic-search',
        name: '语义对话检索',
        version: '1.0.0',
        author: 'Shimamura-Adach',
        description: '把当前对话的最近消息在本机建立向量索引，模型可以用自然语言问题按语义（而非关键词）找到相关前文。索引只在内存里、按对话隔离，全部计算在本机完成，不上传任何内容。',
        permissions: [PLUGIN_PERMISSIONS.CHAT_READ, PLUGIN_PERMISSIONS.EMBEDDING_COMPUTE],
        defaultEnabled: false,
        activeTool: {
            id: 'tool_semantic',
            name: '语义检索',
            callName: 'tool_semantic',
            type: 'plugin',
            resultCount: 6,
            description: '当需要按语义（意思相近但用词可能不同）查找当前对话历史里的内容时，单独输出 <tool_semantic_add:自然语言问题> 或 <tool_semantic_cover:自然语言问题>。用完整的自然语言句子描述要找的内容，例如"角色第一次提到那把刀的对话""用户表达过对结局的不满"。多个独立信息点拆开，每行一个标签，单次回复最多 5 个工具标签，不写说明或 COT。本轮第一次检索一律用 add；结果偏题、太宽或需要更换检索方向时用 cover。要精确匹配原文词句时改用关键词工具更合适。',
            displayDescription: '把最近的对话消息做成本地语义索引，模型用自然语言问题按意思（而非关键词）查找前文，适合"话说过但记不清原词"的场景。首次使用需要在本机为最近消息计算索引，可能稍慢。'
        },
        settings: [
            {
                key: 'indexSize',
                label: '索引消息数',
                type: 'number',
                default: DEFAULT_INDEX_SIZE,
                min: MIN_INDEX_SIZE,
                max: MAX_INDEX_SIZE,
                help: '对当前对话最近多少条消息建立索引。越大覆盖越全，首次索引越慢。'
            }
        ],

        // Idle warmup: the host calls this after a chat is opened/switched so
        // the index is ready in the background and real tool calls return
        // instantly. Failures are logged by the host and never affect chat.
        warmup: async (ctx) => { await ensureIndexed(ctx, null); },

        execute: async (query, tool, signal, ctx) => {
        const question = String(query || '').trim();
        if (!question) return [];
        if (typeof embedTexts !== 'function') throw new Error('本机嵌入服务不可用');

        const targets = await ensureIndexed(ctx, signal);
        const [queryVector] = await embedTexts([question], signal);
        if (!queryVector) return [];

            const resultCount = clampNumber(tool?.resultCount, 1, RESULT_COUNT_MAX, 6);
            return targets
                .map(target => ({
                    target,
                    score: dotProduct(queryVector, index.get(target.id) || [])
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, resultCount)
                .map(({ target, score }) => ({
                    turn: target.turn,
                    role: target.role,
                    speaker: ROLE_LABELS[target.role] || target.speaker || target.role,
                    matchedTerms: [],
                    dialogueText: `${ROLE_LABELS[target.role] || target.speaker || target.role}：${target.text}`,
                    messageId: target.id,
                    score: Number(score.toFixed(4))
                }));
        }
    });
};
