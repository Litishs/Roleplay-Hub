/**
 * RPHStoryBranch — 剧情分支（纯逻辑，零 DOM 依赖）
 *
 * 目标：给角色对话提供"分支"能力（从某一轮剧情分叉出平行路线）。
 *   - 作用域约定：分支聊天/记忆以「角色uuid__branch__分支id」为存储键，
 *     与上游 localStorage 的 scoped key 模型同构，原生行存储零改动。
 *   - 纯函数：分支列表归一化、子树收集、树形图布局，均可 Node 单测。
 *
 * 可在 Node 环境直接 import 用于测试。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RPHStoryBranch = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAIN_ID = 'main';
    const SCOPE_SEPARATOR = '__branch__';

    const createId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    };

    /** 角色级 id → 分支作用域 id（主线不拼接，保持与旧数据兼容）。 */
    const getScopeId = (characterId, branchId = MAIN_ID) => {
        if (!characterId) return null;
        if (!branchId || branchId === MAIN_ID) return String(characterId);
        return `${characterId}${SCOPE_SEPARATOR}${branchId}`;
    };

    /** 分支作用域 id → 角色 uuid（截断分隔符之后的部分）。 */
    const getOwnerId = (scopeId) => {
        const value = String(scopeId || '');
        const separatorIndex = value.indexOf(SCOPE_SEPARATOR);
        if (separatorIndex <= 0) return value || null;
        return value.slice(0, separatorIndex);
    };

    const isBranchScopeId = (scopeId) => String(scopeId || '').includes(SCOPE_SEPARATOR);

    const defaultBranchName = (count) => `分支 ${Math.max(1, count)}`;

    const createMainBranch = (char) => ({
        id: MAIN_ID,
        name: '主线',
        parentId: null,
        createdAt: Number(char?.createdAt) || Date.now(),
        updatedAt: Date.now(),
        forkFloor: 0,
        floorCount: 0,
        messageCount: 0,
        wordCount: 0
    });

    /** 归一化存储的分支列表：补主线、去重、修 parentId、规范化字段。 */
    const normalizeBranches = (char, saved) => {
        const source = Array.isArray(saved?.branches) ? saved.branches : [];
        const seen = new Set();
        const branches = source.map((branch, index) => {
            const id = String(branch?.id || '').trim();
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const fallbackName = id === MAIN_ID ? '主线' : defaultBranchName(index + 1);
            const name = id === MAIN_ID
                ? '主线'
                : String(branch?.name || fallbackName).trim().replace(/^路线(?=\s*\d+$)/, '分支');
            return {
                id,
                name: name.slice(0, 30),
                parentId: id === MAIN_ID ? null : (String(branch?.parentId || MAIN_ID)),
                createdAt: Number(branch?.createdAt) || Date.now(),
                updatedAt: Number(branch?.updatedAt) || Number(branch?.createdAt) || Date.now(),
                forkFloor: Math.max(0, Number(branch?.forkFloor) || 0),
                floorCount: Math.max(0, Number(branch?.floorCount) || 0),
                messageCount: Math.max(0, Number(branch?.messageCount) || 0),
                wordCount: Math.max(0, Number(branch?.wordCount) || 0)
            };
        }).filter(Boolean);
        if (!seen.has(MAIN_ID)) branches.unshift(createMainBranch(char));
        const validIds = new Set(branches.map(branch => branch.id));
        branches.forEach(branch => {
            if (branch.id !== MAIN_ID && !validIds.has(branch.parentId)) {
                branch.parentId = MAIN_ID;
            }
        });
        return branches;
    };

    /** 收集某分支及其全部子分支的 id（删除级联用）。 */
    const collectSubtreeIds = (branches, branchId) => {
        const childrenByParent = new Map();
        branches.forEach(branch => {
            if (!childrenByParent.has(branch.parentId)) childrenByParent.set(branch.parentId, []);
            childrenByParent.get(branch.parentId).push(branch.id);
        });
        const result = new Set();
        const stack = [branchId];
        while (stack.length > 0) {
            const current = stack.pop();
            if (result.has(current)) continue;
            result.add(current);
            stack.push(...(childrenByParent.get(current) || []));
        }
        return [...result];
    };

    const formatWordCount = (count) => {
        const value = Math.max(0, Number(count) || 0);
        if (value >= 10000) {
            const formatted = (value / 10000).toFixed(1).replace(/\.?0+$/, '');
            return `${formatted}W`;
        }
        if (value >= 1000) {
            const formatted = (value / 1000).toFixed(1).replace(/\.?0+$/, '');
            return `${formatted}k`;
        }
        return String(value);
    };

    /**
     * 纵向树形布局：返回分支图节点与连线（SVG path）。
     * branches 需已归一化（含 main）；activeId/selectedId 用于高亮路由。
     * overrides: { activeFloorCount, activeWordCount } — 当前分支的实时统计。
     */
    const buildBranchTree = (branches, activeId = MAIN_ID, selectedId = MAIN_ID, overrides = {}) => {
        const NODE_WIDTH = 124;
        const NODE_HEIGHT = 64;
        const HORIZONTAL_GAP = 28;
        const LEVEL_GAP = 70;
        const PADDING_X = 28;
        const PADDING_Y = 30;
        const branchesById = new Map(branches.map(branch => [branch.id, branch]));
        const childrenByParent = new Map();
        branches.forEach(branch => {
            const parentId = branch.parentId || null;
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push(branch);
        });
        childrenByParent.forEach(children => children.sort((a, b) => a.createdAt - b.createdAt));

        const positions = new Map();
        const visiting = new Set();
        let leafIndex = 0;
        let maxDepth = 0;
        const placeBranch = (branch, depth) => {
            if (positions.has(branch.id)) return positions.get(branch.id).centerX;
            if (visiting.has(branch.id)) return PADDING_X + NODE_WIDTH / 2;
            visiting.add(branch.id);
            maxDepth = Math.max(maxDepth, depth);
            const childCenters = (childrenByParent.get(branch.id) || [])
                .filter(child => child.id !== branch.id)
                .map(child => placeBranch(child, depth + 1));
            const centerX = childCenters.length > 0
                ? childCenters.reduce((total, value) => total + value, 0) / childCenters.length
                : PADDING_X + NODE_WIDTH / 2 + leafIndex++ * (NODE_WIDTH + HORIZONTAL_GAP);
            const y = PADDING_Y + depth * (NODE_HEIGHT + LEVEL_GAP);
            positions.set(branch.id, {
                x: centerX - NODE_WIDTH / 2,
                y,
                centerX,
                centerY: y + NODE_HEIGHT / 2,
                depth
            });
            visiting.delete(branch.id);
            return centerX;
        };
        const roots = branches
            .filter(branch => !branch.parentId || !branchesById.has(branch.parentId))
            .sort((a, b) => (a.id === MAIN_ID ? -1 : b.id === MAIN_ID ? 1 : a.createdAt - b.createdAt));
        roots.forEach(branch => placeBranch(branch, 0));
        branches.forEach(branch => {
            if (!positions.has(branch.id)) placeBranch(branch, 0);
        });

        const collectRouteIds = (startId) => {
            const ids = new Set();
            let branch = branchesById.get(startId);
            while (branch && !ids.has(branch.id)) {
                ids.add(branch.id);
                branch = branchesById.get(branch.parentId);
            }
            return ids;
        };
        const activeRouteIds = collectRouteIds(activeId);
        const selectedRouteIds = collectRouteIds(selectedId);
        const routeColumns = Math.max(1, leafIndex);
        const naturalWidth = PADDING_X * 2 + routeColumns * NODE_WIDTH + (routeColumns - 1) * HORIZONTAL_GAP;
        const canvasWidth = Math.max(360, naturalWidth);
        const horizontalOffset = (canvasWidth - naturalWidth) / 2;
        const naturalHeight = PADDING_Y * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * LEVEL_GAP;
        const canvasHeight = Math.max(170, naturalHeight);
        const verticalOffset = (canvasHeight - naturalHeight) / 2;

        const nodes = branches.map(branch => {
            const position = positions.get(branch.id);
            const isActive = branch.id === activeId;
            const wordCount = isActive ? (overrides.activeWordCount ?? branch.wordCount) : branch.wordCount;
            return {
                ...branch,
                ...position,
                x: position.x + horizontalOffset,
                y: position.y + verticalOffset,
                centerX: position.centerX + horizontalOffset,
                centerY: position.centerY + verticalOffset,
                isActive,
                isSelected: branch.id === selectedId,
                isOnActiveRoute: activeRouteIds.has(branch.id),
                isOnSelectedRoute: selectedRouteIds.has(branch.id),
                floorCount: isActive ? (overrides.activeFloorCount ?? branch.floorCount) : branch.floorCount,
                wordCount,
                wordCountText: formatWordCount(wordCount)
            };
        });
        const links = nodes.filter(node => positions.has(node.parentId)).map(node => {
            const parent = positions.get(node.parentId);
            const startX = parent.centerX + horizontalOffset;
            const startY = parent.y + verticalOffset + NODE_HEIGHT;
            const endX = node.centerX;
            const endY = node.y;
            const middleY = (startY + endY) / 2;
            return {
                id: `${node.parentId}-${node.id}`,
                path: `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`,
                isActive: activeRouteIds.has(node.id),
                isSelected: selectedRouteIds.has(node.id)
            };
        });
        return { nodes, links, width: canvasWidth, height: canvasHeight };
    };

    return {
        MAIN_ID,
        SCOPE_SEPARATOR,
        createId,
        getScopeId,
        getOwnerId,
        isBranchScopeId,
        defaultBranchName,
        createMainBranch,
        normalizeBranches,
        collectSubtreeIds,
        buildBranchTree,
        formatWordCount
    };
}));
