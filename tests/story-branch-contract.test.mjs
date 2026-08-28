import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as storyBranch from '../src/modules/story-branch.mjs';

const [html, app, presets] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/default-presets.mjs', import.meta.url), 'utf8')
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
    assert.ok(app.includes('const createStoryBranch = async'));
    assert.ok(app.includes('const switchStoryBranch = async'));
    assert.ok(app.includes('const openStoryBranchModal = ()'));
    assert.ok(app.includes('const deleteSelectedStoryBranch = ()'));
    assert.ok(app.includes('storyBranches, activeStoryBranchId, currentStoryBranch, storyRouteMap,'));
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
    assert.ok(app.includes('const memorySourceIndex = forkMessageId'), '分支创建须尝试内存回退定位目标消息');
    assert.ok(app.includes("branchChat = chatHistory.value.map(message => serializeChatMessage(message, 'final'))"), '内存回退须序列化消息后再写入分支');
});

test('app.js keeps branch scope ids in the outer function scope (no try-block leakage)', () => {
    assert.ok(app.includes('let restoreScopeId = null;'), '恢复路径的作用域 id 必须在 try 外声明');
    assert.ok(app.includes("await loadCharacterMemories(restoreScopeId, ' on restore');"), '恢复路径应在 try 外使用 restoreScopeId');
    assert.ok(app.includes('let initialBranchScopeId = null;'), '角色切换的作用域 id 必须在 try 外声明');
    assert.ok(app.includes('await loadCharacterMemories(initialBranchScopeId);'), '角色切换应在 try 外使用 initialBranchScopeId');
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
