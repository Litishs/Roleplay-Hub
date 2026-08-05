import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import memorySchema from '../assets/js/memory-schema.js';

const [html, app, repository, javaDatabase, javaPlugin] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/storage-repository.js', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/RoleplayDatabase.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url), 'utf8')
]);

test('memory-schema.js exposes schema primitives', () => {
    assert.equal(memorySchema.SCHEMA_VERSION, 1);
    assert.deepEqual([...memorySchema.FACT_TYPES], ['entity', 'relation', 'event', 'state', 'plot', 'quote']);
    assert.equal(typeof memorySchema.mergeFacts, 'function');
    assert.equal(typeof memorySchema.computeMaintenanceCandidates, 'function');
    assert.equal(typeof memorySchema.buildLocalBaseline, 'function');
    assert.equal(typeof memorySchema.createArc, 'function');
    assert.equal(typeof memorySchema.createAudit, 'function');
});

test('normalizeFact produces valid typed facts', () => {
    const entity = memorySchema.normalizeFact({ type: 'entity', name: '林晚', attrs: { 身份: '师姐' } }, { turn: 3 });
    assert.equal(entity.kind, 'entity');
    assert.equal(entity.sourceTurn, 3);
    assert.equal(entity.status, 'current');
    const entityWithAttributes = memorySchema.normalizeFact({ type: 'entity', name: '墨渊', attributes: { 形态: '残魂' } }, { turn: 1 });
    assert.deepEqual(entityWithAttributes.attrs, { 形态: '残魂' }, '应兼容 attributes 别名');
    const relation = memorySchema.normalizeFact({ type: 'relation', from: 'user', kind: '师徒', to: '林晚', strength: 0.8 }, { turn: 3 });
    assert.equal(relation.strength, 0.8);
    const plot = memorySchema.normalizeFact({ type: 'plot', summary: '未解之谜', status: 'open' }, { turn: 2 });
    assert.equal(plot.status, 'current', '伏笔生命周期状态应为 current');
    assert.equal(plot.plotStatus, 'open', '剧情状态应存于 plotStatus');
    assert.equal(memorySchema.normalizeFact({ type: 'unknown', name: 'x' }), null);
});

test('parseFactResponse handles direct, envelope and SSE formats', () => {
    const direct = memorySchema.parseFactResponse(JSON.stringify({
        facts: [{ type: 'event', summary: '直接格式' }]
    }));
    assert.equal(direct.length, 1);

    const envelope = memorySchema.parseFactResponse(JSON.stringify({
        choices: [{
            message: { content: '```json\n{"facts":[{"type":"state","subject":"苏语嫣","aspect":"身体","value":"潮红"}]}\n```' }
        }]
    }));
    assert.equal(envelope.length, 1);
    assert.equal(envelope[0].type, 'state');

    const sse = [
        'data: {"choices":[{"delta":{"content":"{\\"facts\\":[{\\"type\\":\\"plot\\",\\"summary\\":\\"伏笔\\"}]}"}}]}',
        'data: [DONE]'
    ].join('\n');
    const streamed = memorySchema.parseFactResponse(sse);
    assert.equal(streamed.length, 1);
    assert.equal(streamed[0].type, 'plot');

    assert.throws(() => memorySchema.parseFactResponse('不是 JSON'), /没有返回有效的事实 JSON/);
});

test('mergeFacts dedups identical facts and versions changed values', () => {
    const incoming = [
        { type: 'state', subject: '林晚', aspect: '身体状况', value: '左臂受伤' },
        { type: 'event', inStoryTime: '第3天', summary: '林晚为救user受伤' }
    ];
    const first = memorySchema.mergeFacts([], incoming, { turn: 3 });
    assert.equal(first.facts.length, 2);
    const duplicate = memorySchema.mergeFacts(first.facts, incoming, { turn: 4 });
    assert.equal(duplicate.facts.length, 2, '同 payload 重复抽取不新增');
    const changed = memorySchema.mergeFacts(first.facts, [
        { type: 'state', subject: '林晚', aspect: '身体状况', value: '左臂痊愈' }
    ], { turn: 5 });
    const states = changed.facts.filter(f => f.kind === 'state');
    assert.equal(states.length, 2, '版本链保留新旧两条');
    assert.ok(states.some(f => f.status === 'current' && f.value === '左臂痊愈'));
    assert.ok(states.some(f => f.status === 'superseded' && f.value === '左臂受伤'));
    const current = states.find(f => f.status === 'current');
    assert.equal(current.changedFrom, '左臂受伤', '状态变化应记录 changedFrom');
});

test('mergeFacts marks out-of-order updates as conflict', () => {
    const first = memorySchema.mergeFacts([], [{ type: 'state', subject: '林晚', aspect: '身体状况', value: '重伤' }], { turn: 10 });
    const second = memorySchema.mergeFacts(first.facts, [{ type: 'state', subject: '林晚', aspect: '身体状况', value: '轻伤' }], { turn: 5 });
    const states = second.facts.filter(f => f.kind === 'state');
    assert.ok(states.some(f => f.status === 'conflict'), '乱序更新应标记冲突而非覆盖');
    assert.ok(states.some(f => f.status === 'current' && f.value === '重伤'));
});

test('computeMaintenanceCandidates detects roll-up, archive and prune', () => {
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const facts = [
        { id: 'e1', kind: 'event', type: 'event', status: 'current', sourceTurn: 1, summary: '事件一', updatedAt: now },
        { id: 'e2', kind: 'event', type: 'event', status: 'current', sourceTurn: 2, summary: '事件二', updatedAt: now },
        { id: 'e3', kind: 'event', type: 'event', status: 'current', sourceTurn: 3, summary: '事件三', updatedAt: now },
        { id: 'e4', kind: 'event', type: 'event', status: 'current', sourceTurn: 100, summary: '新事件', updatedAt: now },
        { id: 's1', kind: 'state', type: 'state', status: 'superseded', sourceTurn: 1, updatedAt: now - 10 * day, importance: 0.4 },
        { id: 's2', kind: 'state', type: 'state', status: 'archived', sourceTurn: 2, updatedAt: now - 40 * day, importance: 0.3 }
    ];
    const candidates = memorySchema.computeMaintenanceCandidates(facts, {
        arcRetainTurns: 50,
        arcMinEvents: 3,
        arcTurnWindow: 20,
        archiveDays: 7,
        pruneDays: 30
    }, now);
    assert.equal(candidates.rollUp.length, 1, '早期事件应滚入一个剧情弧');
    assert.equal(candidates.rollUp[0].events.length, 3);
    assert.ok(candidates.archive.some(f => f.id === 's1'), '超期 superseded 应进回收站');
    assert.ok(candidates.prune.some(f => f.id === 's2'), '回收站超期低重要度应可清理');
});

test('buildLocalBaseline creates entity/relation/event without LLM', () => {
    const facts = memorySchema.buildLocalBaseline(
        { name: '林晚', first_mes: '你醒来了，这里是剑宗山门。', description: '外冷内热的师姐。' },
        { name: '小明' }
    );
    assert.ok(facts.some(f => f.kind === 'entity' && f.name === '林晚'));
    assert.ok(facts.some(f => f.kind === 'relation' && f.from === '小明' && f.to === '林晚'));
    assert.ok(facts.some(f => f.kind === 'event' && f.inStoryTime === '开场'));
});

test('mergeFacts keeps extracted entities separate from baseline entity', () => {
    const baseline = memorySchema.buildLocalBaseline(
        { name: '救命！！我的大师姐', first_mes: '开场白', description: '' },
        { name: '小明' }
    );
    const merged = memorySchema.mergeFacts(baseline, [
        { type: 'entity', name: '墨渊', attributes: { 形态: '残魂' } },
        { type: 'event', summary: '测试事件', participants: ['墨渊'] }
    ], { turn: 1 });
    const entities = merged.facts.filter(f => f.kind === 'entity');
    assert.equal(entities.length, 2, '新增实体应与基线实体并存');
    assert.ok(entities.some(e => e.name === '墨渊'), '墨渊实体应被保留');
    assert.deepEqual(entities.find(e => e.name === '墨渊').attrs, { 形态: '残魂' });
});

test('index.html loads memory-schema.js and exposes facts panel', () => {
    const appIdx = html.indexOf('assets/js/app.js');
    const schemaIdx = html.indexOf('assets/js/memory-schema.js');
    assert.ok(appIdx > 0 && schemaIdx > 0 && schemaIdx < appIdx);
    assert.match(html, /memoryGraphView === 'facts'/);
    assert.match(html, /startFactExtractionPatrol\(\)/);
    assert.match(html, /runFactMaintenance\(\)/);
    assert.match(html, /restoreArchivedFact\(item\)/);
    assert.match(html, /memorySettings\.factExtractionEnabled/);
});

test('app.js wires fact layer state, patrol and maintenance', () => {
    assert.match(app, /const memoryFacts = ref\(\[\]\)/);
    assert.match(app, /const ensureFactBaseline = async \(\) => \{/);
    assert.match(app, /const extractFactsForTurn = async \(turnInfo, signal\) => \{/);
    assert.match(app, /const startFactExtractionPatrol = async \(options = \{\}\) => \{/);
    assert.match(app, /const runFactMaintenance = async \(options = \{\}\) => \{/);
    assert.match(app, /const restoreArchivedFact = \(fragment\) => \{/);
    assert.match(app, /const factPreviewText = \(fact\) => \{/);
    assert.match(app, /memoryModel.*memoryFactModel|memoryFactModel/);
    assert.match(app, /_factLoadedCharacterId === characterId/, '事实加载应记录已加载的角色，而非用 currentCharacter 判断');
    assert.match(app, /memoryFacts\.value = \[\];/, '切换角色时应清空旧角色事实');
    assert.match(app, /memorySettings\.embeddingBackend === 'local'[\s\S]{0,120}?\? !!globalThis\.RPHLocalEmbedding/, '本地嵌入后端不应再要求 API 嵌入模型');
    assert.match(app, /vectorExtractedTurns/, '向量补录应按角色记录已提取轮次，避免切换角色重复重扫');
    assert.match(app, /getMemoryVectorExtractedKey\(currentCharacter\.value\.uuid\)/, '删除/编辑消息后应重置已提取标记');
});

test('storage-repository.js exposes incremental fragment APIs', () => {
    assert.match(repository, /async loadFragments\(characterId\)/);
    assert.match(repository, /async applyFragments\(characterId, changes\)/);
    assert.match(repository, /async deleteFragments\(characterId\)/);
    assert.match(repository, /plugin\.memoryList/);
    assert.match(repository, /plugin\.memoryApply/);
});

test('native storage provides memory_fragments row table and plugin methods', () => {
    assert.match(javaDatabase, /DATABASE_VERSION = 2/);
    assert.match(javaDatabase, /CREATE TABLE IF NOT EXISTS memory_fragments/);
    assert.match(javaDatabase, /JSONArray getMemoryFragments\(String characterId\)/);
    assert.match(javaDatabase, /void applyMemoryFragments\(String characterId, JSONObject changes\)/);
    assert.match(javaPlugin, /public void memoryList\(PluginCall call\)/);
    assert.match(javaPlugin, /public void memoryApply\(PluginCall call\)/);
    assert.match(javaPlugin, /public void memoryDelete\(PluginCall call\)/);
});
