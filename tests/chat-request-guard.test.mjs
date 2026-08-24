import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from '../src/modules/chat-request-guard.mjs';

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

test('SSE empty heartbeat cannot extend first token deadline', () => {
  const { guard, setClock } = createClockedGuard();
  guard.markHeaders(1_000);

  for (let clock = 5_000; clock < 61_000; clock += 5_000) {
    setClock(clock);
    assert.equal(guard.getTimeout(), null);
  }

  setClock(61_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_waiting_first_token');
});

test('Only meaningful content or reasoning can refresh stream idle', () => {
  const { guard, setClock } = createClockedGuard();
  guard.markHeaders(0);
  setClock(10_000);
  assert.equal(guard.markMeaningful('first text', ''), true);

  setClock(100_000);
  assert.equal(guard.markMeaningful('   ', '\n'), false);
  setClock(129_999);
  assert.equal(guard.getTimeout(), null);
  setClock(130_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_streaming');
});

test('Continuous output cannot exceed total timeout', () => {
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

test('First byte wait has independent deadline', () => {
  const { guard, setClock } = createClockedGuard();
  setClock(59_999);
  assert.equal(guard.getTimeout(), null);
  assert.equal(guard.getRemainingMs(), 1);
  setClock(60_000);
  assert.equal(guard.getTimeout()?.stage, 'timed_out_waiting_headers');
});
