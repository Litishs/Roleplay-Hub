<template>
    <div class="flex flex-col gap-3">
        <p class="text-xs text-gray-500 leading-relaxed">
            插件为随应用内置的能力模块，全部计算在本机完成；在这里启用、停用或调整它们的行为。
            外置插件的沙箱加载将在后续版本提供。
        </p>

        <div v-for="plugin in plugins" :key="plugin.id"
            class="rounded-xl border border-gray-200/70 bg-white/70 backdrop-blur-sm p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold text-gray-800 text-sm">{{ plugin.name }}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">v{{ plugin.version }}</span>
                        <span v-if="plugin.builtin" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">内置</span>
                    </div>
                    <p class="text-xs text-gray-500 leading-relaxed mt-1">{{ plugin.description }}</p>
                    <div v-if="plugin.permissions.length" class="flex flex-wrap gap-1 mt-1.5">
                        <span v-for="permission in plugin.permissions" :key="permission"
                            class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
                            {{ permission }}
                        </span>
                    </div>
                </div>
                <label class="shrink-0 inline-flex items-center cursor-pointer" :title="plugin.enabled ? '点击停用' : '点击启用'">
                    <input type="checkbox" class="sr-only peer" :checked="plugin.enabled"
                        @change="onToggle(plugin, $event)">
                    <span class="w-9 h-5 rounded-full bg-gray-300 peer-checked:bg-indigo-500 relative transition-colors
                        after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4
                        after:rounded-full after:bg-white after:transition-transform
                        peer-checked:after:translate-x-4"></span>
                </label>
            </div>

            <div v-if="plugin.enabled && plugin.hasActiveTool" class="text-[11px] text-gray-400">
                已作为工具 <code class="text-gray-500">{{ toolCallName(plugin) }}</code> 提供给模型，可在「主动工具」设置中调整结果条数。
            </div>

            <div v-if="plugin.enabled && plugin.settings.length" class="flex flex-col gap-2 border-t border-gray-100 pt-2">
                <label v-for="setting in plugin.settings" :key="setting.key"
                    class="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span class="min-w-0">
                        {{ setting.label }}
                        <span v-if="setting.help" class="block text-[10px] text-gray-400 leading-snug">{{ setting.help }}</span>
                    </span>
                    <input v-if="setting.type === 'number'" type="number" :min="setting.min" :max="setting.max"
                        class="w-24 shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700
                            focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        :value="pluginSettingValue(plugin, setting)"
                        @change="onSettingChange(plugin, setting, $event)">
                </label>
            </div>

            <p v-if="plugin.error" class="text-[11px] text-red-500">{{ plugin.error }}</p>
        </div>

        <p v-if="plugins.length === 0" class="text-sm text-gray-400">暂无可用插件。</p>
    </div>
</template>

<script>
import { inject, ref, onMounted, onBeforeUnmount } from "vue";

export default {
    name: 'PluginMarketplace',
    setup() {
        const ctx = inject("appContext") || {};
        const plugins = ref([]);
        let unsubscribe = null;

        const refresh = () => {
            if (ctx.pluginRegistry) plugins.value = ctx.pluginRegistry.list();
        };

        onMounted(async () => {
            if (!ctx.pluginRegistry) return;
            await ctx.pluginRegistry.ready();
            refresh();
            unsubscribe = ctx.pluginRegistry.onChange(refresh);
        });
        onBeforeUnmount(() => { if (unsubscribe) unsubscribe(); });

        const toolCallName = (plugin) => {
            const tool = ctx.pluginRegistry?.getToolContributions?.().find(item => item.pluginId === plugin.id);
            return tool ? `<${tool.callName}_add: 查询>` : '';
        };
        const pluginSettingValue = (plugin, setting) => {
            const values = ctx.pluginRegistry?.getPluginSettings?.(plugin.id) || {};
            return values[setting.key] ?? setting.default;
        };
        const onToggle = async (plugin, event) => {
            plugin.error = '';
            try {
                await ctx.setPluginEnabled(plugin.id, event.target.checked);
            } catch (error) {
                plugin.error = String(error?.message || error);
                event.target.checked = !event.target.checked;
            }
        };
        const onSettingChange = async (plugin, setting, event) => {
            plugin.error = '';
            try {
                await ctx.setPluginSetting(plugin.id, setting.key, event.target.value);
            } catch (error) {
                plugin.error = String(error?.message || error);
                event.target.value = pluginSettingValue(plugin, setting);
            }
        };

        return { plugins, toolCallName, pluginSettingValue, onToggle, onSettingChange };
    }
};
</script>
