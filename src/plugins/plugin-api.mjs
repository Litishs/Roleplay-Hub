// 插件清单定义与校验（Plugin Marketplace Phase 1）。
//
// Phase 1 只收录随应用内置的插件：清单在本仓库里声明、随构建分发，运行时经
// plugin-registry 注册。清单里声明的权限目前用于市场界面的展示与告知，
// 真正的按权限隔离（外置插件跑进沙箱 iframe、宿主 API 按权限放行）留给
// Phase 2 的外置插件加载器——那一步落地前，本文件就是插件与宿主的契约面。

export const PLUGIN_PERMISSIONS = Object.freeze({
    CHAT_READ: 'chat:read',
    EMBEDDING_COMPUTE: 'embedding:compute',
    WEB_REQUEST: 'web:request'
});

const PLUGIN_ID_PATTERN = /^rph-[a-z0-9-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const CALL_NAME_PATTERN = /^tool_[a-z0-9_]+$/;

export const definePlugin = (manifest) => {
    const id = String(manifest?.id || '').trim();
    if (!PLUGIN_ID_PATTERN.test(id)) {
        throw new Error(`插件 id 不合法: "${id}"（需形如 rph-小写字母数字连字符）`);
    }
    const fail = (message) => { throw new Error(`插件 ${id}: ${message}`); };

    if (!String(manifest?.name || '').trim()) fail('缺少 name');
    if (!VERSION_PATTERN.test(String(manifest?.version || ''))) fail('version 需为 x.y.z');

    const permissions = Object.freeze([...new Set(manifest?.permissions || [])]);
    const knownPermissions = Object.values(PLUGIN_PERMISSIONS);
    permissions.forEach(permission => {
        if (!knownPermissions.includes(permission)) fail(`声明了未知权限 "${permission}"（合法值: ${knownPermissions.join(', ')}）`);
    });

    const activeTool = manifest?.activeTool;
    if (activeTool) {
        if (!CALL_NAME_PATTERN.test(String(activeTool.callName || ''))) {
            fail(`activeTool.callName 不合法: "${activeTool.callName}"（需形如 tool_xxx）`);
        }
        if (!String(activeTool.description || '').trim()) fail('activeTool 缺少 description（模型侧调用说明）');
        if (!String(activeTool.displayDescription || '').trim()) fail('activeTool 缺少 displayDescription（设置页展示说明）');
    }

    (manifest?.settings || []).forEach(setting => {
        if (!String(setting?.key || '').trim()) fail('settings 项缺少 key');
        if (!['number', 'text', 'boolean'].includes(setting?.type)) fail(`settings.${setting?.key} 的 type 不合法`);
    });

    return Object.freeze({
        ...manifest,
        id,
        version: String(manifest.version),
        permissions,
        // Phase 1 的插件全部随应用内置；字段留给 Phase 2 区分来源。
        builtin: manifest?.builtin !== false
    });
};
