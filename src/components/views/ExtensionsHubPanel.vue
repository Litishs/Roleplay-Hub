<template>
    <!-- Narrow-screen "扩展" tab (2026-11-23): one flat list of the six
         destinations the drawer used to carry, in the maintainer's order. Rows
         reuse the settings list classes, so hover, density and dark mode come
         for free. Always mounted (v-show) so a later push animation can slide a
         page over a root that is still painted. -->
    <div v-show="currentView === 'ext'" class="management-view tab-hub-view">
        <settings-page-header title="扩展" :back="false"></settings-page-header>
        <div class="settings-stack">
            <div class="settings-group-card">
                <button v-for="entry in entries" :key="entry.view" type="button"
                    class="settings-accordion-trigger settings-link-row" @click="currentView = entry.view">
                    <span class="settings-accordion-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path v-for="(d, index) in entry.icon" :key="index" stroke-linecap="round"
                                stroke-linejoin="round" stroke-width="1.8" :d="d"></path>
                        </svg>
                    </span>
                    <span class="settings-accordion-copy">
                        <span class="settings-accordion-title">{{ entry.label }}</span>
                        <span class="settings-accordion-description">{{ entry.description }}</span>
                    </span>
                    <span class="settings-link-tail">
                        <!-- v6 §20: the sweep capsule used to live in the drawer's
                             记忆系统 row; keep it where the entry now is. -->
                        <span v-if="entry.view === 'memory' && memoryMigrationBadge"
                            class="settings-accordion-badge">{{ memoryMigrationBadge }}</span>
                        <span v-else-if="entry.view === 'uitemplates' && uiTemplateUpdateStatus.state === 'running'"
                            class="settings-accordion-badge">更新中</span>
                    </span>
                    <svg class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import { inject } from "vue";

// Icons are the sidebar's (SideNav.vue) so each destination keeps the glyph
// users already know.
const ENTRIES = [
    { view: 'memory', label: '记忆系统', description: '滚动总结与固定信息卡', icon: ['M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'] },
    { view: 'presets', label: '预设', description: '提示词分组，同一时间启用一组', icon: ['M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4M6 18a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'] },
    { view: 'worldinfo', label: '世界书', description: '按关键词注入的设定条目', icon: ['M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5S19.83 5.48 21 6.25v13C19.83 18.48 18.25 18 16.5 18s-3.33.48-4.5 1.25'] },
    { view: 'regex', label: '正则', description: '收发文本的查找替换与美化', icon: ['M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'] },
    { view: 'uitemplates', label: 'UI模板', description: '消息模板与变量系统', icon: ['M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5'] },
    { view: 'tools', label: '工具', description: '供模型调用的自定义工具', icon: ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z'] }
];

// The plugin marketplace stays hidden behind the same flag as the sidebar's
// entry (SideNav.vue); flip both together.
const pluginsMarketEnabled = false;
const PLUGIN_ENTRY = { view: 'plugins', label: '插件市场', description: '浏览与管理插件', icon: ['M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z'] };

// Plain data: the entries never change at runtime, so this need not be reactive.
const entries = pluginsMarketEnabled ? [...ENTRIES, PLUGIN_ENTRY] : ENTRIES;

export default {
  setup() {
    const ctx = inject("appContext");
    return { ...(ctx || {}), entries };
  }
};
</script>
