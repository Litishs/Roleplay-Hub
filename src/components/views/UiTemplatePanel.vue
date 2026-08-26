<template>
            <div v-if="currentView === 'uitemplates'" class="management-view">
                <settings-page-header title="UI模板" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path>
                        </svg>
                    </template>
                    <button @click="openExportModal('uitemplates')" :disabled="currentUiTemplates.length === 0"
                        class="settings-icon-button disabled:opacity-40" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importUiTemplates" class="hidden">
                    </label>
                    <button @click="createUiTemplate" class="settings-create-button" title="新建模板">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <button @click="showUiTemplateSettings = !showUiTemplateSettings; settingsHelpTopic = ''"
                        class="settings-collapse-trigger" aria-controls="ui-template-settings-panel"
                        :aria-expanded="showUiTemplateSettings"
                        :class="['w-full flex justify-between items-center px-4 py-3 rounded-xl font-bold',
                                     showUiTemplateSettings ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50']">
                        <span class="flex items-center min-w-0">
                            <span
                                :class="['p-1.5 rounded-lg mr-3 transition-colors', showUiTemplateSettings ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5">
                                    </path>
                                </svg>
                            </span>
                            <span class="truncate">变量系统设置</span>
                            <span v-if="uiTemplateUpdateStatus.state !== 'idle'"
                                class="ml-2 inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border"
                                :class="{
                                    'bg-blue-50 text-blue-700 border-blue-200': uiTemplateUpdateStatus.state === 'running',
                                    'bg-green-50 text-green-700 border-green-200': uiTemplateUpdateStatus.state === 'success',
                                    'bg-yellow-50 text-yellow-700 border-yellow-200': uiTemplateUpdateStatus.state === 'skipped',
                                    'bg-red-50 text-red-700 border-red-200': uiTemplateUpdateStatus.state === 'error',
                                    'bg-gray-50 text-gray-500 border-gray-200': uiTemplateUpdateStatus.state === 'idle'
                                }">
                                {{ uiTemplateUpdateStatus.message }}
                            </span>
                        </span>
                        <span class="flex items-center gap-3 flex-shrink-0">
                            <span class="text-xs font-bold"
                                :class="settings.uiTemplateEnabled ? 'text-primary-600' : 'text-gray-400'">
                                {{ settings.uiTemplateEnabled ? '已开启' : '已关闭' }}
                            </span>
                            <svg :class="{'transform rotate-180': showUiTemplateSettings}"
                                class="settings-collapse-chevron w-5 h-5" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                                </path>
                            </svg>
                        </span>
                    </button>
                    <div id="ui-template-settings-panel" class="settings-collapse"
                        :class="{ 'is-open': showUiTemplateSettings }"
                        :aria-hidden="!showUiTemplateSettings" :inert="!showUiTemplateSettings">
                        <div class="settings-collapse__inner">
                            <div class="settings-collapse__content px-4 pb-4 pt-3 border-t border-gray-100">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center space-x-3">
                                <span class="text-sm font-bold text-gray-700">变量分析</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" v-model="settings.uiTemplateEnabled" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact"></div>
                                </label>
                            </div>
                            <div class="flex items-center justify-end gap-2 min-h-[30px]">
                                <button @click="updateUiTemplatesFromChat({ manual: true })"
                                    :disabled="!settings.uiTemplateEnabled"
                                    class="inline-flex items-center text-xs px-3 py-1.5 bg-gradient-to-r from-primary-50 to-blue-50 hover:from-primary-100 hover:to-blue-100 text-primary-700 rounded-lg border border-primary-200/80 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow font-medium active:scale-95"
                                    :class="settings.uiTemplateMainModelAnalysis ? 'invisible opacity-0 pointer-events-none' : 'visible opacity-100'">
                                    <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                    </svg>
                                    <span>立即分析</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="settings.uiTemplateEnabled"
                            class="mb-3 animate-fade-in">
                            <div class="segmented-switch segmented-switch--compact w-full">
                                <div class="segmented-switch__indicator"
                                    :class="{ 'is-right': !settings.uiTemplateMainModelAnalysis }"></div>
                                <button type="button" @click="settings.uiTemplateMainModelAnalysis = true"
                                    class="segmented-switch__option"
                                    :class="{ 'is-active': settings.uiTemplateMainModelAnalysis }">
                                    主模型
                                </button>
                                <button type="button" @click="settings.uiTemplateMainModelAnalysis = false"
                                    class="segmented-switch__option"
                                    :class="{ 'is-active': !settings.uiTemplateMainModelAnalysis }">
                                    副模型
                                </button>
                            </div>
                        </div>
                        <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis"
                            class="flex items-center justify-between mb-3 animate-fade-in">
                            <div class="flex items-center space-x-3">
                                <span class="text-sm font-bold text-gray-700">将变量注入上下文</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" v-model="settings.uiTemplateInjectContext" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact"></div>
                                </label>
                            </div>
                        </div>
                        <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis"
                            class="flex items-center justify-between mb-3 animate-fade-in">
                            <div class="flex items-center space-x-3">
                                <span class="text-sm font-bold text-gray-700" title="多个模板合并为一次请求（模板数≤5且payload≤200KB时生效），显著降低请求次数与token消耗">合并分析请求</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" v-model="settings.uiTemplateBatchMode" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact"></div>
                                </label>
                            </div>
                        </div>
                        <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis"
                            class="flex items-center justify-between mb-3 animate-fade-in">
                            <div class="flex items-center space-x-3">
                                <span class="text-sm font-bold text-gray-700" title="要求分析接口以 response_format 返回 JSON 对象，结构化输出更稳定；不兼容该参数的端点请关闭">JSON结构化输出</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" v-model="settings.uiTemplateJsonMode" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact"></div>
                                </label>
                            </div>
                        </div>
                        <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis"
                            class="space-y-3 pt-3 border-t border-gray-100 animate-fade-in">
                            <div class="grid grid-cols-1 gap-3">
                                <div>
                                    <div class="relative mb-1.5 flex items-center">
                                        <label class="text-xs font-medium text-gray-500">分析模型</label>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'analysisModel' ? '' : 'analysisModel'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'analysisModel' }"
                                            :aria-expanded="settingsHelpTopic === 'analysisModel'"
                                            aria-label="查看分析模型说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'analysisModel'" class="settings-help-popover">
                                            <span class="settings-help-popover-content">仅在使用副模型分析时生效。它负责阅读对话并更新 UI 模板变量，不参与正文回复。模型速度会影响分析等待时间，结构化输出能力会影响变量更新是否准确。</span>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button @click="openModelSelector('uiTemplateModel')"
                                            class="flex-1 px-3 py-2 text-sm text-left bg-gray-50/60 border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-white transition-all cursor-pointer truncate"
                                            :title="settings.uiTemplateModel || '未选择模型'">
                                            <span
                                                :class="settings.uiTemplateModel ? 'text-gray-800 font-mono' : 'text-gray-400'">{{
                                                settings.uiTemplateModel || '未选择模型' }}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                <div class="flex justify-between items-center mb-2">
                                    <div class="relative flex items-center">
                                        <label class="text-xs font-medium text-gray-500">分析对话层数</label>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'analysisDepth' ? '' : 'analysisDepth'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'analysisDepth' }"
                                            :aria-expanded="settingsHelpTopic === 'analysisDepth'"
                                            aria-label="查看分析对话层数说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'analysisDepth'" class="settings-help-popover is-above">
                                            <span class="settings-help-popover-content">决定副模型分析时读取最近多少层对话。层数越多，能看到的剧情变化越完整，消耗越多；层数越少，消耗越少，但可能看不到较早发生的剧情</span>
                                        </div>
                                    </div>
                                    <span
                                        class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                        {{ uiTemplateAnalysisDepthSlider + ' 层' }}
                                    </span>
                                </div>
                                <input type="range" v-model.number="uiTemplateAnalysisDepthSlider" min="4" max="10"
                                    step="1"
                                    class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                </div>

                <div v-if="!currentCharacter && currentUiTemplates.length === 0" class="py-24 text-center text-gray-400">请先选择角色卡</div>
                <div v-else-if="currentUiTemplates.length === 0" class="py-24 text-center text-gray-400">
                    当前没有UI模板
                </div>
                <div v-else class="space-y-4">
                    <div v-for="(template, index) in currentUiTemplates" :key="template.id"
                        class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div class="p-4 flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="font-bold text-gray-800 truncate">{{ template.name }}</h3>
                                    <span class="text-[10px] px-2 py-0.5 rounded-full border"
                                        :class="template.scope === 'global' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'">
                                        {{ template.scope === 'global' ? '全局' : '绑定' }}
                                    </span>
                                    <span v-if="hasUiTemplateScripts(template.htmlTemplate)"
                                        class="text-[10px] px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200"
                                        title="模板含可执行脚本（&lt;script&gt;/内联事件/iframe），仅在信任来源时使用">
                                        含脚本
                                    </span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">{{ Object.keys(template.variableState || {}).length }} 个变量 · {{ (template.changeLog || []).length }} 条记录</p>
                            </div>
                            <div class="flex items-center gap-1">
                                <label class="relative inline-flex items-center cursor-pointer mr-2">
                                    <input type="checkbox" v-model="template.enabled" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact settings-toggle--solid"></div>
                                </label>
                                <button @click="editUiTemplate(index)" class="item-action-button item-action-button--edit" title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                                <button @click="deleteUiTemplate(index)" class="item-action-button item-action-button--delete" title="删除">
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

            <!-- Regex View -->
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
