<template>
    <!-- Narrow-screen root navigation (2026-11-23). Wide screens keep the left
         sidebar and detail pages use the whole screen, so the bar only shows on
         the four tab roots. It is an overlay: tab-root views reserve its height
         through .app-views.has-tab-bar, which lets content sit under it later
         (glass) and lets it animate without moving the layout. -->
    <nav v-show="isTabRootView && !isRootTextFocused" class="bottom-tab-bar" aria-label="主导航">
        <button v-for="tab in tabs" :key="tab.id" type="button" class="bottom-tab"
            :class="{ 'is-active': activeTab === tab.id }"
            :aria-current="activeTab === tab.id ? 'page' : undefined" :aria-label="tab.label"
            @click="switchTab(tab.id)">
            <span class="bottom-tab__pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path v-for="(d, index) in tab.icon" :key="index" :d="d"></path>
                </svg>
            </span>
            <span class="bottom-tab__label">{{ tab.label }}</span>
        </button>
    </nav>
</template>

<script>
import { inject } from "vue";
import { TAB_ORDER } from "../../modules/tab-navigation.mjs";

// Labels and icon paths mirror the sidebar's (SideNav.vue) so a destination
// reads the same in both navigations. The order comes from TAB_ORDER.
const TAB_META = {
    home: {
        label: '会话',
        icon: ['M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z']
    },
    workshop: {
        label: '工坊',
        icon: ['M4 5a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V5zm-9 9a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z']
    },
    ext: {
        label: '扩展',
        icon: ['M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z']
    },
    settings: {
        label: '设置',
        icon: [
            'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
            'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
        ]
    }
};

// Plain data: the tabs never change at runtime, so this need not be reactive.
const tabs = TAB_ORDER.map(id => ({ id, ...TAB_META[id] }));

export default {
  setup() {
    const ctx = inject("appContext");
    return { ...(ctx || {}), tabs };
  }
};
</script>
