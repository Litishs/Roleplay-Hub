
    'use strict';

    const createEmptyProfile = () => ({
        characters: [],
        relations: [],
        openPlots: [],
        updatedAt: 0
    });

    const normalizeProfile = (profile) => {
        const source = profile && typeof profile === 'object' ? profile : {};
        return {
            characters: Array.isArray(source.characters) ? source.characters : [],
            relations: Array.isArray(source.relations) ? source.relations : [],
            openPlots: Array.isArray(source.openPlots) ? source.openPlots : [],
            updatedAt: Number(source.updatedAt) || 0
        };
    };

    const relationKey = (edge) => `${String(edge?.from || '').trim()}|${String(edge?.to || '').trim()}|${String(edge?.relation || '').trim()}`;

    const isValidRelation = (edge) => (
        edge && typeof edge === 'object'
        && String(edge.from || '').trim()
        && String(edge.to || '').trim()
        && String(edge.relation || '').trim()
    );

    /**
     * 合并关系边：同键命中则更新 status/updatedTurn，否则追加。
     * @param {Array} incoming 模型输出的新关系边
     * @param {Object} profile 当前固定信息卡
     * @param {number} [turn]
     * @returns {{relations:Array, added:number, updated:number}}
     */
    const mergeRelations = (incoming, profile, turn = 0) => {
        const current = normalizeProfile(profile);
        const map = new Map(current.relations.map(edge => [relationKey(edge), { ...edge }]));
        let added = 0;
        let updated = 0;
        (Array.isArray(incoming) ? incoming : []).forEach(edge => {
            if (!isValidRelation(edge)) return;
            const key = relationKey(edge);
            const normalized = {
                from: String(edge.from).trim(),
                to: String(edge.to).trim(),
                relation: String(edge.relation).trim(),
                status: edge.status === 'ended' ? 'ended' : 'active',
                updatedTurn: Number(edge.updatedTurn) || turn
            };
            if (map.has(key)) {
                const old = map.get(key);
                if (old.status !== normalized.status || old.updatedTurn !== normalized.updatedTurn) {
                    map.set(key, { ...old, ...normalized });
                    updated++;
                }
            } else {
                map.set(key, normalized);
                added++;
            }
        });
        return {
            relations: [...map.values()],
            added,
            updated
        };
    };

    /**
     * 合并角色状态：按名字去重，同名字则刷新状态文本。
     * 每次输出（含未变化）都刷新 lastSeenTurn，供注入时做过期标注（v4）。
     * @param {Array} incoming
     * @param {Object} profile
     * @param {number} [turn]
     * @returns {{characters:Array, added:number, updated:number}}
     */
    const mergeCharacters = (incoming, profile, turn = 0) => {
        const current = normalizeProfile(profile);
        const map = new Map(current.characters.map(char => [String(char.name || '').trim(), { ...char }]));
        let added = 0;
        let updated = 0;
        (Array.isArray(incoming) ? incoming : []).forEach(char => {
            const name = String(char?.name || '').trim();
            if (!name) return;
            const normalized = {
                name,
                status: String(char.status || '').trim(),
                updatedTurn: Number(char.updatedTurn) || turn,
                lastSeenTurn: turn
            };
            if (map.has(name)) {
                const old = map.get(name);
                if (old.status !== normalized.status) {
                    map.set(name, { ...old, ...normalized, lastSeenTurn: turn });
                    updated++;
                } else {
                    map.set(name, { ...old, lastSeenTurn: turn });
                }
            } else {
                map.set(name, normalized);
                added++;
            }
        });
        return {
            characters: [...map.values()],
            added,
            updated
        };
    };

    /**
     * 合并未决伏笔：按 summary 去重；状态 closed 时保留但标记关闭；重复输出刷新 lastSeenTurn。
     */
    const mergeOpenPlots = (incoming, profile, turn = 0) => {
        const current = normalizeProfile(profile);
        const map = new Map(current.openPlots.map(plot => [String(plot.summary || '').trim(), { ...plot }]));
        let added = 0;
        (Array.isArray(incoming) ? incoming : []).forEach(plot => {
            const summary = String(plot?.summary || '').trim();
            if (!summary) return;
            const normalized = {
                summary,
                status: plot.status === 'closed' ? 'closed' : 'open',
                deadline: String(plot.deadline || '').trim(),
                updatedTurn: Number(plot.updatedTurn) || turn,
                lastSeenTurn: turn
            };
            if (!map.has(summary)) {
                map.set(summary, normalized);
                added++;
            } else {
                const old = map.get(summary);
                if (old.status !== normalized.status || old.deadline !== normalized.deadline) {
                    map.set(summary, { ...old, ...normalized, lastSeenTurn: turn });
                } else {
                    map.set(summary, { ...old, lastSeenTurn: turn });
                }
            }
        });
        return { openPlots: [...map.values()], added };
    };

    /**
     * 构建注入文本（{{user}} 为中心，紧凑格式）。
     * v4：距 currentTurn 超过 staleAfter 轮未再出现（lastSeenTurn）的条目追加过期标注，不删除数据。
     */
    const buildProfileContext = (profile, options = {}) => {
        const current = normalizeProfile(profile);
        const userRoleName = String(options.userRoleName || '我').trim();
        const currentTurn = Math.max(0, Math.floor(Number(options.currentTurn) || 0));
        const staleAfter = Math.max(1, Math.floor(Number(options.staleAfter) || 40));
        const staleNote = (entry) => {
            const lastSeenTurn = Math.floor(Number(entry?.lastSeenTurn) || 0);
            if (!currentTurn || !lastSeenTurn) return '';
            return currentTurn - lastSeenTurn >= staleAfter ? `（第${lastSeenTurn}轮后未再出现）` : '';
        };
        const parts = [];
        const activeCharacters = current.characters.filter(char => String(char.status || '').trim());
        if (activeCharacters.length > 0) {
            const lines = activeCharacters.map(char => `${char.name}:${char.status}${staleNote(char)}`);
            parts.push(`<character_status>${lines.join('; ')}</character_status>`);
        }
        const open = current.openPlots.filter(plot => plot.status !== 'closed');
        if (open.length > 0) {
            const lines = open.map(plot => {
                const label = plot.deadline ? `${plot.summary}（${plot.deadline}）` : plot.summary;
                return `${label}${staleNote(plot)}`;
            });
            parts.push(`<open_plots>${lines.join('; ')}</open_plots>`);
        }
        if (parts.length === 0) return '';
        return [
            '<role_profile>',
            `  <description>以下为记忆动态信息卡：剧情中变化的角色动态状态与未决伏笔；静态角色关系以世界书为准，不在此重复。</description>`,
            ...parts.map(part => indent(part, 2)),
            '</role_profile>'
        ].join('\n');
    };

    const indent = (text, spaces) => {
        const pad = ' '.repeat(spaces);
        return String(text).split('\n').map(line => `${pad}${line}`).join('\n');
    };

    /**
     * 关系视图数据：径向布局用——中心 {{user}}，直接相连角色为第一圈，其余角色为外圈。
     * @returns {{center:string, nodes:Array<{id:string,label:string,radius:number}>, edges:Array<{from:string,to:string,relation:string}>}}
     */
    const buildRelationViewData = (profile, options = {}) => {
        const current = normalizeProfile(profile);
        const userRoleName = String(options.userRoleName || '我').trim();
        const active = current.relations.filter(edge => edge.status !== 'ended');
        const direct = new Set();
        active.forEach(edge => {
            if (edge.from === userRoleName) direct.add(edge.to);
            if (edge.to === userRoleName) direct.add(edge.from);
        });
        const nodes = [{ id: userRoleName, label: userRoleName, radius: 0 }];
        const others = new Set();
        active.forEach(edge => {
            if (edge.from !== userRoleName && edge.to !== userRoleName) {
                others.add(edge.from);
                others.add(edge.to);
            } else {
                if (edge.from !== userRoleName) direct.add(edge.from);
                if (edge.to !== userRoleName) direct.add(edge.to);
            }
        });
        direct.forEach(name => {
            if (name !== userRoleName) nodes.push({ id: name, label: name, radius: 1 });
        });
        others.forEach(name => {
            if (name !== userRoleName && !direct.has(name)) nodes.push({ id: name, label: name, radius: 2 });
        });
        return {
            center: userRoleName,
            nodes,
            edges: active.map(edge => ({ from: edge.from, to: edge.to, relation: edge.relation }))
        };
    };

    

export { createEmptyProfile, normalizeProfile, relationKey, mergeRelations, mergeCharacters, mergeOpenPlots, buildProfileContext, buildRelationViewData };


