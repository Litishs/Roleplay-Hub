// Contract test: v6 L3 retrieval.
//
// Retrieval is ledger-native: the <memory_toc> block is always injected so
// the model can name a range, tool_memory returns full ledger entry text,
// and per-turn auto-recall is lexical over the distilled digest text
// (v6 design doc §8). No embedding call may remain on the recall path.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMemoryRecall } from '../src/modules/memory-view.mjs';

const appSource = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
const senderSource = await readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8');

const digest = (id, text, covers, meta = {}) => ({
    id,
    kind: 'digest',
    level: 0,
    covers,
    base: [],
    text,
    meta: { at: 0, model: '', tokens: 0, stale: false, folded: false, legacy: false, ...meta }
});

const turnIndexFor = (turns) => new Map(turns.flatMap(([id, turn]) => [[id, turn]]));

test('memory recall: hit count first, then recency', () => {
    const ledger = {
        entries: [
            digest('exact', '雪夜出逃的细节', [{ id: 'u1', h: 'h' }]),
            digest('partial-old', '雪夜', [{ id: 'u2', h: 'h' }]),
            digest('partial-new', '雪夜', [{ id: 'u3', h: 'h' }])
        ]
    };
    const turnIndex = turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3]]);
    const selected = buildMemoryRecall(ledger, turnIndex, '雪夜出逃');
    assert.equal(selected[0].entryId, 'exact', 'the entry matching more query terms wins');
    assert.deepEqual(selected.slice(1).map(item => item.entryId), ['partial-new', 'partial-old'], 'ties break by recency');
});

test('memory recall: a long natural CJK query still matches a distilled digest', () => {
    // Regression: the n-gram extractor used to keep only the longest 20 terms,
    // so a full sentence query produced zero bigrams and recall returned [].
    const ledger = { entries: [digest('e1', '第一批摘要：雪夜出逃，角色受伤未愈。', [{ id: 'u1', h: 'h' }])] };
    const selected = buildMemoryRecall(
        ledger,
        turnIndexFor([['u1', 1]]),
        '第10轮用户：我们继续查雪夜的线索。\n第10轮角色：雪夜的线索指向旧钟楼（第10段）。'
    );
    assert.deepEqual(selected.map(item => item.entryId), ['e1']);
});

test('memory recall: entries fully inside the raw window are skipped', () => {
    const ledger = {
        entries: [
            digest('retained', '雪夜出逃', [{ id: 'u1', h: 'h' }]),
            digest('outside', '雪夜出逃', [{ id: 'u2', h: 'h' }])
        ]
    };
    const turnIndex = turnIndexFor([['u1', 8], ['u2', 3]]);
    const selected = buildMemoryRecall(ledger, turnIndex, '雪夜出逃', { excludedTurns: new Set([8]) });
    assert.deepEqual(selected.map(item => item.entryId), ['outside']);
});

test('memory recall: stale and vanished entries never match', () => {
    const ledger = {
        entries: [
            digest('live', '雪夜出逃', [{ id: 'u1', h: 'h' }]),
            digest('stale', '雪夜出逃', [{ id: 'u2', h: 'h' }], { stale: true }),
            digest('vanished', '雪夜出逃', [{ id: 'gone', h: 'h' }])
        ]
    };
    const selected = buildMemoryRecall(ledger, turnIndexFor([['u1', 1], ['u2', 2]]), '雪夜出逃');
    assert.deepEqual(selected.map(item => item.entryId), ['live']);
});

test('memory recall: a query without usable terms selects nothing', () => {
    const ledger = { entries: [digest('e1', '雪夜出逃', [{ id: 'u1', h: 'h' }])] };
    assert.deepEqual(buildMemoryRecall(ledger, turnIndexFor([['u1', 1]]), '吗 呢 的'), []);
});

test('memory recall: recall budget skips an oversized tail entry', () => {
    const ledger = {
        entries: [
            digest('big', `雪夜${'很长'.repeat(800)}`, [{ id: 'u1', h: 'h' }]),
            digest('small', '雪夜', [{ id: 'u2', h: 'h' }])
        ]
    };
    const turnIndex = turnIndexFor([['u1', 1], ['u2', 2]]);
    const selected = buildMemoryRecall(ledger, turnIndex, '雪夜', { recallLimit: 2, recallBudget: 5 });
    assert.deepEqual(selected.map(item => item.entryId), ['small']);
});

test('prompt assembly injects <memory_toc> from the ledger view inside <role_memory>', () => {
    const start = appSource.indexOf('const buildMemoryContextForPrompt');
    assert.ok(start > 0, 'buildMemoryContextForPrompt exists');
    const block = appSource.slice(start, appSource.indexOf('const searchMemoryLedgerForTool', start));
    assert.ok(block.includes('toc = view.toc;'), 'TOC comes from the pure view fold');
    assert.ok(block.includes('parts.push(`<memory_toc>'), 'TOC block is assembled');
    assert.ok(block.includes('item.label'), 'TOC rows carry render-time turn labels');
    assert.ok(block.includes('selectMemoryLedgerRecall()'), 'lexical recall runs in the same pass');
});

test('tool_memory reads ledger entries instead of embedding shards', () => {
    const start = appSource.indexOf('const searchMemoryLedgerForTool');
    assert.ok(start > 0, 'searchMemoryLedgerForTool exists');
    const block = appSource.slice(start, appSource.indexOf('const extractKeywordToolTerms', start));
    assert.ok(block.includes("entry.kind === 'digest'"), 'only digest entries are tool results');
    assert.ok(block.includes('projectEntryTurns'), 'turn ranges are projected from covers');
    assert.ok(block.includes('parseMemoryToolTurnRange'), 'turn-range queries are supported');
    assert.ok(block.includes('extractVectorQueryTerms'), 'keyword queries fall back to lexical terms');
    assert.ok(block.includes('entryId'), 'entry ids are addressable');
    assert.ok(block.includes('text: String(entry.text'), 'full entry text is returned');
    assert.ok(!block.includes('requestMemoryEmbeddings'), 'no embedding call on the tool path');
});

test('tool_memory description teaches the memory_toc turn-range contract', () => {
    const start = appSource.indexOf('const ACTIVE_TOOL_DEFAULT_DESCRIPTION');
    const end = appSource.indexOf('const ACTIVE_TOOL_DEFAULT_DISPLAY_DESCRIPTION', start);
    const description = appSource.slice(start, end);
    assert.ok(description.includes('<memory_toc>'), 'description references the TOC');
    assert.ok(description.includes('轮次区间'), 'description explains turn ranges');
    assert.ok(description.includes('条目编号'), 'description explains entry ids');
});

test('send path no longer performs vector recall or at-depth fragment injection', () => {
    assert.ok(!senderSource.includes('selectVectorMemoriesForChatContext('), 'no vector recall call');
    assert.ok(!senderSource.includes('vector_memory_recall'), 'journal event uses the ledger wording');
    assert.ok(senderSource.includes('getLastMemoryRecallStats'), 'sender reports lexical recall stats');
    assert.ok(!senderSource.includes('以下内容是从往期对话记录中按当前输入检索出的相关记忆分片'), 'no fragment block is produced');
    // The escaped-tag stripper stays: it sanitizes already-saved legacy text.
    assert.ok(senderSource.includes('role_memory_vector_recall|memory_fragment'), 'legacy display sanitizer is kept');
});