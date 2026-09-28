// Plugin manifest definition and validation (Plugin Marketplace Phase 1).
//
// Phase 1 ships built-in plugins only: manifests are declared in this repo,
// distributed with the build, and registered through plugin-registry at
// runtime. Permissions declared in a manifest currently serve display and
// disclosure in the marketplace UI; real per-permission isolation (external
// plugins inside a sandboxed iframe, host API gated by permission) is left to
// the Phase 2 external plugin loader. Until that lands, this file is the
// plugin-host contract surface.

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
        // Phase 1 plugins are all built in; the field is kept for Phase 2 to tell sources apart.
        builtin: manifest?.builtin !== false
    });
};
