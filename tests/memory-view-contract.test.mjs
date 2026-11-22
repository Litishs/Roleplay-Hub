// Contract test: v6 memory view (L1).
//
// buildMemoryView must be a pure function (no storage / network / Vue) and
// derive everything from the ledger + the current live turn projection:
// long/short folding, TOC labels, the MemoryPanel batches projection and
// budget truncation (v6 design doc §5).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMemoryView, VIEW_DEFAULTS } from '../src/modules/memory-view.mjs';
import { estimateTokens } from '../src/modules/utils.mjs';

const viewSource = await readFile(new URL('../src/modules/memory-view.mjs', import.meta.url), 'utf8');

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

test('memory view: module is pure (no I/O, no Vue, no globals)', () => {
    assert.ok(!viewSource.includes('localStorage'));
    assert.ok(!viewSource.includes('fetch('));
    assert.ok(!viewSource.includes("from 'vue'"));
    assert.ok(!viewSource.includes('indexedDB'));
    assert.ok(!viewSource.includes('setTimeout'));
});

test('memory view: long takes the older layers, short the newest level-0 window (no overlap)', () => {
    const ledger = {
        entries: [
            digest('e1', '甲段', [{ id: 'u1', h: 'h' }]),
            digest('e2', '乙段', [{ id: 'u2', h: 'h' }]),
            digest('e3', '丙段', [{ id: 'u3', h: 'h' }]),
            digest('e4', '丁段', [{ id: 'u4', h: 'h' }])
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4]]), { shortDigestCount: 2 });
    assert.equal(view.long, '甲段\n\n乙段', 'long holds everything outside the short window');
    assert.equal(view.short, '丙段\n\n丁段', 'short keeps the newest level-0 batches');
    assert.ok(!view.long.includes('丙段'), 'no text is injected twice (L5 dedup)');
    assert.deepEqual(view.batches.map(b => [b.fromTurn, b.toTurn, b.status]), [[1, 1, 'done'], [2, 2, 'done'], [3, 3, 'done'], [4, 4, 'done']]);
    assert.deepEqual(view.toc.map(item => item.label), ['第 1 轮', '第 2 轮', '第 3 轮', '第 4 轮']);
    assert.equal(view.toc[0].entryId, 'e1');
    assert.deepEqual(view.toc.map(item => item.level), [0, 0, 0, 0], 'toc rows expose the fold level');
});

test('memory view: stale / vanished / text-less entries never reach the prompt', () => {
    const ledger = {
        entries: [
            digest('live', '保留', [{ id: 'u1', h: 'h' }]),
            digest('stale', '失效', [{ id: 'u2', h: 'h' }], { stale: true }),
            digest('vanished', '消息已删', [{ id: 'gone', h: 'h' }]),
            digest('adopted-coverage', '', [{ id: 'u3', h: 'h' }], { legacy: true })
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3]]));
    assert.equal(view.long, '', 'a lone digest belongs to the short block');
    assert.equal(view.short, '保留');
    assert.deepEqual(view.batches.map(b => b.fromTurn), [1], 'coverage-only legacy rows stay out of the panel projection');
});

test('memory view: budgets hard-truncate long/short/toc', () => {
    const longText = '甲'.repeat(200);
    const ledger = {
        entries: [
            digest('e1', longText, [{ id: 'u1', h: 'h' }]),
            digest('e2', longText, [{ id: 'u2', h: 'h' }])
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2]]), {
        longBudget: 10, shortBudget: 10, tocBudget: 1, cardBudget: 10, shortDigestCount: 1
    });
    // Truncation is enforced against the same token estimate the prompt
    // budget uses, so CJK text cannot overshoot a fixed char cap.
    assert.ok(estimateTokens(view.long) <= 10, 'long truncated to the token budget');
    assert.ok(view.long.endsWith('…'));
    assert.ok(estimateTokens(view.short) <= 10);
    assert.ok(view.short.endsWith('…'));
    assert.deepEqual(view.toc, [], 'toc rows beyond the budget are dropped');
});

test('memory view: tightened L5 defaults are the contract (§17 Q7)', () => {
    assert.equal(VIEW_DEFAULTS.longBudget, 600);
    assert.equal(VIEW_DEFAULTS.shortBudget, 1000);
    assert.equal(VIEW_DEFAULTS.tocBudget, 300);
    assert.equal(VIEW_DEFAULTS.cardBudget, 800);
    // The export line proves the hard caps travel with the view.
    const view = buildMemoryView(null, null);
    assert.deepEqual(view.budgets, {
        long: 600, short: 1000, toc: 300, card: 800
    });
});

test('memory view: folded digests never reach injection, their parent does', () => {
    const ledger = {
        entries: [
            digest('old-1', '旧一', [{ id: 'u1', h: 'h' }], { folded: true }),
            digest('old-2', '旧二', [{ id: 'u2', h: 'h' }], { folded: true }),
            {
                id: 'fold-1', kind: 'digest', level: 1, covers: [{ id: 'u1', h: 'h' }, { id: 'u2', h: 'h' }],
                base: ['old-1', 'old-2'], text: '折叠后的长期要点',
                meta: { at: 3, model: '', tokens: 0, stale: false, folded: false, legacy: false }
            },
            digest('fresh', '新一批', [{ id: 'u3', h: 'h' }])
        ]
    };
    const turnIndex = turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3]]);
    const view = buildMemoryView(ledger, turnIndex);
    assert.equal(view.long, '折叠后的长期要点', 'the fold parent is the long layer');
    assert.equal(view.short, '新一批', 'recent level-0 stays in the short window');
    assert.deepEqual(view.toc.map(item => item.entryId), ['fold-1', 'fresh']);
    assert.deepEqual(view.toc.map(item => item.level), [1, 0]);
});

test('memory view: cardBudget drops overflow rows, locked and fresher rows win', () => {
    const ledger = {
        entries: [
            fact('c1', 'character', '甲', '甲乙丙丁戊己庚辛壬癸', [{ id: 'u1', h: 'h' }], { at: 1, lastSeenTurn: 1 }),
            fact('c2', 'character', '乙', '状态', [{ id: 'u2', h: 'h' }], { at: 2 }),
            fact('c3', 'character', '丙', '锁定状态', [], { at: 0, manual: true })
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2]]), { cardBudget: 10 });
    // Locked row first, then the freshest auto row; the older bulky row is
    // dropped whole once the cap is reached.
    assert.deepEqual(view.card.characters.map(row => row.name), ['丙', '乙']);
    assert.ok(view.tokens.card <= 10);
});

test('memory view: turn labels re-project from live data (no persisted skew)', () => {
    const ledger = { entries: [digest('e1', '内容', [{ id: 'u9', h: 'h' }])] };
    const before = buildMemoryView(ledger, turnIndexFor([['u9', 3]]));
    const after = buildMemoryView(ledger, turnIndexFor([['u9', 2]]));
    assert.equal(before.toc[0].label, '第 3 轮');
    assert.equal(after.toc[0].label, '第 2 轮', 'a deleted floor shifts the label without touching storage');
    assert.equal(before.batches[0].fromTurn, 3);
    assert.equal(after.batches[0].fromTurn, 2);
});

test('memory view: pins project by kind and never go through digests', () => {
    const ledger = {
        entries: [
            { id: 'p1', kind: 'pin', level: 0, covers: [], base: [], text: '置顶记忆', meta: { at: 1, stale: false, folded: false } },
            { id: 'p2', kind: 'pin', level: 0, covers: [], base: [], text: '', meta: { at: 2, stale: false, folded: false } }
        ]
    };
    const view = buildMemoryView(ledger, new Map());
    assert.deepEqual(view.pins, ['置顶记忆'], 'empty pins are dropped');
    assert.deepEqual(view.card, { characters: [], openPlots: [] });
    assert.equal(view.long, '');
});

test('memory view: empty ledger folds to an empty view', () => {
    const view = buildMemoryView(null, null);
    assert.equal(view.long, '');
    assert.equal(view.short, '');
    assert.deepEqual(view.toc, []);
    assert.deepEqual(view.batches, []);
    assert.deepEqual(view.pins, []);
    assert.deepEqual(view.tokens, { long: 0, short: 0, toc: 0, card: 0 });
});
// --- v6 L4: fact card projection + pin gating -----------------------------

const fact = (id, factKind, factKey, text, covers, meta = {}) => ({
    id,
    kind: 'fact',
    level: 0,
    covers,
    base: [],
    text,
    meta: {
        at: 0,
        stale: false,
        folded: false,
        manual: false,
        factKind,
        factKey,
        factStatus: '',
        factDeadline: '',
        ...meta
    }
});

test('memory view: card takes the newest non-stale/folded fact per key', () => {
    const ledger = {
        entries: [
            fact('old-anna', 'character', '安娜', '受伤', [{ id: 'u1', h: 'h' }], { at: 1 }),
            fact('new-anna', 'character', '安娜', '痊愈', [{ id: 'u2', h: 'h' }], { at: 2 }),
            fact('folded-anna', 'character', '安娜', '被覆盖', [{ id: 'u3', h: 'h' }], { at: 3, folded: true }),
            fact('stale-bella', 'character', '贝拉', '失踪', [{ id: 'u4', h: 'h' }], { at: 4, stale: true }),
            fact('plot-old', 'plot', '寻药', '寻药', [{ id: 'u1', h: 'h' }], { at: 1, factStatus: 'open', factDeadline: '三日后' }),
            fact('plot-new', 'plot', '寻药', '寻药', [{ id: 'u2', h: 'h' }], { at: 2, factStatus: 'closed' })
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4]]));
    assert.equal(view.card.characters.length, 1);
    assert.deepEqual(view.card.characters[0], {
        entryId: 'new-anna',
        name: '安娜',
        status: '痊愈',
        lastSeenTurn: 2,
        manual: false,
        legacy: false,
        at: 2
    });
    assert.equal(view.card.openPlots.length, 1);
    assert.equal(view.card.openPlots[0].status, 'closed');
    assert.equal(view.card.openPlots[0].deadline, '');
    assert.equal(view.card.openPlots[0].lastSeenTurn, 2);
});

test('memory view: a manual (covers:[]) fact wins over newer auto rows', () => {
    const ledger = {
        entries: [
            fact('manual', 'character', '安娜', '被囚', [], { at: 1, manual: true }),
            fact('auto', 'character', '安娜', '痊愈', [{ id: 'u2', h: 'h' }], { at: 9 })
        ]
    };
    const view = buildMemoryView(ledger, turnIndexFor([['u2', 2]]));
    assert.equal(view.card.characters.length, 1);
    assert.equal(view.card.characters[0].entryId, 'manual');
    assert.equal(view.card.characters[0].manual, true);
    assert.equal(view.card.characters[0].lastSeenTurn, 0, 'manual rows have no timeline freshness');
});

test('memory view: facts whose covers vanished are not projected', () => {
    const ledger = {
        entries: [fact('gone', 'character', '安娜', '受伤', [{ id: 'missing', h: 'h' }])]
    };
    const view = buildMemoryView(ledger, new Map());
    assert.deepEqual(view.card, { characters: [], openPlots: [] });
});

test('memory view: card lastSeenTurn re-projects from live turns (no skew)', () => {
    const ledger = {
        entries: [fact('f1', 'plot', '寻药', '寻药', [{ id: 'u9', h: 'h' }], { factStatus: 'open' })]
    };
    const before = buildMemoryView(ledger, turnIndexFor([['u9', 5]]));
    const after = buildMemoryView(ledger, turnIndexFor([['u9', 3]]));
    assert.equal(before.card.openPlots[0].lastSeenTurn, 5);
    assert.equal(after.card.openPlots[0].lastSeenTurn, 3, 'deleting floors shifts freshness without touching storage');
});

test('memory view: pins exclude disabled rows, keep creation order and cap at 10', () => {
    const entries = [];
    for (let index = 0; index < 12; index += 1) {
        entries.push({
            id: `p${index}`,
            kind: 'pin',
            level: 0,
            covers: [],
            base: [],
            text: `记忆${index}`,
            meta: { at: 20 - index, stale: false, folded: false, enabled: index !== 0 }
        });
    }
    const view = buildMemoryView({ entries }, new Map());
    assert.equal(view.pins.length, 10);
    assert.ok(!view.pins.includes('记忆0'), 'disabled pin is excluded');
    assert.deepEqual(view.pins.slice(0, 3), ['记忆11', '记忆10', '记忆9'], 'oldest -> newest');
});
