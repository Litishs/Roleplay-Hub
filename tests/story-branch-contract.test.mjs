import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as storyBranch from '../src/modules/story-branch.mjs';
import { filterLedgerForBranch, makeDigestEntry } from '../src/modules/memory-ledger.mjs';

const [html, app, presets, cardOps, branching] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/default-presets.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useCardOperations.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useStoryBranching.mjs', import.meta.url), 'utf8')
]);
    const mainJs = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test('story-branch.js exposes branch API', () => {
    assert.equal(storyBranch.MAIN_ID, 'main');
    assert.equal(typeof storyBranch.getScopeId, 'function');
    assert.equal(typeof storyBranch.getOwnerId, 'function');
    assert.equal(typeof storyBranch.createId, 'function');
    assert.equal(typeof storyBranch.normalizeBranches, 'function');
    assert.equal(typeof storyBranch.collectSubtreeIds, 'function');
    assert.equal(typeof storyBranch.buildBranchTree, 'function');
});

test('getScopeId keeps main unscoped and scopes branch ids', () => {
    assert.equal(storyBranch.getScopeId('uuid-1', 'main'), 'uuid-1');
    assert.equal(storyBranch.getScopeId('uuid-1'), 'uuid-1');
    assert.equal(storyBranch.getScopeId('uuid-1', 'branch-9'), 'uuid-1__branch__branch-9');
    assert.equal(storyBranch.getOwnerId('uuid-1__branch__branch-9'), 'uuid-1');
    assert.equal(storyBranch.getOwnerId('uuid-1'), 'uuid-1');
    assert.equal(storyBranch.getScopeId(null, 'branch-9'), null);
});

test('normalizeBranches creates main and repairs parents', () => {
    const char = { uuid: 'uuid-1', createdAt: 100 };
    const normalized = storyBranch.normalizeBranches(char, {
        branches: [
            { id: 'b1', name: '路线 1', parentId: 'ghost' },
            { id: 'b1', name: '重复分支', parentId: 'main' }
        ]
    });
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].id, 'main');
    assert.equal(normalized[0].name, '主线');
    assert.equal(normalized[1].id, 'b1');
    assert.equal(normalized[1].name, '分支 1');
    assert.equal(normalized[1].parentId, 'main');
});

test('collectSubtreeIds cascades to children', () => {
    const branches = [
        { id: 'main', parentId: null },
        { id: 'b1', parentId: 'main' },
        { id: 'b2', parentId: 'b1' },
        { id: 'b3', parentId: 'main' }
    ];
    assert.deepEqual(storyBranch.collectSubtreeIds(branches, 'b1').sort(), ['b1', 'b2']);
    assert.deepEqual(storyBranch.collectSubtreeIds(branches, 'main').sort(), ['b1', 'b2', 'b3', 'main']);
});

test('buildBranchTree lays out nodes and links', () => {
    const branches = [
        { id: 'main', name: '主线', parentId: null, createdAt: 1, floorCount: 2, wordCount: 100 },
        { id: 'b1', name: '分支 1', parentId: 'main', createdAt: 2, floorCount: 3, wordCount: 200 }
    ];
    const tree = storyBranch.buildBranchTree(branches, 'main', 'main');
    assert.equal(tree.nodes.length, 2);
    assert.equal(tree.links.length, 1);
    assert.equal(tree.links[0].id, 'main-b1');
    assert.ok(tree.width >= 360);
    assert.ok(tree.height >= 170);
    assert.equal(tree.nodes.find(node => node.id === 'main').isActive, true);
    assert.equal(tree.nodes.find(node => node.id === 'b1').isSelected, false);
});


test('app.js wires branch state and actions into setup return', () => {
    assert.ok(app.includes('const RPHStoryBranch = {'));
    assert.ok(app.includes('const storyBranches = ref([])'));
    assert.ok(app.includes('const activeStoryBranchId = ref(\'main\')'));
    // 2026-08-29 (Phase 3.0): createStoryBranch moved to useStoryBranching.mjs
    assert.ok(branching.includes('const createStoryBranch = async'));
    assert.ok(app.includes('const switchStoryBranch = async'));
    assert.ok(app.includes('const openStoryBranchModal = ()'));
    assert.ok(app.includes('const deleteSelectedStoryBranch = ()'));
    assert.ok(app.includes('storyBranches, activeStoryBranchId, currentStoryBranch, storyRouteMap,'));
});

test('useStoryBranching owns createStoryBranch with rollback and guards', () => {
    assert.ok(branching.includes('export function useStoryBranching(deps)'), 'deps-injecting factory export');
    // fork + rollback behavior markers stay intact
    assert.ok(branching.includes('目标消息已发生变化，请重试'), 'fork validation kept');
    assert.ok(branching.includes('已创建并进入'), 'success toast kept');
    assert.ok(branching.includes('创建分支失败：'), 'failure toast kept');
    assert.ok(branching.includes('storyBranches.value = storyBranches.value.filter(branch => branch.id !== createdBranch.branchId);'), 'rollback kept');
    // guards reached through setter bridges, never rebound locally
    assert.ok(branching.includes('setApplyingCharacterScopedData(true);'), 'apply guard set through bridge');
    assert.ok(branching.includes('setMemoriesLoaded(true);'), 'memories guard set through bridge');
    // fact-layer guard resets removed with the fact layer (2026-09-06 audit)
    assert.ok(!branching.includes('setFactLoadedCharacterId') && !branching.includes('memoryFacts'), 'fact reset removed');
    assert.ok(branching.includes('getDb() ? getDb().deleteFragments(createdBranch.branchScopeId) : Promise.resolve(),'), 'db reached through accessor');
    assert.ok(branching.includes('setMemorySummaries(previousState.summaries);'));
    assert.ok(branching.includes('setMemoryProfile(previousState.profile);'));
    assert.ok(branching.includes("deleteScopedStoredValue('memory_summaries', createdBranch.branchScopeId)"));
    assert.ok(branching.includes("deleteScopedStoredValue('memory_profile', createdBranch.branchScopeId)"));
    assert.ok(!/_(isApplyingCharacterScopedData|memoriesLoaded|classicMemoriesLoaded)\b/.test(branching.replace(/^\/\/.*$/gm, '')), 'no direct guard access in code');
    assert.ok(!branching.includes('\ndb ?') && !branching.includes(' db ? db.deleteFragments'), 'no direct db binding access');
    assert.ok(branching.includes('return { createStoryBranch };'));
});

test('app.js scopes chat and memory persistence by branch', () => {
    assert.ok(app.includes('const getCurrentChatStorageScopeId = ()'));
    assert.ok(app.includes('const characterId = getCurrentChatStorageScopeId();'));
    assert.ok(app.includes('loadStoredChatHistory = async (char, fallbackIndex = null, storyScopeId = getCurrentStoryBranchScopeId()'));
    assert.ok(app.includes('getUiTemplateRuntimeKey = (char = currentCharacter.value)'));
    assert.ok(app.includes('return getStoryBranchScopeId(char.uuid, activeStoryBranchId.value);'));
    assert.ok(app.includes('setScopedStoredValue(\'branches\', char.uuid'));
    // fact fragment persistence removed with the fact layer (2026-09-06 audit);
    // db.applyFragments must not reappear without its schema module.
    assert.ok(!app.includes('db.applyFragments'), 'fact fragment persistence stays removed');
});

test('app.js falls back to in-memory history when fork target is missing from storage', () => {
    // 2026-08-29 (Phase 3.0): createStoryBranch moved to useStoryBranching.mjs
    assert.ok(branching.includes('const memorySourceIndex = forkMessageId'), '分支创建须尝试内存回退定位目标消息');
    assert.ok(branching.includes("branchChat = chatHistory.value.map(message => serializeChatMessage(message, 'final'))"), '内存回退须序列化消息后再写入分支');
});

test('mid-history forks rebuild derived memory layers from the branch timeline', () => {
    // Summary/profile records hold final-state text (not per-batch snapshots),
    // so trimming the batch list alone would keep the parent's post-fork events.
    assert.ok(branching.includes('const parentTurnCount = buildConversationTurnSnapshot('), 'fork must measure the parent timeline before slicing');
    assert.ok(branching.includes('if (forkTurn < parentTurnCount) {'), 'mid-history forks must be detected');
    assert.ok(branching.includes("branchSummaries = { long: '', short: '', batches: [], updatedAt: now };"), 'summary text and batch list reset together');
    assert.ok(branching.includes('branchProfile = null;'), 'profile reset for a mid-history fork');
    assert.ok(branching.includes('setMemorySummaries(branchSummaries ? cloneForStorage(branchSummaries) : null);'), 'in-memory summary ref must not alias the parent branch');
    assert.ok(branching.includes('setMemoryProfile(branchProfile ? cloneForStorage(branchProfile) : null);'), 'in-memory profile ref must not alias the parent branch');
    assert.ok(app.includes('setMemorySummaries,') && app.includes('setMemoryProfile,'), 'setter bridges wired into useStoryBranching');
    assert.ok(app.includes('abortClassicBatchExtraction();\n            abortRollingSummary();'), 'leaving a branch aborts the rolling summary chain');
});

test('app.js keeps branch scope ids in the outer function scope (no try-block leakage)', () => {
    // 2026-08-29 (Phase 2.2): selectCharacter moved to useCardOperations; the
    // startup restore path (restoreScopeId) stays in app.mjs
    assert.ok(app.includes('let restoreScopeId = null;'), '恢复路径的作用域 id 必须在 try 外声明');
    assert.ok(app.includes("await loadCharacterMemories(restoreScopeId, ' on restore');"), '恢复路径应在 try 外使用 restoreScopeId');
    assert.ok(cardOps.includes('let initialBranchScopeId = null;'), '角色切换的作用域 id 必须在 try 外声明');
    assert.ok(cardOps.includes('await loadCharacterMemories(initialBranchScopeId);'), '角色切换应在 try 外使用 initialBranchScopeId');
});

test('default-presets.js seeds 时间戳 preset', () => {
    assert.ok(presets.includes('name: "时间戳"'));
    assert.ok(presets.includes('role: "system"'));
    assert.ok(presets.includes('<timestamp_rule>'));
    assert.ok(presets.includes('正文第一行必须单独输出当前剧情时间戳'));
});


test('src/main.js imports story-branch.js', () => {
    assert.ok(app.includes('./story-branch.mjs'));
});

test('useStoryBranching receives flushCurrentBranchState as a dep', () => {
    // runtime regression caught by desktop smoke: a missing dep surfaced only as
    // "创建分支失败：flushCurrentBranchState is not defined" at call time
    assert.ok(branching.includes('        flushCurrentBranchState,'), 'composable destructures flushCurrentBranchState');
    assert.ok(branching.includes('if (!await flushCurrentBranchState()) return;'), 'call site kept');
    const wiring = app.slice(app.indexOf('const { createStoryBranch } = useStoryBranching({'));
    const wiringEnd = wiring.indexOf('});');
    assert.ok(wiring.slice(0, wiringEnd).includes('flushCurrentBranchState,'), 'app.mjs passes flushCurrentBranchState');
});

test('v6 L2: branch memory is a covers ⊆ survivors filter (zero API)', () => {
    assert.ok(branching.includes("getScopedStoredValue('memory_ledger', parentScopeId)"));
    // The child ledger keeps only entries whose consumed messages survived.
    assert.ok(branching.includes("const survivorIds = new Set(branchChat.map(message => message?.id).filter(Boolean));"));
    assert.ok(branching.includes('filterLedgerForBranch(branchLedger, survivorIds)'));
    // The child projection is folded from the filtered ledger, not copied.
    assert.ok(branching.includes('buildMemorySummariesProjection(branchLedger, branchChat)'));
    assert.ok(app.includes('buildMemorySummariesProjection: (ledger, chatMessages) => {'));
    // Zero API calls on branch creation: inheritance is pure filtering.
    assert.ok(!branching.includes('fetch('), 'branch creation never calls the model');
    // Legacy fallback: data without covers rebuilds from the child chat.
    assert.ok(branching.includes("branchSummaries = { long: '', short: '', batches: [], updatedAt: now };"));
    // In-memory state and rollback follow the same pattern as summaries.
    assert.ok(branching.includes('setMemoryLedger(branchLedger ? cloneForStorage(branchLedger) : null);'));
    assert.ok(branching.includes('setMemoryLedger(previousState.ledger);'));
    assert.ok(branching.includes("deleteScopedStoredValue('memory_ledger', createdBranch.branchScopeId)"));
    assert.ok(app.includes('memoryLedger,') && app.includes('setMemoryLedger,'), 'ledger refs bridged into useStoryBranching');
    // Ledger loaders wired at both scope entry points.
    assert.ok(app.includes('await loadMemoryLedger(characterId);'));
    assert.ok(app.includes('await loadMemoryLedger(targetScopeId);'));
});

test('v6 L2: forks of forks filter recursively (no post-fork leakage)', () => {
    const ledger = {
        version: 1,
        hashVersion: 1,
        updatedAt: 0,
        entries: [
            makeDigestEntry({ id: 'early', covers: [{ id: 'm1', h: 'h1' }], text: '早期' }),
            makeDigestEntry({ id: 'mid', covers: [{ id: 'm1', h: 'h1' }, { id: 'm3', h: 'h3' }], text: '中段' }),
            makeDigestEntry({ id: 'late', covers: [{ id: 'm5', h: 'h5' }], text: '后段' }),
            makeDigestEntry({ id: 'pin', covers: [], text: '置顶' })
        ]
    };
    // Fork after m1..m3 → mid/late dropped, pin follows.
    const child = filterLedgerForBranch(ledger, new Set(['m1', 'm2', 'm3']));
    assert.deepEqual(child.entries.map(entry => entry.id).sort(), ['early', 'mid', 'pin']);
    // Fork the fork after m1..m2 → only entries fully inside the new tail.
    const grandchild = filterLedgerForBranch(child, new Set(['m1', 'm2']));
    assert.deepEqual(grandchild.entries.map(entry => entry.id).sort(), ['early', 'pin']);
});
