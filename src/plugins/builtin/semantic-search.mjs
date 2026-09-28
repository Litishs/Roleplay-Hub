// 内置插件：语义对话检索（Plugin Marketplace 首个上架插件）。
//
// 把当前对话最近 N 条消息用本机嵌入模型（RPHLocalEmbedding，bge-small-zh）
// 建立向量索引，模型的自然语言问题同样嵌入后按余弦相似度排序，返回最相关的
// 原文片段。与关键词工具（tool_grep，精确匹配）互补：适合"意思说过但记不清
// 原词"的检索。
//
// 设计约束：
//  - 索引只存内存、按对话作用域隔离（切聊天即重建），不持久化向量——Phase 1
//    用"够用的正确"换零迁移成本；向量化持久化等 chat_messages 加向量列后做。
//  - 嵌入与排序依赖全部注入（embedTexts / getMessages / getScopeId），宿主传
//    真实现、测试传假实现，同一份代码两条路径。
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

// 向量已由嵌入管线 L2 归一化，余弦相似度即点积。
const dotProduct = (a, b) => {
    let sum = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) sum += a[i] * b[i];
    return sum;
};

export const createSemanticSearchPlugin = ({ getMessages, getScopeId, embedTexts }) => {
    // 索引状态收在工厂闭包里：每个插件实例独立，测试无需清理钩子。
    let indexScope = null;
    const index = new Map();

    // 建立/增量补全索引并返回参与检索的目标（含位置与角色元信息）。
    // 只嵌入缺失的条目：流式新增的消息在下一次调用时增量补上。
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

        // 空闲预热：宿主在聊天打开/切换后调用，把索引在后台建好，
        // 模型真正调用工具时即时返回。失败由宿主记日志，不影响聊天。
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
