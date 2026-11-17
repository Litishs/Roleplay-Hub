// Contract test: legacy info-card shape + <role_profile> rendering (v6 L4).
//
// L4 moved fact merging into the ledger (append + fold) and deleted the
// memory-profile merge family plus the dead relations field. What remains
// here is the read-only legacy shape used for adoption/import and the pure
// renderer shared by injection and the panel (design doc §5.4 / §10).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as memoryProfile from '../src/modules/memory-profile.mjs';

const [html, app] = await Promise.all([
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8')
]);

test('固定信息卡:legacy shape keeps characters/openPlots and drops relations', () => {
    const empty = memoryProfile.createEmptyProfile();
    assert.deepEqual(empty, { characters: [], openPlots: [], updatedAt: 0 });
    const normalized = memoryProfile.normalizeProfile({
        characters: [{ name: '甲', status: '受伤' }],
        relations: [{ from: '甲', to: '乙', relation: '师徒' }],
        openPlots: [{ summary: '寻药', status: 'open' }],
        updatedAt: 7
    });
    assert.deepEqual(normalized.characters.map(item => item.name), ['甲']);
    assert.deepEqual(normalized.openPlots.map(item => item.summary), ['寻药']);
    assert.equal(normalized.updatedAt, 7);
    assert.equal('relations' in normalized, false, 'relations is a dead field');
    assert.equal(memoryProfile.mergeCharacters, undefined);
    assert.equal(memoryProfile.mergeOpenPlots, undefined);
    assert.equal(memoryProfile.mergeRelations, undefined);
    assert.equal(memoryProfile.relationKey, undefined);
});

test('固定信息卡:注入文本只含动态状态与伏笔，不含关系', () => {
    const profile = {
        characters: [{ name: '林夕瑶', status: '剑修' }],
        relations: [{ from: '我', to: '林夕瑶', relation: '恋人', status: 'active' }],
        openPlots: [{ summary: '调查失踪案', status: 'open', deadline: '三日后' }]
    };
    const text = memoryProfile.buildProfileContext(profile, { userRoleName: '我' });
    assert.ok(text.includes('<role_profile>'));
    assert.ok(!text.includes('恋人'));
    assert.ok(!text.includes('→'));
    assert.ok(text.includes('林夕瑶:剑修'));
    assert.ok(text.includes('调查失踪案（三日后）'));
    // Closed plots stay in the card data but are not injected.
    const closed = memoryProfile.buildProfileContext({
        openPlots: [{ summary: '已解决', status: 'closed' }]
    });
    assert.equal(closed, '');
});

test('固定信息卡:新鲜度按 covers 投影的 lastSeenTurn 精确判定（v6 §5.4）', () => {
    // Re-affirming an unchanged status appends a new fact whose covers
    // project to the current turn, so freshness advances without a
    // "last mentioned" heuristic.
    assert.equal(memoryProfile.isProfileStale({ lastSeenTurn: 10 }, 60, 40), true);
    assert.equal(memoryProfile.isProfileStale({ lastSeenTurn: 30 }, 60, 40), false);
    assert.equal(memoryProfile.isProfileStale({ lastSeenTurn: 55 }, 60, 40), false);
    // No live covers (manual / legacy fact / pin) is never annotated.
    assert.equal(memoryProfile.isProfileStale({ lastSeenTurn: 0 }, 600, 40), false);
    assert.equal(memoryProfile.isProfileStale(null, 600, 40), false);

    const staleText = memoryProfile.buildProfileContext(
        { characters: [{ name: '安娜', status: '净化者', lastSeenTurn: 10 }] },
        { currentTurn: 60, staleAfter: 40 }
    );
    assert.ok(staleText.includes('安娜:净化者（第10轮后未再出现）'));
    const freshText = memoryProfile.buildProfileContext(
        { characters: [{ name: '安娜', status: '净化者', lastSeenTurn: 55 }] },
        { currentTurn: 60, staleAfter: 40 }
    );
    assert.ok(freshText.includes('安娜:净化者'));
    assert.ok(!freshText.includes('未再出现'));
    const plotText = memoryProfile.buildProfileContext(
        { openPlots: [{ summary: '寻找至宝', status: 'open', lastSeenTurn: 5 }] },
        { currentTurn: 60, staleAfter: 40 }
    );
    assert.ok(plotText.includes('寻找至宝（第5轮后未再出现）'));
});

test('固定信息卡:L4 不再有合并写路径，profile 只做旧数据读取', () => {
    assert.ok(app.includes('./memory-profile.mjs'));
    assert.ok(app.includes("'memory_profile'"), 'legacy key stays readable for adoption');
    assert.ok(!app.includes('applyMemoryProfileDelta'), 'no profile merge writer remains');
    assert.ok(!app.includes('mergeCharacters('), 'facts are merged by the ledger, not by memory-profile');
    assert.ok(!app.includes('mergeOpenPlots('));
    assert.ok(!html.includes("setMemoryGraphView('relations')"));
    assert.ok(!html.includes('memoryRelationCanvas'));
    assert.ok(!app.includes('drawRelationView'));
});