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
import { inject } from "vue";
export default {
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>
