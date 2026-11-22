// Contract test: v6 L4 fact / pin integration.
//
// L4 moves the info card and the manual-memory layer into the ledger:
// profile deltas append fact entries, pin CRUD appends pin entries, and the
// injection prefix grows <user_pinned> above the summaries (design doc
// §4/§10/§13, v5 §四/§五 M2 UX).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, panel, memoryState, reconcileModule] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/memory-reconcile.mjs', import.meta.url), 'utf8')
]);

test('v6 L4: <user_pinned> sits above summaries, info card and TOC', () => {
    const start = app.indexOf('const buildMemoryContextForPrompt');
    assert.ok(start > 0);
    const block = app.slice(start, app.indexOf('const ensureMemoryLedger', start));
    assert.ok(block.includes('pins = view.pins'), 'pins come from the ledger fold');
    assert.ok(block.includes('parts.push(`<user_pinned>'));
    assert.ok(block.includes('parts.push(profileText)'));
    assert.ok(block.includes('staleAfter: memorySettings.profileStaleAfter'));
    const pinIndex = block.indexOf('<user_pinned>');
    const longIndex = block.indexOf('<long_summary>');
    const profileIndex = block.indexOf('parts.push(profileText)');
    const tocIndex = block.indexOf('parts.push(`<memory_toc>');
    assert.ok(pinIndex > 0 && pinIndex < longIndex, 'user content is injected before derived summaries');
    assert.ok(longIndex < profileIndex && profileIndex < tocIndex, 'info card before the directory');
    // The card comes from the pure view; the legacy key is only the
    // pre-adoption fallback (design doc §11).
    assert.ok(block.includes('const view = buildMemoryView(ledger, buildLiveTurnIndex());'));
    assert.ok(block.includes('const cardSource = (hasCard || hasFactEntries) ? view.card : memoryProfile.value;'));
});

test('v6 L4: pin CRUD writes ledger entries and enforces the v5 limits', () => {
    for (const name of ['addMemoryPin', 'updateMemoryPin', 'deleteMemoryPin', 'toggleMemoryPinEnabled']) {
        assert.ok(app.includes(`const ${name} = async`), `${name} exists`);
    }
    assert.ok(app.includes('validatePinText(text)'), 'text limit is enforced');
    assert.ok(app.includes('countEnabledPins(memoryLedger.value) >= PIN_ENABLED_LIMIT'), 'enabled cap is enforced');
    assert.ok(app.includes('appendEntry(ledger, makePinEntry('), 'pins are appended to the ledger');
    assert.ok(app.includes('entry.meta.folded = true;'), 'edit/delete keeps append-only history');
    // Exposed to the panel.
    assert.ok(app.includes('memoryPins: computed('));
    assert.ok(app.includes('addMemoryPin, updateMemoryPin, deleteMemoryPin, toggleMemoryPinEnabled,'));
});

test('v6 L4: info-card edits append manual facts with covers:[]', () => {
    assert.ok(app.includes('const saveMemoryFact = async'));
    assert.ok(app.includes('const deleteMemoryFact = async'));
    assert.ok(app.includes('const toggleMemoryFactLock = async'));
    assert.ok(app.includes('const toggleMemoryPlotStatus = async'));
    assert.ok(app.includes('foldFactsForKey(ledger, normalized.factKind, normalized.factKey)'));
    assert.ok(app.includes('covers: [],\n                manual: true,'));
    assert.ok(app.includes('memoryCard: computed('), 'panel reads the projected card');
    assert.ok(app.includes('lib.isProfileStale(item, currentTurn, staleAfter)'), 'exact freshness annotation');
});

test('v6 L4: clear-rebuild deletes digest/fact but preserves pins', () => {
    const start = app.indexOf('clearAllMemories: () => {');
    const block = app.slice(start, app.indexOf('exportMemories:', start));
    assert.ok(block.includes("entry.kind === 'pin' && !entry.meta.folded"), 'pins survive');
    assert.ok(block.includes('手动记忆属于用户内容，不会被删除'));
    assert.ok(block.includes('saveMemoryLedgerNow(scopeId, nextLedger)'), 'pin-only ledger is persisted');
    assert.ok(block.includes("deleteScopedStoredValue('memory_profile', scopeId)"), 'legacy card is cleared for a clean rebuild');
});

test('v6 L4: reconciler adopts the legacy profile once and writes facts atomically', () => {
    assert.ok(reconcileModule.includes('loadLegacyProfile'));
    assert.ok(reconcileModule.includes('adoptLegacyProfile'));
    assert.ok(reconcileModule.includes('appendProfileFacts'));
    assert.ok(reconcileModule.includes('ledger.profileAdopted = true'));
    // One save after appending both the digest and its facts.
    const start = reconcileModule.indexOf('appendEntry(ledger, makeDigestEntry({');
    const block = reconcileModule.slice(start, reconcileModule.indexOf('processed += 1;', start));
    assert.ok(block.includes('appendProfileFacts('));
    assert.ok(block.indexOf('appendProfileFacts(') < block.indexOf('saveLedgerNow'), 'facts precede the single save');
});

test('v6 L4: MemoryPanel renders directory/info-card tabs and the manual card', () => {
    assert.ok(panel.includes('memoryLedgerTab'));
    assert.ok(panel.includes("memoryLedgerTab = 'toc'"));
    assert.ok(panel.includes("memoryLedgerTab = 'card'"));
    assert.ok(panel.includes('信息卡'));
    assert.ok(panel.includes('手动记忆'));
    assert.ok(panel.includes('memoryCard.characters'));
    assert.ok(panel.includes('memoryCard.openPlots'));
    assert.ok(panel.includes('memoryPins'));
    assert.ok(panel.includes('saveMemoryFact'));
    assert.ok(panel.includes('toggleMemoryFactLock'));
    assert.ok(panel.includes('toggleMemoryPlotStatus'));
    // The old profile object is no longer rendered directly.
    assert.ok(!panel.includes('memoryProfile?.'));
});

test('v6 L4: profileStaleAfter is a bounded, persisted setting', () => {
    assert.ok(memoryState.includes('profileStaleAfter: 40'));
    assert.ok(app.includes('memorySettings.profileStaleAfter = Math.max(10, Math.min(100'));
    assert.ok(panel.includes('v-model.number="memorySettings.profileStaleAfter"'));
    assert.ok(panel.includes('信息卡过期标注'));
});
// --- v6 L5: hierarchical compaction UI + real budgets ----------------------

test('v6 L5: compaction is a persisted switch with a bounded fanout slider', () => {
    assert.ok(memoryState.includes('compactionEnabled: true'));
    assert.ok(memoryState.includes('compactionFanout: 5'));
    assert.ok(app.includes('memorySettings.compactionEnabled = memorySettings.compactionEnabled !== false'));
    assert.ok(app.includes('memorySettings.compactionFanout = Math.max(COMPACT_FANOUT_MIN'));
    // Slider bounds come from the ledger module (single source of truth).
    assert.ok(app.includes('compactFanoutMin: COMPACT_FANOUT_MIN'));
    assert.ok(app.includes('compactFanoutMax: COMPACT_FANOUT_MAX'));
    assert.ok(panel.includes('v-model="memorySettings.compactionEnabled"'));
    assert.ok(panel.includes('v-model.number="memorySettings.compactionFanout"'));
    assert.ok(panel.includes(':min="compactFanoutMin"'));
    assert.ok(panel.includes(':max="compactFanoutMax"'));
    assert.ok(panel.includes('层级压实'));
    assert.ok(panel.includes('压实阈值'));
});

test('v6 L5: manual compaction button and manual trigger are wired', () => {
    assert.ok(panel.includes('手动压实'));
    assert.ok(panel.includes('compactMemoryNow()'));
    assert.ok(app.includes('const compactMemoryNow = async () => {'));
    assert.ok(app.includes('memoryReconciler.reconcile({ compact: true })'));
    assert.ok(app.includes('requestCompaction: requestMemoryCompaction'));
    assert.ok(app.includes('buildCompactionMessages'));
    assert.ok(app.includes('已压实 ${result.folded} 组记忆'));
    // Manual compaction overrides the automatic switch for one sweep.
    assert.ok(reconcileModule.includes('if (!force && settings.compactionEnabled === false) return 0;'));
    assert.ok(reconcileModule.includes('selectCompactionGroup(ledger, live.liveTurnIndex'));
    assert.ok(reconcileModule.includes('applyCompaction(ledger, {'));
    assert.ok(reconcileModule.includes('MAX_COMPACTIONS_PER_RUN'));
});

test('v6 L5: health panel shows the injection budget block and fold sources', () => {
    assert.ok(panel.includes('注入预算（实际 / 上限）'));
    assert.ok(panel.includes('memoryBudgetRows'));
    assert.ok(panel.includes('row.used }} / {{ row.budget }}'));
    assert.ok(panel.includes('折叠来源'));
    assert.ok(panel.includes('getMemoryEntryBase'));
    assert.ok(app.includes('memoryBudgetStats: computed'));
    assert.ok(app.includes('tocBudget: Infinity'), 'panel directory is not capped by the injection budget');
    assert.ok(app.includes('long: { used: view.tokens.long, budget: view.budgets.long }'));
    assert.ok(app.includes('const getMemoryEntryBase = (entryId) => {'));
    // Folded digests never reach tool retrieval either.
    assert.ok(app.includes('!entry.meta.stale && !entry.meta.folded'));
});
