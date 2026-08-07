/**
 * RPHMemorySchema — 差异式动态记忆（事实层）纯逻辑模块
 *
 * P1 差异式事实层：
 *   - 事实类型：entity / relation / event / state / plot / quote / arc / meta / audit
 *   - 幂等去重：按类型化 dedupKey（同一实体/关系/状态 = 同一事实）
 *   - 版本化：同 key 新值写入后旧值 status=superseded（保留版本链）
 *   - 冲突检测：乱序/无法判定新旧时标记 conflict，不自动覆盖
 *   - 整理候选：旧事件滚入剧情弧、陈旧事实进回收站、超期可清理
 *   - 审计：每次自动改动追加 audit 记录
 *
 * 零 DOM 依赖，可在 Node 环境直接 import 用于测试。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RPHMemorySchema = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SCHEMA_VERSION = 2;

    const FACT_TYPES = Object.freeze([
        'entity', 'relation', 'event', 'state', 'plot', 'quote'
    ]);

    const STATUSES = Object.freeze([
        'current', 'superseded', 'conflict', 'rolled', 'archived'
    ]);

    const ANCHOR_FIELDS = Object.freeze([
        'storyDay', 'segment', 'minutes', 'timeKey',
        'anchorConfidence', 'anchorSource', 'relativeTime'
    ]);

    const SEGMENT_MINUTES = Object.freeze({
        '清晨': 120, '上午': 300, '正午': 420, '下午': 540,
        '傍晚': 630, '入夜': 660, '深夜': 780, '子夜': 960
    });

    const DEFAULT_OPTIONS = Object.freeze({
        arcTurnWindow: 20,          // 每多少轮一个剧情弧分组
        arcMinEvents: 3,            // 少于该事件数不滚弧
        arcRetainTurns: 60,         // 早于最近 N 轮的事件进入滚弧候选
        archiveDays: 7,             // superseded/rolled 超过该天数进回收站
        pruneDays: 30,              // 回收站内超过该天数可物理清理
        pruneMinImportance: 0.5     // importance 低于该值的才可清理
    });

    const now = () => Date.now();

    const stableStringify = (value) => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        const keys = Object.keys(value).sort();
        return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    };

    const hashString = (text) => {
        let hash = 0;
        const clean = String(text || '');
        for (let i = 0; i < clean.length; i++) {
            hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    };

    const pick = (value, keys) => {
        const output = {};
        keys.forEach(key => {
            if (value && value[key] !== undefined && value[key] !== null && value[key] !== '') {
                output[key] = value[key];
            }
        });
        return output;
    };

    const normalizeText = (value, maxLength = 600) => {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    };

    const normalizeAnchor = (raw, turn = 0) => {
        const storyDay = Number(raw?.storyDay);
        const segment = Object.prototype.hasOwnProperty.call(SEGMENT_MINUTES, raw?.segment) ? raw.segment : null;
        const rawMinutes = raw?.minutes;
        const hasMinutes = rawMinutes !== null && rawMinutes !== undefined && rawMinutes !== ''
            && Number.isFinite(Number(rawMinutes)) && Number(rawMinutes) >= 0;
        const minutes = hasMinutes ? Number(rawMinutes) : NaN;
        const segmentMinutes = segment ? SEGMENT_MINUTES[segment] : null;
        const resolvedMinutes = hasMinutes ? Math.min(1439, Math.floor(minutes)) : segmentMinutes;
        const day = Number.isFinite(storyDay) ? Math.max(0, Math.floor(storyDay)) : null;
        return {
            storyDay: day,
            segment,
            minutes: resolvedMinutes,
            timeKey: day !== null ? day * 1440 + (resolvedMinutes || 0) : (raw?.timeKey !== undefined ? Number(raw.timeKey) : null),
            anchorConfidence: raw?.anchorConfidence === 'low' || raw?.anchorConfidence === 'medium'
                ? raw.anchorConfidence
                : raw?.anchorConfidence === 'high' ? 'high' : 'low',
            anchorSource: String(raw?.anchorSource || 'unresolved'),
            relativeTime: normalizeText(raw?.relativeTime, 120)
        };
    };

    const buildEventId = (raw, turn = 0) => {
        if (raw?.eventId && String(raw.eventId).trim()) return normalizeText(raw.eventId, 80);
        const day = Number(raw?.storyDay);
        const participants = Array.isArray(raw?.participants)
            ? [...raw.participants].map(p => normalizeText(p, 80)).filter(Boolean).sort().join('+')
            : '';
        const stem = normalizeText(raw?.summary || raw?.sourceText || '', 24);
        const dayPart = Number.isFinite(day) ? day : Math.max(0, Number(raw?.sourceTurn) || 0);
        return `ev:${dayPart}:${hashString(`${participants}|${stem}`)}`;
    };

    const normalizeForCompare = (text) => String(text || '')
        .replace(/\s+/g, '')
        .replace(/[，。、“”‘’：；！？,.!?;:"'`~（）()【】\[\]<>《》]/g, '');

    const bigrams = (text) => {
        const clean = normalizeForCompare(text);
        const set = new Set();
        for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
        return set;
    };

    /**
     * 文本冗余判定（bigram 重叠 / 较短文本 bigram 数），用于"复述不新增"的语义去重降级实现。
     * 阈值按文本口径取 0.5；未来接入本地 embedding 时按余弦 ≥0.85 升级。
     */
    const isRedundantText = (a, b, threshold = 0.5) => {
        const setA = bigrams(a);
        const setB = bigrams(b);
        if (setA.size === 0 || setB.size === 0) return false;
        let intersection = 0;
        for (const gram of setA) if (setB.has(gram)) intersection++;
        const min = Math.min(setA.size, setB.size);
        return min > 0 && intersection / min >= threshold;
    };

    const arrayOverlap = (a, b) => {
        const set = new Set((Array.isArray(b) ? b : []).map(x => String(x || '')));
        return (Array.isArray(a) ? a : []).some(x => set.has(String(x || '')));
    };

    /**
     * 事实的稳定去重键。同一键视为同一事实，新值写入时旧值降级。
     */
    const getDedupKey = (fact) => {
        const type = String(fact?.type || '');
        switch (type) {
            case 'entity':
                return `e:${normalizeText(fact.name, 80)}`.toLowerCase();
            case 'relation':
                return `r:${normalizeText(fact.from, 80)}|${normalizeText(fact.relKind || fact.kind, 40)}|${normalizeText(fact.to, 80)}`.toLowerCase();
            case 'state':
                return `s:${normalizeText(fact.subject, 80)}|${normalizeText(fact.aspect, 80)}`.toLowerCase();
            case 'event':
                return `ev:${normalizeText(fact.eventId, 80)}`.toLowerCase();
            case 'plot':
                return `p:${hashString(fact.summary)}`.toLowerCase();
            case 'quote':
                return `q:${normalizeText(fact.speaker, 80)}|${hashString(fact.text)}`.toLowerCase();
            default:
                return `${type}:${hashString(stableStringify(fact))}`.toLowerCase();
        }
    };

    /**
     * 事实的"值载荷"：用于判断同 key 事实内容是否变化。
     */
    const getValuePayload = (fact) => {
        const type = String(fact?.type || '');
        switch (type) {
            case 'entity':
                return stableStringify(fact.attrs || {});
            case 'relation':
                return stableStringify(pick(fact, ['relKind', 'strength', 'attitude', 'trust', 'note']));
            case 'state':
                return stableStringify({ value: fact.value, changedFrom: fact.changedFrom });
            case 'event':
                return stableStringify(pick(fact, ['summary', 'participants', 'inStoryTime']));
            case 'plot':
                return stableStringify(pick(fact, ['summary', 'plotStatus']));
            case 'quote':
                return stableStringify(pick(fact, ['text', 'note']));
            default:
                return stableStringify(fact);
        }
    };

    /**
     * 规范化一条事实，生成 id / 时间戳 / 默认字段。
     */
    const normalizeFact = (raw, meta = {}) => {
        const type = String(raw?.type || '').toLowerCase();
        if (!FACT_TYPES.includes(type)) return null;
        const turn = Math.max(0, Number(meta.turn) || Number(raw.sourceTurn) || 0);
        const nowTs = now();
        const anchor = normalizeAnchor(raw, turn);
        const base = {
            id: String(raw.id || `${type}:${turn}:${hashString(stableStringify(raw) + nowTs)}`),
            kind: type,
            type,
            status: STATUSES.includes(raw.status) ? raw.status : 'current',
            sourceTurn: turn,
            ...ANCHOR_FIELDS.reduce((acc, field) => {
                acc[field] = anchor[field];
                return acc;
            }, {}),
            createdAt: Number(raw.createdAt) || nowTs,
            updatedAt: Number(raw.updatedAt) || nowTs,
            importance: Math.max(0, Math.min(1, Number(raw.importance) || 0.6)),
            accessCount: Number(raw.accessCount) || 0,
            lastAccessedAt: Number(raw.lastAccessedAt) || 0
        };
        switch (type) {
            case 'entity':
                return {
                    ...base,
                    name: normalizeText(raw.name, 80),
                    attrs: (raw.attrs || raw.attributes) && typeof (raw.attrs || raw.attributes) === 'object'
                        ? (raw.attrs || raw.attributes)
                        : {}
                };
            case 'relation':
                return {
                    ...base,
                    from: normalizeText(raw.from, 80),
                    relKind: normalizeText(raw.kind || raw.relKind, 40),
                    to: normalizeText(raw.to, 80),
                    strength: Math.max(0, Math.min(1, Number(raw.strength) || 0.5)),
                    attitude: normalizeText(raw.attitude, 120),
                    trust: Math.max(0, Math.min(1, Number(raw.trust) || 0.5)),
                    validFrom: anchor.timeKey !== null && anchor.timeKey !== undefined ? anchor.timeKey : null,
                    validUntil: raw.validUntil !== undefined && raw.validUntil !== null ? Number(raw.validUntil) : null
                };
            case 'event':
                return {
                    ...base,
                    eventId: buildEventId(raw, turn),
                    inStoryTime: normalizeText(raw.inStoryTime, 80),
                    summary: normalizeText(raw.summary, 900),
                    participants: Array.isArray(raw.participants)
                        ? raw.participants.map(p => normalizeText(p, 80)).filter(Boolean)
                        : []
                };
            case 'state':
                return {
                    ...base,
                    subject: normalizeText(raw.subject, 80),
                    aspect: normalizeText(raw.aspect, 80),
                    value: normalizeText(raw.value, 300),
                    changedFrom: normalizeText(raw.changedFrom, 300),
                    validFrom: anchor.timeKey !== null && anchor.timeKey !== undefined ? anchor.timeKey : null,
                    validUntil: raw.validUntil !== undefined && raw.validUntil !== null ? Number(raw.validUntil) : null
                };
            case 'plot':
                return {
                    ...base,
                    summary: normalizeText(raw.summary, 400),
                    plotStatus: raw.status === 'closed' ? 'closed' : 'open',
                    relatedEntities: Array.isArray(raw.relatedEntities)
                        ? raw.relatedEntities.map(e => normalizeText(e, 80)).filter(Boolean)
                        : [],
                    deadline: raw.deadline !== undefined && raw.deadline !== null ? Number(raw.deadline) : null,
                    deadlineText: normalizeText(raw.deadlineText, 120)
                };
            case 'quote':
                return {
                    ...base,
                    speaker: normalizeText(raw.speaker, 80),
                    text: normalizeText(raw.text, 500),
                    note: normalizeText(raw.note, 120)
                };
            default:
                return null;
        }
    };

    /**
     * 合并一批新事实到现有事实列表（幂等 + 版本化 + 冲突标记）。
     * @param {Array} existing 现有事实数组
     * @param {Array} incoming 新抽取的事实数组
     * @param {Object} meta { turn }
     * @returns {{facts: Array, added: number, superseded: number, conflicts: number}}
     */
    const mergeFacts = (existing, incoming, meta = {}) => {
        const facts = (Array.isArray(existing) ? existing : []).map(fact => ({ ...fact }));
        const turn = Math.max(0, Number(meta.turn) || 0);
        const byKey = new Map();
        facts.forEach(fact => {
            const key = getDedupKey(fact);
            if (!byKey.has(key) || fact.status === 'current') byKey.set(key, fact);
        });

        let added = 0;
        let superseded = 0;
        let conflicts = 0;
        let merged = 0;
        let redundant = 0;

        (Array.isArray(incoming) ? incoming : []).forEach(raw => {
            const fact = normalizeFact(raw, { turn });
            if (!fact) return;

            // 事件：同一 eventId = 同一事件的延续 → 追加描述，不新增
            if (fact.type === 'event') {
                const key = getDedupKey(fact);
                const existingEvent = byKey.get(key);
                if (existingEvent && existingEvent.status === 'current') {
                    existingEvent.summary = [existingEvent.summary, fact.summary].filter(Boolean).join('\n');
                    existingEvent.updatedAt = Math.max(existingEvent.updatedAt, fact.updatedAt);
                    const participantSet = new Set([
                        ...(existingEvent.participants || []),
                        ...(fact.participants || [])
                    ]);
                    existingEvent.participants = [...participantSet];
                    merged++;
                    return;
                }
                // 复述检测：同参与者 + 高相似摘要 → 视为同一事件的重复提取，不新增
                const duplicateEvent = facts.find(f => f.type === 'event' && f.status === 'current' && f.id !== fact.id
                    && (f.storyDay === fact.storyDay || (f.storyDay == null && fact.storyDay == null))
                    && arrayOverlap(f.participants, fact.participants)
                    && isRedundantText(f.summary, fact.summary));
                if (duplicateEvent) {
                    redundant++;
                    return;
                }
            }

            const key = getDedupKey(fact);
            const existingFact = byKey.get(key);
            if (!existingFact || existingFact.status !== 'current') {
                facts.push(fact);
                byKey.set(key, fact);
                added++;
                return;
            }
            if (getValuePayload(existingFact) === getValuePayload(fact)) {
                existingFact.updatedAt = Math.max(existingFact.updatedAt, fact.updatedAt);
                return;
            }
            // 内容不同：新轮次覆盖旧轮次，旧值降级；乱序（旧轮次）标记冲突
            if (turn > 0 && fact.sourceTurn <= existingFact.sourceTurn) {
                facts.push({ ...fact, status: 'conflict' });
                conflicts++;
                return;
            }
            if (fact.type === 'state' || fact.type === 'relation') {
                // 区间更新：旧值关闭区间，新值开启
                existingFact.status = 'superseded';
                existingFact.validUntil = fact.timeKey !== null && fact.timeKey !== undefined ? fact.timeKey : null;
                if (fact.type === 'state') fact.changedFrom = existingFact.value;
                facts.push(fact);
                byKey.set(key, fact);
                added++;
                superseded++;
                return;
            }
            existingFact.status = 'superseded';
            facts.push(fact);
            byKey.set(key, fact);
            added++;
            superseded++;
        });

        return { facts, added, superseded, conflicts, merged, redundant };
    };

    /**
     * 标记一次访问（召回命中时调用）。
     */
    const touchFact = (fact, at = now()) => {
        if (!fact) return null;
        fact.accessCount = Number(fact.accessCount) || 0;
        fact.accessCount += 1;
        fact.importance = Math.min(1, (Number(fact.importance) || 0.6) + 0.02);
        fact.lastAccessedAt = at;
        return fact;
    };

    /**
     * 计算整理候选：
     *   - rollUp：早于保留窗口的事件按轮次分桶，桶内事件数达标则成为滚弧候选
     *   - archive：superseded/rolled 且超期 → 进回收站
     *   - prune：回收站内超期且低重要度 → 可物理清理
     * @returns {{rollUp: Array, archive: Array, prune: Array}}
     */
    const computeMaintenanceCandidates = (facts, options = {}, nowTs = now()) => {
        const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
        const list = Array.isArray(facts) ? facts : [];
        const latestTurn = list.reduce((max, fact) => Math.max(max, Number(fact.sourceTurn) || 0), 0);
        const archiveBefore = nowTs - opts.archiveDays * 24 * 3600 * 1000;
        const pruneBefore = nowTs - opts.pruneDays * 24 * 3600 * 1000;

        const archive = [];
        const prune = [];

        list.forEach(fact => {
            if ((fact.status === 'superseded' || fact.status === 'rolled') && fact.updatedAt < archiveBefore) {
                archive.push(fact);
            }
            if (fact.status === 'archived'
                && fact.updatedAt < pruneBefore
                && (Number(fact.importance) || 0) < opts.pruneMinImportance) {
                prune.push(fact);
            }
        });

        const rollUpEvents = list
            .filter(fact => fact.type === 'event' && fact.status === 'current')
            .filter(fact => latestTurn - (Number(fact.sourceTurn) || 0) >= opts.arcRetainTurns)
            .sort((a, b) => (a.sourceTurn || 0) - (b.sourceTurn || 0));

        const buckets = new Map();
        rollUpEvents.forEach(fact => {
            const bucket = Math.floor((fact.sourceTurn || 0) / opts.arcTurnWindow);
            if (!buckets.has(bucket)) buckets.set(bucket, []);
            buckets.get(bucket).push(fact);
        });

        const rollUp = [...buckets.entries()]
            .filter(([, events]) => events.length >= opts.arcMinEvents)
            .map(([bucket, events]) => ({
                bucket,
                startTurn: events[0].sourceTurn,
                endTurn: events[events.length - 1].sourceTurn,
                events,
                summarySource: events.map(event => `[第${event.sourceTurn}轮] ${event.summary}`).join('\n')
            }));

        return { rollUp, archive, prune };
    };

    const createArc = (candidate, meta = {}) => ({
        id: String(meta.id || `arc:${candidate.startTurn}-${candidate.endTurn}`),
        kind: 'arc',
        type: 'arc',
        status: 'current',
        startTurn: candidate.startTurn,
        endTurn: candidate.endTurn,
        eventIds: candidate.events.map(event => event.id),
        summary: candidate.summarySource,
        sourceTurn: candidate.endTurn,
        createdAt: now(),
        updatedAt: now(),
        importance: 1
    });

    const createAudit = (action, detail = {}) => ({
        id: `audit:${now().toString(36)}:${hashString(stableStringify(detail))}`,
        kind: 'audit',
        type: 'audit',
        action,
        detail,
        createdAt: now()
    });

    const stripFences = (text) => {
        const cleaned = String(text || '').trim();
        if (!cleaned) return '';
        const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        return (fenced ? fenced[1] : cleaned).trim();
    };

    const tryParseFacts = (text) => {
        const jsonText = stripFences(text);
        if (!jsonText) return null;
        try {
            const data = JSON.parse(jsonText);
            if (Array.isArray(data?.facts)) return data.facts;
            if (Array.isArray(data)) return data;
        } catch (_) { }
        return null;
    };

    /**
     * 解析副模型的事实抽取响应，兼容：
     *   1) 直接返回 {"facts":[...]} 或数组
     *   2) 标准 chat/completions 信封（content/text 内嵌 JSON，含 Markdown 围栏）
     *   3) SSE 强制流式（逐 data: 行拼接）
     */
    const parseFactResponse = (rawText) => {
        const direct = tryParseFacts(rawText);
        if (direct) return direct;

        try {
            const envelope = JSON.parse(rawText);
            const choice = envelope?.choices?.[0];
            if (choice) {
                const content = choice.message?.content ?? choice.text ?? '';
                const fromContent = tryParseFacts(content);
                if (fromContent) return fromContent;
            }
        } catch (_) { }

        let content = '';
        String(rawText || '').split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) return;
            const payload = trimmed.replace(/^data:\s*/, '');
            if (!payload || payload === '[DONE]') return;
            try {
                const data = JSON.parse(payload);
                const choice = data.choices?.[0];
                content += (choice?.delta?.content || choice?.message?.content || choice?.text || '');
            } catch (_) { }
        });
        const streamed = tryParseFacts(content);
        if (streamed) return streamed;
        throw new Error('副模型没有返回有效的事实 JSON');
    };

    /**
     * 本地降级基线：不依赖 LLM，从开场白构建最小动态基线。
     */
    const buildLocalBaseline = (character, user = {}, meta = {}) => {
        const charName = normalizeText(character?.name, 80) || '角色';
        const userName = normalizeText(user?.name, 80) || '用户';
        const firstMes = normalizeText(character?.first_mes || character?.firstMes || '', 900);
        const description = normalizeText(character?.description || '', 900);
        const turn = Math.max(0, Number(meta.turn) || 0);
        const nowTs = now();
        const facts = [];

        facts.push({
            type: 'entity',
            name: charName,
            attrs: {
                角色卡描述: description ? description.slice(0, 180) : ''
            }
        });
        facts.push({
            type: 'relation',
            from: userName,
            kind: '认识',
            to: charName,
            strength: 0.3,
            attitude: '开场相遇'
        });
        if (firstMes) {
            facts.push({
                type: 'event',
                inStoryTime: '开场',
                summary: firstMes.slice(0, 220),
                participants: [charName, userName]
            });
        }

        return facts.map(fact => normalizeFact(fact, { turn }));
    };

    const unresolvedAnchor = (relative = '', turn = 0) => ({
        storyDay: null,
        segment: null,
        minutes: null,
        timeKey: null,
        anchorConfidence: 'low',
        anchorSource: 'unresolved',
        relativeTime: normalizeText(relative, 120)
    });

    /**
     * Schema v1 → v2 迁移：尽力按 inStoryTime/轮次锚定，不能锚定的标低置信度。
     * @param {Array} facts 旧事实数组
     * @param {Object} clock 当前剧情时钟
     * @param {Function} resolveFn resolve(expression, clock) → anchor
     */
    const migrateFactsV1toV2 = (facts, clock = {}, resolveFn = null) => {
        const resolver = typeof resolveFn === 'function' ? resolveFn : () => unresolvedAnchor();
        return (Array.isArray(facts) ? facts : []).map(fact => {
            const migrated = { ...fact };
            const hasAnchor = ANCHOR_FIELDS.some(field => migrated[field] !== undefined && migrated[field] !== null);
            if (!hasAnchor) {
                const expression = migrated.inStoryTime || migrated.deadlineText || migrated.relativeTime
                    || (migrated.type === 'event' ? '今天' : '');
                const anchor = expression
                    ? resolver(expression, clock)
                    : unresolvedAnchor(expression, migrated.sourceTurn || 0);
                const mappedAnchor = {
                    storyDay: anchor.storyDay,
                    segment: anchor.segment,
                    minutes: anchor.minutes,
                    anchorConfidence: anchor.confidence || anchor.anchorConfidence || 'low',
                    anchorSource: anchor.source || anchor.anchorSource || 'unresolved',
                    relativeTime: anchor.relative || anchor.relativeTime || expression
                };
                const normalizedAnchor = normalizeAnchor(mappedAnchor, migrated.sourceTurn || 0);
                ANCHOR_FIELDS.forEach(field => {
                    migrated[field] = normalizedAnchor[field];
                });
            }
            if (migrated.type === 'event') {
                migrated.eventId = buildEventId(migrated, migrated.sourceTurn || 0);
            }
            if (migrated.type === 'state' || migrated.type === 'relation') {
                if (migrated.validFrom === undefined) {
                    migrated.validFrom = migrated.timeKey !== null && migrated.timeKey !== undefined ? migrated.timeKey : null;
                }
                if (migrated.validUntil === undefined) migrated.validUntil = null;
            }
            if (migrated.type === 'plot') {
                if (migrated.deadlineText && (migrated.deadline === undefined || migrated.deadline === null)) {
                    const deadlineAnchor = resolver(migrated.deadlineText, clock);
                    migrated.deadline = deadlineAnchor.timeKey !== null && deadlineAnchor.timeKey !== undefined
                        ? deadlineAnchor.timeKey
                        : null;
                }
                if (migrated.deadline === undefined) migrated.deadline = null;
            }
            return migrated;
        });
    };

    /**
     * 紧凑时间线摘要（纯本地拼接，不调模型）：
     * 当前状态 → 最近 N 天事件 → 更早只引用日摘要 → 相关关系 → 未决伏笔。
     */
    const buildTimelineDigest = (facts, clock = {}, options = {}) => {
        const opts = Object.assign({
            recentDays: 3,
            maxStates: 8,
            maxRelations: 6,
            maxPlots: 6,
            maxRecentEvents: 12
        }, options || {});
        const currentDay = Number(clock?.storyDay);
        const hasCurrentDay = Number.isFinite(currentDay);
        const list = Array.isArray(facts) ? facts : [];
        const lines = [];

        const states = list
            .filter(f => f.kind === 'state' && f.status === 'current' && f.validUntil == null)
            .sort((a, b) => (b.timeKey || 0) - (a.timeKey || 0))
            .slice(0, opts.maxStates);
        if (states.length) {
            lines.push(`【当前状态】${states.map(s => `${s.subject}·${s.aspect}:${s.value}`).join('; ')}`);
        }

        const relations = list
            .filter(f => f.kind === 'relation' && f.status === 'current' && f.validUntil == null)
            .slice(0, opts.maxRelations);
        if (relations.length) {
            lines.push(`【关系】${relations.map(r => {
                const strength = Number(r.strength);
                return `${r.from}→${r.relKind || r.kind}→${r.to}${Number.isFinite(strength) ? `(${Math.round(strength * 100)}%)` : ''}`;
            }).join('; ')}`);
        }

        const events = list
            .filter(f => f.kind === 'event' && f.status === 'current' && f.storyDay !== null)
            .sort((a, b) => (b.timeKey || 0) - (a.timeKey || 0));
        const recentEvents = events
            .filter(e => !hasCurrentDay || e.storyDay >= currentDay - opts.recentDays)
            .slice(0, opts.maxRecentEvents);
        if (recentEvents.length) {
            lines.push(`【最近事件】${recentEvents.map(e =>
                `[D${e.storyDay}${e.segment ? '·' + e.segment : ''}]${e.summary}`
            ).join('; ')}`);
        }
        if (hasCurrentDay) {
            const olderDays = [...new Set(events
                .filter(e => e.storyDay < currentDay - opts.recentDays)
                .map(e => e.storyDay))]
                .sort((a, b) => b - a);
            if (olderDays.length) {
                lines.push(`【更早】${olderDays.slice(0, 5).map(d => `D${d}已凝练`).join('、')}${olderDays.length > 5 ? `等${olderDays.length}天` : ''}`);
            }
        }

        const plots = list
            .filter(f => f.kind === 'plot' && f.status === 'current' && f.plotStatus === 'open')
            .sort((a, b) => (a.deadline ?? Number.MAX_SAFE_INTEGER) - (b.deadline ?? Number.MAX_SAFE_INTEGER))
            .slice(0, opts.maxPlots);
        if (plots.length) {
            lines.push(`【未决伏笔】${plots.map(p =>
                p.summary + (p.deadline != null ? `(截止D${Math.floor(p.deadline / 1440)})` : '')
            ).join('; ')}`);
        }

        return lines.join('\n');
    };

    const createTimeAnchor = (clock = {}, meta = {}) => ({
        id: 'clock',
        kind: 'time_anchor',
        type: 'time_anchor',
        status: 'current',
        storyDay: Math.max(0, Number(clock?.storyDay) || 0),
        segment: clock?.segment || null,
        absolute: clock?.absolute || null,
        confidence: clock?.confidence || 'high',
        updatedAt: now()
    });

    const createDayDigest = (day, eventIds = [], summary = '', meta = {}) => ({
        id: String(meta.id || `digest:day:${day}`),
        kind: 'digest',
        type: 'digest',
        status: 'current',
        digestKind: 'day',
        storyDay: day,
        eventIds,
        summary: String(summary || ''),
        createdAt: now(),
        updatedAt: now(),
        importance: 1
    });

    const createArcDigest = (startDay, endDay, digestIds = [], summary = '', meta = {}) => ({
        id: String(meta.id || `digest:arc:${startDay}-${endDay}`),
        kind: 'digest',
        type: 'digest',
        status: 'current',
        digestKind: 'arc',
        startDay,
        endDay,
        digestIds,
        summary: String(summary || ''),
        createdAt: now(),
        updatedAt: now(),
        importance: 1
    });

    return {
        SCHEMA_VERSION,
        FACT_TYPES,
        STATUSES,
        ANCHOR_FIELDS,
        DEFAULT_OPTIONS,
        getDedupKey,
        getValuePayload,
        normalizeFact,
        buildEventId,
        mergeFacts,
        isRedundantText,
        touchFact,
        computeMaintenanceCandidates,
        createArc,
        createAudit,
        parseFactResponse,
        buildLocalBaseline,
        migrateFactsV1toV2,
        buildTimelineDigest,
        createTimeAnchor,
        createDayDigest,
        createArcDigest
    };
});
