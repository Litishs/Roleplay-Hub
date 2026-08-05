import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import memoryGraph from '../assets/js/memory-graph.js';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8')
]);

const makeMemory = (id, turn, sequence, text, embedding) => ({
    id,
    turn,
    sequence,
    paragraph: text,
    summary: text,
    sourceText: text,
    embedding
});

test('memory-graph.js exposes computeGraph / runForceLayout / findNodeAt', () => {
    assert.equal(typeof memoryGraph.computeGraph, 'function');
    assert.equal(typeof memoryGraph.runForceLayout, 'function');
    assert.equal(typeof memoryGraph.findNodeAt, 'function');
    assert.equal(typeof memoryGraph.cosineSimilarity, 'function');
    assert.equal(typeof memoryGraph.extractTerms, 'function');
});

test('computeGraph builds fragment nodes and same-turn chain edges', () => {
    const memories = [
        makeMemory('a', 3, 1, '第一段内容', [1, 0, 0, 0]),
        makeMemory('b', 3, 2, '第二段内容', [0, 1, 0, 0]),
        makeMemory('c', 4, 1, '第三段内容', [0, 0, 1, 0])
    ];
    const { nodes, edges } = memoryGraph.computeGraph(memories);
    assert.equal(nodes.length, 3);
    assert.ok(nodes.every(node => node.kind === 'fragment'));
    const turnEdge = edges.find(edge => edge.source === 'a' && edge.target === 'b');
    assert.ok(turnEdge, '同轮分片应有轮次边');
    assert.ok(turnEdge.types.includes('turn'));
});

test('computeGraph creates semantic edges from similar embeddings', () => {
    const memories = [
        makeMemory('a', 1, 1, '林晚救了我', [1, 1, 0, 0]),
        makeMemory('b', 2, 1, '她救了我', [1, 1, 0, 0]),
        makeMemory('c', 3, 1, '完全无关内容', [0, 0, 1, 1])
    ];
    const { edges } = memoryGraph.computeGraph(memories);
    const semantic = edges.filter(edge => edge.types.includes('semantic'));
    assert.ok(semantic.length >= 1, '相似分片应产生语义边');
    const pair = semantic.find(edge =>
        (edge.source === 'a' && edge.target === 'b') || (edge.source === 'b' && edge.target === 'a')
    );
    assert.ok(pair, 'a/b 相似分片应有语义边');
    assert.ok(pair.weight >= 0.9);
});

test('computeGraph creates keyword co-occurrence edges for shared terms', () => {
    const memories = [
        makeMemory('a', 1, 1, '林晚师姐救了我，戒指来历不明'),
        makeMemory('b', 2, 1, '林晚师姐的戒指是个谜'),
        makeMemory('c', 3, 1, '今天天气很好')
    ];
    const { edges } = memoryGraph.computeGraph(memories, { keywordMinShared: 2 });
    const keywordEdge = edges.find(edge =>
        edge.types.includes('keyword')
        && ((edge.source === 'a' && edge.target === 'b') || (edge.source === 'b' && edge.target === 'a'))
    );
    assert.ok(keywordEdge, '共享关键词的分片应产生关键词边');
});

test('computeGraph caps node count keeping recent turns', () => {
    const memories = [];
    for (let i = 1; i <= 850; i++) {
        memories.push(makeMemory(`m${i}`, i, 1, `第${i}轮内容`, [0, 0, 0, 0]));
    }
    const { nodes } = memoryGraph.computeGraph(memories, { maxNodes: 800 });
    assert.ok(nodes.length <= 800);
    const maxTurn = Math.max(...nodes.map(node => node.turn));
    assert.equal(maxTurn, 850, '应优先保留最近轮次');
});

test('computeGraph bounds edges per node to keep layout fast on dense data', () => {
    const memories = [];
    for (let i = 1; i <= 60; i++) {
        memories.push(makeMemory(`m${i}`, i, 1, `林晚师姐救了我 戒指 事件 剧情 关系`, [1, 1, 1, 1]));
    }
    const { nodes, edges } = memoryGraph.computeGraph(memories, { maxEdgesPerNode: 8 });
    const maxDegree = Math.max(...nodes.map(node => node.degree));
    assert.ok(maxDegree <= 8, `每节点边数应受预算限制，实际 ${maxDegree}`);
    assert.ok(edges.length <= (nodes.length * 8) / 2 + 1, `总边数应受预算限制，实际 ${edges.length}`);
});

test('runForceLayout keeps positions finite and within bounds', () => {
    const memories = [];
    for (let i = 1; i <= 40; i++) {
        memories.push(makeMemory(`m${i}`, i, 1, `内容${i}`, [1, 0, 0, 0]));
    }
    const { nodes, edges } = memoryGraph.computeGraph(memories);
    memoryGraph.runForceLayout(nodes, edges, { layoutIterations: 20 });
    nodes.forEach(node => {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), '坐标必须有限');
        assert.ok(node.x >= 0 && node.x <= 1200, 'x 越界');
        assert.ok(node.y >= 0 && node.y <= 720, 'y 越界');
    });
});

test('findNodeAt hits the closest node within radius', () => {
    const nodes = [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 300, y: 300 }
    ];
    assert.equal(memoryGraph.findNodeAt(nodes, 105, 105, 20).id, 'a');
    assert.equal(memoryGraph.findNodeAt(nodes, 310, 310, 20).id, 'b');
    assert.equal(memoryGraph.findNodeAt(nodes, 200, 200, 20), null);
});

test('index.html loads memory-graph.js before app.js', () => {
    const appIdx = html.indexOf('assets/js/app.js');
    const graphIdx = html.indexOf('assets/js/memory-graph.js');
    assert.ok(appIdx > 0 && graphIdx > 0 && graphIdx < appIdx);
});

test('index.html exposes graph panel and canvas ref', () => {
    assert.match(html, /memoryGraphView === 'graph'/);
    assert.match(html, /ref="memoryGraphCanvas"/);
    assert.match(html, /onMemoryGraphPointerDown/);
    assert.match(html, /showSearchResultsInGraph\(\)/);
});

test('app.js wires graph state, render loop and cleanup', () => {
    assert.match(app, /const memoryGraphView = ref\('list'\)/);
    assert.match(app, /const memoryGraphNodes = ref\(\[\]\)/);
    assert.match(app, /const memoryGraphHighlightIds = ref\(new Set\(\)\)/);
    assert.match(app, /const rebuildMemoryGraph = \(\) => \{/);
    assert.match(app, /const drawMemoryGraph = \(\) => \{/);
    assert.match(app, /const onMemoryGraphWheel = \(e\) => \{/);
    assert.match(app, /_memoryGraphResizeObserver\.disconnect\(\)/);
    assert.match(app, /globalThis\.RPHMemoryGraph/);
});
