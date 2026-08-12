import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import memorySummary from '../assets/js/memory-summary.js';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8')
]);

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

test('滚动摘要:index.html 加载模块并渲染进度提示', () => {
    assert.ok(html.includes('assets/js/memory-summary.js'));
    assert.ok(html.includes('summaryProgress'));
    assert.ok(html.includes('retryRollingSummary'));
    assert.ok(html.includes('正在总结 第'));
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

test('记忆摘要固定注入前缀且不参与楼层裁剪', () => {
    assert.ok(app.includes("const timelineDigestText = memorySettings.enabled"));
    assert.ok(app.includes("content: timelineDigestText"));
    assert.ok(app.includes('safeTargetLimit += 1;'));
    assert.ok(!app.includes('时间线摘要注入（摘要为主，P4）'));
});

test('分片生成状态可见并可重试', () => {
    assert.ok(app.includes('sliceBuildStatus'));
    assert.ok(html.includes('sliceBuildStatus.status'));
    assert.ok(html.includes('startVectorBatchMemoryExtraction({ manual: true })'));
    assert.ok(app.includes('status: \'building\''));
});

test('总结批次大小可配置', () => {
    assert.ok(app.includes('summaryBatchSize: SUMMARY_BATCH_SIZE_DEFAULT'));
    assert.ok(app.includes('batchSize: memorySettings.summaryBatchSize'));
    assert.ok(app.includes('const summaryBatchSizeSlider'));
    assert.ok(html.includes('summaryBatchSizeSlider'));
    assert.ok(html.includes('总结批次大小'));
    assert.equal(memorySummary.normalizeState({ batchSize: 5 }).batchSize, 5);
    assert.equal(memorySummary.normalizeState({ batchSize: 0 }).batchSize, memorySummary.DEFAULTS.batchSize);
});
