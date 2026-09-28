<template>
    <div v-if="currentView === 'plugins'" class="management-view">
        <div class="max-w-3xl mx-auto flex items-center mb-4 md:mb-6">
            <button @click="toggleMobileMenu" class="mobile-menu-button">
                <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
            </button>
            <h2 class="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
                <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z">
                    </path>
                </svg>
                插件市场
            </h2>
            <span class="ml-auto text-[10px] md:text-[11px] text-gray-400 font-medium select-none">{{ summary }}</span>
        </div>

        <div class="max-w-3xl mx-auto rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur-sm shadow-sm p-4 md:p-5 settings-panel-body">
            <PluginMarketplace />
        </div>
    </div>
</template>

<script>
import { inject, ref, computed, onMounted } from "vue";
import PluginMarketplace from "../settings/PluginMarketplace.vue";

export default {
    name: 'PluginsPanel',
    components: { PluginMarketplace },
    setup() {
        const ctx = inject("appContext") || {};
        const pluginStateTick = ref(0);

        // 标题右侧摘要（N 个插件 · M 个启用中）——registry 非响应式，用 tick 订阅变更。
        const summary = computed(() => {
            pluginStateTick.value;
            const plugins = ctx.pluginRegistry?.list?.() || [];
            if (plugins.length === 0) return '暂无插件';
            return `${plugins.length} 个插件 · ${plugins.filter(plugin => plugin.enabled).length} 个启用中`;
        });

        onMounted(async () => {
            if (!ctx.pluginRegistry) return;
            await ctx.pluginRegistry.ready();
            ctx.pluginRegistry.onChange(() => { pluginStateTick.value++; });
        });

        return { ...(ctx || {}), summary };
    }
};
</script>
