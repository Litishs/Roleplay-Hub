// Runtime (ESM import) tests for src/modules/memory-utils.mjs pure helpers.
// v6 L3 removed the vector-stack helpers; the lexical query-term extractor
// stays because ledger retrieval and auto-recall still use it.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getTimelineCharCount, factPreviewText, extractVectorQueryTerms,
    getClassicMemoryKey, trimMemoryText, normalizeKeepFloors
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

test('extractVectorQueryTerms keeps 2-grams on long CJK runs (recall regression)', () => {
    // A 16-char run used to consume the whole "longest 20" budget with
    // 4/3-grams, dropping every bigram; ledger recall then matched nothing
    // for "查雪夜的线索" against a digest that literally says 雪夜.
    const terms = extractVectorQueryTerms('第10轮用户：我们继续查雪夜的线索。');
    assert.ok(terms.includes('雪夜'), 'bigrams survive long CJK runs');
    assert.ok(terms.includes('线索'));
    assert.ok(terms.length <= 60);
});

test('extractVectorQueryTerms builds de-duplicated han grams and latin tokens', () => {
    const terms = extractVectorQueryTerms('送樱上学，why not go_HOME？呢');
    assert.ok(terms.includes('go_home'));
    assert.ok(terms.includes('送樱'));
    assert.ok(terms.every(term => !['呢', '的', '吗'].includes(term)), 'stopwords excluded');
    assert.ok(terms.every(term => term.length >= 1));
    assert.deepEqual(extractVectorQueryTerms('！？。。'), []);
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

test('normalizeKeepFloors clamps and rounds to even numbers', () => {
    assert.equal(normalizeKeepFloors(15, 4, 20, 16), 16);
    assert.equal(normalizeKeepFloors(13, 4, 20, 16), 14);
    assert.equal(normalizeKeepFloors(3, 4, 20, 16), 4);
    assert.equal(normalizeKeepFloors(99, 4, 20, 16), 20);
    assert.equal(normalizeKeepFloors('abc', 4, 20, 16), 16);
});
