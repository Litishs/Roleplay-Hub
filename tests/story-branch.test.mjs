// Runtime (ESM import) tests for src/modules/story-branch.mjs scope helpers.
// Complements story-branch-contract (text assertions) with behavior locks on
// the id/scope round-trip, branch normalization and tree layout.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAIN_ID, SCOPE_SEPARATOR, createId, getScopeId, getOwnerId, isBranchScopeId,
    defaultBranchName, createMainBranch, normalizeBranches, collectSubtreeIds,
    buildBranchTree, formatWordCount
} from '../src/modules/story-branch.mjs';

test('scope id round-trips preserve the owner character id', () => {
    const charId = '8df1dfa5-2445-48d8-a945-c3234eb21451';
    const branchId = 'abc123';
    const scopeId = getScopeId(charId, branchId);
    assert.equal(scopeId, `${charId}${SCOPE_SEPARATOR}${branchId}`);
    assert.equal(isBranchScopeId(scopeId), true);
    assert.equal(getOwnerId(scopeId), charId);
    // Main line keeps the bare character id for legacy data compatibility.
    assert.equal(getScopeId(charId), charId);
    assert.equal(getScopeId(charId, MAIN_ID), charId);
    assert.equal(isBranchScopeId(charId), false);
    assert.equal(getOwnerId(charId), charId);
    assert.equal(getScopeId(''), null);
});

test('createId yields unique non-empty branch ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createId()));
    assert.equal(ids.size, 20);
});

test('normalizeBranches repairs stored branch lists', () => {
    const char = { uuid: 'u-1', createdAt: 1000 };
    const saved = {
        branches: [
            { id: 'b1', name: '路线 1', parentId: 'main' },   // legacy 路线N naming
            { id: 'b1', name: 'duplicate', parentId: 'main' }, // duplicate id dropped
            { id: '', name: 'no id' },                        // id-less entry dropped
            { id: 'b2', name: '' },                           // fallback name
            { id: 'longname', name: 'n'.repeat(40), parentId: 'ghost' } // name clamped to 30, ghost parent → main
        ]
    };
    const branches = normalizeBranches(char, saved);
    const byId = new Map(branches.map(b => [b.id, b]));
    // main line is always present, first, deduped
    assert.equal(branches[0].id, MAIN_ID);
    assert.equal(branches[0].name, '主线');
    assert.equal(branches[0].parentId, null);
    assert.equal(branches.filter(b => b.id === 'b1').length, 1);
    assert.ok(!byId.has(''), 'id-less branches dropped');
    assert.equal(byId.get('b1').name, '分支 1', 'legacy 路线N renamed to 分支N');
    assert.equal(byId.get('b2').name, '分支 4', 'empty name falls back to source-index-based default');
    assert.equal(byId.get('longname').name.length, 30, 'name clamped to 30 chars');
    assert.equal(byId.get('longname').parentId, MAIN_ID, 'dangling parentId repaired to main');
});

test('collectSubtreeIds walks a branch subtree including the root', () => {
    const char = { uuid: 'u-1' };
    const branches = normalizeBranches(char, {
        branches: [
            { id: 'a', parentId: MAIN_ID },
            { id: 'b', parentId: 'a' },
            { id: 'c', parentId: 'b' },
            { id: 'd', parentId: MAIN_ID }
        ]
    });
    const subtree = collectSubtreeIds(branches, 'b');
    assert.ok(Array.isArray(subtree));
    assert.deepEqual([...subtree].sort(), ['b', 'c']);
    const whole = collectSubtreeIds(branches, MAIN_ID);
    assert.ok(['main', 'a', 'b', 'c', 'd'].every(id => whole.includes(id)));
});

test('buildBranchTree lays out nodes and links for a simple tree', () => {
    const char = { uuid: 'u-1' };
    const branches = normalizeBranches(char, {
        branches: [
            { id: 'a', parentId: MAIN_ID },
            { id: 'b', parentId: MAIN_ID }
        ]
    });
    const tree = buildBranchTree(branches, 'a', 'b');
    assert.ok(Array.isArray(tree.nodes) && tree.nodes.length === 3);
    assert.ok(Array.isArray(tree.links) && tree.links.length === 2);
    assert.equal(typeof tree.width, 'number');
    assert.equal(typeof tree.height, 'number');
    const nodeById = new Map(tree.nodes.map(node => [node.id, node]));
    assert.equal(nodeById.get('main').depth, 0);
    assert.equal(nodeById.get('a').depth, 1);
    assert.equal(nodeById.get('b').depth, 1);
    // active/selected highlighting follows the requested routes
    assert.equal(nodeById.get('a').isActive, true);
    assert.equal(nodeById.get('b').isSelected, true);
    assert.equal(nodeById.get('main').isOnActiveRoute, true);
});

test('formatWordCount renders k/W abbreviations', () => {
    assert.equal(formatWordCount(999), '999');
    assert.equal(formatWordCount(1500), '1.5k');
    assert.equal(formatWordCount(20000), '2W');
});

test('createMainBranch and defaultBranchName provide stable defaults', () => {
    const main = createMainBranch({ createdAt: 12345 });
    assert.equal(main.id, MAIN_ID);
    assert.equal(main.createdAt, 12345);
    assert.equal(main.forkFloor, 0);
    assert.equal(defaultBranchName(0), '分支 1');
    assert.equal(defaultBranchName(3), '分支 3');
});
