// Runtime (ESM import) tests for src/modules/memory-utils.mjs pure helpers.
// These pin real behavior of the vector/classic memory retrieval helpers that
// previously had only text-assertion coverage.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getTimelineCharCount, factPreviewText, sortVectorMemoriesByTime, getVectorLexicalMatch,
    extractVectorQueryTerms, normalizeVectorMemoryFingerprintText, mergeSmallMemoryParagraphs,
    splitLongMemoryParagraph, getClassicMemoryKey, trimMemoryText, isEmbeddingLike,
    getMemoryVectorExtractedKey, getMemoryEmptyTurnsKey, normalizeKeepFloors
} from '../src/modules/memory-utils.mjs';

test('getTimelineCharCount counts code points, not utf-16 units', () => {
    assert.equal(getTimelineCharCount('abc'), 3);
    assert.equal(getTimelineCharCount('🐇🐇'), 2);
    assert.equal(getTimelineCharCount(null), 0);
});

test('factPreviewText renders a label per fact kind', () => {
    assert.equal(factPreviewText({ kind: 'entity', name: '晴人' }), '晴人');
    assert.equal(factPreviewText({ kind: 'relation', from: 'A', relKind: '姊妹', to: 'B' }), 'A → 姊妹 → B');
    assert.equal(factPreviewText({ kind: 'event', sourceTurn: 4, summary: '离家' }), '[第4轮] 离家');
    assert.equal(factPreviewText({ kind: 'state', subject: '天气', aspect: '晴雨', value: '雨' }), '天气·晴雨：雨');
    assert.equal(factPreviewText({ kind: 'quote', speaker: '樱', text: '不要' }), '樱：「不要」');
    assert.equal(factPreviewText({ kind: 'arc', startTurn: 1, endTurn: 9 }), '第1-9轮剧情弧');
    assert.equal(factPreviewText({ kind: 'audit', action: 'rollup' }), '审计:rollup');
    assert.equal(factPreviewText({ kind: 'meta' }), '元数据');
    assert.equal(factPreviewText({ kind: 'unknown' }), '');
    assert.equal(factPreviewText(null), '');
});

test('sortVectorMemoriesByTime orders by turn, then sequence, then score desc', () => {
    const items = [
        { turn: 3, sequence: 1, vectorScore: 5 },
        { turn: 1, sequence: 2, vectorScore: 1 },
        { turn: 1, sequence: 1, vectorScore: 9 },
        { turn: null, sequence: 0, vectorScore: 99 }, // missing turn sorts last
        { turn: 1, sequence: 1, vectorScore: 4 }
    ];
    const sorted = sortVectorMemoriesByTime(items);
    assert.deepEqual(sorted.map(i => i.vectorScore), [9, 4, 1, 5, 99]);
});

test('getVectorLexicalMatch counts case-insensitive hits with a capped boost', () => {
    const memory = { sourceText: 'The Quick Fox', summary: 'slow turtle' };
    assert.deepEqual(getVectorLexicalMatch(memory, ['quick', 'FOX']), { hits: 2, boost: 0.03, matched: ['quick', 'FOX'] });
    // hits counts distinct matched terms (not occurrences); boost caps at 0.08 (6 hits).
    const manyTerms = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'];
    const capped = getVectorLexicalMatch({ sourceText: 'aa bb cc dd ee ff gg' }, manyTerms);
    assert.equal(capped.boost, 0.08);
    assert.deepEqual(getVectorLexicalMatch(memory, []), { hits: 0, boost: 0, matched: [] });
});

test('extractVectorQueryTerms builds de-duplicated han grams and latin tokens', () => {
    const terms = extractVectorQueryTerms('送樱上学，why not go_HOME？呢');
    assert.ok(terms.includes('go_home'));
    assert.ok(terms.includes('送樱'));
    assert.ok(terms.every(term => !['呢', '的', '吗'].includes(term)), 'stopwords excluded');
    assert.ok(terms.every(term => term.length >= 1));
    assert.deepEqual(extractVectorQueryTerms('！？。。'), []);
});

test('normalizeVectorMemoryFingerprintText strips whitespace and CJK/latin punctuation', () => {
    assert.equal(normalizeVectorMemoryFingerprintText('你好， 世界。\n"Quote"!'), '你好世界Quote');
});

test('mergeSmallMemoryParagraphs merges within the limit and keeps paragraph ranges', () => {
    const merged = mergeSmallMemoryParagraphs(['aaaa', 'bb', 'cccccccc'], 10);
    assert.deepEqual(merged, [
        { text: 'aaaa\n\nbb', start: 1, end: 2 },
        { text: 'cccccccc', start: 3, end: 3 }
    ]);
    assert.deepEqual(mergeSmallMemoryParagraphs(['', '  '], 10), [], 'blank paragraphs dropped');
});

test('splitLongMemoryParagraph splits long text at sentence boundaries', () => {
    assert.deepEqual(splitLongMemoryParagraph('短文本', 10), ['短文本']);
    const long = `${'a'.repeat(8)}。${'b'.repeat(8)}。${'c'.repeat(8)}。`;
    const parts = splitLongMemoryParagraph(long, 10);
    assert.ok(parts.length >= 2);
    assert.ok(parts.every(part => part.length <= 10));
    assert.equal(parts.join(''), long, 'sentence periods stay attached to their chunk');
});

test('getClassicMemoryKey prefers joined ids and falls back to the turn number', () => {
    assert.equal(getClassicMemoryKey(['a1', 'b2']), 'a1|b2');
    assert.equal(getClassicMemoryKey([null, ''], 7), 'turn:7');
});

test('trimMemoryText collapses newlines and truncates with an ellipsis', () => {
    assert.equal(trimMemoryText('a\n\n\n\nb'), 'a\n\nb');
    assert.equal(trimMemoryText('x'.repeat(30), 10), `${'x'.repeat(10)}...`);
    assert.equal(trimMemoryText('short', 10), 'short');
});

test('storage key builders default to the global scope', () => {
    assert.equal(getMemoryVectorExtractedKey('u-1'), 'u-1:vectorExtracted');
    assert.equal(getMemoryVectorExtractedKey(''), 'global:vectorExtracted');
    assert.equal(getMemoryEmptyTurnsKey('u-1'), 'u-1:vector');
    assert.equal(getMemoryEmptyTurnsKey(undefined), 'global:vector');
});

test('isEmbeddingLike accepts arrays and typed arrays only', () => {
    assert.equal(isEmbeddingLike([0.1, 0.2]), true);
    assert.equal(isEmbeddingLike(new Float32Array(4)), true);
    assert.equal(isEmbeddingLike('vector'), false);
    assert.equal(isEmbeddingLike({ 0: 1 }), false);
});

test('normalizeKeepFloors clamps and rounds to even numbers', () => {
    assert.equal(normalizeKeepFloors(15, 4, 20, 16), 16);
    assert.equal(normalizeKeepFloors(13, 4, 20, 16), 14);
    assert.equal(normalizeKeepFloors(3, 4, 20, 16), 4);
    assert.equal(normalizeKeepFloors(99, 4, 20, 16), 20);
    assert.equal(normalizeKeepFloors('abc', 4, 20, 16), 16);
});
