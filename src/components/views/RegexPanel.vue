<template>
            <div v-if="currentView === 'regex'" class="management-view">
                <settings-page-header title="正则脚本" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                        </svg>
                    </template>
                    <button @click="openExportModal('regex')" class="settings-icon-button" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importRegex" class="hidden">
                    </label>
                    <button @click="createRegex" class="settings-create-button" title="新建脚本">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>
                <div id="regex-list" class="grid grid-cols-1 gap-4">
                    <div v-for="(script, index) in regexScripts" :key="script.name + index"
                        class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
                        <div class="flex-1 min-w-0 mr-4 flex items-center">
                            <div class="cursor-move text-gray-400 mr-3 hover:text-gray-600" title="拖动排序">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 8h16M4 16h16"></path>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    <h3 class="font-bold text-gray-800 truncate">{{ script.name }}</h3>
                                    <span class="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0"
                                        :class="script.scope === 'global' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'">
                                        {{ script.scope === 'global' ? '全局' : '绑定' }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-4 flex-shrink-0">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="script.enabled" class="settings-toggle-input sr-only" :true-value="true"
                                    :false-value="false">
                                <div class="settings-toggle"></div>
                            </label>
                            <div class="flex space-x-1 border-l border-gray-200 pl-4">
                                <button @click="editRegex(index)"
                                    class="item-action-button item-action-button--edit"
                                    title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                                <button @click="deleteRegex(index)"
                                    class="item-action-button item-action-button--delete"
                                    title="删除">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                        </path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tools View -->
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
