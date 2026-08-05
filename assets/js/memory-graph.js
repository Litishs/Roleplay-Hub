/**
 * RPHMemoryGraph — 向量记忆图谱计算与布局（纯逻辑，零 DOM 依赖）
 *
 * P0 图谱 v1：
 *   - 节点 = 记忆分片（kind: 'fragment'，为后续实体/事件节点预留升级位）
 *   - 语义边 = 分片 embedding 余弦相似度 >= 阈值（大数据量时按轮次窗口截断）
 *   - 轮次边 = 同一轮内相邻分片按 sequence 串联
 *   - 关键词边 = 共享中文 n-gram / 拉丁词 >= 阈值
 *   - 力导向布局：网格空间哈希斥力 + 边弹簧 + 向心力（O(N·k) 级）
 *
 * 可在 Node 环境直接 import 用于测试。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RPHMemoryGraph = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_OPTIONS = Object.freeze({
        semanticThreshold: 0.55,      // 语义边最低余弦相似度
        semanticTurnWindow: 12,       // 大数据量时语义边只考虑轮次差 <= 该值
        fullScanMax: 350,             // 分片数 <= 该值时做全量语义边计算
        keywordMinShared: 2,          // 共享词 >= 该值时生成关键词边
        keywordMaxTerms: 24,          // 每分片参与共现的词上限（高频词按长度优先）
        maxNodes: 800,                // 图谱最多展示分片数（超出保留最近轮次）
        maxEdgesPerNode: 8,           // 每节点边数预算（防稠密边拖垮布局/绘制）
        maxRepulsionNeighbors: 24,    // 斥力邻居上限（防聚集时网格退化为 O(N^2)）
        layoutIterations: 48,         // 力导向迭代次数
        layoutWidth: 1200,            // 布局世界宽度
        layoutHeight: 720,            // 布局世界高度
        repulsion: 4800,              // 斥力强度
        springLength: 78,             // 边自然长度
        springStrength: 0.055,        // 边弹簧强度
        centering: 0.012,             // 向心力强度
        damping: 0.82                 // 速度阻尼
    });

    const STOP_TERMS = new Set([
        '是不是', '有没有', '为什么', '怎么样', '怎么办', '什么', '这个', '那个',
        '还是', '还在', '还会', '了吗', '吗', '呢', '啊', '吧', '的', '了', '我', '你', '她', '他',
        '我们', '你们', '他们', '自己', '一个', '没有', '可以', '知道', '觉得', '现在', '时候',
        '已经', '这么', '那么', '怎么', '这样', '那样', '然后', '但是', '因为', '所以'
    ]);

    const isEmbeddingLike = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

    const cosineSimilarity = (a, b) => {
        if (!isEmbeddingLike(a) || !isEmbeddingLike(b) || a.length === 0 || b.length === 0) return -1;
        const length = Math.min(a.length, b.length);
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < length; i++) {
            const av = Number(a[i]) || 0;
            const bv = Number(b[i]) || 0;
            dot += av * bv;
            normA += av * av;
            normB += bv * bv;
        }
        if (normA === 0 || normB === 0) return -1;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    const getMemoryText = (memory) => String(
        memory?.paragraph || memory?.summary || memory?.sourceText || ''
    ).trim();

    const normalizeTermText = (text) => String(text || '')
        .replace(/\s+/g, '')
        .replace(/[，。、“”‘’：；！？,.!?;:"'`~（）()【】\[\]<>《》]/g, '');

    const extractTerms = (text, maxTerms = DEFAULT_OPTIONS.keywordMaxTerms) => {
        const normalized = String(text || '')
            .replace(/[^\p{Script=Han}A-Za-z0-9_]+/gu, ' ')
            .trim();
        if (!normalized) return [];

        const terms = new Set();
        normalized.split(/\s+/).filter(Boolean).forEach(part => {
            if (/^[A-Za-z0-9_]{2,}$/.test(part)) {
                terms.add(part.toLowerCase());
                return;
            }
            const han = part.replace(/[^\p{Script=Han}]/gu, '');
            if (han.length >= 2) {
                for (let size = Math.min(4, han.length); size >= 2; size--) {
                    for (let i = 0; i <= han.length - size; i++) {
                        const term = han.slice(i, i + size);
                        if (!STOP_TERMS.has(term)) terms.add(term);
                    }
                }
            } else if (han.length === 1 && !STOP_TERMS.has(han)) {
                terms.add(han);
            }
        });

        return Array.from(terms)
            .filter(term => term.length > 0 && !STOP_TERMS.has(term))
            .sort((a, b) => b.length - a.length)
            .slice(0, maxTerms);
    };

    const orderNumber = (value, fallback) => {
        if (value === null || value === undefined || value === '') return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    };

    /**
     * 从记忆分片构建图谱。
     * @param {Array} memories 分片数组（需含 id；embedding 可选，缺失则无语义边）
     * @param {Object} options 覆盖 DEFAULT_OPTIONS
     * @returns {{nodes: Array, edges: Array}}
     */
    const computeGraph = (memories, options = {}) => {
        const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
        const source = (Array.isArray(memories) ? memories : [])
            .filter(memory => memory && memory.id);

        if (source.length === 0) return { nodes: [], edges: [] };

        // 超过上限时优先保留最近轮次（按 turn 降序截断后再升序排回）
        let pool = source;
        if (pool.length > opts.maxNodes) {
            pool = [...pool]
                .sort((a, b) => (orderNumber(b.turn, 0) - orderNumber(a.turn, 0)))
                .slice(0, opts.maxNodes);
        }
        pool = pool
            .map((memory, index) => ({
                id: String(memory.id),
                kind: 'fragment',                       // 升级位：后续可扩展 'entity' / 'event'
                memory,
                turn: orderNumber(memory.turn, 0),
                sequence: orderNumber(memory.sequence, index + 1),
                text: getMemoryText(memory),
                terms: extractTerms(getMemoryText(memory), opts.keywordMaxTerms)
            }))
            .sort((a, b) => (a.turn - b.turn) || (a.sequence - b.sequence));

        const nodes = pool.map(item => ({
            id: item.id,
            kind: item.kind,
            turn: item.turn,
            sequence: item.sequence,
            text: item.text,
            terms: item.terms,
            degree: 0,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0
        }));

        const byId = new Map(nodes.map(node => [node.id, node]));
        const edges = [];
        const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const edgeMap = new Map();

        const addEdge = (aId, bId, type, weight) => {
            if (aId === bId || !byId.has(aId) || !byId.has(bId)) return;
            const key = edgeKey(aId, bId);
            let edge = edgeMap.get(key);
            if (!edge) {
                edge = { source: aId, target: bId, types: [], weight: 0 };
                edgeMap.set(key, edge);
                edges.push(edge);
            }
            if (!edge.types.includes(type)) edge.types.push(type);
            edge.weight = Math.max(edge.weight, Number(weight) || 0);
            byId.get(aId).degree++;
            byId.get(bId).degree++;
        };

        // 轮次边：同一轮按 sequence 串联
        const byTurn = new Map();
        nodes.forEach(node => {
            if (!byTurn.has(node.turn)) byTurn.set(node.turn, []);
            byTurn.get(node.turn).push(node);
        });
        byTurn.forEach(group => {
            group.sort((a, b) => a.sequence - b.sequence);
            for (let i = 0; i < group.length - 1; i++) {
                addEdge(group[i].id, group[i + 1].id, 'turn', 0.35);
            }
        });

        // 语义边：全量（小规模）或按轮次窗口（大规模）
        const semanticNodes = pool.filter(item => isEmbeddingLike(item.memory?.embedding) && item.memory.embedding.length > 0);
        if (semanticNodes.length > 1) {
            if (semanticNodes.length <= opts.fullScanMax) {
                for (let i = 0; i < semanticNodes.length; i++) {
                    for (let j = i + 1; j < semanticNodes.length; j++) {
                        const score = cosineSimilarity(
                            semanticNodes[i].memory.embedding,
                            semanticNodes[j].memory.embedding
                        );
                        if (Number.isFinite(score) && score >= opts.semanticThreshold) {
                            addEdge(semanticNodes[i].id, semanticNodes[j].id, 'semantic', score);
                        }
                    }
                }
            } else {
                for (let i = 0; i < semanticNodes.length; i++) {
                    for (let j = i + 1; j < semanticNodes.length; j++) {
                        if (Math.abs(semanticNodes[i].turn - semanticNodes[j].turn) > opts.semanticTurnWindow) continue;
                        const score = cosineSimilarity(
                            semanticNodes[i].memory.embedding,
                            semanticNodes[j].memory.embedding
                        );
                        if (Number.isFinite(score) && score >= opts.semanticThreshold) {
                            addEdge(semanticNodes[i].id, semanticNodes[j].id, 'semantic', score);
                        }
                    }
                }
            }
        }

        // 关键词边：共享词 >= 阈值（词面共现）
        if (nodes.length <= opts.fullScanMax * 2) {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].terms.length === 0) continue;
                for (let j = i + 1; j < nodes.length; j++) {
                    if (nodes[j].terms.length === 0) continue;
                    const set = new Set(nodes[j].terms);
                    let shared = 0;
                    for (const term of nodes[i].terms) {
                        if (set.has(term)) shared++;
                    }
                    if (shared >= opts.keywordMinShared) {
                        addEdge(nodes[i].id, nodes[j].id, 'keyword', Math.min(0.75, 0.45 + shared * 0.08));
                    }
                }
            }
        }

        // 边数预算：按优先级（语义 > 关键词 > 同轮）保留每节点最强边，防止稠密边拖垮布局与绘制
        if (opts.maxEdgesPerNode > 0) {
            const budget = new Map();
            const keep = new Set();
            const priority = (edge) => {
                const semantic = edge.types.includes('semantic') ? 1000 : 0;
                const keyword = edge.types.includes('keyword') ? 100 : 0;
                return semantic + keyword + Number(edge.weight) * 10;
            };
            [...edges].sort((a, b) => priority(b) - priority(a)).forEach(edge => {
                const aUsed = budget.get(edge.source) || 0;
                const bUsed = budget.get(edge.target) || 0;
                if (aUsed < opts.maxEdgesPerNode && bUsed < opts.maxEdgesPerNode) {
                    keep.add(edge);
                    budget.set(edge.source, aUsed + 1);
                    budget.set(edge.target, bUsed + 1);
                }
            });
            edges.length = 0;
            keep.forEach(edge => edges.push(edge));
            nodes.forEach(node => { node.degree = 0; });
            edges.forEach(edge => {
                byId.get(edge.source).degree++;
                byId.get(edge.target).degree++;
            });
        }

        return { nodes, edges };
    };

    /**
     * 力导向布局（网格空间哈希斥力 + 边弹簧 + 向心力）。
     * @param {Array} nodes computeGraph 返回的节点（原地更新 x/y）
     * @param {Array} edges computeGraph 返回的边
     * @param {Object} options 布局参数
     * @returns {Array} nodes
     */
    const runForceLayout = (nodes, edges, options = {}) => {
        const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
        if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

        const width = opts.layoutWidth;
        const height = opts.layoutHeight;
        const margin = 90;

        // 初始位置：按轮次分列（时间线），同轮内上下抖动
        const turns = [...new Set(nodes.map(node => node.turn))].sort((a, b) => a - b);
        const turnIndex = new Map(turns.map((turn, index) => [turn, index]));
        const columnX = (index) => margin + (turns.length > 1 ? (index / (turns.length - 1)) : 0.5) * (width - margin * 2);
        nodes.forEach(node => {
            if (!Number.isFinite(node.x) || node.x === 0) {
                const index = turnIndex.get(node.turn) || 0;
                const jitter = ((node.sequence % 7) - 3) * 34 + ((Math.abs(node.turn * 13 + node.sequence * 7) % 100) - 50) * 0.8;
                node.x = columnX(index) + jitter;
                node.y = height / 2 + ((node.sequence % 5) - 2) * 58;
            }
            node.vx = 0;
            node.vy = 0;
        });

        const springEdges = (Array.isArray(edges) ? edges : []).filter(edge => edge?.source && edge?.target);
        const byId = new Map(nodes.map(node => [node.id, node]));

        const gridCell = 150;
        const grid = new Map();
        const gridKey = (x, y) => `${Math.floor(x / gridCell)}:${Math.floor(y / gridCell)}`;
        const clearGrid = () => grid.clear();
        const fillGrid = () => {
            nodes.forEach(node => {
                const key = gridKey(node.x, node.y);
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push(node);
            });
        };
        const getNearby = (node) => {
            const results = [];
            const cx = Math.floor(node.x / gridCell);
            const cy = Math.floor(node.y / gridCell);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const bucket = grid.get(`${cx + dx}:${cy + dy}`);
                    if (bucket) {
                        for (const other of bucket) {
                            if (other !== node) results.push(other);
                        }
                    }
                }
            }
            return results;
        };

        for (let iter = 0; iter < opts.layoutIterations; iter++) {
            clearGrid();
            fillGrid();

            // 斥力
            nodes.forEach(node => {
                const nearby = getNearby(node).slice(0, opts.maxRepulsionNeighbors);
                for (const other of nearby) {
                    const dx = node.x - other.x;
                    const dy = node.y - other.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = 70;
                    const dist = Math.max(Math.sqrt(distSq), minDist);
                    const force = opts.repulsion / (dist * dist);
                    node.vx += (dx / dist) * force;
                    node.vy += (dy / dist) * force;
                }
            });

            // 边弹簧
            springEdges.forEach(edge => {
                const a = byId.get(edge.source);
                const b = byId.get(edge.target);
                if (!a || !b) return;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
                const force = (dist - opts.springLength) * opts.springStrength;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                a.vx += fx;
                a.vy += fy;
                b.vx -= fx;
                b.vy -= fy;
            });

            // 向心力 + 速度积分 + 阻尼
            nodes.forEach(node => {
                node.vx += (width / 2 - node.x) * opts.centering;
                node.vy += (height / 2 - node.y) * opts.centering;
                node.x += node.vx;
                node.y += node.vy;
                node.vx *= opts.damping;
                node.vy *= opts.damping;
                node.x = Math.max(8, Math.min(width - 8, node.x));
                node.y = Math.max(8, Math.min(height - 8, node.y));
            });
        }

        return nodes;
    };

    const findNodeAt = (nodes, x, y, radius = 16) => {
        const r2 = radius * radius;
        let best = null;
        let bestDist = r2;
        for (const node of nodes || []) {
            const dx = node.x - x;
            const dy = node.y - y;
            const dist = dx * dx + dy * dy;
            if (dist <= r2 && dist <= bestDist) {
                best = node;
                bestDist = dist;
            }
        }
        return best;
    };

    return {
        DEFAULT_OPTIONS,
        computeGraph,
        runForceLayout,
        findNodeAt,
        cosineSimilarity,
        extractTerms
    };
});
