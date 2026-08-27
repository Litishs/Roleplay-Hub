<template>
    <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400 pb-4 select-none">
        <span>Roleplay Hub</span>
        <span v-if="appVersionName" class="font-mono">v{{ appVersionName }}</span>
        <span v-if="appVersionCode" class="font-mono">(build {{ appVersionCode }})</span>
        <span v-if="latestVersionName" class="text-green-500">→ v{{ latestVersionName }}</span>
        <button @click="checkForUpdates(true)" :disabled="checkingUpdate" class="hover:text-primary-500 transition-colors ml-1.5" title="检查更新">
            <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
        </button>
        <button v-if="updateAvailable" @click="downloadAndInstallUpdate" :disabled="downloadingUpdate" class="ml-1.5 px-1.5 py-0.5 bg-green-600 text-white rounded text-[10px] font-bold hover:bg-green-500 transition-colors">
            <template v-if="!downloadingUpdate">更新</template>
            <template v-else>{{ Math.round(downloadProgress * 100) }}%</template>
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
