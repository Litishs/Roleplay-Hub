import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import memoryProfile from '../assets/js/memory-profile.js';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8')
]);

test('固定信息卡:关系有向边去重与更新', () => {
    const profile = memoryProfile.createEmptyProfile();
    const first = memoryProfile.mergeRelations(
        [{ from: 'A', to: 'B', relation: '老师' }],
        profile,
        8
    );
    assert.equal(first.added, 1);
    assert.equal(first.updated, 0);
    const second = memoryProfile.mergeRelations(
        [{ from: 'A', to: 'B', relation: '老师', status: 'ended' }],
        { ...profile, relations: first.relations },
        16
    );
    assert.equal(second.added, 0);
    assert.equal(second.updated, 1);
    assert.equal(second.relations[0].status, 'ended');
    assert.equal(second.relations[0].updatedTurn, 16);
});

test('固定信息卡:对称关系双向各存一条', () => {
    const profile = memoryProfile.createEmptyProfile();
    const merged = memoryProfile.mergeRelations(
        [
            { from: '我', to: '林夕瑶', relation: '恋人' },
            { from: '林夕瑶', to: '我', relation: '恋人' }
        ],
        profile,
        8
    );
    assert.equal(merged.relations.length, 2);
    assert.equal(memoryProfile.relationKey(merged.relations[0]) !== memoryProfile.relationKey(merged.relations[1]), true);
});

test('固定信息卡:角色状态与伏笔合并', () => {
    const profile = memoryProfile.createEmptyProfile();
    const chars = memoryProfile.mergeCharacters([{ name: '林夕瑶', status: '剑修,灵力受损' }], profile, 8);
    assert.equal(chars.added, 1);
    const chars2 = memoryProfile.mergeCharacters([{ name: '林夕瑶', status: '灵力恢复' }], { ...profile, characters: chars.characters }, 16);
    assert.equal(chars2.added, 0);
    assert.equal(chars2.updated, 1);
    assert.equal(chars2.characters[0].status, '灵力恢复');
    const plots = memoryProfile.mergeOpenPlots([{ summary: '调查失踪案' }], profile, 8);
    assert.equal(plots.added, 1);
    const plots2 = memoryProfile.mergeOpenPlots(
        [{ summary: '调查失踪案', status: 'closed' }],
        { ...profile, openPlots: plots.openPlots },
        16
    );
    assert.equal(plots2.openPlots[0].status, 'closed');
});

test('固定信息卡:注入文本只含动态状态与伏笔，不含关系', () => {
    const profile = {
        characters: [{ name: '林夕瑶', status: '剑修' }],
        relations: [
            { from: '我', to: '林夕瑶', relation: '恋人', status: 'active' },
            { from: '林夕瑶', to: '我', relation: '恋人', status: 'active' },
            { from: '我', to: '师父', relation: '学生', status: 'active' },
            { from: '旧友', to: '我', relation: '朋友', status: 'ended' }
        ],
        openPlots: [{ summary: '调查失踪案', status: 'open', deadline: '三日后' }]
    };
    const text = memoryProfile.buildProfileContext(profile, { userRoleName: '我' });
    assert.ok(text.includes('<role_profile>'));
    assert.ok(!text.includes('恋人'));
    assert.ok(!text.includes('→'));
    assert.ok(text.includes('林夕瑶:剑修'));
    assert.ok(text.includes('调查失踪案（三日后）'));
});

test('固定信息卡:过期标注——lastSeenTurn 超阈值标「未再出现」，重复输出刷新（v4）', () => {
    const profile = memoryProfile.createEmptyProfile();
    const merged = memoryProfile.mergeCharacters(
        [{ name: '安娜', status: '净化者' }],
        profile,
        10
    );
    // 距第 10 轮超过 40 轮未再出现 → 标注
    const staleText = memoryProfile.buildProfileContext(
        { characters: merged.characters },
        { userRoleName: '我', currentTurn: 60 }
    );
    assert.ok(staleText.includes('安娜:净化者（第10轮后未再出现）'));
    // 未超阈值不标注
    const freshText = memoryProfile.buildProfileContext(
        { characters: merged.characters },
        { userRoleName: '我', currentTurn: 30 }
    );
    assert.ok(freshText.includes('安娜:净化者'));
    assert.ok(!freshText.includes('未再出现'));
    // 模型重复输出（状态未变）刷新 lastSeenTurn，解除过期
    const remerged = memoryProfile.mergeCharacters(
        [{ name: '安娜', status: '净化者' }],
        { characters: merged.characters },
        55
    );
    const refreshedText = memoryProfile.buildProfileContext(
        { characters: remerged.characters },
        { userRoleName: '我', currentTurn: 60 }
    );
    assert.ok(refreshedText.includes('安娜:净化者'));
    assert.ok(!refreshedText.includes('未再出现'));
    // 伏笔同样支持过期标注
    const plots = memoryProfile.mergeOpenPlots([{ summary: '寻找至宝' }], profile, 5);
    const plotText = memoryProfile.buildProfileContext(
        { openPlots: plots.openPlots },
        { userRoleName: '我', currentTurn: 60 }
    );
    assert.ok(plotText.includes('寻找至宝（第5轮后未再出现）'));
});

test('固定信息卡:index.html 加载模块且不再有关系视图', () => {
    assert.ok(html.includes('assets/js/memory-profile.js'));
    assert.ok(!html.includes("setMemoryGraphView('relations')"));
    assert.ok(!html.includes('memoryRelationCanvas'));
});

test('固定信息卡:app.js 接入存储与注入，移除关系渲染', () => {
    assert.ok(app.includes("'memory_profile'"));
    assert.ok(!app.includes('drawRelationView'));
    assert.ok(!app.includes('memoryRelationCanvas'));
});
