<template>
    <div class="settings-panel-content grid grid-cols-2 gap-3">
        <!-- 导出在左、导入在右，两个按钮等宽一排。强调色用主色蓝（AGENTS §2.7：
             操作按钮一律 bg-primary-600，不用绿色）。 -->
        <button type="button" @click="exportNativeBackup" :disabled="backupInProgress"
            class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" aria-hidden="true"><use href="#icon-export"></use></svg>
            导出备份
        </button>
        <button type="button" @click="restoreNativeBackup" :disabled="backupInProgress"
            class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" aria-hidden="true"><use href="#icon-import"></use></svg>
            导入备份
        </button>
    </div>
</template>

<script>
import { inject } from "vue";
export default {
    setup() {
        const ctx = inject("appContext");
        return ctx || {};
    }
};
</script>
