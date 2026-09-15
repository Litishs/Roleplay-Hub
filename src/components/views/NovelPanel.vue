<template>
            <div v-if="currentView === 'novel'" class="h-full overflow-hidden flex flex-col bg-gray-50 relative">
                <embedded-view-content :src="novelUrl" :loading="isNovelLoading"
                    loading-text="加载小说工坊中..." @menu="toggleMobileMenu" @load="onNovelLoad">
                </embedded-view-content>
            </div>
</template>

<script>
import { inject } from "vue";
import EmbeddedViewContent from "../common/EmbeddedViewContent.vue";
// Novel workshop ("墨韵·造梦") panel: thin wrapper around the standalone
// novel/index.html page, mirroring GeneratorPanel/SquarePanel (Phase 1.6:
// shared components declared locally). The panel only mounts while
// currentView === 'novel', so the <=3 active iframe budget is preserved.
// No "open in system browser" button: the page is local-only and depends on
// the host storage bridge.
export default {
  components: { EmbeddedViewContent },
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>
