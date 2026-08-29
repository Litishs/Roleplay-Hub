import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as memorySummary from '../src/modules/memory-summary.mjs';

const [html, app, sender, messageList, memoryState] = await Promise.all([
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8')
]);
    const mainJs = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test('滚动摘要:窗口外未攒满一批时不触发', () => {
    const pending = memorySummary.computePendingBatch([], 20, { keepFloors: 16, batchSize: 8 });
    assert.equal(pending, null);
});

test('滚动摘要:窗口外攒满一批时返回批次区间', () => {
    const pending = memorySummary.computePendingBatch([], 25, { keepFloors: 16, batchSize: 8 });
    assert.deepEqual(pending, { fromTurn: 1, toTurn: 8 });
});

test('滚动摘要:强制模式按批推进，不足一批也处理', () => {
    const first = memorySummary.computePendingBatch([], 30, { keepFloors: 16, batchSize: 8 }, { force: true });
    assert.deepEqual(first, { fromTurn: 1, toTurn: 8 });
    const done = [{ fromTurn: 1, toTurn: 8, status: 'done' }];
    const second = memorySummary.computePendingBatch(done, 30, { keepFloors: 16, batchSize: 8 }, { force: true });
    assert.deepEqual(second, { fromTurn: 9, toTurn: 14 });
    assert.equal(memorySummary.computePendingBatch([], 16, { keepFloors: 16, batchSize: 8 }, { force: true }), null);
    // 自动模式不足一批不触发
    assert.equal(memorySummary.computePendingBatch([], 22, { keepFloors: 16, batchSize: 8 }), null);
});

test('滚动摘要:已总结批次推进后再触发下一批', () => {
    const batches = [{ fromTurn: 1, toTurn: 8, status: 'done' }];
    const pending = memorySummary.computePendingBatch(batches, 33, { keepFloors: 16, batchSize: 8 });
    assert.deepEqual(pending, { fromTurn: 9, toTurn: 16 });
});

test('滚动摘要:失败批次不阻塞重新触发同一批', () => {
    const batches = [{ fromTurn: 1, toTurn: 8, status: 'failed' }];
    const pending = memorySummary.computePendingBatch(batches, 25, { keepFloors: 16, batchSize: 8 });
    assert.deepEqual(pending, { fromTurn: 1, toTurn: 8 });
});

test('滚动摘要:失败空洞优先补，不被后续完成批次跨过（v4 真机场景）', () => {
    // 真机数据形态：1-88 done、89-96 failed、97-120 done → 下一批必须回到 89
    const batches = [
        { fromTurn: 1, toTurn: 88, status: 'done' },
        { fromTurn: 89, toTurn: 96, status: 'failed' },
        { fromTurn: 97, toTurn: 120, status: 'done' }
    ];
    const pending = memorySummary.computePendingBatch(batches, 157, { keepFloors: 32, batchSize: 12 });
    assert.deepEqual(pending, { fromTurn: 89, toTurn: 100 });
    // 空洞补上后（89-100 done）继续从 121 推进：尾部 5 轮未攒满一批，自动模式不触发、force 处理
    const repaired = [
        { fromTurn: 1, toTurn: 88, status: 'done' },
        { fromTurn: 89, toTurn: 100, status: 'done' },
        { fromTurn: 97, toTurn: 120, status: 'done' }
    ];
    assert.equal(memorySummary.computePendingBatch(repaired, 157, { keepFloors: 32, batchSize: 12 }), null);
    assert.deepEqual(
        memorySummary.computePendingBatch(repaired, 157, { keepFloors: 32, batchSize: 12 }, { force: true }),
        { fromTurn: 121, toTurn: 125 }
    );
});

test('滚动摘要:被 done 覆盖的失败记录清理，部分覆盖的保留', () => {
    const batches = [
        { fromTurn: 1, toTurn: 88, status: 'done' },
        { fromTurn: 89, toTurn: 96, status: 'failed' },
        { fromTurn: 89, toTurn: 100, status: 'done' },
        { fromTurn: 105, toTurn: 112, status: 'failed' },
        { fromTurn: 113, toTurn: 120, status: 'done' }
    ];
    const pruned = memorySummary.pruneCoveredFailedBatches(batches);
    assert.equal(pruned.filter(b => b.status === 'failed').length, 1);
    assert.ok(pruned.some(b => b.status === 'failed' && b.fromTurn === 105));
    assert.ok(!pruned.some(b => b.status === 'failed' && b.fromTurn === 89));
});

test('滚动摘要:重写式消息包含旧摘要、批次原文与时间锚指令', () => {
    const messages = memorySummary.buildRewriteMessages({
        shortSummary: '旧摘要',
        longSummary: '旧长期',
        profileText: '<relations>我→林夕瑶:恋人</relations>',
        batch: { fromTurn: 1, toTurn: 2 },
        turns: [
            { turn: 1, userContent: '第一轮用户', assistantContent: '第一轮AI' },
            { turn: 2, userContent: '第二轮用户', assistantContent: '第二轮AI' },
            { turn: 5, userContent: '不应出现的轮次' }
        ],
        characterName: '林夕瑶',
        userRoleName: '我'
    });
    const system = messages[0].content;
    const joined = messages.map(m => m.content).join('\n');
    assert.ok(system.includes('滚动记忆整理器'));
    assert.ok(system.includes('{"short"'));
    assert.ok(system.includes('"profile"'));
    assert.ok(system.includes('角色动态状态'));
    assert.ok(system.includes('不重复世界书里已有的静态设定'));
    assert.ok(system.includes('禁止“几天前”“最近”这类模糊词'));
    // v4：时间锚只能摘自原文时间表达，禁止提示词示例泄漏（承和年号来自旧提示词示例）
    assert.ok(!system.includes('承和'));
    assert.ok(system.includes('只能摘自原文中实际出现的时间表达'));
    assert.ok(system.includes('禁止虚构原文中不存在的历法、年号或日期'));
    assert.ok(system.includes('写“第 N 轮”'));
    assert.ok(joined.includes('旧摘要'));
    assert.ok(joined.includes('旧长期'));
    assert.ok(joined.includes('旧固定信息卡'));
    assert.ok(joined.includes('我→林夕瑶:恋人'));
    assert.ok(joined.includes('第一轮用户'));
    assert.ok(joined.includes('第二轮AI'));
    assert.ok(!joined.includes('不应出现的轮次'));
});

test('滚动摘要:解析 direct / 包裹 JSON / 纯文本降级（含 profile）', () => {
    assert.deepEqual(
        memorySummary.parseSummaryJson('{"short":"s","long":"l","profile":{"relations":[{"from":"A","to":"B","relation":"老师"}]}}'),
        {
            short: 's',
            long: 'l',
            profile: { relations: [{ from: 'A', to: 'B', relation: '老师' }] }
        }
    );
    assert.deepEqual(
        memorySummary.parseSummaryJson('```json\n{"short":"s2","long":"l2"}\n```'),
        { short: 's2', long: 'l2', profile: null }
    );
    const fallback = memorySummary.parseSummaryJson('纯文本摘要');
    assert.equal(fallback.short, '纯文本摘要');
    assert.equal(fallback.long, '');
    assert.equal(fallback.profile, null);
});

test('滚动摘要:进度提示文案三种状态', () => {
    assert.equal(memorySummary.formatProgress({ fromTurn: 1, toTurn: 8, status: 'running' }), '正在总结 第 1–8 轮…');
    assert.equal(memorySummary.formatProgress({ fromTurn: 1, toTurn: 8, status: 'done' }), '已总结 第 1–8 轮');
    assert.equal(memorySummary.formatProgress({ fromTurn: 1, toTurn: 8, status: 'failed' }), '第 1–8 轮总结失败，稍后自动重试');
});

test('滚动摘要:MemoryPanel.vue 加载模块并渲染进度提示', () => {
    assert.ok(app.includes('./memory-summary.mjs'));
    assert.ok(messageList.includes('summaryProgress'));
    assert.ok(messageList.includes('retryRollingSummary'));
    assert.ok(messageList.includes('正在总结 第'));
});

test('滚动摘要:app.js 接入注入、触发与存储键', () => {
    assert.ok(app.includes('buildMemoryContextForPrompt'));
    assert.ok(app.includes('runRollingSummaryCheck'));
    assert.ok(app.includes("'memory_summaries'"));
    assert.ok(app.includes('memorySettings.keepFloors'));
});

test('记忆重构:单一引擎且旧模式/事实层 UI 已移除', () => {
    assert.ok(html.includes("setMemoryGraphView('summary')"));
    assert.ok(!html.includes("setMemoryGraphView('graph')"));
    assert.ok(!html.includes("setMemoryGraphView('facts')"));
    assert.ok(!html.includes("setMemoryGraphView('relations')"));
    assert.ok(!html.includes('总结模式'));
    assert.ok(!html.includes('事实层抽取'));
    assert.ok(!html.includes('剧情时钟'));
    assert.ok(!app.includes('MEMORY_MODE_CLASSIC'));
    assert.ok(!app.includes('memory-schema.js'));
});

test('立即总结按钮使用强制模式', () => {
    assert.ok(html.includes("runRollingSummaryCheck({ force: true })"));
    assert.ok(app.includes('const force = options.force === true'));
});

test('滚动总结循环处理全部待总结批次', () => {
    assert.ok(app.includes('while (true)'));
    assert.ok(app.includes('processed > 200'));
    assert.ok(app.includes('withTimeoutSignal(signal, 180000)'));
    assert.ok(app.includes('status: \'failed\''));
});

test('滚动摘要:链内使用快照且切换角色/分支/清空重建时中止（v4）', () => {
    // 链快照：批次请求只读链启动捕获的数据，不逐批读共享 ref
    assert.ok(app.includes('const chainContext = {'));
    assert.ok(app.includes('historySnapshot,'));
    assert.ok(app.includes('requestRollingSummary(batch, abortController.signal, chainContext)'));
    // 中止接线与每批前 scope 校验双保险
    assert.ok(app.includes('const abortRollingSummary = () => {'));
    assert.ok(app.includes('_summaryAbortController'));
    assert.ok(app.includes('getCurrentChatStorageScopeId() !== scopeId'));
    // 失败批次补上后自动清理记录
    assert.ok(app.includes('pruneCoveredFailedBatches'));
});

// 2026-08-29 (Phase 2.2): timeline digest injection moved to useMessageSender
test('记忆摘要固定注入前缀且不参与楼层裁剪', () => {
    assert.ok(sender.includes("const timelineDigestText = memorySettings.enabled"));
    assert.ok(sender.includes("content: timelineDigestText"));
    assert.ok(sender.includes('safeTargetLimit += 1;'));
    assert.ok(!app.includes('时间线摘要注入（摘要为主，P4）'));
});

test('分片生成状态可见并可重试', () => {
    assert.ok(app.includes('sliceBuildStatus'));
    assert.ok(html.includes('sliceBuildStatus.status'));
    assert.ok(html.includes('startVectorBatchMemoryExtraction({ manual: true })'));
    assert.ok(app.includes('status: \'building\''));
});

test('分片标记：清空重建重置标记，自动补录对脏状态自愈（v4）', () => {
    // 清空重建必须同步清 vectorExtractedTurns / emptyTurns，否则自动补录空转、分片永远为 0
    assert.ok(app.includes('delete memorySettings.vectorExtractedTurns[extractedKey]'));
    assert.ok(app.includes('delete memorySettings.emptyTurns[emptyKey]'));
    // 自愈：分片为 0 但标记 > 0 → 重置标记全量重扫
    assert.ok(app.includes('let lastExtracted = Number(memorySettings.vectorExtractedTurns[extractedKey]) || 0'));
    assert.ok(app.includes('memories.value.length === 0'));
});

test('本地嵌入模型默认自动加载（v4）', () => {
    assert.ok(app.includes('const ensureLocalEmbeddingReady = () => {'));
    assert.ok(app.includes('ensureLocalEmbeddingReady();'));
    assert.ok(app.includes("watch(() => memorySettings.embeddingBackend"));
    assert.ok(app.includes('未加载(将自动加载)'));
    assert.ok(!app.includes('未加载(首次使用时加载模型)'));
});

test('总结批次大小可配置', () => {
    // memorySettings defaults moved to src/composables/useMemorySystem.mjs (Phase 2)
    assert.ok(memoryState.includes('summaryBatchSize: SUMMARY_BATCH_SIZE_DEFAULT'));
    assert.ok(app.includes('batchSize: memorySettings.summaryBatchSize'));
    assert.ok(app.includes('const summaryBatchSizeSlider'));
    assert.ok(html.includes('summaryBatchSizeSlider'));
    assert.ok(html.includes('总结批次大小'));
    assert.equal(memorySummary.normalizeState({ batchSize: 5 }).batchSize, 5);
    assert.equal(memorySummary.normalizeState({ batchSize: 0 }).batchSize, memorySummary.DEFAULTS.batchSize);
});
