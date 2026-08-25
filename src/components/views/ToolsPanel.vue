<template>
            <div v-if="currentView === 'tools'" class="management-view">
                <settings-page-header title="工具" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z"></path>
                        </svg>
                    </template>
                </settings-page-header>

                <div
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <button @click="showActiveToolSettings = !showActiveToolSettings"
                        :class="['w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all font-bold',
                                     showActiveToolSettings ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50']">
                        <span class="flex items-center min-w-0">
                            <div
                                :class="['p-1.5 rounded-lg mr-3 transition-colors', showActiveToolSettings ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                    </path>
                                </svg>
                            </div>
                            <span class="truncate">工具全局设置</span>
                        </span>
                        <span class="flex items-center flex-shrink-0">
                            <svg :class="{'transform rotate-180': showActiveToolSettings}"
                                class="w-5 h-5 transition-transform duration-300" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                                </path>
                            </svg>
                        </span>
                    </button>
                    <div v-show="showActiveToolSettings" class="px-3 pb-3 pt-2 border-t border-gray-100 animate-fade-in">
                        <div class="bg-gray-50/60 p-2.5 rounded-xl border border-gray-100">
                            <div class="flex items-center mb-2">
                                <label class="text-xs font-medium text-gray-500">调用工具积极性</label>
                            </div>
                            <div class="grid grid-cols-3 gap-1 rounded-xl bg-white border border-gray-200 p-1">
                                <button v-for="option in activeToolAggressivenessOptions" :key="option.value"
                                    type="button"
                                    @click="settings.activeToolAggressiveness = option.value"
                                    :class="['h-8 rounded-lg text-[13px] font-bold transition-all active:scale-[0.98]',
                                        settings.activeToolAggressiveness === option.value
                                            ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-100'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50']">
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="active-tools-list" class="space-y-4">
                    <div v-for="(tool, index) in activeTools" :key="tool.id || index"
                        class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex justify-between items-center">
                        <button type="button" @click="editActiveTool(index)"
                            class="flex-1 min-w-0 mr-4 flex items-center text-left">
                            <div class="text-primary-600 bg-primary-50 mr-3 rounded-lg w-10 h-10 flex items-center justify-center flex-shrink-0">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z">
                                    </path>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center">
                                    <h3 class="font-bold text-gray-800 truncate">{{ tool.name || '未命名工具' }}</h3>
                                </div>
                                <div class="text-xs text-gray-500 mt-1 tool-description-preview">
                                    {{ getActiveToolDisplayDescription(tool) }}
                                </div>
                                <div v-if="isWebActiveTool(tool) && tool.enabled && !tool.tavilyApiKey"
                                    class="mt-1 text-[11px] font-bold text-amber-600">
                                    需要填写 Tavily API Key
                                </div>
                            </div>
                        </button>
                        <div class="flex items-center space-x-4 flex-shrink-0">
                            <label class="relative inline-flex items-center cursor-pointer" @click.stop>
                                <input type="checkbox" v-model="tool.enabled" @change="normalizeActiveTools()"
                                    class="settings-toggle-input sr-only">
                                <div class="settings-toggle"></div>
                            </label>
                            <div class="flex space-x-1 border-l border-gray-200 pl-4">
                                <button @click="editActiveTool(index)"
                                    class="item-action-button item-action-button--edit"
                                    title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Token Usage View -->
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
