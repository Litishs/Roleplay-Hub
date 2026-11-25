<template>
    <!-- Narrow-screen "工坊" tab (2026-11-23): the three online workshops behind
         one root page. Each workshop is its own card (reference 2026-11-24) so
         the destinations read as three separate products rather than settings
         rows. Always mounted (v-show) so a later push animation can slide a
         workshop over a root that is still painted. -->
    <div v-show="currentView === 'workshop'" class="management-view tab-hub-view">
        <settings-page-header title="工坊" :back="false">
            <!-- Same 24px primary glyph as the tab bar entry (2026-11-24), so the
                 four tab roots share one title spec. -->
            <template #icon>
                <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 5a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V5zm-9 9a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z"></path>
                </svg>
            </template>
        </settings-page-header>
        <div class="tab-hub-cards">
            <button v-for="entry in entries" :key="entry.view" type="button"
                class="tab-hub-card" @click="currentView = entry.view">
                <span class="tab-hub-card__icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <use v-if="entry.symbol" :href="entry.symbol"></use>
                        <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="entry.icon"></path>
                    </svg>
                </span>
                <span class="settings-accordion-copy">
                    <span class="settings-accordion-title">{{ entry.label }}</span>
                    <span class="settings-accordion-description">{{ entry.description }}</span>
                </span>
                <svg class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>
    </div>
</template>

<script>
import { inject } from "vue";
import SettingsPageHeader from "../common/SettingsPageHeader.vue";

// Icons follow the sidebar entries these replace (SideNav.vue); 万相广场 takes
// a globe because the sidebar's four-squares icon now marks the 工坊 tab itself.
const ENTRIES = [
    { view: 'generator', label: '角色卡生成', description: '从一句话设定生成完整角色卡', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { view: 'square', label: '万相广场', description: '社区分享的角色卡与灵感', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { view: 'novel', label: '小说生成', description: '长篇续写与章节管理', symbol: '#icon-book' }
];

export default {
  // Registered locally: the root app's `components` option only resolves the
  // root template, so panels must import what their own template uses.
  components: { SettingsPageHeader },
  setup() {
    const ctx = inject("appContext");
    return { ...(ctx || {}), entries: ENTRIES };
  }
};
</script>
