<template>
    <div class="settings-panel-content space-y-6">
        <!-- Settings Toggles Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label
                class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                <div class="relative inline-flex items-center mr-2.5">
                    <input type="checkbox" v-model="settings.autoFetchModels" class="settings-toggle-input sr-only">
                    <div class="settings-toggle settings-toggle--indigo"></div>
                </div>
                <span
                    class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">自动获取模型</span>
            </label>
            <label
                class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                <div class="relative inline-flex items-center mr-2.5">
                    <input type="checkbox" v-model="settings.stream" class="settings-toggle-input sr-only">
                    <div class="settings-toggle settings-toggle--indigo"></div>
                </div>
                <span
                    class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">流式输出
                </span>
            </label>
            <label
                class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                <div class="relative inline-flex items-center mr-2.5">
                    <input type="checkbox" v-model="settings.useCharacterBackground"
                        class="settings-toggle-input sr-only">
                    <div class="settings-toggle settings-toggle--indigo"></div>
                </div>
                <span
                    class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">使用封面背景</span>
            </label>
            <label
                class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                <div class="relative inline-flex items-center mr-2.5">
                    <input type="checkbox" v-model="settings.immersiveMode" class="settings-toggle-input sr-only">
                    <div class="settings-toggle settings-toggle--indigo"></div>
                </div>
                <span
                    class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">沉浸模式</span>
            </label>
        </div>

        <!-- Render Layer Limit Setting -->
        <div class="pt-6 border-t border-gray-100 mt-6">
            <h4 class="settings-section-heading">
                <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                    </path>
                </svg>
                高级参数
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Font Family Setting -->
                <div
                    class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                    <label
                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">界面字体</label>
                    <custom-select v-model="settings.fontFamily" :options="fontFamilyOptions"
                        button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-400 focus:ring-indigo-100"
                        menu-class="text-sm">
                    </custom-select>
                </div>

                <!-- Theme Mode Setting -->
                <div
                    class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                    <label
                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">外观主题</label>
                    <custom-select v-model="settings.themeMode" :options="themeModeOptions"
                        button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-400 focus:ring-indigo-100"
                        menu-class="text-sm">
                    </custom-select>
                </div>

                <!-- Font Size Setting -->
                <div
                    class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                    <div class="flex justify-between items-center mb-3">
                        <label
                            class="text-xs font-bold text-gray-500 uppercase tracking-wider">对话字体大小</label>
                        <span
                            class="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 whitespace-nowrap">{{
                            settings.fontSize }}px</span>
                    </div>
                    <input type="range" v-model.number="settings.fontSize" min="12" max="24"
                        step="1"
                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all">
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { inject } from "vue";
import { RPHubCustomSelect as CustomSelect } from "../../modules/ui-select.mjs";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { CustomSelect },
    setup() {
        const ctx = inject("appContext");
        return ctx || {};
    }
};
</script>
