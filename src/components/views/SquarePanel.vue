<template>
            <div v-if="currentView === 'square'" class="h-full overflow-hidden flex flex-col bg-gray-50 relative">
                <button type="button" @click="openSquareExternally"
                    class="absolute top-3 right-3 z-30 w-10 h-10 inline-flex items-center justify-center rounded-lg bg-white/95 border border-gray-200 text-gray-600 shadow-md active:scale-95 transition-transform"
                    title="在系统浏览器打开万相广场" aria-label="在系统浏览器打开万相广场">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M5 7v12h12v-5"></path>
                    </svg>
                </button>
                <embedded-view-content :src="squareUrl" :loading="isSquareLoading"
                    loading-text="加载万相广场中..." @menu="toggleMobileMenu" @load="onSquareLoad">
                </embedded-view-content>
            </div>

            <!-- Settings View -->
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
