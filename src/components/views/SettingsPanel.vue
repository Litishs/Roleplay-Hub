<template>
            <div v-if="currentView === 'settings'" class="management-view">
                <div class="max-w-3xl mx-auto flex items-center mb-4 md:mb-6">
                    <button @click="toggleMobileMenu"
                            class="mobile-menu-button">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
                    </button>
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg>
                        设置
                    </h2>
                    <span class="ml-auto text-[10px] md:text-[11px] text-gray-400 font-medium select-none">原作者 STA1N · 二次开发 Litishs</span>
                </div>
                <div class="settings-stack">


                    <!-- User Settings -->
                    <section class="settings-accordion settings-accordion--user"
                        :class="{'is-open': settingsSectionsOpen.user}">
                        <button type="button"
                            @click="settingsSectionsOpen.user = !settingsSectionsOpen.user; settingsHelpTopic = ''; showProfileDropdown = false"
                            class="settings-accordion-trigger" :aria-expanded="settingsSectionsOpen.user"
                            aria-controls="user-settings-panel">
                            <span class="settings-accordion-icon settings-accordion-avatar">
                                <img v-if="user?.avatar" :src="user.avatar" alt="" class="w-full h-full object-cover">
                                <span v-else>{{ (user.name || 'U').charAt(0).toUpperCase() }}</span>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">用户设置</span>
                                <span class="settings-accordion-description">人设、头像与叙事视角</span>
                            </span>
                            <span class="settings-accordion-summary">
                                {{ user.name || '未命名' }} · {{ isSecondPerson ? '第二人称' : '第三人称' }}
                            </span>
                            <svg :class="{'rotate-180': settingsSectionsOpen.user}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>

                        <div id="user-settings-panel" class="settings-collapse" :class="{'is-open': settingsSectionsOpen.user}"
                            :aria-hidden="!settingsSectionsOpen.user" :inert="!settingsSectionsOpen.user">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                                    <PresetManager />
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- API Settings -->
                    <section class="settings-accordion settings-accordion--api"
                        :class="{'is-open': settingsSectionsOpen.api}">
                        <button type="button" @click="settingsSectionsOpen.api = !settingsSectionsOpen.api; settingsHelpTopic = ''"
                            class="settings-accordion-trigger"
                            :aria-expanded="settingsSectionsOpen.api" aria-controls="api-settings-panel">
                            <span class="settings-accordion-icon">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">API 连接与服务</span>
                                <span class="settings-accordion-description">提供商、密钥与模型服务</span>
                            </span>
                            <span class="settings-accordion-summary">
                                {{ selectedApiProvider.name }} · {{ apiStatus === 'connected' ? apiLatency + 'ms' : (apiStatus === 'checking' ? '检测中' : (apiStatus === 'error' ? '连接失败' : '未检测')) }}
                            </span>
                            <svg :class="{'transform rotate-180': settingsSectionsOpen.api}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>

                        <div id="api-settings-panel" class="settings-collapse" :class="{'is-open': settingsSectionsOpen.api}"
                            :aria-hidden="!settingsSectionsOpen.api" :inert="!settingsSectionsOpen.api">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                        <ApiConfig />
                        </div>
                        </div>
                    </div>
                    </section>

                    <!-- Advanced Settings -->
                    <section class="settings-accordion settings-accordion--advanced"
                        :class="{'is-open': settingsSectionsOpen.advanced}">
                        <button type="button" @click="settingsSectionsOpen.advanced = !settingsSectionsOpen.advanced; settingsHelpTopic = ''"
                            class="settings-accordion-trigger"
                            :aria-expanded="settingsSectionsOpen.advanced" aria-controls="advanced-settings-panel">
                            <span class="settings-accordion-icon">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">高级设置</span>
                                <span class="settings-accordion-description">生成策略与界面外观</span>
                            </span>
                            <span class="settings-accordion-summary">
                                {{ settings.themeMode === 'dark' ? '深色' : (settings.themeMode === 'light' ? '浅色' : '跟随系统') }} · {{ settings.fontSize }}px
                            </span>
                            <svg :class="{'transform rotate-180': settingsSectionsOpen.advanced}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>

                        <div id="advanced-settings-panel" class="settings-collapse" :class="{'is-open': settingsSectionsOpen.advanced}"
                            :aria-hidden="!settingsSectionsOpen.advanced" :inert="!settingsSectionsOpen.advanced">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                        <AdvancedSettings />
                        </div>
                        </div>
                    </div>
                    </section>

                    <!-- 语音设置（TTS P0：Android 系统语音引擎） -->
                    <section class="settings-accordion settings-accordion--voice"
                        :class="{'is-open': ttsSettingsExpanded}">
                        <button type="button" @click="ttsSettingsExpanded = !ttsSettingsExpanded; settingsHelpTopic = ''"
                            class="settings-accordion-trigger" aria-controls="tts-settings-panel"
                            :aria-expanded="ttsSettingsExpanded">
                            <span class="settings-accordion-icon">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"></path>
                                </svg>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">语音设置</span>
                                <span class="settings-accordion-description">朗读引擎与播放偏好</span>
                            </span>
                            <span class="settings-accordion-summary">{{ settings.ttsEnabled ? '已开启' : '已关闭' }}</span>
                            <svg :class="{'transform rotate-180': ttsSettingsExpanded}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                        <div id="tts-settings-panel" class="settings-collapse" :class="{ 'is-open': ttsSettingsExpanded }"
                            :aria-hidden="!ttsSettingsExpanded" :inert="!ttsSettingsExpanded">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                                    <TtsSettings />
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- 本机数据（备份与恢复，置于设置页最底部） -->
                    <section class="settings-accordion settings-accordion--local"
                        :class="{'is-open': settingsSectionsOpen.localData}">
                        <button type="button" @click="settingsSectionsOpen.localData = !settingsSectionsOpen.localData; settingsHelpTopic = ''"
                            class="settings-accordion-trigger"
                            :aria-expanded="settingsSectionsOpen.localData" aria-controls="local-data-panel">
                            <span class="settings-accordion-icon">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9.5L14.5 4H6a2 2 0 00-2 2v1zm4 12v-6h8v6M8 4v5h6V4"></path>
                                </svg>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">本机数据</span>
                                <span class="settings-accordion-description">完整备份与恢复</span>
                            </span>
                            <span class="settings-accordion-summary">备份与恢复</span>
                            <svg :class="{'transform rotate-180': settingsSectionsOpen.localData}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                        <div id="local-data-panel" class="settings-collapse" :class="{'is-open': settingsSectionsOpen.localData}"
                            :aria-hidden="!settingsSectionsOpen.localData" :inert="!settingsSectionsOpen.localData">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                        <DataManager />
                        <div class="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                            <div class="flex items-center justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-sm font-bold text-gray-700">运行日志</span>
                                        <button type="button" @click="diagnosticsHelpOpen = !diagnosticsHelpOpen"
                                            class="settings-help-trigger" :class="{ 'is-open': diagnosticsHelpOpen }"
                                            :aria-expanded="diagnosticsHelpOpen" aria-label="查看运行日志说明"
                                            title="运行日志说明">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                    </div>
                                    <div class="mt-0.5 text-[11px] text-gray-400">
                                        最近 {{ requestDiagnosticsCount }} 条 / 其中 LLM 对话 {{ chatDiagnosticsCount }} 条
                                    </div>
                                </div>
                                <div class="flex flex-shrink-0 items-center gap-2 flex-wrap justify-end">
                                    <button type="button" @click="exportRequestDiagnostics('file')"
                                        class="inline-flex items-center text-xs px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium border border-primary-600 transition-all active:scale-95 shadow-sm">
                                        <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m4 4H5a2 2 0 01-2-2V6a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 11v7a2 2 0 01-2 2z"></path>
                                        </svg>
                                        导出日志
                                    </button>
                                    <button type="button" @click="clearRequestDiagnostics"
                                        class="inline-flex items-center text-xs px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 font-medium border border-gray-200 transition-all active:scale-95"
                                        title="清空运行日志">
                                        <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                        清空
                                    </button>
                                </div>
                            </div>
                            <div v-if="diagnosticsHelpOpen" class="mt-2 rounded-lg bg-gray-50 p-2.5 text-[11px] leading-5 text-gray-500">
                                仅记录「行为摘要」（功能类型、耗时、字符数、哈希、短错误提示），不含聊天明文、思考过程或设定正文，可安全导出用于定位问题。
                            </div>
                        </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                            <UpdateChecker />

            <!-- Presets View -->
            </div>
</template>

<script>
import { inject, ref } from "vue";
import ApiConfig from "../settings/ApiConfig.vue";
import PresetManager from "../settings/PresetManager.vue";
import DataManager from "../settings/DataManager.vue";
import UpdateChecker from "../settings/UpdateChecker.vue";
import AdvancedSettings from "../settings/AdvancedSettings.vue";
import TtsSettings from "../settings/TtsSettings.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { ApiConfig, PresetManager, DataManager, UpdateChecker, AdvancedSettings, TtsSettings },
  setup() {
    const ctx = inject("appContext");
    const diagnosticsHelpOpen = ref(false);
    return { ...(ctx || {}), diagnosticsHelpOpen };
  }
};
</script>
