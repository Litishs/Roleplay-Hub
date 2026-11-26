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
                        class="w-full touch-range cursor-pointer">
                </div>

                <!-- Page background (2026-11-26). Only the choice is stored; a
                     custom image is compressed to a file in the app's private
                     media directory, which the native backup packs with the rest
                     of the user's data. -->
                <div
                    class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 md:col-span-2">
                    <div class="flex justify-between items-center mb-3">
                        <label
                            class="text-xs font-bold text-gray-500 uppercase tracking-wider">界面底图</label>
                        <span class="text-xs text-gray-400">{{ pageBackgroundLabel }}</span>
                    </div>
                    <custom-select v-model="pageBackgroundChoice" :options="pageBackgroundOptions"
                        button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-400 focus:ring-indigo-100"
                        menu-class="text-sm">
                    </custom-select>
                    <div class="mt-3 flex items-center gap-2">
                        <button type="button" @click="pageBackgroundInput?.click()"
                            class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary-700">
                            {{ settings.pageBackground === 'custom' ? '更换图片' : '选择相册图片' }}
                        </button>
                        <button v-if="settings.pageBackground === 'custom'" type="button"
                            @click="clearPageBackground()"
                            class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                            移除
                        </button>
                        <span class="text-[11px] text-gray-400">长边不超过 1080px，自动压缩</span>
                    </div>
                    <input ref="pageBackgroundInput" type="file" accept="image/*" class="hidden"
                        @change="handlePageBackgroundSelection">
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { computed, inject, ref } from "vue";
import { RPHubCustomSelect as CustomSelect } from "../../modules/ui-select.mjs";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.

export default {
  components: { CustomSelect },
    setup() {
        const ctx = inject("appContext") || {};

        // Page background (2026-11-26). The row owns the option list and the
        // file input; the pipeline itself (compress, write, toast) lives in
        // app.mjs because it writes settings and shows a toast.
        const pageBackgroundInput = ref(null);
        const pageBackgroundOptions = [
            { value: 'off', label: '关闭' },
            { value: 'aurora', label: '极光' },
            { value: 'dune', label: '沙丘' },
            { value: 'custom', label: '自定义图片' }
        ];
        const pageBackgroundLabel = computed(() => {
            const choice = ctx.settings?.pageBackground || 'off';
            const match = pageBackgroundOptions.find((option) => option.value === choice);
            return match ? match.label : '关闭';
        });
        // Selecting 自定义图片 must not blank the current background before an
        // image is chosen, so the picker opens first and the write happens on
        // the file's change event.
        const pageBackgroundChoice = computed({
            get: () => ctx.settings?.pageBackground || 'off',
            set: (value) => {
                if (!ctx.settings) return;
                if (value === 'custom') {
                    pageBackgroundInput.value?.click();
                    return;
                }
                ctx.settings.pageBackground = value;
            }
        });
        const handlePageBackgroundSelection = async (event) => {
            const input = event.target;
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            await ctx.selectCustomPageBackground?.(file);
        };

        return {
            ...ctx,
            pageBackgroundInput,
            pageBackgroundOptions,
            pageBackgroundLabel,
            pageBackgroundChoice,
            handlePageBackgroundSelection
        };
    }
};
</script>
