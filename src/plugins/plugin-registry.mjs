// Plugin registry: registration / enable-disable / per-plugin settings / tool
// contributions, with state persisted through storage.
//
// Deliberately framework-agnostic (no Vue import): the host app.mjs subscribes
// via onChange to refresh the UI; tests drive it directly with a fake storage.
// The enable state takes effect through "tool contributions" — enabled plugins
// merge their activeTool definition into app.mjs's activeTools list, so the
// existing tool parsing, prompt injection, and result formatting recognize
// plugin tools with zero changes.
//
// Storage shape (storage key: plugin_marketplace_state):
//   { enabled: { [pluginId]: true|false }, settings: { [pluginId]: { key: value } } }
// When enabled has no record for a plugin, fall back to the manifest's
// defaultEnabled (built-in plugins may declare out-of-the-box availability).

export const PLUGIN_STATE_STORAGE_KEY = 'plugin_marketplace_state';

export const createPluginRegistry = ({ storage = null, logger = console } = {}) => {
    const plugins = new Map();
    const listeners = new Set();

    let state = { enabled: {}, settings: {} };
    let loadPromise = null;
    let persistQueue = Promise.resolve();

    const notify = () => listeners.forEach(listener => {
        try { listener(); } catch (error) { logger?.warn?.('[PluginRegistry] listener failed:', error); }
    });

    const load = () => {
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            try {
                const raw = storage ? await storage.get(PLUGIN_STATE_STORAGE_KEY) : null;
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    state = {
                        enabled: (raw.enabled && typeof raw.enabled === 'object') ? { ...raw.enabled } : {},
                        settings: (raw.settings && typeof raw.settings === 'object') ? { ...raw.settings } : {}
                    };
                }
            } catch (error) {
                logger?.warn?.('[PluginRegistry] 读取插件状态失败，按默认值继续:', error);
            }
        })();
        return loadPromise;
    };

    const persist = () => {
        persistQueue = persistQueue.then(async () => {
            if (!storage) return;
            try {
                await storage.set(PLUGIN_STATE_STORAGE_KEY, state);
            } catch (error) {
                logger?.warn?.('[PluginRegistry] 插件状态持久化失败（本次改动仅内存生效）:', error);
            }
        });
        return persistQueue;
    };

    const effectiveEnabled = (plugin) => {
        const recorded = state.enabled[plugin.id];
        if (recorded !== undefined) return recorded === true;
        return plugin.defaultEnabled === true;
    };

    return {
        ready: load,

        async register(plugin) {
            await load();
            if (plugins.has(plugin.id)) {
                throw new Error(`插件重复注册: ${plugin.id}`);
            }
            plugins.set(plugin.id, plugin);
            // Backfill setting defaults: when a manifest gains a new setting,
            // existing user state has no entry for that key.
            const pluginSettings = { ...(state.settings[plugin.id] || {}) };
            (plugin.settings || []).forEach(setting => {
                if (pluginSettings[setting.key] === undefined) pluginSettings[setting.key] = setting.default;
            });
            state.settings[plugin.id] = pluginSettings;
            await persist();
            notify();
        },

        // Synchronous snapshot: call ready() first (the host renders the
        // marketplace UI only after registration completes).
        list() {
            return [...plugins.values()].map(plugin => ({
                id: plugin.id,
                name: plugin.name,
                version: plugin.version,
                author: plugin.author || '',
                description: plugin.description || '',
                permissions: [...(plugin.permissions || [])],
                builtin: plugin.builtin !== false,
                hasActiveTool: !!plugin.activeTool,
                settings: (plugin.settings || []).map(setting => ({ ...setting })),
                enabled: effectiveEnabled(plugin)
            }));
        },

        isEnabled(pluginId) {
            const plugin = plugins.get(pluginId);
            return plugin ? effectiveEnabled(plugin) : false;
        },

        async setEnabled(pluginId, value) {
            await load();
            if (!plugins.has(pluginId)) throw new Error(`未知插件: ${pluginId}`);
            state.enabled[pluginId] = value === true;
            await persist();
            notify();
        },

        getPluginSettings(pluginId) {
            const plugin = plugins.get(pluginId);
            if (!plugin) return {};
            const merged = {};
            (plugin.settings || []).forEach(setting => {
                const stored = state.settings[pluginId]?.[setting.key];
                merged[setting.key] = stored === undefined ? setting.default : stored;
            });
            return merged;
        },

        async setPluginSetting(pluginId, key, value) {
            await load();
            if (!plugins.has(pluginId)) throw new Error(`未知插件: ${pluginId}`);
            const setting = (plugins.get(pluginId).settings || []).find(item => item.key === key);
            if (!setting) throw new Error(`插件 ${pluginId} 没有设置项 ${key}`);
            let normalized = value;
            if (setting.type === 'number') {
                const number = Number(value);
                if (!Number.isFinite(number)) throw new Error(`设置项 ${key} 需为数字`);
                normalized = setting.min !== undefined || setting.max !== undefined
                    ? Math.max(setting.min ?? -Infinity, Math.min(setting.max ?? Infinity, Math.round(number)))
                    : Math.round(number);
            }
            state.settings[pluginId] = { ...(state.settings[pluginId] || {}), [key]: normalized };
            await persist();
            notify();
        },

        // activeTool definitions contributed by enabled plugins (app.mjs
        // merges them into its activeTools list).
        getToolContributions() {
            return [...plugins.values()]
                .filter(plugin => effectiveEnabled(plugin) && plugin.activeTool)
                .map(plugin => ({ ...plugin.activeTool, pluginId: plugin.id }));
        },

        async executeTool(pluginId, query, tool, signal, ctx) {
            await load();
            const plugin = plugins.get(pluginId);
            if (!plugin) throw new Error(`插件未注册: ${pluginId}`);
            if (!effectiveEnabled(plugin)) throw new Error(`插件未启用: ${plugin.name || pluginId}`);
            if (typeof plugin.execute !== 'function') throw new Error(`插件 ${pluginId} 未实现 execute`);
            return plugin.execute(query, tool, signal, ctx);
        },

        // Idle warmup: gives enabled plugins a chance to build indexes /
        // prepare in the background. Each getSettings is bound per plugin; a
        // single failing plugin only logs and never drags down the others.
        async warmupAll(baseCtx = {}) {
            await load();
            for (const plugin of plugins.values()) {
                if (!effectiveEnabled(plugin) || typeof plugin.warmup !== 'function') continue;
                try {
                    await plugin.warmup({
                        ...baseCtx,
                        getSettings: () => (baseCtx.getSettings ? baseCtx.getSettings(plugin.id) : {})
                    });
                } catch (error) {
                    logger?.warn?.(`[PluginRegistry] 插件 ${plugin.id} 预热失败:`, error?.message || error);
                }
            }
        },

        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};
