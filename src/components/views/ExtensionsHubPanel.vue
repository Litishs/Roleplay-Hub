<template>
    <!-- Narrow-screen "扩展" tab (2026-11-23): one flat list of the six
         destinations the drawer used to carry, in the maintainer's order. Each
         entry is its own card (2026-11-24 follow-up: separate cards, not one
         shared panel), so the hub reads the same way as 工坊. Rows reuse the
         settings row classes for typography and hover; each row's right side
         reports its current state: live counts, the active preset group, the
         running update. Always mounted (v-show) so a later push animation can
         slide a page over a root that is still painted. -->
    <div v-show="currentView === 'ext'" class="management-view tab-hub-view">
        <settings-page-header title="扩展" :back="false"></settings-page-header>
        <div class="tab-hub-cards">
            <div v-for="entry in entries" :key="entry.view" class="tab-hub-row-card">
                <button type="button" class="settings-accordion-trigger settings-link-row"
                    @click="currentView = entry.view">
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
                             记忆系统 row; keep it where the entry now is. It wins
                             over the count while a migration is in flight. -->
                        <span v-if="entry.view === 'memory' && memoryMigrationBadge"
                            class="settings-accordion-badge">{{ memoryMigrationBadge }}</span>
                        <span v-else-if="entry.view === 'uitemplates' && uiTemplateUpdateStatus.state === 'running'"
                            class="settings-accordion-badge">更新中</span>
                        <span v-else class="tab-hub-status__text">{{ statusFor(entry.view) }}</span>
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
import SettingsPageHeader from "../common/SettingsPageHeader.vue";

// Icons are the sidebar's (SideNav.vue) so each destination keeps the glyph
// users already know.
const ENTRIES = [
    { view: 'memory', label: '记忆系统', description: '账本、事实与固定记忆', icon: ['M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'] },
    { view: 'presets', label: '预设', description: '提示词与生成参数组合', icon: ['M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4M6 18a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'] },
    { view: 'worldinfo', label: '世界书', description: '关键词触发的设定条目', icon: ['M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5S19.83 5.48 21 6.25v13C19.83 18.48 18.25 18 16.5 18s-3.33.48-4.5 1.25'] },
    { view: 'regex', label: '正则', description: '收发文本的查找替换脚本', icon: ['M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'] },
    { view: 'uitemplates', label: 'UI模板', description: '消息内的可交互界面', icon: ['M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5'] },
    { view: 'tools', label: '工具', description: '允许模型调用的功能', icon: ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z'] }
];

// The plugin marketplace stays hidden behind the same flag as the sidebar's
// entry (SideNav.vue); flip both together.
const pluginsMarketEnabled = false;
const PLUGIN_ENTRY = { view: 'plugins', label: '插件市场', description: '浏览与管理插件', icon: ['M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z'] };

// Plain data: the entries never change at runtime, so this need not be reactive.
const entries = pluginsMarketEnabled ? [...ENTRIES, PLUGIN_ENTRY] : ENTRIES;

const asList = (source) => (Array.isArray(source?.value) ? source.value : []);

export default {
  // Registered locally: the root app's `components` option only resolves the
  // root template, so panels must import what their own template uses.
  components: { SettingsPageHeader },
  setup() {
    const ctx = inject("appContext") || {};
    // Right-hand status: read straight from the state the detail pages use, so
    // the hub shows the same numbers without a second source of truth. Counts
    // always render (0 included) so an empty feature reads as empty, not broken.
    const statusFor = (view) => {
      switch (view) {
        case 'memory': {
          const count = asList(ctx.memoryTocEntries).length;
          return `${count} 条`;
        }
        case 'presets': {
          const active = asList(ctx.presetGroups).find(group => group.enabled);
          return active?.name || '';
        }
        case 'worldinfo': {
          const enabled = asList(ctx.worldInfo).filter(entry => entry.enabled !== false).length;
          return `启用 ${enabled} 条`;
        }
        case 'regex': {
          return `${asList(ctx.regexScripts).length} 条规则`;
        }
        case 'uitemplates': {
          return `${asList(ctx.currentUiTemplates).length} 个`;
        }
        case 'tools': {
          // Dedupe by call name the way normalizeActiveTools does, without
          // mutating state from render.
          const callNames = new Set();
          asList(ctx.activeTools).forEach(tool => {
            if (tool && tool.enabled !== false && tool.callName) callNames.add(tool.callName);
          });
          return `启用 ${callNames.size} 个`;
        }
        default:
          return '';
      }
    };
    return { ...ctx, entries, statusFor };
  }
};
</script>
