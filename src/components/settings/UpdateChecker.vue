<template>
    <div class="px-4 pb-4 select-none">
        <!-- Inline update announcement card (shown when an update is available
             and the user has not dismissed it today) -->
        <div v-if="updateAvailable && !updateNoticeDismissedToday"
            class="mb-3 rounded-2xl border border-green-200 bg-green-50/60 overflow-hidden shadow-sm">
            <div class="px-4 pt-3 pb-2 border-b border-green-100 flex items-start justify-between gap-3">
                <div>
                    <h4 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        发现新版本
                    </h4>
                    <p class="text-[11px] text-gray-500 font-mono mt-0.5">
                        v{{ appVersionName || '?' }} → v{{ latestVersionName }}
                    </p>
                </div>
                <button @click="dismissUpdateNoticeToday"
                    class="text-[11px] text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                    今日不再提示
                </button>
            </div>
            <div class="px-4 py-3 max-h-48 overflow-y-auto text-[13px] text-gray-600 leading-relaxed release-notes-body"
                v-html="renderReleaseNotesHtml(updateInfo && updateInfo.body)"></div>
            <div class="px-4 pb-3">
                <button @click="downloadAndInstallUpdate()" :disabled="downloadingUpdate || checkingUpdate"
                    class="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-60">
                    <template v-if="!downloadingUpdate">立即更新</template>
                    <template v-else>{{ Math.round(downloadProgress * 100) }}%</template>
                </button>
            </div>
        </div>

        <!-- Version footer line -->
        <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <span>Roleplay Hub</span>
            <span v-if="appVersionName" class="font-mono">v{{ appVersionName }}</span>
            <span v-if="appBuildType" class="font-mono">({{ appBuildType }})</span>
            <span v-if="latestVersionName" class="text-green-500">→ v{{ latestVersionName }}</span>
            <button @click="checkForUpdates(true)" :disabled="checkingUpdate" class="hover:text-primary-500 transition-colors ml-1.5" title="检查更新">
                <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
            </button>
        </div>
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
