import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { select } = require('../assets/js/memory-recall-fallback.js');

test('嵌入召回失败时优先选择关键词命中的记忆', () => {
  const memories = [
    { id: 'recent', turn: 20, sourceText: '今天在花园散步' },
    { id: 'matched', turn: 5, sourceText: '旧城区的钟楼藏着钥匙' },
    { id: 'other', turn: 10, sourceText: '在车站告别' }
  ];
  const selected = select(memories, {
    queryTerms: ['钟楼', '钥匙'],
    topK: 2,
    getFingerprint: memory => memory.id
  });

  assert.deepEqual(Array.from(selected, memory => memory.id), ['matched', 'recent']);
  assert.equal(selected[0].vectorRecallMode, 'lexical-fallback');
  assert.equal(selected[0].vectorLexicalHits, 2);
});

test('没有关键词命中时按最近轮次补足且保持数量上限', () => {
  const memories = [1, 4, 3, 2].map(turn => ({ id: String(turn), turn, paragraph: `第 ${turn} 轮` }));
  const selected = select(memories, {
    queryTerms: ['不存在'],
    topK: 3,
    getFingerprint: memory => memory.id
  });

  assert.deepEqual(Array.from(selected, memory => memory.id), ['4', '3', '2']);
});

test('关键词回退按分片指纹去重', () => {
  const selected = select([
    { id: 'a', turn: 1, paragraph: '重复内容' },
    { id: 'b', turn: 2, paragraph: '重复内容' },
    { id: 'c', turn: 3, paragraph: '其他内容' }
  ], {
    queryTerms: [],
    topK: 3,
    getFingerprint: memory => memory.paragraph
  });

  assert.equal(selected.length, 2);
  assert.deepEqual(Array.from(selected, memory => memory.id), ['c', 'b']);
});
