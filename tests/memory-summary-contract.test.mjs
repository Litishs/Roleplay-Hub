import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as memorySummary from '../src/modules/memory-summary.mjs';

const [html, app, sender, messageList, memoryState, rollingSummary, reconcileModule, summaryModule] = await Promise.all([
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useRollingSummary.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/memory-reconcile.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/memory-summary.mjs', import.meta.url), 'utf8')
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
    // v6 L3: the list/summary toggle collapsed into one ledger card.
    assert.ok(!html.includes("setMemoryGraphView('list')"));
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
    // v6 L1: the trigger adapter forwards force into the single writer.
    assert.ok(rollingSummary.includes('force: options.force === true'));
    assert.ok(rollingSummary.includes('reconcileMemory'));
});

test('滚动总结循环处理全部待总结批次', () => {
    // v6 L1: the chain loop moved to memory-reconcile.mjs (single writer).
    assert.ok(reconcileModule.includes('while (processed < MAX_BATCHES_PER_RUN)'));
    assert.ok(reconcileModule.includes('MAX_BATCHES_PER_RUN = 200'));
    assert.ok(app.includes('withTimeoutSignal(signal, 180000)'));
    assert.ok(reconcileModule.includes("status: 'failed'"));
});

test('滚动摘要:链内使用快照且切换角色/分支/清空重建时中止（v6 L1）', () => {
    // Chain snapshot: one live snapshot per pass; every batch reads it.
    assert.ok(reconcileModule.includes('const live = deps.buildLiveSnapshot();'));
    // Abort: the reconciler owns the signal and the pending flag; scope
    // switches discard pending work (§6.4).
    assert.ok(app.includes('const abortRollingSummary = () => {'));
    assert.ok(app.includes('_summaryAbortController'));
    assert.ok(reconcileModule.includes('if (deps.getScopeId() !== scopeId) return { processed, folded: 0, reason: \'aborted\' };'));
    assert.ok(reconcileModule.includes('if (signal?.aborted)'));
    assert.ok(reconcileModule.includes("error?.name === 'AbortError'"));
    assert.ok(reconcileModule.includes('state.pending = null;'));
    // Failed-batch pruning helper stays in the module (unused by the ledger
    // chain; ledger holes supersede it) — nothing is deleted in L1.
    assert.ok(summaryModule.includes('pruneCoveredFailedBatches'));
});

// 2026-08-29 (Phase 2.2): timeline digest injection moved to useMessageSender
test('记忆摘要固定注入前缀且不参与楼层裁剪', () => {
    assert.ok(sender.includes("const timelineDigestText = memorySettings.enabled"));
    assert.ok(sender.includes("content: timelineDigestText"));
    assert.ok(sender.includes('safeTargetLimit += 1;'));
    assert.ok(!app.includes('时间线摘要注入（摘要为主，P4）'));
});

test('记忆账本目录可见（v6 L3）', () => {
    assert.ok(app.includes('memoryTocEntries'));
    assert.ok(html.includes('memoryTocEntries'));
    assert.ok(html.includes('记忆目录'));
    assert.ok(html.includes('tool_memory'));
    // The vector shard surface is gone.
    assert.ok(!html.includes('sliceBuildStatus'));
    assert.ok(!html.includes('vectorMemorySearchQuery'));
    assert.ok(!app.includes('startVectorBatchMemoryExtraction'));
});

test('总结批次大小可配置', () => {
    // memorySettings defaults moved to src/composables/useMemorySystem.mjs (Phase 2)
    assert.ok(memoryState.includes('summaryBatchSize: SUMMARY_BATCH_SIZE_DEFAULT'));
    // v6 L1: the writer reads the batch size through the reconciler settings.
    assert.ok(reconcileModule.includes('batchSize: settings.summaryBatchSize'));
    assert.ok(app.includes('const summaryBatchSizeSlider'));
    assert.ok(html.includes('summaryBatchSizeSlider'));
    assert.ok(html.includes('总结批次大小'));
    assert.equal(memorySummary.normalizeState({ batchSize: 5 }).batchSize, 5);
    assert.equal(memorySummary.normalizeState({ batchSize: 0 }).batchSize, memorySummary.DEFAULTS.batchSize);
});

// --- v6 ledger era (L1): independent batch digests + ledger read path ---

test('v6 批次提示词：独立批次 + 一行上下文，不再重写旧 long/short', () => {
    const messages = memorySummary.buildDigestMessages({
        contextLine: '上一段末尾',
        profileText: '旧信息卡',
        batch: { fromTurn: 3, toTurn: 4 },
        turns: [
            { turn: 3, userText: '第三轮用户', assistantText: '第三轮AI' },
            { turn: 4, userText: '第四轮用户', assistantText: '第四轮AI' },
            { turn: 9, userText: '不应出现' }
        ],
        characterName: '林夕瑶',
        userRoleName: '我'
    });
    const system = messages[0].content;
    const joined = messages.map(m => m.content).join('\n');
    assert.ok(system.includes('批次摘要器'));
    assert.ok(system.includes('{"digest"'));
    assert.ok(system.includes('不要续写、重写或扩写任何旧摘要'));
    // Independence: the old cumulative texts are no longer inputs at all.
    assert.ok(!joined.includes('旧短期摘要'));
    assert.ok(!joined.includes('旧长期摘要'));
    assert.ok(joined.includes('目前为止'));
    assert.ok(joined.includes('第三轮用户'));
    assert.ok(joined.includes('第四轮AI'));
    assert.ok(!joined.includes('不应出现'));
    assert.ok(joined.includes('旧信息卡'));
});

test('v6 L5 压实提示词：有界批次组、叙事重写、JSON 输出', () => {
    const messages = memorySummary.buildCompactionMessages({
        entries: [
            { fromTurn: 1, toTurn: 8, text: '第一批要点' },
            { fromTurn: 9, toTurn: 16, text: '第二批要点' },
            { fromTurn: 17, toTurn: 24, text: '  ' }
        ],
        level: 2,
        characterName: '林夕瑶',
        userRoleName: '我'
    });
    const system = messages[0].content;
    const joined = messages.map(m => m.content).join('\n');
    assert.ok(system.includes('长期记忆压实器'));
    assert.ok(system.includes('连贯、有叙事声音的长期要点'));
    assert.ok(system.includes('不要逐条罗列'));
    assert.ok(system.includes('{"digest"'));
    assert.ok(system.includes('禁止虚构摘要中不存在的历法、年号或日期'));
    assert.ok(joined.includes('【第 1–8 轮·批次摘要】\n第一批要点'));
    assert.ok(joined.includes('【第 9–16 轮·批次摘要】\n第二批要点'));
    assert.ok(!joined.includes('17–24'), 'blank child text is skipped, not sent');
    assert.ok(joined.includes('第 2 层'));
    // Compaction never re-reads cumulative long/short text (input bounded by
    // the fanout, design doc §9.2).
    assert.ok(!joined.includes('旧短期摘要'));
    assert.ok(!joined.includes('旧长期摘要'));
});

test('v6 批次解析：direct / 包裹 / 纯文本降级', () => {
    assert.deepEqual(
        memorySummary.parseDigestJson('{"digest":"d","profile":{"characters":[]}}'),
        { digest: 'd', profile: { characters: [] } }
    );
    assert.deepEqual(memorySummary.parseDigestJson('```json\n{"digest":"d2"}\n```'), { digest: 'd2', profile: null });
    assert.deepEqual(memorySummary.parseDigestJson('纯文本摘要'), { digest: '纯文本摘要', profile: null });
});

test('v6 注入谓词识别 role_memory 块（§12.2 修复）', () => {
    assert.ok(app.includes('const ROLE_MEMORY_OPEN_TAG = `<${ROLE_MEMORY_TAG}>`;'));
    assert.ok(app.includes('text.startsWith(ROLE_MEMORY_OPEN_TAG)'));
    assert.ok(app.includes('ROLE_MEMORY_CLOSE_TAG'));
    // Dead v4 timeline constants are gone (defined but never produced).
    assert.ok(!app.includes('ROLE_MEMORY_TIMELINE_TAG'));
});

test('v6 写入链：ledger 为唯一派生存储，投影双写，编辑/删除同步失效', () => {
    assert.ok(app.includes("const saveMemoryLedgerNow = async (scopeId, data) => {"));
    assert.ok(app.includes("const loadMemoryLedger = async (characterId) => {"));
    assert.ok(app.includes("'memory_ledger'"));
    assert.ok(app.includes('persistMemoryLedgerAndProjection'));
    assert.ok(app.includes('invalidateMemoryLedgerNow()'));
    assert.ok(app.includes("await deleteScopedStoredValue('memory_ledger', scopeId);"));
    // Read priority: the ledger fold wins when it has entries; the legacy
    // strings only serve scopes that never reconciled.
    assert.ok(app.includes('const hasLedger = Boolean(ledger && Array.isArray(ledger.entries) && ledger.entries.length > 0);'));
    assert.ok(app.includes("if (!hasLedger && !memorySummaries.value && !memoryProfile.value) return '';"), 'ledger-only state still injects');
    assert.ok(app.includes('const view = buildMemoryView(ledger, buildLiveTurnIndex());'));
});
