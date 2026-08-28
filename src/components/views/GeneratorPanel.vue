<template>
            <div v-if="currentView === 'generator'" class="h-full overflow-hidden flex flex-col bg-gray-50 relative">
                <embedded-view-content :src="generatorUrl" :loading="isGeneratorLoading"
                    loading-text="加载角色卡工坊中..." @menu="toggleMobileMenu" @load="onGeneratorLoad">
                </embedded-view-content>
            </div>
</template>

<script>
import { inject } from "vue";
import EmbeddedViewContent from "../common/EmbeddedViewContent.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { EmbeddedViewContent },
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>
