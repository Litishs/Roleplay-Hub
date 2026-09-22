// Swipe candidates (同楼多候选) contract tests — design doc:
// documents/swipe候选重掷工程方案.md
// Covers: pure data-layer invariants (runtime import), app.mjs text contracts
// for the regenerate/mergeOrRestore/switch/edit paths, persistence passthrough,
// vector patrol M0 change, MessageList.vue wiring and the runtime-policy cap.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8').then(s => s.replace(/\r\n/g, '\n'));

const app = await read('src/modules/app.mjs');
const swipeModule = await read('src/modules/swipe-candidates.mjs');
const policy = await read('src/modules/runtime-policy.mjs');
const vectorPatrol = await read('src/composables/useVectorMemoryPatrol.mjs');
const cardOps = await read('src/composables/useCardOperations.mjs');
const messageList = await read('src/components/chat/MessageList.vue');

test('swipe data layer: initSwipes lazily wraps a legacy message and keeps the mirror', async () => {
    const { initSwipes } = await import('../src/modules/swipe-candidates.mjs');
    const legacy = { role: 'assistant', content: 'A', reasoning: 'RA' };
    assert.equal(initSwipes(legacy), true);
    assert.equal(legacy.swipes.length, 1);
    assert.equal(legacy.activeSwipeIndex, 0);
    assert.equal(legacy.swipes[0].content, 'A');
    assert.equal(legacy.swipes[0].reasoning, 'RA');
    // already initialized -> no-op
    assert.equal(initSwipes(legacy), false);
    // user messages never get candidates
    const user = { role: 'user', content: 'hi' };
    assert.equal(initSwipes(user), false);
    assert.equal(user.swipes, undefined);
});

test('swipe data layer: captureActiveCandidate writes the mirror back into the active slot', async () => {
    const { initSwipes, captureActiveCandidate } = await import('../src/modules/swipe-candidates.mjs');
    const msg = { role: 'assistant', content: 'A', reasoning: 'RA' };
    initSwipes(msg);
    msg.content = 'A2';
    const captured = captureActiveCandidate(msg, {
        uiTemplateBlocks: { top: ['t'], bottom: [] },
        uiTemplateTurn: [{ turn: 3, changes: {} }],
        timing: { id: 'x', duration: 1234 }
    });
    assert.equal(captured.content, 'A2');
    assert.deepEqual(captured.uiTemplateBlocks, { top: ['t'], bottom: [] });
    assert.equal(captured.uiTemplateTurn[0].turn, 3);
    assert.equal(captured.timing.duration, 1234);
    // undefined extras delete the field instead of storing undefined
    const captured2 = captureActiveCandidate(msg, { uiTemplateBlocks: undefined });
    assert.equal(captured2.uiTemplateBlocks, undefined);
    assert.ok(!('uiTemplateBlocks' in captured2));
});

test('swipe data layer: append FIFO-evicts beyond the cap and clamps the index', async () => {
    const { initSwipes, appendSwipeCandidate } = await import('../src/modules/swipe-candidates.mjs');
    const msg = { role: 'assistant', content: 'A', reasoning: '' };
    initSwipes(msg);
    assert.equal(appendSwipeCandidate(msg, { content: 'B', reasoning: '' }, 5), 0);
    assert.equal(msg.swipes.length, 2);
    assert.equal(appendSwipeCandidate(msg, { content: 'C', reasoning: '' }, 3), 0);
    assert.equal(msg.swipes.length, 3);
    assert.equal(msg.swipes.map(s => s.content).join(''), 'ABC');
    // cap reached -> oldest evicted, index clamped back into bounds
    msg.activeSwipeIndex = 2;
    assert.equal(appendSwipeCandidate(msg, { content: 'D', reasoning: '' }, 3), 1);
    assert.equal(msg.swipes.length, 3);
    assert.equal(msg.swipes.map(s => s.content).join(''), 'BCD');
    assert.equal(msg.activeSwipeIndex, 2);
});

test('swipe data layer: normalizeSwipes repairs pairing violations and restores the mirror', async () => {
    const { normalizeSwipes } = await import('../src/modules/swipe-candidates.mjs');
    // missing swipes -> drop orphan index
    const orphan = { role: 'assistant', content: 'A', activeSwipeIndex: 0 };
    normalizeSwipes(orphan);
    assert.equal(orphan.swipes, undefined);
    assert.equal(orphan.activeSwipeIndex, undefined);
    // out-of-bounds index -> downgrade to a single candidate anchored on the mirror
    const broken = { role: 'assistant', content: 'X', reasoning: '', swipes: [{ content: 'A', reasoning: 'RA' }, { content: 'B', reasoning: 'RB' }], activeSwipeIndex: 9 };
    normalizeSwipes(broken);
    assert.equal(broken.activeSwipeIndex, 0);
    assert.equal(broken.swipes.length, 1);
    assert.equal(broken.content, 'X');
    // non-numeric index -> same downgrade
    const garbage = { role: 'assistant', content: 'X', swipes: [{ content: 'A', reasoning: '' }], activeSwipeIndex: 'zz' };
    normalizeSwipes(garbage);
    assert.equal(garbage.activeSwipeIndex, 0);
    assert.equal(garbage.content, 'X');
    // valid pairing -> mirror restored from the active candidate, all candidates kept
    const healthy = { role: 'assistant', content: 'wrong', reasoning: '', swipes: [{ content: 'A', reasoning: 'RA' }, { content: 'B', reasoning: 'RB' }], activeSwipeIndex: 1 };
    normalizeSwipes(healthy);
    assert.equal(healthy.swipes.length, 2);
    assert.equal(healthy.content, 'B');
    assert.equal(healthy.reasoning, 'RB');
});

test('runtime policy owns the swipe candidate cap and the module reads it (no hardcoded 5)', () => {
    assert.match(policy, /swipeMaxCandidates:\s*5/, 'limits.swipeMaxCandidates declared in runtime-policy.mjs');
    assert.ok(swipeModule.includes('RPHRuntimePolicy?.limits?.swipeMaxCandidates'), 'swipe module reads the cap from the policy');
    assert.ok(!/=\s*5\s*;/.test(swipeModule.replace(/const value = Number\(RPHRuntimePolicy\?\.limits\?\.swipeMaxCandidates\);/, '')), 'cap is not hardcoded in the swipe module');
});

test('regenerateMessage: swipe order contract (capture before prune) + last-floor guard', () => {
    const fnStart = app.indexOf('const regenerateMessage = async (index) => {');
    const fnEnd = app.indexOf('const getEnabledActiveTools', fnStart);
    const fn = app.slice(fnStart, fnEnd);
    // capture must run before pruning (design doc D-4/§5.1)
    const captureAt = fn.indexOf('captureActiveCandidate(msg');
    const pruneAt = fn.indexOf('pruneUiTemplateChangesFromTurn(uiTurnAtIndex)');
    const pendingAt = fn.indexOf('pendingSwipeBase = {');
    assert.ok(captureAt > -1 && pruneAt > -1, 'both call sites exist');
    assert.ok(captureAt < pruneAt, 'captureActiveCandidate runs before pruneUiTemplateChangesFromTurn');
    assert.ok(pendingAt > captureAt && pendingAt < pruneAt, 'pendingSwipeBase snapshot taken after capture, before prune');
    assert.ok(fn.includes('if (index !== chatHistory.value.length - 1) return;'), 'last-floor guard');
    assert.ok(fn.includes('await mergeOrRestoreSwipedGeneration();'), 'mergeOrRestore runs after generateResponse');
    // D-6: the confirmation dialog is removed (operation is reversible now)
    assert.ok(!fn.includes('confirmAction('), 'confirmation dialog removed from the AI branch');
});

test('pendingSwipeBase + mergeOrRestoreSwipedGeneration: merge and restore branches exist', () => {
    assert.ok(app.includes('let pendingSwipeBase = null;'), 'setup-local pending state');
    const fnStart = app.indexOf('const mergeOrRestoreSwipedGeneration = async () => {');
    const fnEnd = app.indexOf('const activateCandidate = async', fnStart);
    const fn = app.slice(fnStart, fnEnd);
    assert.ok(fn.includes('pendingSwipeBase = null;'), 'pending state cleared either way');
    assert.ok(fn.includes('tail.swipes = [...baseSwipes'), 'merge branch appends the new reply as a candidate');
    assert.ok(fn.includes('tail.activeSwipeIndex = tail.swipes.length - 1;'), 'merge branch activates the new candidate');
    assert.ok(fn.includes("showToast('重新生成失败，已恢复原回复', 'error', 5000);"), 'restore branch toasts the recovery');
    assert.ok(fn.includes('restoreLastMessage(base.message);'), 'restore branch puts the snapshot back');
});

test('activateCandidate: lazy-capture four-piece + whole-segment swap + timing + rollback', () => {
    const fnStart = app.indexOf('const activateCandidate = async (index, target) => {');
    const fnEnd = app.indexOf('const swipePrev =', fnStart);
    const fn = app.slice(fnStart, fnEnd);
    assert.ok(fn.includes('captureActiveCandidate(msg'), 'lazy-capture before leaving the candidate');
    assert.ok(fn.includes('swapUiTemplateTurn(next.uiTemplateTurn, turnIndex)'), 'template changeLog segment swapped as a whole (with fallback boundary)');
    assert.ok(fn.includes('swapTimingForMessage(msg.id, next.timing)'), 'timing record swapped per message id');
    assert.ok(fn.includes('msg.activeSwipeIndex = target;'), 'index move');
    assert.ok(fn.includes('msg.shouldAnimate = false;'), 'no entrance animation replay on switch');
    assert.ok(fn.includes('await saveConversationMutationNow({ saveTemplateRuntime: true });'), 'persist after switch');
    assert.ok(fn.includes('catch (error)'), 'failure path guarded');
    assert.ok(fn.includes("showToast('切换失败：'"), 'failure toast');
    assert.ok(fn.includes('restoreLastMessage(previousTail);'), 'last-message rollback on failure');
    assert.ok(fn.includes('if (isConversationBusy.value) return;'), 'busy guard');
    // helpers exist
    assert.ok(app.includes('const extractUiTemplateTurnSegment = (turnIndex) => {'));
    assert.ok(app.includes('const swapUiTemplateTurn = (segment, fallbackTurn = null) => {'));
    assert.ok(app.includes('rebuildUiTemplateStateFromLogs(template, remainingLogs, remainingLogs);'), 'variable state rebuilt after segment swap');
    assert.ok(app.includes('const restoreLastMessage = (tailSnapshot) => {'));
});

test('persistence passthrough: swipes / activeSwipeIndex are NOT runtime-only fields', () => {
    const setStart = app.indexOf('const CHAT_RUNTIME_ONLY_FIELDS = new Set([');
    const setEnd = app.indexOf(']);', setStart);
    const setBody = app.slice(setStart, setEnd);
    assert.ok(!setBody.includes('swipes'), 'swipes must serialize into storage');
    assert.ok(!setBody.includes('activeSwipeIndex'), 'activeSwipeIndex must serialize into storage');
    // loaded messages get pairing repaired
    assert.ok(app.includes("if (msg.role === 'assistant') normalizeSwipes(msg);"), 'normalizeSwipes on the load path');
});

test('editMessage save retires the candidate set', () => {
    const fnStart = app.indexOf('const saveEditMessage = (index) => {');
    const fnEnd = app.indexOf('const cancelEditMessage', fnStart);
    const fn = app.slice(fnStart, fnEnd);
    assert.ok(fn.includes('delete msg.swipes;'), 'swipes cleared on edit save');
    assert.ok(fn.includes('delete msg.activeSwipeIndex;'), 'activeSwipeIndex cleared on edit save');
});

test('M0 memory patrol: the newest turn is unconditionally excluded from vector extraction', () => {
    assert.ok(vectorPatrol.includes('const safeTurns = snapshot.turns.slice(0, -1);'), 'unconditional last-turn exclusion');
    assert.ok(!vectorPatrol.includes('isConversationBusy.value ? snapshot.turns.slice(0, -1)'), 'busy-conditional exclusion removed');
    // 2026-09-18 regression fix: the "conversation changed" rescan check must use the
    // same last-turn-excluded basis as scannedTurnCount, otherwise an empty-chunk patrol
    // spins a synchronous busy loop and freezes the renderer on device boot.
    assert.ok(vectorPatrol.includes('const currentTurnCount = Math.max(0, buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false }).turns.length - 1);'), 'rescan comparison on the safe basis');
    assert.ok(!vectorPatrol.includes('.turns.length;\n                    if (added > 0'), 'old full-count comparison removed');
});

test('MessageList.vue: swipe switcher wired with arrows, counter, render conditions and regenerate title', () => {
    assert.match(messageList, /msg\.role === 'assistant' && index === chatHistory\.length - 1 && msg\.swipes && msg\.swipes\.length > 1 && !isConversationBusy/, 'last-floor render condition');
    assert.ok(messageList.includes('@click="swipePrev(index)"'), 'left arrow wired');
    assert.ok(messageList.includes('@click="swipeNext(index)"'), 'right arrow wired');
    assert.match(messageList, /\{\{ msg\.activeSwipeIndex \+ 1 \}\}\/\{\{ msg\.swipes\.length \}\}/, 'mono counter');
    assert.ok(messageList.includes('title="重新生成（追加候选）"'), 'regenerate title updated');
    assert.ok(messageList.includes('title="上一个候选"') && messageList.includes('title="下一个候选"'), 'arrow titles');
});

test('MessageList.vue: candidate bar anchored above the bubble + bubble swipe gesture (M3)', () => {
    // top-position bar: it must appear BEFORE the bubble div so it stays visible for tall candidates
    const barAt = messageList.indexOf('Swipe candidate bar (top position)');
    const bubbleAt = messageList.indexOf('<!-- Message Bubble -->');
    assert.ok(barAt > -1 && bubbleAt > -1 && barAt < bubbleAt, 'candidate bar rendered above the bubble');
    // bubble horizontal swipe gesture wired with touch guards
    assert.ok(messageList.includes('onBubbleTouchStart($event, index)'), 'bubble touchstart wired');
    assert.ok(messageList.includes('onBubbleTouchEnd($event, index)'), 'bubble touchend wired');
    assert.ok(messageList.includes('onBubbleTouchMove($event, index)'), 'bubble touchmove wired');
    assert.ok(messageList.includes('onBubbleTouchCancel($event, index)'), 'bubble touchcancel wired');
    assert.ok(messageList.includes("target.closest('a, button, details, summary, textarea, input, select, [contenteditable]')"), 'interactive-element guard');
    assert.ok(messageList.includes("sel.type === 'Range'"), 'text-selection guard');
    assert.ok(messageList.includes('Math.abs(relDx) > 56'), 'horizontal distance threshold');
    assert.ok(messageList.includes("if (dir === 'next') ctx.swipeNext(index); else ctx.swipePrev(index);"), 'swipe-left -> next, swipe-right -> prev');
    // drag animation applied imperatively via DOM style (no per-move Vue re-render)
    assert.ok(messageList.includes('setBubbleTransform(bubbleTouch.el, effective, false)'), 'drag follows the finger via DOM transform');
    assert.ok(messageList.includes("'transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)'"), 'spring-back transition');
    assert.ok(messageList.includes('dx * 0.25'), 'rubber-band at the edge candidate');
    assert.ok(messageList.includes('Math.abs(dy) > Math.abs(dx)'), 'vertical scroll wins over swipe');
    assert.ok(messageList.includes('dt < 260 && Math.abs(relDx) > 32'), 'flick gesture supported');
    assert.ok(messageList.includes('translateX('), 'fly-out / fly-in animation');
    assert.ok(messageList.includes("el.style.opacity = '0.25'"), 'fade during candidate swap');
    // gesture state stays local to the component (no ctx pollution)
    assert.ok(messageList.includes('return { ...(ctx || {}), canSwipeGesture'), 'ctx spread with local handlers');
});

test('swipePrev/swipeNext exported from setup and bound in MessageList', () => {
    assert.match(app, /copyMessage, deleteMessage, regenerateMessage, swipePrev, swipeNext,/, 'ctx export');
    // card ops discard hook is wired for character switches
    assert.ok(cardOps.includes('discardPendingSwipeBase?.();'), 'character switch discards the pending swipe base');
    assert.ok(app.includes('discardPendingSwipeBase,') && app.includes('const discardPendingSwipeBase = (reason'), 'dep wiring + definition');
});

test('branch switch abandons the pending swipe merge', () => {
    const fnStart = app.indexOf('const switchStoryBranch = async (branchId, options = {}) => {');
    const fnEnd = app.indexOf('const openStoryBranchNameEditor', fnStart);
    const fn = app.slice(fnStart, fnEnd);
    assert.ok(fn.includes('if (pendingSwipeBase)'), 'pending check on branch switch');
    assert.ok(fn.includes("console.warn('[Swipe] Pending swipe base discarded on branch switch')"), 'warn + discard');
});
