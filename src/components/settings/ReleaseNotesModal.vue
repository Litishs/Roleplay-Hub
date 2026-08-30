<template>
    <transition enter-active-class="transition duration-300 ease-modal-fade" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="releaseNotesModal.show"
            class="fixed inset-0 z-[210] flex items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div class="fixed inset-0 bg-black/40 backdrop-blur-[2px]" @click="releaseNotesModal.onCancel"></div>
            <div class="bg-white rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] transform transition-transform w-full max-w-md overflow-hidden relative z-10 border border-gray-100 flex flex-col animate-slide-up">
                <div class="px-6 pt-6 pb-2 text-center">
                    <div class="w-12 h-12 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-3 border border-green-100 shadow-sm">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-bold text-gray-900 tracking-tight">发现新版本</h3>
                    <p class="text-[13px] text-gray-500 mt-1 font-mono">
                        v{{ releaseNotesModal.currentVersion }} → v{{ releaseNotesModal.latestVersion }}
                    </p>
                </div>
                <div class="px-6 pb-2 flex-1 min-h-0 flex flex-col">
                    <p class="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5 text-left">更新说明</p>
                    <div class="release-notes-body text-left text-[13px] text-gray-600 leading-relaxed overflow-y-auto max-h-[45vh] px-1 prose-sm"
                        v-html="releaseNotesModal.html"></div>
                </div>
                <div class="flex space-x-3 w-full p-6 pt-4">
                    <button @click="releaseNotesModal.onCancel"
                        class="flex-1 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl transition-all border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 hover:-translate-y-0.5">
                        稍后再说
                    </button>
                    <button @click="releaseNotesModal.onConfirm"
                        class="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-green-400 hover:-translate-y-0.5">
                        立即更新
                    </button>
                </div>
            </div>
        </div>
    </transition>
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
