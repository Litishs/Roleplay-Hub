import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { create } = require('../assets/js/chat-request-guard.js');

const createClockedGuard = () => {
  let clock = 0;
  const guard = create({
    now: () => clock,
    firstByteMs: 60_000,
    firstTokenMs: 60_000,
    streamIdleMs: 120_000,
    totalMs: 600_000
  });
  return { guard, setClock: value => { clock = value; } };
};

test('SSE 空心跳不能延长首个有效 token 的截止时间', () => {
  const { guard, setClock } = createClockedGuard();
  guard.markHeaders(1_000);

  for (let clock = 5_000; clock < 61_000; clock += 5_000) {
    setClock(clock);
    assert.equal(guard.getTimeout(), null);
  }

  setClock(61_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_waiting_first_token');
});

test('只有有效正文或思维内容才能刷新流空闲期限', () => {
  const { guard, setClock } = createClockedGuard();
  guard.markHeaders(0);
  setClock(10_000);
  assert.equal(guard.markMeaningful('第一段正文', ''), true);

  setClock(100_000);
  assert.equal(guard.markMeaningful('   ', '\n'), false);
  setClock(129_999);
  assert.equal(guard.getTimeout(), null);
  setClock(130_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_streaming');
});

test('持续输出也不能突破生成总时限', () => {
  const { guard, setClock } = createClockedGuard();
  guard.markHeaders(0);
  for (let clock = 10_000; clock < 600_000; clock += 10_000) {
    setClock(clock);
    guard.markMeaningful('x', '');
    assert.equal(guard.getTimeout(), null);
  }

  setClock(600_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_total');
});

test('首包等待有独立截止时间', () => {
  const { guard, setClock } = createClockedGuard();
  setClock(59_999);
  assert.equal(guard.getTimeout(), null);
  assert.equal(guard.getRemainingMs(), 1);
  setClock(60_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_waiting_headers');
});
