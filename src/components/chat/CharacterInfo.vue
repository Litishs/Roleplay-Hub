<template>
                <!-- Character Background Layer -->
                <div v-if="settings.useCharacterBackground && currentCharacter && currentCharacter?.avatar"
                    class="absolute -inset-4 bg-cover bg-center bg-no-repeat pointer-events-none transition-opacity duration-500 z-0 blur-[2px] char-bg-blur"
                    :style="{ backgroundImage: `url(${currentCharacter?.avatar})`, opacity: 0.9 }">
                </div>

                <!-- Blur Overlay for Description Panel -->
                <transition name="fade">
                    <div v-if="showDescriptionPanel" @click="showDescriptionPanel = false"
                        class="absolute inset-0 bg-black/5 z-[35] transition-opacity duration-300 desc-panel-overlay">
                    </div>
                </transition>
                <!-- Character Description Panel -->
                <transition name="dropdown">
                    <div v-if="showDescriptionPanel && currentCharacter"
                        class="absolute top-14 left-3 right-3 md:w-[420px] md:left-[60px] md:right-auto md:top-[60px] md:ml-0 max-h-[calc(100dvh-5rem)] md:max-h-[calc(100dvh-7rem)] bg-white border border-gray-200/90 shadow-[0_18px_48px_-26px_rgba(15,23,42,0.5)] rounded-2xl z-40 overflow-hidden ring-1 ring-black/5 origin-top-left transform-gpu flex flex-col desc-panel">
                        <div class="flex items-center gap-3 p-3.5 pr-12 border-b border-gray-100/80 bg-white flex-shrink-0">
                            <button type="button" @click="editCharacter(currentCharacterIndex)"
                                class="group flex-shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
                                title="编辑角色">
                                <img :src="currentCharacter?.avatar"
                                    class="w-14 h-14 rounded-xl object-cover border border-white shadow-sm transition-transform duration-200 group-hover:scale-[1.02]">
                            </button>

                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2 min-w-0">
                                    <h3 class="font-bold text-gray-900 text-lg leading-tight truncate">
                                        {{ currentCharacter.name }}</h3>
                                    <button @click="editCharacter(currentCharacterIndex)"
                                        class="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex-shrink-0"
                                        title="编辑角色">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z">
                                            </path>
                                        </svg>
                                    </button>
                                </div>
                                <div class="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-gray-400 desc-panel-stats">
                                    <span class="inline-flex items-baseline gap-1">
                                        <span class="text-[13px] font-bold leading-none text-gray-700 desc-panel-stat-number">{{ chatRoundStats.floors }}</span>
                                        <span class="desc-panel-stat-unit">楼</span>
                                    </span>
                                    <span class="h-3 w-px rounded-full bg-gray-200"></span>
                                    <span class="inline-flex items-baseline gap-1">
                                        <span class="text-[13px] font-bold leading-none text-gray-700 desc-panel-stat-number">{{ Number(conversationBodyLength || 0).toLocaleString() }}</span>
                                        <span class="desc-panel-stat-unit">字</span>
                                        <span v-if="memorySettings.enabled && memorySettings.mode === 'classic'"
                                            class="inline-flex items-baseline gap-1" title="按当前总结记忆与保留楼层预测">
                                            <span class="text-gray-700" aria-hidden="true">→</span>
                                            <span class="text-[13px] font-bold leading-none text-gray-700 desc-panel-stat-number">{{ Number(summaryCompressedBodyLength || 0).toLocaleString() }}</span>
                                            <span class="desc-panel-stat-unit">字</span>
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <button @click="showDescriptionPanel = false"
                                class="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all z-20 desc-close-btn"
                                title="关闭">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div class="min-h-0 flex-1 p-3.5 flex flex-col overflow-hidden">
                            <div class="mb-2 flex items-center justify-between px-0.5">
                                <div class="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                        </path>
                                    </svg>
                                    角色卡简介
                                </div>
                            </div>
                            <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar rounded-xl bg-gray-50/55 p-3">
                                <div v-if="currentCharacter.description" class="prose prose-sm prose-gray max-w-none">
                                    <div class="text-sm text-gray-700 leading-relaxed font-normal font-sans markdown-body"
                                        v-html="renderMarkdown(currentCharacter.description, 'assistant', true)">
                                    </div>
                                </div>
                                <div v-else
                                    class="flex min-h-32 flex-col items-center justify-center text-gray-400 italic text-sm">
                                    <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                        </path>
                                    </svg>
                                    暂无描述信息
                                </div>
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
