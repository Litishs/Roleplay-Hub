<template>
            <div v-if="currentView === 'presets'" class="management-view">
                <settings-page-header title="预设管理" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
                        </svg>
                    </template>
                    <button @click="openExportModal('presets')" class="settings-icon-button" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入预设">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importPresets" class="hidden">
                    </label>
                    <button @click="createPreset" class="settings-create-button" title="新建预设">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div id="presets-list" class="space-y-4">
                    <div v-for="(preset, index) in presets" :key="preset.name + index"
                        class="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
                        <div class="flex items-center flex-1 min-w-0 mr-4">
                            <div class="cursor-move text-gray-400 mr-3 hover:text-gray-600 flex-shrink-0" title="拖动排序">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 8h16M4 16h16"></path>
                                </svg>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 min-w-0">
                                    <h3 class="font-bold text-gray-800 truncate">{{ preset.name }}</h3>
                                    <span :class="['hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full border font-bold flex-shrink-0', getPresetRoleBadgeClass(preset)]">
                                        {{ getPresetRoleDisplayLabel(preset) }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-4 flex-shrink-0">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="preset.enabled" class="settings-toggle-input sr-only">
                                <div class="settings-toggle"></div>
                            </label>
                            <div class="flex space-x-1 border-l border-gray-200 pl-4">
                                <button @click="editPreset(index)"
                                    class="item-action-button item-action-button--edit"
                                    title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                                <button @click="deletePreset(index)"
                                    class="item-action-button item-action-button--delete"
                                    title="删除">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- UI Templates View -->
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
