/*  UI 模板纯函数引擎（v3.2，自 app.js 抽取）
 *  - 只包含可独立测试的纯函数/数据归一化逻辑，不依赖 Vue/settings/localStorage。
 *  - 浏览器环境挂载 window.RPHUiTemplateEngine（在 app.js 之前加载）；
 *  - Node 环境（单测）通过 CommonJS module.exports 导出。
 *  - 行为与 app.js 抽取前保持一致；updateMode 死字段已随抽取清理。
 */
(function (global) {
    'use strict';

    const createUiTemplateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const defaultUiTemplateHtml = '';
    const defaultUiTemplateVariables = {};

    const cloneUiObject = (value) => JSON.parse(JSON.stringify(value || {}));
    const cloneUiValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    const stripUiTemplateCodeFence = (value) => {
        const text = String(value || '').trim();
        const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\s*```$/);
        return (fenced ? fenced[1] : text).trim();
    };

    const inferInitialUiTemplateState = (template = {}, variableState = null) => {
        if (template.initialVariableState && typeof template.initialVariableState === 'object') {
            return cloneUiObject(template.initialVariableState);
        }
        let baseState = cloneUiObject(variableState || template.variableState || template.variables || defaultUiTemplateVariables);
        const logs = Array.isArray(template.changeLog) ? [...template.changeLog].sort((a, b) => (a.time || 0) - (b.time || 0)) : [];
        const initializedKeys = new Set();
        logs.forEach(log => {
            Object.entries(log.changes || {}).forEach(([key, change]) => {
                if (!initializedKeys.has(key) && change && Object.prototype.hasOwnProperty.call(change, 'from')) {
                    if (key === '$root') {
                        baseState = cloneUiValue(change.from) || {};
                    } else {
                        baseState[key] = change.from;
                    }
                    initializedKeys.add(key);
                }
            });
        });
        return baseState;
    };

    const normalizeUiTemplate = (template = {}) => {
        const variableState = (template.variableState && typeof template.variableState === 'object')
            ? cloneUiObject(template.variableState)
            : (template.variables && typeof template.variables === 'object'
                ? cloneUiObject(template.variables)
                : (template.initialVariableState && typeof template.initialVariableState === 'object'
                    ? cloneUiObject(template.initialVariableState)
                    : { ...defaultUiTemplateVariables }));
        return {
            id: template.id || createUiTemplateId(),
            name: template.name || 'UI模板',
            enabled: template.enabled !== false,
            scope: template.scope === 'global' ? 'global' : 'character',
            order: Number.isFinite(Number(template.order)) ? Number(template.order) : 100,
            placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
            htmlTemplate: stripUiTemplateCodeFence(template.htmlTemplate || template.template || defaultUiTemplateHtml),
            initialVariableState: inferInitialUiTemplateState(template, variableState),
            variableState,
            variableSchema: (template.variableSchema && (typeof template.variableSchema === 'object' || typeof template.variableSchema === 'string')) ? template.variableSchema : '',
            changeLog: Array.isArray(template.changeLog) ? template.changeLog : [],
            runtimeByCharacter: (template.runtimeByCharacter && typeof template.runtimeByCharacter === 'object') ? cloneUiObject(template.runtimeByCharacter) : {}
        };
    };

    const isUiTemplateObject = (value) => value !== null && typeof value === 'object';

    const splitUiTemplatePath = (path) => String(path || '')
        .trim()
        .replace(/\[(?:'([^']+)'|"([^"]+)"|([^\]]+))\]/g, (_, single, double, bare) => `.${single ?? double ?? String(bare || '').trim()}`)
        .split('.')
        .map(part => part.trim())
        .filter(Boolean);

    const readUiTemplatePath = (source, path) => {
        const normalizedPath = String(path || '').trim();
        if (!normalizedPath || normalizedPath === 'this' || normalizedPath === '.') return source;
        if (isUiTemplateObject(source) && Object.prototype.hasOwnProperty.call(source, normalizedPath)) {
            return source[normalizedPath];
        }
        return splitUiTemplatePath(normalizedPath).reduce((acc, key) => (
            acc !== undefined && acc !== null && acc[key] !== undefined ? acc[key] : undefined
        ), source);
    };

    const getUiTemplateValue = (source, path, context = null) => {
        const expression = String(path || '').trim();
        if (!expression) return undefined;
        if (context) {
            if (expression === 'this' || expression === '.') return context.current;
            if (expression === '@index') return context.index ?? 0;
            if (expression === '@number') return (context.index ?? 0) + 1;
            if (expression === '@first') return (context.index ?? 0) === 0;
            if (expression === '@last') return (context.index ?? 0) === (context.length ?? 0) - 1;
            if (expression === '@key') return context.key ?? context.index ?? '';
            if (expression.startsWith('root.')) return readUiTemplatePath(context.root, expression.slice(5));
            if (expression === 'root') return context.root;
            if (expression.startsWith('../')) {
                let parentContext = context.parentContext;
                let parentPath = expression;
                while (parentPath.startsWith('../')) {
                    parentPath = parentPath.slice(3);
                    if (parentPath.startsWith('../') && parentContext?.parentContext) {
                        parentContext = parentContext.parentContext;
                    }
                }
                const fallbackParent = { root: context.root, current: context.root, parentContext: null };
                return getUiTemplateValue(context.root, parentPath, parentContext || fallbackParent);
            }
            if (context.alias && (expression === context.alias || expression.startsWith(`${context.alias}.`))) {
                return expression === context.alias
                    ? context.current
                    : readUiTemplatePath(context.current, expression.slice(context.alias.length + 1));
            }
            const localValue = readUiTemplatePath(context.current, expression);
            if (localValue !== undefined) return localValue;
        }
        return readUiTemplatePath(source, expression);
    };

    const setUiTemplateValue = (source, path, value) => {
        const expression = String(path || '').trim();
        if (!expression) return source;
        if (expression === '$root' || expression === 'this' || expression === '.') return cloneUiValue(value);
        const root = isUiTemplateObject(source) ? source : {};
        if (Object.prototype.hasOwnProperty.call(root, expression) || !/[.[\]]/.test(expression)) {
            root[expression] = cloneUiValue(value);
            return root;
        }
        const parts = splitUiTemplatePath(expression);
        if (!parts.length) return root;
        let target = root;
        parts.forEach((part, index) => {
            if (index === parts.length - 1) {
                target[part] = cloneUiValue(value);
                return;
            }
            const nextPart = parts[index + 1];
            if (!isUiTemplateObject(target[part])) {
                target[part] = /^\d+$/.test(nextPart) ? [] : {};
            }
            target = target[part];
        });
        return root;
    };

    const stringifyUiTemplateValue = (value) => {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value, null, 2);
            } catch (e) {
                return String(value);
            }
        }
        return String(value);
    };

    const escapeUiValue = (value) => stringifyUiTemplateValue(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const createUiTemplateRenderContext = (variables, overrides = {}) => ({
        root: variables,
        current: variables,
        parentContext: null,
        index: 0,
        key: '',
        length: 1,
        alias: '',
        ...overrides
    });

    const renderUiTemplateString = (templateText, variables = {}, context = null) => {
        const activeContext = context || createUiTemplateRenderContext(variables);
        const withArrays = renderUiTemplateEachBlocks(String(templateText || ''), variables, activeContext);
        return withArrays.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expression) => {
            const key = String(expression || '').trim();
            if (!key || key === 'else' || key.startsWith('#') || key.startsWith('/')) return match;
            return escapeUiValue(getUiTemplateValue(variables, key, activeContext));
        });
    };

    const renderUiTemplateEachBlocks = (templateText, variables = {}, context = null) => {
        let output = String(templateText || '');
        const eachBlockPattern = /\{\{\s*#each\s+([^\s}]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\}((?:(?!\{\{\s*#each\b)[\s\S])*?)\{\{\s*\/each\s*\}\}/g;
        for (let pass = 0; pass < 50; pass++) {
            let replaced = false;
            output = output.replace(eachBlockPattern, (match, path, alias, body) => {
                replaced = true;
                const value = getUiTemplateValue(variables, path, context);
                const [itemTemplate, emptyTemplate = ''] = String(body || '').split(/\{\{\s*else\s*\}\}/i);
                const entries = Array.isArray(value)
                    ? value.map((item, index) => ({ item, key: index, index }))
                    : (isUiTemplateObject(value)
                        ? Object.entries(value).map(([key, item], index) => ({ item, key, index }))
                        : []);
                if (!entries.length) {
                    return renderUiTemplateString(emptyTemplate, variables, context);
                }
                return entries.map(({ item, key, index }) => renderUiTemplateString(itemTemplate, variables, createUiTemplateRenderContext(variables, {
                    current: item,
                    parentContext: context,
                    index,
                    key,
                    length: entries.length,
                    alias: alias || ''
                }))).join('');
            });
            if (!replaced) break;
        }
        return output;
    };

    const parseUiTemplateUpdateJson = (rawContent) => {
        const normalizedContent = String(rawContent || '')
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
        try {
            return JSON.parse(normalizedContent);
        } catch (primaryError) {
            const objectStart = normalizedContent.indexOf('{');
            const arrayStart = normalizedContent.indexOf('[');
            const candidates = [
                [objectStart, normalizedContent.lastIndexOf('}')],
                [arrayStart, normalizedContent.lastIndexOf(']')]
            ].filter(([start, end]) => start >= 0 && end > start);
            for (const [start, end] of candidates) {
                try {
                    return JSON.parse(normalizedContent.slice(start, end + 1));
                } catch (_) { }
            }
            throw primaryError;
        }
    };

    /* 把模型返回的变量更新规整为统一的更新条目 {id?, name?, variables, reason}。
     * 带额外字段的条目只保留这四个字段（修复 C3：额外字段不再被误当作变量映射）。
     * 纯对象（无 variables/updates 键）按旧版兼容形态视作根变量映射。
     */
    const normalizeUiTemplateUpdateList = (parsed) => {
        const normalizeUpdateEntry = (update) => {
            if (!update || typeof update !== 'object') return null;
            if (Object.prototype.hasOwnProperty.call(update, 'variables')) {
                return {
                    ...(update.id !== undefined ? { id: update.id } : {}),
                    ...(update.name !== undefined ? { name: update.name } : {}),
                    variables: update.variables,
                    reason: String(update.reason || '').trim()
                };
            }
            return { variables: update, reason: '' };
        };
        if (Array.isArray(parsed)) return parsed.map(normalizeUpdateEntry).filter(Boolean);
        if (!parsed || typeof parsed !== 'object') return [];
        if (Array.isArray(parsed.updates)) {
            return parsed.updates.map(normalizeUpdateEntry).filter(Boolean);
        }
        if (Object.prototype.hasOwnProperty.call(parsed, 'variables')) {
            return [normalizeUpdateEntry(parsed)];
        }
        return [{ variables: parsed, reason: '' }];
    };

    const isAllowedUiTemplateKey = (template, key) => {
        if (!template || key === '$root') return true;
        const known = new Set();
        const state = template.variableState;
        const initial = template.initialVariableState;
        if (state && typeof state === 'object') Object.keys(state).forEach(k => known.add(k));
        if (initial && typeof initial === 'object') Object.keys(initial).forEach(k => known.add(k));
        const schema = template.variableSchema;
        if (schema && typeof schema === 'object') Object.keys(schema).forEach(k => known.add(k));
        if (known.size === 0) return true;
        const parts = splitUiTemplatePath(key);
        const topLevel = parts.length ? parts[0] : String(key);
        return known.has(topLevel);
    };

    const applyUiTemplateUpdateListToTemplate = (template, updates, { model = '', turn = null, source = 'ai', matchName = true } = {}) => {
        let fieldCount = 0;
        let changed = false;
        const rejectedKeys = [];
        updates.forEach(update => {
            if (!template || !update || typeof update !== 'object') return;
            if (update.id && update.id !== template.id) return;
            if (matchName && update.name && update.name !== template.name) return;
            if (update.variables === null || typeof update.variables !== 'object') return;
            const changes = {};
            const variableEntries = Array.isArray(update.variables)
                ? [['$root', update.variables]]
                : Object.entries(update.variables);
            variableEntries.forEach(([key, value]) => {
                if (!isAllowedUiTemplateKey(template, key)) {
                    rejectedKeys.push(key);
                    return;
                }
                const oldValue = key === '$root'
                    ? template.variableState
                    : getUiTemplateValue(template.variableState || {}, key);
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    template.variableState = setUiTemplateValue(template.variableState || {}, key, value);
                    changes[key] = { from: oldValue, to: value };
                }
            });
            if (rejectedKeys.length) {
                console.warn(`[UI模板] ${template.name || template.id} 忽略未定义变量: ${rejectedKeys.join(', ')}`);
            }
            if (Object.keys(changes).length > 0) {
                if (!Array.isArray(template.changeLog)) template.changeLog = [];
                template.changeLog.unshift({
                    id: createUiTemplateId(),
                    time: Date.now(),
                    source,
                    model,
                    turn,
                    changes,
                    reason: update.reason || ''
                });
                template.changeLog = template.changeLog.slice(0, 50);
                fieldCount += Object.keys(changes).length;
                changed = true;
            }
        });
        return { changed, fieldCount, rejectedKeys };
    };

    const UI_TEMPLATE_EVENT_HANDLER_NAMES = new Set([
        'click', 'change', 'input', 'load', 'error', 'focus', 'blur', 'submit', 'reset',
        'keyup', 'keydown', 'keypress', 'mouseover', 'mouseout', 'mousedown', 'mouseup',
        'dblclick', 'contextmenu', 'dragstart', 'drag', 'dragend', 'dragenter', 'dragleave',
        'dragover', 'drop', 'paste', 'copy', 'cut', 'touchstart', 'touchend', 'touchmove',
        'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter',
        'pointerleave', 'pointercancel', 'gotpointercapture', 'lostpointercapture',
        'wheel', 'scroll', 'resize', 'unload', 'beforeunload', 'pagehide', 'pageshow',
        'animationend', 'animationiteration', 'animationstart', 'transitionend',
        'canplay', 'canplaythrough', 'close', 'durationchange', 'emptied', 'ended',
        'loadeddata', 'loadedmetadata', 'loadstart', 'pause', 'play', 'playing',
        'progress', 'ratechange', 'seeked', 'seeking', 'select', 'stalled', 'suspend',
        'timeupdate', 'toggle', 'volumechange', 'waiting', 'invalid', 'show',
        'popstate', 'hashchange', 'message', 'online', 'offline', 'storage',
        'readystatechange', 'fullscreenchange', 'orientationchange', 'visibilitychange'
    ]);

    /* 模板脚本风险检测（G2）：
     *  - <script> 内联/外链脚本；
     *  - 内联事件处理属性（onclick/onchange/...）；
     *  - <iframe> 嵌入；
     *  - javascript: URI。
     * 返回 { hasScript, inlineHandlers, hasIframe, javascriptUri, risky }。
     */
    const analyzeUiTemplateScriptRisk = (htmlTemplate) => {
        const html = String(htmlTemplate || '');
        const risk = { hasScript: false, inlineHandlers: false, hasIframe: false, javascriptUri: false, risky: false };
        if (!html) return risk;
        risk.hasScript = /<script\b/i.test(html);
        risk.hasIframe = /<iframe\b/i.test(html);
        risk.javascriptUri = /javascript\s*:/i.test(html);
        const handlerMatches = [...html.matchAll(/\son([a-z][a-z0-9]*)\s*=/gi)];
        risk.inlineHandlers = handlerMatches.some(match => UI_TEMPLATE_EVENT_HANDLER_NAMES.has(String(match[1] || '').toLowerCase()));
        risk.risky = risk.hasScript || risk.inlineHandlers || risk.hasIframe || risk.javascriptUri;
        return risk;
    };

    const hasUiTemplateScripts = (htmlTemplate) => analyzeUiTemplateScriptRisk(htmlTemplate).risky;

    const engine = {
        createUiTemplateId,
        defaultUiTemplateHtml,
        defaultUiTemplateVariables,
        cloneUiObject,
        cloneUiValue,
        stripUiTemplateCodeFence,
        inferInitialUiTemplateState,
        normalizeUiTemplate,
        isUiTemplateObject,
        splitUiTemplatePath,
        readUiTemplatePath,
        getUiTemplateValue,
        setUiTemplateValue,
        stringifyUiTemplateValue,
        escapeUiValue,
        createUiTemplateRenderContext,
        renderUiTemplateString,
        renderUiTemplateEachBlocks,
        parseUiTemplateUpdateJson,
        normalizeUiTemplateUpdateList,
        isAllowedUiTemplateKey,
        applyUiTemplateUpdateListToTemplate,
        analyzeUiTemplateScriptRisk,
        hasUiTemplateScripts
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = engine;
    }
    if (global) {
        global.RPHUiTemplateEngine = engine;
    }
})(typeof window !== 'undefined' ? window : globalThis);
