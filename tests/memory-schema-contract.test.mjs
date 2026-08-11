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
    assert.equal(memorySchema.SCHEMA_VERSION, 2);
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

test('normalizeFact v2 attaches time anchors and derives timeKey', () => {
    const anchored = memorySchema.normalizeFact(
        { type: 'event', summary: '事件', storyDay: 3, segment: '下午', minutes: null, anchorConfidence: 'high', anchorSource: 'relative', relativeTime: '今天下午' },
        { turn: 5 }
    );
    assert.equal(anchored.storyDay, 3);
    assert.equal(anchored.segment, '下午');
    assert.equal(anchored.timeKey, 3 * 1440 + 540);
    assert.equal(anchored.anchorSource, 'relative');
    const plain = memorySchema.normalizeFact({ type: 'event', summary: '无锚点' }, { turn: 5 });
    assert.equal(plain.anchorConfidence, 'low');
    assert.equal(plain.storyDay, null);
});

test('buildEventId is stable for same participants and summary stem', () => {
    const a = memorySchema.buildEventId({ storyDay: 3, participants: ['苏语嫣', '用户'], summary: '一起去了灵溪边' }, 5);
    const b = memorySchema.buildEventId({ storyDay: 3, participants: ['用户', '苏语嫣'], summary: '一起去了灵溪边' }, 5);
    const c = memorySchema.buildEventId({ storyDay: 3, participants: ['苏语嫣', '用户'], summary: '在山门前争吵' }, 5);
    assert.equal(a, b, '参与者顺序无关且摘要主干稳定');
    assert.notEqual(a, c, '不同事件应有不同 eventId');
});

test('mergeFacts v2 appends same-event continuation instead of adding', () => {
    const first = memorySchema.mergeFacts([], [
        { type: 'event', eventId: 'ev:1', storyDay: 3, summary: '灵溪边相遇', participants: ['苏语嫣', '用户'] }
    ], { turn: 1 });
    assert.equal(first.added, 1);
    const second = memorySchema.mergeFacts(first.facts, [
        { type: 'event', eventId: 'ev:1', storyDay: 3, summary: '灵溪边相遇后一起散步', participants: ['苏语嫣', '用户'] }
    ], { turn: 2 });
    assert.equal(second.merged, 1, '同一事件延续应合并到已有节点');
    assert.equal(second.added, 0);
    assert.equal(second.facts.filter(f => f.kind === 'event').length, 1);
});

test('mergeFacts v2 updates state intervals with validFrom/validUntil', () => {
    const first = memorySchema.mergeFacts([], [
        { type: 'state', storyDay: 1, subject: '苏语嫣', aspect: '身体状况', value: '完好' }
    ], { turn: 1 });
    const old = first.facts[0];
    assert.equal(old.validFrom, 1 * 1440);
    const second = memorySchema.mergeFacts(first.facts, [
        { type: 'state', storyDay: 3, subject: '苏语嫣', aspect: '身体状况', value: '左臂受伤' }
    ], { turn: 3 });
    const states = second.facts.filter(f => f.kind === 'state');
    const newState = states.find(s => s.status === 'current');
    const oldState = states.find(s => s.status === 'superseded');
    assert.equal(newState.validFrom, 3 * 1440);
    assert.equal(oldState.validUntil, 3 * 1440, '旧状态应关闭区间');
});

test('mergeFacts v2 drops redundant event retellings', () => {
    const first = memorySchema.mergeFacts([], [
        { type: 'event', storyDay: 3, summary: '苏语嫣在灵溪边握剑，夕阳照在水面', participants: ['苏语嫣', '用户'] }
    ], { turn: 1 });
    const second = memorySchema.mergeFacts(first.facts, [
        { type: 'event', storyDay: 3, summary: '苏语嫣握剑立于灵溪边，夕阳映在水面上', participants: ['苏语嫣', '用户'] }
    ], { turn: 2 });
    assert.equal(second.redundant, 1, '同参与者+高相似摘要应判为复述');
    assert.equal(second.facts.filter(f => f.kind === 'event').length, 1);
});

test('mergeFacts v2 keeps similar events on different days', () => {
    const first = memorySchema.mergeFacts([], [
        { type: 'event', storyDay: 1, summary: '清晨醒来发现窗外天亮了', participants: ['可可'] }
    ], { turn: 144 });
    const second = memorySchema.mergeFacts(first.facts, [
        { type: 'event', storyDay: 2, summary: '清晨醒来发现窗外天亮了', participants: ['可可'] }
    ], { turn: 148 });
    assert.equal(second.redundant, 0, '不同天数的相似事件不应判为复述');
    assert.equal(second.facts.filter(f => f.kind === 'event').length, 2);
});

test('migrateFactsV1toV2 anchors old facts by inStoryTime', () => {
    const oldFacts = [
        { type: 'event', sourceTurn: 5, inStoryTime: '昨晚', summary: '旧事件', participants: ['A'] },
        { type: 'state', sourceTurn: 2, subject: 'A', aspect: '健康', value: '正常' }
    ];
    const clock = { storyDay: 3, segment: '上午' };
    const resolver = (expr) => expr === '昨晚'
        ? { storyDay: 2, segment: '入夜', minutes: 660, timeKey: 2 * 1440 + 660, anchorConfidence: 'high', anchorSource: 'relative', relativeTime: '昨晚' }
        : { storyDay: null, segment: null, minutes: null, timeKey: null, anchorConfidence: 'low', anchorSource: 'unresolved', relativeTime: expr };
    const migrated = memorySchema.migrateFactsV1toV2(oldFacts, clock, resolver);
    const event = migrated.find(f => f.type === 'event');
    assert.equal(event.storyDay, 2);
    assert.equal(event.anchorSource, 'relative');
    assert.ok(event.eventId, '迁移后事件应有 eventId');
    const state = migrated.find(f => f.type === 'state');
    assert.ok(state.validFrom === null || Number.isFinite(state.validFrom), '状态应有 validFrom');
});

test('buildTimelineDigest assembles states, events, relations and plots', () => {
    const facts = [
        memorySchema.normalizeFact({ type: 'state', storyDay: 5, subject: '苏语嫣', aspect: '身体状况', value: '左臂受伤', anchorConfidence: 'high' }, { turn: 1 }),
        memorySchema.normalizeFact({ type: 'event', storyDay: 6, segment: '上午', summary: '去药房抓药', participants: ['苏语嫣'], anchorConfidence: 'high' }, { turn: 2 }),
        memorySchema.normalizeFact({ type: 'relation', storyDay: 0, from: '用户', relKind: '师徒', to: '苏语嫣', strength: 0.8, anchorConfidence: 'high' }, { turn: 0 }),
        memorySchema.normalizeFact({ type: 'plot', storyDay: 6, summary: '墨渊残魂来历未解', plotStatus: 'open', deadlineText: '三日后', anchorConfidence: 'high' }, { turn: 3 })
    ];
    const digest = memorySchema.buildTimelineDigest(facts, { storyDay: 7 });
    assert.ok(digest.includes('【当前状态】'));
    assert.ok(digest.includes('【最近事件】'));
    assert.ok(digest.includes('【关系】'));
    assert.ok(digest.includes('【未决伏笔】'));
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
    assert.match(app, /getMemoryVectorExtractedKey\(getCurrentChatStorageScopeId\(\)\)/, '删除/编辑消息后应重置已提取标记（按分支作用域）');
});

test('app.js reports vector backfill progress by actual request count', () => {
    assert.match(app, /const totalRequests = Math\.ceil\(fragmentItems\.length \/ MEMORY_VECTOR_BATCH_SIZE\)/, '补录总量应按实际请求（批次）数计算');
    assert.match(app, /batchExtractProgress\.value = \{ current: 0, total: totalRequests \}/, '补录进度总量应使用请求数');
    assert.match(app, /batchExtractProgress\.value\.current = Math\.min\(\s*Math\.floor\(i \/ MEMORY_VECTOR_BATCH_SIZE\) \+ 1,\s*totalRequests\s*\)/, '补录进度当前值应按已完成请求数推进');
});

test('app.js wires timeline clock, digest injection and timeline graph', () => {
    assert.match(app, /timeLib\(\)\.formatForPrompt\(clockState\)/, '抽取提示词应注入当前剧情时间');
    assert.match(app, /clockProposal/, '抽取响应应解析时间推进提案');
    assert.match(app, /ROLE_MEMORY_TIMELINE_OPEN_TAG/, '应有时间线摘要注入标签');
    assert.match(app, /const buildMemoryDigestForContext = \(\) => \{/, '应有上下文摘要组装');
    assert.match(app, /const buildTimelineGraphData = \(\) => \{/, '应有时间线图谱数据');
    assert.match(app, /kind: 'day'/, '时间线视图应有天节点');
    assert.match(app, /migrateFactsV1toV2/, '应接入 v1→v2 迁移');
    assert.match(app, /const runTimelineConsolidation = async/, '应有时间滚降凝练');
});

test('index.html exposes clock card and clock injection setting', () => {
    assert.match(html, /剧情时钟/);
    assert.match(html, /factClockLabel/);
    assert.match(html, /editFactClock\(\)/);
    assert.match(html, /memorySettings\.factClockInjection/);
    assert.match(html, /D\{\{ e\.storyDay \}\}/, '事件列表应显示天锚点');
    assert.match(html, /reAnchorFact\(e\)/, '低置信度锚点应可重解析');
});

test('app.js implements context token budget and slimmer floor defaults', () => {
    assert.match(app, /VECTOR_KEEP_FLOORS_DEFAULT = 16/, '向量默认保留楼层应降为 16');
    assert.match(app, /SUMMARY_KEEP_FLOORS_DEFAULT = 12/, '总结默认保留楼层应降为 12');
    assert.match(app, /MIN_CONTEXT_FLOORS = 6/, '应保留现场窗口下限');
    assert.match(app, /CONTEXT_TOKEN_BUDGET_DEFAULT = 26000/, '应有默认上下文预算');
    assert.match(app, /const estimateTokens = \(text\) => \{/, '应有本地 token 估算器');
    assert.match(app, /const getContextTokenBudget = \(\) => \{/, '应有预算读取');
    assert.match(app, /budgetedChatHistory/, '历史楼层应按预算截取');
    assert.match(app, /settings\.contextTokenBudget/, '设置中应含上下文预算');
});

test('index.html exposes context token budget slider', () => {
    assert.match(html, /上下文 Token 预算/);
    assert.match(html, /settings\.contextTokenBudget/);
    assert.match(html, /向量模式可选 8–40 楼/);
});

test('app.js implements memory provider decoupling (P6) and output limit (P7)', () => {
    assert.match(app, /memoryProviderId/, '记忆设置应含记忆供应商字段');
    assert.match(app, /const getMemoryProvider = \(\) => \{/, '应有记忆供应商解析');
    assert.match(app, /const getMemoryApiEndpoint = \(path\) => \{/, '记忆请求应走记忆供应商端点');
    assert.match(app, /const fetchModelsForMemoryProvider = \(\) => \{/, '记忆模型选择器应拉记忆供应商模型');
    assert.match(app, /fetchModelsForProvider\(provider\.providerId/, '记忆模型选择应路由到记忆供应商');
    assert.match(app, /maxOutputTokens: 4096/, '设置应含输出上限');
    assert.match(app, /const getMaxOutputTokens = \(\) => \{/, '应有输出上限读取');
    assert.match(app, /max_tokens: getMaxOutputTokens\(\)/, '请求应使用用户设定的输出上限');
});

test('index.html exposes memory provider selector and output limit slider', () => {
    assert.match(html, /记忆供应商/);
    assert.match(html, /memoryProviderSelectOptions/);
    assert.match(html, /memoryProviderLabel/);
    assert.match(html, /输出长度上限/);
    assert.match(html, /settings\.maxOutputTokens/);
});

test('provider switching force-syncs the API key input and marks configured providers', () => {
    assert.match(app, /apiKeyInput\.value\.value = settings\.apiKey/, '切换供应商后应强制同步输入框，防止旧 Key 串槽');
    assert.match(html, /settings\.apiProviderKeys && settings\.apiProviderKeys\[provider\.id\]/, '供应商下拉应标注已配置 Key 的供应商');
});

test('chat decoupled from settings browsing provider and models aggregated per provider', () => {
    assert.match(app, /chatProviderId: ''/, '聊天供应商字段默认回退');
    assert.match(app, /const getChatProvider = \(\) => \{/, '应有聊天供应商解析');
    assert.match(app, /const getChatProviderEndpoint = \(path\) => \{/, '聊天请求应走聊天供应商端点');
    assert.match(app, /chatUrl = getChatProviderEndpoint\('chat\/completions'\)/, '聊天请求 URL 应来自聊天供应商');
    assert.match(app, /Bearer \$\{getChatProvider\(\)\.apiKey\}/, '聊天请求 Key 应来自聊天供应商');
    assert.match(app, /const providerModels = reactive\(\{\}\)/, '应有按供应商聚合的模型注册表');
    assert.match(app, /const fetchAllConfiguredProviderModels = \(\) => \{/, '应拉取所有已配 Key 供应商的模型');
    assert.match(app, /selectModel = \(modelId, providerId = ''\) => \{/, '选模型应携带供应商');
    assert.match(app, /settings\.chatProviderId = selectedProviderId/, '选聊天模型应绑定其供应商');
    assert.match(app, /memorySettings\.memoryProviderId = selectedProviderId/, '选记忆模型应绑定其供应商');
    assert.match(app, /const chatBindingLabel = computed/, '设置页应显示聊天绑定');
});

test('model selector shows provider grouping and bindings', () => {
    assert.match(html, /activeProviderTag = tag\.id/, '模型选择器应有供应商筛选');
    assert.match(html, /providerTags/, '应有供应商标签');
    assert.match(html, /getProviderDisplayName\(model\._providerId\)/, '模型行应显示来源供应商');
    assert.match(html, /selectModel\(model\.id, model\._providerId\)/, '选模型应带供应商');
    assert.match(html, /chatBindingLabel/, '设置页应展示聊天绑定');
});

test('worldbook budget governance (P4) trims by tokens and dedups with character card', () => {
    assert.match(app, /worldInfoTokenBudget: 4000/, '世界书应有默认 token 预算');
    assert.match(app, /const getWorldInfoTokenBudget = \(\) => \{/, '应有世界书预算读取');
    assert.match(app, /isRedundantText\(text, charPromptForDedup, 0\.85\)/, '世界书条目应与角色卡描述去重');
    assert.match(app, /charPromptForDedup = String\(getCurrentCharacterPrompt\(\) \|\| ''\)/, '去重应使用可调用的角色卡提示，避免 TDZ');
    assert.ok(!app.includes("charPromptForDedup = String(charPrompt || '')"), '不得在 charPrompt 初始化前引用');
    assert.match(app, /dedupedEntries\.find\(e => e\.constant\)/, '预算裁剪应保底保留最高优先常驻条目');
    assert.match(app, /dedupedEntries\.find\(e => !e\.constant\)/, '预算裁剪应保底保留最高优先触发条目');
    assert.match(html, /世界书 Token 预算/);
    assert.match(html, /settings\.worldInfoTokenBudget/);
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
