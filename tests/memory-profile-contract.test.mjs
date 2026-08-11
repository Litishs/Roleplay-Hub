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

test('固定信息卡:注入文本以 {{user}} 为中心且为有向边格式', () => {
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
    assert.ok(text.includes('我→林夕瑶:恋人'));
    assert.ok(text.includes('林夕瑶→我:恋人'));
    assert.ok(text.includes('我→师父:学生'));
    assert.ok(!text.includes('旧友→我'));
    assert.ok(text.includes('林夕瑶:剑修'));
    assert.ok(text.includes('调查失踪案（三日后）'));
});

test('固定信息卡:关系视图数据以用户为中心分层', () => {
    const profile = {
        relations: [
            { from: '我', to: '林夕瑶', relation: '恋人', status: 'active' },
            { from: '我', to: '师父', relation: '学生', status: 'active' },
            { from: '林夕瑶', to: '阿七', relation: '好友', status: 'active' }
        ]
    };
    const data = memoryProfile.buildRelationViewData(profile, { userRoleName: '我' });
    assert.equal(data.center, '我');
    assert.equal(data.nodes.find(n => n.label === '我').radius, 0);
    assert.equal(data.nodes.find(n => n.label === '林夕瑶').radius, 1);
    assert.equal(data.nodes.find(n => n.label === '师父').radius, 1);
    assert.equal(data.nodes.find(n => n.label === '阿七').radius, 2);
    assert.equal(data.edges.length, 3);
});

test('固定信息卡:index.html 加载模块并提供关系视图', () => {
    assert.ok(html.includes('assets/js/memory-profile.js'));
    assert.ok(html.includes("setMemoryGraphView('relations')"));
    assert.ok(html.includes('ref="memoryRelationCanvas"'));
    assert.ok(html.includes('关系表（有向边）'));
});

test('固定信息卡:app.js 接入存储、注入与渲染', () => {
    assert.ok(app.includes("'memory_profile'"));
    assert.ok(app.includes('buildRelationViewData'));
    assert.ok(app.includes('drawRelationView'));
    assert.ok(app.includes('memoryRelationCanvas'));
});
