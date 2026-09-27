// 语义检索插件行为测试：假 embedder（字典映射 + 调用计数）驱动同一份插件代码，
// 覆盖排序正确性、结果字段、<think> 剥离、缓存复用、作用域切换、索引窗口与中断。
import assert from 'node:assert/strict';
import test from 'node:test';

const { createSemanticSearchPlugin } = await import('../src/plugins/builtin/semantic-search.mjs');

// 字典嵌入：命中词条返回预置向量，未命中返回等权兜底向量。向量已"归一化"。
const VECTORS = {
    '用户说想去看海': [1, 0, 0],
    'AI描述山间徒步': [0, 1, 0],
    '用户提到喜欢摇滚乐': [0, 0, 1],
    '想去看海的日子': [0.9, 0.1, 0]
};
const makeEmbedder = () => {
    const embedded = [];
    const embedTexts = async (texts) => {
        embedded.push(...texts);
        return texts.map(text => VECTORS[text] || [0.5, 0.5, 0.5]);
    };
    embedTexts.embedded = embedded;
    return embedTexts;
};

const makeMessages = () => ([
    { id: 'm1', role: 'user', content: '用户说想去看海' },
    { id: 'm2', role: 'assistant', content: '<think>内部推理不应被索引</think>AI描述山间徒步' },
    { id: 'm3', role: 'user', content: '用户提到喜欢摇滚乐' },
    { id: 'm4', role: 'system', content: '系统消息不参与检索' },
    { id: 'm5', role: 'assistant', content: null }
]);

const makeCtx = (overrides = {}) => ({
    getMessages: () => makeMessages(),
    getScopeId: () => 'chat-a',
    getSettings: () => ({}),
    ...overrides
});

const makeTool = (resultCount = 6) => ({
    id: 'tool_semantic',
    callName: 'tool_semantic',
    type: 'plugin',
    resultCount
});

test('语义检索：按相似度降序排序，剥离 <think>，字段完整', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });

    const results = await plugin.execute('想去看海的日子', makeTool(), null, makeCtx());

    assert.equal(results.length, 3, 'system 与非字符串内容被过滤');
    assert.equal(results[0].messageId, 'm1', '最相近的消息排第一');
    assert.ok(results[0].score > results[1].score && results[1].score >= results[2].score, '分数单调不增');
    assert.ok(!results.some(item => item.dialogueText.includes('内部推理')), '<think> 内容不进索引');
    assert.equal(results[0].role, 'user');
    assert.match(results[0].dialogueText, /^用户：/);
    assert.ok(Number.isFinite(results[0].score));
    assert.deepEqual(results[0].matchedTerms, []);
});

test('索引缓存：第二次调用只嵌入查询本身', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    const ctx = makeCtx();

    await plugin.execute('看海', makeTool(), null, ctx);
    const afterFirst = embedTexts.embedded.length;
    assert.ok(afterFirst >= 3, '首轮嵌入全部消息');

    await plugin.execute('徒步', makeTool(), null, ctx);
    assert.equal(embedTexts.embedded.length, afterFirst + 1, '二轮只嵌入 1 条查询');
});

test('切换对话作用域后索引重建', async () => {
    let scopeId = 'chat-a';
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => scopeId, embedTexts });
    const ctx = makeCtx({ getScopeId: () => scopeId });

    await plugin.execute('看海', makeTool(), null, ctx);
    const afterFirstChat = embedTexts.embedded.length;

    scopeId = 'chat-b';
    await plugin.execute('看海', makeTool(), null, ctx);
    assert.ok(embedTexts.embedded.length >= afterFirstChat + 3, '新作用域触发全量重建');
});

test('索引窗口与结果条数钳制生效', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    // 窗口下限是 50（indexSize 钳制），所以用 55 条消息验证「只索引最近 50 条」。
    const messages = Array.from({ length: 55 }, (_, index) => ({
        id: `p${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `消息${index}`
    }));

    const results = await plugin.execute(
        '找一个消息',
        makeTool(99),
        null,
        makeCtx({ getSettings: () => ({ indexSize: 50 }), getMessages: () => messages })
    );
    assert.equal(results.length, 20, 'resultCount=99 被钳制到上限 20');
    assert.ok(results.every(item => Number(item.messageId.slice(1)) >= 5), '窗口外的前 5 条（p0-p4）不出现');
    const scores = results.map(item => item.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), '分数降序');
});

test('空查询返回空结果；中断信号向上传播', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });

    assert.deepEqual(await plugin.execute('   ', makeTool(), null, makeCtx()), []);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        () => plugin.execute('看海', makeTool(), controller.signal, makeCtx()),
        (error) => error.name === 'AbortError'
    );
});

test('空闲预热：只建索引不嵌入查询，后续执行命中缓存', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    const ctx = makeCtx();

    await plugin.warmup(ctx);
    const afterWarmup = embedTexts.embedded.length;
    assert.ok(afterWarmup >= 3, '预热嵌入全部消息');

    const results = await plugin.execute('想去看海的日子', makeTool(), null, ctx);
    assert.equal(embedTexts.embedded.length, afterWarmup + 1, '执行时只嵌入查询本身');
    assert.equal(results[0].messageId, 'm1', '预热后的索引可直接命中');
});

test('manifest 通过插件 API 校验，工具贡献结构完整', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });

    assert.equal(plugin.id, 'rph-semantic-search');
    assert.equal(plugin.defaultEnabled, true);
    assert.deepEqual(plugin.permissions, ['chat:read', 'embedding:compute']);
    assert.equal(plugin.activeTool.callName, 'tool_semantic');
    assert.equal(plugin.activeTool.type, 'plugin');
    assert.ok(plugin.activeTool.description.includes('tool_semantic_add'), '模型侧说明包含调用标签');
    assert.equal(typeof plugin.execute, 'function');
});
