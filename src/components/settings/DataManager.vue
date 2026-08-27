<template>
    <div class="settings-panel-content grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" @click="exportNativeBackup" :disabled="backupInProgress"
            class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
            完整备份
        </button>
        <button type="button" @click="restoreNativeBackup" :disabled="backupInProgress"
            class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-import"></use></svg>
            恢复备份
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
