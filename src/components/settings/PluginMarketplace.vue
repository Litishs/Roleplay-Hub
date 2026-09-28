<template>
    <div class="flex flex-col gap-3">
        <p class="text-xs text-gray-500 leading-relaxed">
            插件为随应用内置的能力模块，全部计算在本机完成；在这里启用、停用或调整它们的行为。
            外置插件的沙箱加载将在后续版本提供。
        </p>

        <div v-for="plugin in plugins" :key="plugin.id"
            class="rounded-xl border border-gray-200/70 bg-white/70 backdrop-blur-sm flex flex-col">
            <!-- 名称行（折叠态只保留这一行）：点击行体展开/收起，开关独立于折叠 -->
            <div class="flex items-center gap-2 p-3">
                <button type="button" class="flex items-center gap-2 min-w-0 flex-1 text-left group/row"
                    :title="isExpanded(plugin) ? '收起详情' : '展开详情'"
                    @click="toggleExpand(plugin.id)">
                    <svg class="w-4 h-4 text-gray-400 group-hover/row:text-gray-600 transition-transform flex-shrink-0"
                        :class="isExpanded(plugin) ? 'rotate-90' : ''" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                    <span class="font-semibold text-gray-800 text-sm truncate">{{ plugin.name }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">v{{ plugin.version }}</span>
                    <span v-if="plugin.builtin" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-primary-600 flex-shrink-0">内置</span>
                </button>
                <label class="shrink-0 relative inline-flex items-center cursor-pointer"
                    :title="plugin.enabled ? '点击停用' : '点击启用'" @click.stop>
                    <input type="checkbox" class="settings-toggle-input sr-only" :checked="plugin.enabled"
                        @change="onToggle(plugin, $event)">
                    <div class="settings-toggle"></div>
                </label>
            </div>

            <p v-if="plugin.error" class="text-[11px] text-red-500 px-3 pb-2">{{ plugin.error }}</p>

            <!-- 展开态：描述 / 权限 / 工具接线 / 每插件设置 -->
            <div v-if="isExpanded(plugin)" class="flex flex-col gap-3 px-3 pb-3 border-t border-gray-100 pt-3">
                <p class="text-xs text-gray-500 leading-relaxed">{{ plugin.description }}</p>
                <div v-if="plugin.permissions.length" class="flex flex-wrap gap-1">
                    <span v-for="permission in plugin.permissions" :key="permission"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-amber-600 border border-gray-200">
                        {{ permission }}
                    </span>
                </div>
                <div v-if="plugin.hasActiveTool" class="text-[11px] text-gray-400">
                    已作为工具 <code class="text-gray-500">{{ toolCallName(plugin) }}</code> 提供给模型，可在「主动工具」设置中调整结果条数。
                </div>
                <div v-if="plugin.settings.length" class="flex flex-col gap-2">
                    <label v-for="setting in plugin.settings" :key="setting.key"
                        class="flex items-center justify-between gap-3 text-xs text-gray-600">
                        <span class="min-w-0">
                            {{ setting.label }}
                            <span v-if="setting.help" class="block text-[10px] text-gray-400 leading-snug">{{ setting.help }}</span>
                        </span>
                        <input v-if="setting.type === 'number'" type="number" :min="setting.min" :max="setting.max"
                            class="w-24 shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700
                                focus:outline-none focus:ring-2 focus:ring-primary-200"
                            :value="pluginSettingValue(plugin, setting)"
                            @change="onSettingChange(plugin, setting, $event)">
                    </label>
                </div>
            </div>
        </div>

        <p v-if="plugins.length === 0" class="text-sm text-gray-400">暂无可用插件。</p>
    </div>
</template>

<script>
import { inject, ref, onMounted } from "vue";

export default {
    name: 'PluginMarketplace',
    setup() {
        const ctx = inject("appContext") || {};
        const plugins = ref([]);
        // 折叠态：默认收起只留名称行；按插件 id 记忆展开状态。
        const expandedIds = ref({});
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

        const isExpanded = (plugin) => expandedIds.value[plugin.id] === true;
        const toggleExpand = (pluginId) => {
            expandedIds.value = { ...expandedIds.value, [pluginId]: !isExpanded({ id: pluginId }) };
        };

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

        return { plugins, isExpanded, toggleExpand, toolCallName, pluginSettingValue, onToggle, onSettingChange };
    }
};
</script>
