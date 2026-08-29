import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as storyBranch from '../src/modules/story-branch.mjs';

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
    assert.ok(branching.includes("setFactLoadedCharacterId('');"), 'fact guard reset through bridge');
    assert.ok(branching.includes('getDb() ? getDb().deleteFragments(createdBranch.branchScopeId) : Promise.resolve(),'), 'db reached through accessor');
    assert.ok(!/_(isApplyingCharacterScopedData|memoriesLoaded|classicMemoriesLoaded|factFragmentsLoaded|factLoadedCharacterId)\b/.test(branching.replace(/^\/\/.*$/gm, '')), 'no direct guard access in code');
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
    assert.ok(app.includes('db.applyFragments(getCurrentChatStorageScopeId()'));
});

test('app.js falls back to in-memory history when fork target is missing from storage', () => {
    // 2026-08-29 (Phase 3.0): createStoryBranch moved to useStoryBranching.mjs
    assert.ok(branching.includes('const memorySourceIndex = forkMessageId'), '分支创建须尝试内存回退定位目标消息');
    assert.ok(branching.includes("branchChat = chatHistory.value.map(message => serializeChatMessage(message, 'final'))"), '内存回退须序列化消息后再写入分支');
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
