// Semantic search plugin behavior tests: a fake embedder (dictionary mapping +
// call counting) drives the same plugin code, covering ranking correctness,
// result fields, <think> stripping, cache reuse, scope switching, index
// window, and interruption.
import assert from 'node:assert/strict';
import test from 'node:test';

const { createSemanticSearchPlugin } = await import('../src/plugins/builtin/semantic-search.mjs');

// Dictionary embedder: known terms return preset vectors, unknown terms fall
// back to an equal-weight vector. Vectors are "normalized".
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

test('semantic search: ranks by similarity descending, strips <think>, complete fields', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });

    const results = await plugin.execute('想去看海的日子', makeTool(), null, makeCtx());

    assert.equal(results.length, 3, 'system and non-string content filtered out');
    assert.equal(results[0].messageId, 'm1', 'the closest message ranks first');
    assert.ok(results[0].score > results[1].score && results[1].score >= results[2].score, 'scores are monotonically non-increasing');
    assert.ok(!results.some(item => item.dialogueText.includes('内部推理')), '<think> content stays out of the index');
    assert.equal(results[0].role, 'user');
    assert.match(results[0].dialogueText, /^用户：/);
    assert.ok(Number.isFinite(results[0].score));
    assert.deepEqual(results[0].matchedTerms, []);
});

test('index cache: the second call embeds only the query itself', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    const ctx = makeCtx();

    await plugin.execute('看海', makeTool(), null, ctx);
    const afterFirst = embedTexts.embedded.length;
    assert.ok(afterFirst >= 3, 'the first run embeds all messages');

    await plugin.execute('徒步', makeTool(), null, ctx);
    assert.equal(embedTexts.embedded.length, afterFirst + 1, 'the second run embeds only the 1 query');
});

test('index rebuilds after switching chat scope', async () => {
    let scopeId = 'chat-a';
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => scopeId, embedTexts });
    const ctx = makeCtx({ getScopeId: () => scopeId });

    await plugin.execute('看海', makeTool(), null, ctx);
    const afterFirstChat = embedTexts.embedded.length;

    scopeId = 'chat-b';
    await plugin.execute('看海', makeTool(), null, ctx);
    assert.ok(embedTexts.embedded.length >= afterFirstChat + 3, 'the new scope triggers a full rebuild');
});

test('index window and result-count clamp take effect', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    // The window floor is 50 (indexSize clamp), so 55 messages verify "only the most recent 50 get indexed".
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
    assert.equal(results.length, 20, 'resultCount=99 clamped to the cap of 20');
    assert.ok(results.every(item => Number(item.messageId.slice(1)) >= 5), 'the first 5 messages outside the window (p0-p4) never appear');
    const scores = results.map(item => item.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'scores in descending order');
});

test('empty query returns empty results; abort signal propagates', async () => {
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

test('idle warmup: builds the index without embedding the query, later execution hits the cache', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });
    const ctx = makeCtx();

    await plugin.warmup(ctx);
    const afterWarmup = embedTexts.embedded.length;
    assert.ok(afterWarmup >= 3, 'warmup embeds all messages');

    const results = await plugin.execute('想去看海的日子', makeTool(), null, ctx);
    assert.equal(embedTexts.embedded.length, afterWarmup + 1, 'execution embeds only the query itself');
    assert.equal(results[0].messageId, 'm1', 'the warmed index hits directly');
});

test('manifest passes the plugin API validation, tool contribution structure complete', async () => {
    const embedTexts = makeEmbedder();
    const plugin = createSemanticSearchPlugin({ getMessages: () => [], getScopeId: () => 'x', embedTexts });

    assert.equal(plugin.id, 'rph-semantic-search');
    assert.equal(plugin.defaultEnabled, false);
    assert.deepEqual(plugin.permissions, ['chat:read', 'embedding:compute']);
    assert.equal(plugin.activeTool.callName, 'tool_semantic');
    assert.equal(plugin.activeTool.type, 'plugin');
    assert.ok(plugin.activeTool.description.includes('tool_semantic_add'), 'model-side description includes the call tag');
    assert.equal(typeof plugin.execute, 'function');
});
