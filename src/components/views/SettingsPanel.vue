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
                                    <div class="user-settings-toolbar">
                                        <button type="button" class="user-settings-avatar" @click="$refs.userAvatarInput.click()"
                                            title="更换头像" aria-label="更换头像">
                                            <img v-if="user?.avatar" :src="user.avatar" alt="" class="w-full h-full object-cover">
                                            <span v-else>{{ (user.name || 'U').charAt(0).toUpperCase() }}</span>
                                            <span class="user-settings-avatar-edit" aria-hidden="true">
                                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                                </svg>
                                            </span>
                                        </button>
                                        <input type="file" ref="userAvatarInput" accept="image/*"
                                            @change="handleUserAvatarUpload" class="hidden">

                                        <div class="relative profile-dropdown-container user-settings-profile-picker"
                                            :class="showProfileDropdown ? 'z-[60]' : 'z-10'">
                                            <button type="button" @click.stop="showProfileDropdown = !showProfileDropdown"
                                                class="user-settings-profile-trigger">
                                                <span class="min-w-0 text-left">
                                                    <span class="block font-semibold truncate">{{ user.name || '未命名人设' }}</span>
                                                    <span class="block text-xs text-gray-400 truncate mt-0.5">
                                                        当前人设 · {{ isSecondPerson ? '第二人称' : '第三人称' }}
                                                    </span>
                                                </span>
                                                <svg class="w-4 h-4 flex-shrink-0 text-gray-400 transition-transform"
                                                    :class="{'rotate-180': showProfileDropdown}" fill="none"
                                                    stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </button>

                                            <transition enter-active-class="transition-all duration-150 ease-out"
                                                enter-from-class="opacity-0 -translate-y-1 scale-95"
                                                enter-to-class="opacity-100 translate-y-0 scale-100"
                                                leave-active-class="transition-all duration-100 ease-in"
                                                leave-from-class="opacity-100 translate-y-0 scale-100"
                                                leave-to-class="opacity-0 -translate-y-1 scale-95">
                                                <div v-if="showProfileDropdown" class="user-settings-profile-menu">
                                                    <button v-for="profile in userProfiles" :key="profile.uuid" type="button"
                                                        @click="switchProfile(profile.uuid); showProfileDropdown = false"
                                                        class="user-settings-profile-option"
                                                        :class="{'is-active': activeProfileId === profile.uuid}">
                                                        <span class="user-settings-profile-option-avatar">
                                                            <img v-if="profile.avatar" :src="profile.avatar" alt="" class="w-full h-full object-cover">
                                                            <span v-else>{{ (profile.name || 'U').charAt(0).toUpperCase() }}</span>
                                                        </span>
                                                        <span class="min-w-0 flex-1 text-left">
                                                            <span class="block font-semibold truncate">{{ profile.name || '未命名人设' }}</span>
                                                            <span class="block text-[10px] text-gray-400 truncate mt-0.5">
                                                                {{ profile.person === 'second' ? '第二人称' : '第三人称' }}
                                                                <span v-if="profile.description"> · {{ profile.description.substring(0, 20) }}{{ profile.description.length > 20 ? '...' : '' }}</span>
                                                            </span>
                                                        </span>
                                                        <svg v-if="activeProfileId === profile.uuid" class="w-4 h-4 text-primary-500 flex-shrink-0"
                                                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </transition>
                                        </div>

                                        <button type="button" @click="createNewProfile" class="settings-icon-button"
                                            title="新建人设" aria-label="新建人设">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                            </svg>
                                        </button>
                                        <button type="button" @click="deleteProfile(activeProfileId)"
                                            class="settings-icon-button settings-icon-button--danger"
                                            title="删除当前人设" aria-label="删除当前人设">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                        </button>
                                    </div>

                                    <div class="user-settings-form">
                                        <div class="user-settings-form-grid">
                                            <label class="settings-field">
                                                <span class="settings-field-label">角色名</span>
                                                <input v-model="user.name" type="text" class="settings-form-control"
                                                    placeholder="您的名字">
                                            </label>
                                            <div class="settings-field">
                                                <span class="settings-field-label">叙事视角</span>
                                                <div class="segmented-switch">
                                                    <div class="segmented-switch__indicator" :class="{ 'is-right': !isSecondPerson }"></div>
                                                    <button type="button" @click="togglePerson('second')"
                                                        class="segmented-switch__option" :class="{ 'is-active': isSecondPerson }">
                                                        <span>第二人称</span><span class="text-xs font-normal opacity-80">（你）</span>
                                                    </button>
                                                    <button type="button" @click="togglePerson('third')"
                                                        class="segmented-switch__option" :class="{ 'is-active': !isSecondPerson }">
                                                        <span>第三人称</span><span class="text-xs font-normal opacity-80">（{{ user.name || '他/她' }}）</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <label class="settings-field">
                                            <span class="settings-field-label">详细设定</span>
                                            <textarea v-model="user.description" rows="4" class="settings-form-control settings-form-textarea"
                                                placeholder="描述您的外貌、性格、背景故事等..."></textarea>
                                        </label>
                                    </div>
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
                        <div class="settings-panel-content space-y-6">
                            <!-- Integrated Service Status Monitoring -->
                            <div class="mb-6 pb-6 border-b border-gray-100">
                                <h4
                                    class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                                    <span>服务连接状态</span>
                                    <button @pointerdown="syncApiKeyInput" @click="checkAllStatuses"
                                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium flex items-center">
                                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                                            </path>
                                        </svg>
                                        立即检测
                                    </button>
                                </h4>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- General API Status -->
                                    <div
                                        class="model-setting-row">
                                        <div
                                            :class="['w-2.5 h-2.5 rounded-full mr-3 shadow-sm flex-shrink-0', apiStatus === 'connected' ? 'bg-green-500 shadow-green-200' : (apiStatus === 'checking' ? 'bg-yellow-400 animate-pulse shadow-yellow-200' : (apiStatus === 'error' ? 'bg-red-500 shadow-red-200' : 'bg-gray-300'))]">
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex justify-between items-center mb-0.5">
                                                <div class="text-xs font-bold text-gray-700 truncate">API 接口</div>
                                                <span v-if="apiStatus === 'connected'"
                                                    class="text-xs font-mono font-medium text-teal-600">{{
                                                    apiLatency }}ms</span>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Image API Status -->
                                    <div
                                        class="model-setting-row">
                                        <div class="w-2.5 h-2.5 rounded-full mr-3 shadow-sm flex-shrink-0 bg-gray-300"></div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex justify-between items-center mb-0.5">
                                                <div class="flex items-center gap-1.5 min-w-0 text-xs font-bold text-gray-700 truncate">
                                                    <span>生图服务</span>
                                                    <span class="text-gray-400">·</span>
                                                    <span class="text-gray-500 font-medium whitespace-nowrap">暂不可用</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Main API Inputs -->
                            <div class="grid grid-cols-1 gap-5">
                                <div class="group">
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">API
                                        提供商</label>
                                    <div class="relative mb-2 api-provider-selector-container">
                                        <button type="button" @click="showApiProviderSelector = !showApiProviderSelector"
                                            class="w-full h-12 bg-gray-50/60 border-2 border-gray-100 rounded-xl px-3 py-0 flex items-center justify-between text-left hover:bg-white hover:border-teal-300 hover:shadow-sm transition-all active:scale-[0.99]">
                                            <span class="flex items-center min-w-0">
                                                <span
                                                    class="w-7 h-7 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center mr-2 shrink-0 overflow-hidden">
                                                    <img v-if="selectedApiProvider.icon" :src="selectedApiProvider.icon"
                                                        :alt="selectedApiProvider.name"
                                                        class="w-5 h-5 object-contain"
                                                        @error="$event.target.style.visibility = 'hidden'">
                                                    <svg v-else class="w-4 h-4 text-gray-400" fill="none"
                                                        stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z">
                                                        </path>
                                                    </svg>
                                                </span>
                                                <span class="block min-w-0 text-sm font-bold text-gray-700 truncate">{{
                                                    selectedApiProvider.name }}</span>
                                            </span>
                                            <svg class="w-4 h-4 text-gray-400 ml-2 shrink-0" fill="none"
                                                stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M19 9l-7 7-7-7"></path>
                                            </svg>
                                        </button>
                                        <div v-if="showApiProviderSelector"
                                            class="absolute left-0 right-0 top-full z-40 mt-2 w-full max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl p-2">
                                            <button v-for="provider in apiProviderOptions" :key="provider.id"
                                                type="button" @click="selectApiProvider(provider)"
                                                :class="['w-full px-3 py-2.5 rounded-lg flex items-center text-left transition-all', selectedApiProvider.id === provider.id ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50 text-gray-700']">
                                                <span
                                                    class="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center mr-3 shrink-0 overflow-hidden">
                                                    <img :src="provider.icon" :alt="provider.name"
                                                        class="w-5 h-5 object-contain"
                                                        @error="$event.target.style.visibility = 'hidden'">
                                                </span>
                                                <span class="min-w-0 flex-1">
                                                    <span class="block text-sm font-bold truncate">{{ provider.name
                                                        }}</span>
                                                    <span class="block text-xs text-gray-400 font-mono truncate">{{
                                                        provider.apiUrl }}</span>
                                                </span>
                                                <svg v-if="selectedApiProvider.id === provider.id"
                                                    class="w-4 h-4 ml-2 text-teal-600 shrink-0" fill="none"
                                                    stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M5 13l4 4L19 7"></path>
                                                </svg>
                                                <span v-if="settings.apiProviderKeys && settings.apiProviderKeys[provider.id]"
                                                    class="ml-1.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                                                    title="已配置 Key"></span>
                                            </button>
                                            <button v-for="provider in customApiProviderOptions" :key="provider.id"
                                                type="button" @click="selectApiProvider(provider)"
                                                :class="['w-full mt-2 px-3 py-2.5 border-t border-gray-100 rounded-lg flex items-center text-left transition-all', selectedApiProvider.id === provider.id ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50 text-gray-700']">
                                                <span
                                                    class="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center mr-3 shrink-0">
                                                    <svg class="w-5 h-5 text-gray-500" fill="none"
                                                        stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z">
                                                        </path>
                                                    </svg>
                                                </span>
                                                <span class="min-w-0 flex-1">
                                                    <span class="block text-sm font-bold truncate">{{ provider.name }}</span>
                                                    <span class="block text-xs text-gray-400 truncate">手动输入 API 地址</span>
                                                </span>
                                                <svg v-if="selectedApiProvider.id === provider.id"
                                                    class="w-4 h-4 ml-2 text-teal-600 shrink-0" fill="none"
                                                    stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M5 13l4 4L19 7"></path>
                                                </svg>
                                                <span v-if="settings.apiProviderKeys && settings.apiProviderKeys[provider.id]"
                                                    class="ml-1.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                                                    title="已配置 Key"></span>
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="isCustomApiProvider" class="relative">
                                        <div
                                            class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-teal-500 transition-colors pointer-events-none">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
                                                </path>
                                            </svg>
                                        </div>
                                        <input v-model="settings.apiUrl" type="text"
                                            class="w-full h-12 bg-gray-50/60 border-2 border-gray-100 rounded-xl pl-11 pr-4 py-0 text-gray-800 font-medium focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-100 focus:outline-none transition-all placeholder-gray-400 font-mono text-sm"
                                            placeholder="https://your-api.example/v1">
                                    </div>
                                </div>
                                <div class="group">
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">API
                                        Key</label>
                                    <div class="relative">
                                        <div
                                            class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-teal-500 transition-colors pointer-events-none">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z">
                                                </path>
                                            </svg>
                                        </div>
                                        <input ref="apiKeyInput" v-model="settings.apiKey"
                                            :type="apiKeyVisible ? 'text' : 'password'"
                                            @input="syncApiKeyInput" @change="syncApiKeyInput"
                                            @compositionend="syncApiKeyInput" @blur="syncApiKeyInput"
                                            autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
                                            class="w-full h-12 bg-gray-50/60 border-2 border-gray-100 rounded-xl pl-11 pr-24 py-0 text-gray-800 font-medium focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-100 focus:outline-none transition-all placeholder-gray-400 font-mono text-sm"
                                            placeholder="sk-...">
                                        <div
                                            class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                            <button type="button" @click="pasteApiKeyFromClipboard"
                                                title="从剪贴板粘贴 API Key"
                                                class="h-9 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold border border-teal-100 transition-all active:scale-95 flex items-center gap-1 leading-none"
                                                style="line-height: 1;">
                                                <svg class="w-3.5 h-3.5 flex-shrink-0" style="display:block;vertical-align:middle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                                                </svg>
                                                <span class="flex-shrink-0" style="line-height:1">粘贴</span>
                                            </button>
                                            <button type="button" @click="toggleApiKeyVisibility"
                                                :title="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                                                class="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 flex items-center justify-center transition-all active:scale-95 flex-shrink-0">
                                                <svg v-if="!apiKeyVisible" class="w-4 h-4" style="display:block;vertical-align:middle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                                </svg>
                                                <svg v-else class="w-4 h-4" style="display:block;vertical-align:middle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 当前绑定（聊天/记忆供应商与模型） -->
                                <div class="api-binding-summary mt-4 rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2.5 text-[11px] text-gray-600 space-y-1">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-bold text-gray-700">{{ chatBindingLabel }}</span>
                                        <button type="button" @click="openModelSelector('model')"
                                            class="text-[10px] px-2 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-bold transition-all leading-none" style="line-height:1">
                                            换聊天模型
                                        </button>
                                    </div>
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-bold text-gray-700 truncate">记忆模型：{{ memoryProviderLabel }} · {{ memorySettings.classicModel || '未选' }}</span>
                                        <button type="button" @click="openModelSelector('memoryClassicModel')"
                                            class="text-[10px] px-2 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-bold transition-all leading-none" style="line-height:1">
                                            换
                                        </button>
                                    </div>
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-bold text-gray-700 truncate">向量嵌入：{{ embeddingBindingLabel }}</span>
                                        <button v-if="memorySettings.embeddingBackend !== 'local'" type="button" @click="openModelSelector('memoryEmbeddingModel')"
                                            class="text-[10px] px-2 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-bold transition-all leading-none" style="line-height:1">
                                            换
                                        </button>
                                    </div>
                                    <div class="text-[10px] text-gray-400">在模型列表里选哪个供应商的模型，聊天/记忆就自动绑定该供应商；设置页切换浏览的供应商不影响已绑定。</div>
                                </div>

                                <!-- Model Configuration Inputs -->
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                                    <div class="group">
                                        <label
                                            class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">预设模型①</label>
                                        <div class="relative flex-1 group"
                                            @click="openModelSelector('qualityModel')">
                                            <div
                                                class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-teal-500 transition-colors pointer-events-none z-10">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z">
                                                    </path>
                                                </svg>
                                            </div>
                                            <div
                                                class="w-full bg-gray-50/60 border-2 border-gray-100 rounded-xl pl-11 pr-4 py-3 text-gray-800 font-medium flex items-center justify-between cursor-pointer hover:bg-white hover:border-teal-300 hover:shadow-md transition-all active:scale-[0.99]">
                                                <span class="truncate mr-2 font-mono text-sm">{{ settings.qualityModel
                                                    || '请选择模型' }}</span>
                                                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="group">
                                        <label
                                            class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">预设模型②</label>
                                        <div class="relative flex-1 group"
                                            @click="openModelSelector('balancedModel')">
                                            <div
                                                class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-teal-500 transition-colors pointer-events-none z-10">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3">
                                                    </path>
                                                </svg>
                                            </div>
                                            <div
                                                class="w-full bg-gray-50/60 border-2 border-gray-100 rounded-xl pl-11 pr-4 py-3 text-gray-800 font-medium flex items-center justify-between cursor-pointer hover:bg-white hover:border-teal-300 hover:shadow-md transition-all active:scale-[0.99]">
                                                <span class="truncate mr-2 font-mono text-sm">{{ settings.balancedModel
                                                    || '请选择模型' }}</span>
                                                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="group">
                                        <label
                                            class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">预设模型③</label>
                                        <div class="relative flex-1 group"
                                            @click="openModelSelector('fastModel')">
                                            <div
                                                class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-teal-500 transition-colors pointer-events-none z-10">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                                </svg>
                                            </div>
                                            <div
                                                class="w-full bg-gray-50/60 border-2 border-gray-100 rounded-xl pl-11 pr-4 py-3 text-gray-800 font-medium flex items-center justify-between cursor-pointer hover:bg-white hover:border-teal-300 hover:shadow-md transition-all active:scale-[0.99]">
                                                <span class="truncate mr-2 font-mono text-sm">{{ settings.fastModel ||
                                                    '请选择模型' }}</span>
                                                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="group col-span-1 md:col-span-2 mt-2">
                                        <button @pointerdown="syncApiKeyInput" @click="fetchModels(true)"
                                            class="w-full px-4 py-3 bg-white hover:bg-teal-50 text-gray-600 hover:text-teal-700 rounded-lg border border-gray-200 hover:border-teal-200 transition-all shadow-sm active:scale-95 whitespace-nowrap font-medium flex items-center justify-center text-sm"
                                            title="刷新列表">
                                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                                                </path>
                                            </svg>
                                            刷新可用模型列表
                                        </button>
                                    </div>
                                </div>



                                <!-- Generation Settings (Integrated) -->
                                <div class="pt-6 border-t border-gray-100 mt-6">
                                    <h4 class="settings-section-heading">
                                        <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                            </path>
                                        </svg>
                                        生成参数
                                    </h4>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <!-- 温度 -->
                                        <div
                                            class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                                            <div class="flex justify-between items-center mb-3">
                                                <label
                                                    class="text-xs font-bold text-gray-500 uppercase tracking-wider">温度</label>
                                                <span
                                                    class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{
                                                    settings.temperature }}</span>
                                            </div>
                                            <input v-model.number="settings.temperature" type="range" min="0" max="1"
                                                step="0.01"
                                                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500 hover:accent-teal-400 transition-all">
                                        </div>

                                        <!-- 输出长度上限 -->
                                        <div
                                            class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                                            <div class="flex justify-between items-center mb-3">
                                                <label
                                                    class="text-xs font-bold text-gray-500 uppercase tracking-wider">输出长度上限</label>
                                                <span
                                                    class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{
                                                    settings.maxOutputTokens }} tok</span>
                                            </div>
                                            <input v-model.number="settings.maxOutputTokens" type="range" min="256" max="8192"
                                                step="256"
                                                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500 hover:accent-teal-400 transition-all">
                                            <div class="text-[10px] text-gray-400 mt-1">单次回复的最大输出 token 数，按你的需求设定上限。</div>
                                        </div>

                                        <!-- Image Key -->
                                        <div
                                            class="generation-setting-card">
                                            <label
                                                class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">自动生图密钥</label>
                                            <input v-model="settings.imageGenKey" type="password" :disabled="imageGenUnavailable"
                                                class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                                                placeholder="生图服务暂不可用">
                                        </div>

                                        <!-- Image Style -->
                                        <div
                                            class="generation-setting-card">
                                            <label
                                                class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">生图风格</label>
                                            <custom-select v-model="settings.imageStyle" :options="imageStyleOptions" :disabled="imageGenUnavailable"
                                                button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-teal-400 focus:ring-teal-100"
                                                menu-class="text-sm">
                                            </custom-select>
                                            <textarea v-if="settings.imageStyle === 'custom'"
                                                v-model="settings.customImageArtists" rows="3"
                                                class="mt-3 w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm resize-y custom-scrollbar"
                                                placeholder="输入自定义画师串"></textarea>
                                        </div>

                                        <!-- Image Size -->
                                        <div
                                            class="generation-setting-card">
                                            <label
                                                class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">生图比例</label>
                                            <custom-select v-model="settings.imageSize" :options="imageSizeOptions" :disabled="imageGenUnavailable"
                                                button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-teal-400 focus:ring-teal-100"
                                                menu-class="text-sm">
                                            </custom-select>
                                        </div>

                                        <!-- Image Count -->
                                        <div
                                            class="generation-setting-card">
                                            <label
                                                class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">期望生图数量</label>
                                            <custom-select v-model="settings.imageGenCount" :options="imageGenCountOptions" :disabled="imageGenUnavailable"
                                                button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-teal-400 focus:ring-teal-100"
                                                menu-class="text-sm">
                                            </custom-select>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
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
                                    <div class="flex items-center justify-between mb-4">
                                        <div>
                                            <div class="text-sm font-bold text-gray-700">启用语音朗读</div>
                                            <div class="text-[10px] text-gray-400 mt-0.5">使用语音引擎朗读角色回复，本地运行，无需联网与密钥。</div>
                                        </div>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" v-model="settings.ttsEnabled" class="settings-toggle-input sr-only">
                                            <div class="settings-toggle settings-toggle--indigo"></div>
                                        </label>
                                    </div>

                                    <div v-if="settings.ttsEnabled" class="space-y-4 animate-fade-in">
                                        <!-- 语音引擎：选择朗读服务 -->
                                        <div>
                                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">语音引擎</label>
                                            <div class="grid grid-cols-2 gap-2">
                                                <button type="button" @click="selectTtsService('system')"
                                                    :class="['p-3 rounded-xl border-2 text-left transition-all', settings.ttsService === 'system' ? 'border-teal-400 bg-teal-50/60' : 'border-gray-100 hover:border-gray-200']">
                                                    <div class="text-sm font-bold" :class="settings.ttsService === 'system' ? 'text-teal-700' : 'text-gray-700'">系统语音</div>
                                                    <div class="text-[10px] text-gray-400 mt-0.5">Android 系统引擎，无需下载</div>
                                                </button>
                                                <button type="button" @click="selectTtsService('local')"
                                                    :class="['p-3 rounded-xl border-2 text-left transition-all', settings.ttsService === 'local' ? 'border-teal-400 bg-teal-50/60' : 'border-gray-100']">
                                                    <div class="text-sm font-bold text-gray-700">本地模型</div>
                                                    <div class="text-[10px] text-gray-400 mt-0.5">On-device neural TTS, voices download on demand</div>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- 引擎设置：所选引擎的专属选项 -->
                                        <div>
                                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">引擎设置</label>
                                            <div v-if="settings.ttsService === 'system'" class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                                <div class="flex items-center justify-between">
                                                    <span class="text-xs font-medium text-gray-500">引擎状态</span>
                                                    <span class="text-xs font-bold" :class="ttsStatus.available ? 'text-emerald-600' : 'text-red-500'">{{ ttsStatusLabel }}</span>
                                                </div>
                                            </div>
                                            <div v-else class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 space-y-3">
                                                <div class="flex items-center justify-between">
                                                    <span class="text-xs font-medium text-gray-500">Engine status</span>
                                                    <span class="text-xs font-bold" :class="ttsStatus.available ? 'text-emerald-600' : 'text-red-500'">{{ ttsStatusLabel }}</span>
                                                </div>
                                                <div v-if="!localTtsStatus.checked" class="text-xs text-gray-400">Checking local engine...</div>
                                                <div v-else-if="!localTtsStatus.available" class="text-xs text-gray-500">Local neural TTS is only available in the Android app.</div>
                                                <div v-else>
                                                    <div v-for="voice in localTtsVoices" :key="voice.id"
                                                        class="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-white/80">
                                                        <div class="min-w-0">
                                                            <div class="text-xs font-bold text-gray-700 truncate">
                                                                {{ voice.name }}
                                                                <span class="font-mono text-[10px] font-normal text-gray-400 ml-1">~{{ voice.sizeMb }}MB</span>
                                                            </div>
                                                            <div class="text-[10px] text-gray-400 truncate">{{ voice.desc }}</div>
                                                        </div>
                                                        <div class="flex items-center gap-1.5 flex-shrink-0">
                                                            <span v-if="voice.installed" class="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Installed</span>
                                                            <button v-if="voice.installed" type="button" @click="removeLocalTtsVoice(voice.id)"
                                                                class="px-2 py-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg transition-all active:scale-95">Clear</button>
                                                            <button v-else-if="localTtsInstall && localTtsInstall.voiceId === voice.id" type="button" @click="cancelLocalTtsInstall"
                                                                class="px-2 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all active:scale-95">Cancel</button>
                                                            <button v-else type="button" :disabled="!!localTtsInstall" @click="installLocalTtsVoice(voice.id)"
                                class="px-2 py-1 text-[10px] font-bold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all active:scale-95">Install</button>
                                                        </div>
                                                    </div>
                                                    <div v-if="localTtsInstall" class="space-y-1">
                                                        <div class="flex items-center justify-between text-[10px] text-gray-500">
                                                            <span class="font-bold">{{ localTtsInstall.phase === 'extract' ? 'Extracting...' : 'Downloading...' }}</span>
                                                            <span class="font-mono">{{ localTtsInstallPercent }}%</span>
                                                        </div>
                                                        <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                            <div class="h-full bg-teal-500 transition-all" :style="{ width: localTtsInstallPercent + '%' }"></div>
                                                        </div>
                                                    </div>
                                                    <div v-if="localTtsVoiceOptions.length" class="flex items-center justify-between gap-2">
                                                        <span class="text-xs font-medium text-gray-500 flex-shrink-0">Default voice</span>
                                                        <select v-model="settings.ttsLocalVoice"
                                                            class="flex-1 max-w-[60%] bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                            <option value="">Auto (first installed)</option>
                                                            <option v-for="voice in localTtsVoiceOptions" :key="voice.id" :value="voice.id">{{ voice.name }}</option>
                                                        </select>
                                                    </div>
                                                    <div v-if="localTtsSelectedVoiceIsClone" class="space-y-2 p-3 rounded-lg border border-purple-100 bg-purple-50/40">
                                                        <div class="flex items-center justify-between">
                                                            <span class="text-xs font-bold text-purple-700">Clone voice reference</span>
                                                            <button v-if="settings.ttsCloneReferenceUri" type="button" @click="removeVoiceClip"
                                                                class="px-2 py-1 text-[10px] font-bold text-purple-500 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-lg transition-all active:scale-95">Remove</button>
                                                        </div>
                                                        <input type="file" accept="audio/*" @change="handleVoiceClipUpload"
                                                            class="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 file:cursor-pointer">
                                                        <textarea v-model="settings.ttsCloneReferenceText" rows="2" maxlength="500"
                                                            placeholder="Reference transcript — the exact text spoken in the clip"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300"></textarea>
                                                        <div class="text-[10px]" :class="cloneVoiceReady ? 'text-emerald-600' : 'text-gray-400'">
                                                            {{ cloneVoiceReady ? 'Reference clip and transcript ready.' : 'Upload a clean 3-10s clip and type its exact transcript.' }}
                                                        </div>
                                                    </div>
                                                    <div class="text-[10px] text-gray-400 leading-relaxed">Voice models download on demand and stay on this device. The pitch slider is only approximated during playback for neural voices.</div>
                                                            </div>
                                            </div>
                                            </div>
                                        </div>

                                        <!-- 朗读偏好：所有引擎通用 -->
                                        <div class="space-y-4">
                                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">朗读偏好</label>
                                            <div class="flex items-center justify-between">
                                                <div>
                                                    <div class="text-sm font-bold text-gray-700">自动朗读</div>
                                                    <div class="text-[10px] text-gray-400 mt-0.5">角色回复生成完成后自动朗读，新发送消息时自动停止。</div>
                                                </div>
                                                <label class="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" v-model="settings.ttsAutoPlay" class="settings-toggle-input sr-only">
                                                    <div class="settings-toggle settings-toggle--indigo"></div>
                                                </label>
                                            </div>
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <div class="flex justify-between items-center mb-1.5">
                                                        <label class="text-xs font-medium text-gray-500">语速</label>
                                                        <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ (Number(settings.ttsRate) || 1).toFixed(2) }}</span>
                                                    </div>
                                                    <input type="range" v-model.number="settings.ttsRate" min="0.5" max="2" step="0.05"
                                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500">
                                                </div>
                                                <div>
                                                    <div class="flex justify-between items-center mb-1.5">
                                                        <label class="text-xs font-medium text-gray-500">音调</label>
                                                        <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ (Number(settings.ttsPitch) || 1).toFixed(2) }}</span>
                                                    </div>
                                                    <input type="range" v-model.number="settings.ttsPitch" min="0.5" max="2" step="0.05"
                                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500">
                                                </div>
                                            </div>
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">朗读内容</label>
                                                    <select v-model="ttsReadMode"
                                                        class="w-full bg-gray-50/60 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-all">
                                                        <option value="full">全文朗读</option>
                                                        <option value="dialogue">只读台词（引号内容）</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">最长朗读字数</label>
                                                    <div class="flex items-center gap-2">
                                                        <input type="number" v-model.number="settings.ttsMaxChars" min="100" max="5000" step="100"
                                                            class="w-full bg-gray-50/60 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-all">
                                                        <span class="text-[10px] text-gray-400">字</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <label class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                                                <input type="checkbox" v-model="settings.ttsSkipActions" class="rounded accent-teal-500 mr-2.5">
                                                <span class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">跳过动作叙述（*…* 行）</span>
                                            </label>
                                            <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50/60 border border-gray-100">
                                                <span class="text-xs text-gray-500">朗读效果受所选引擎与语速音调影响。</span>
                                                <button type="button" @click="testTtsVoice"
                                                    class="px-3 py-1.5 text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-lg shadow-sm transition-all active:scale-95">
                                                    测试朗读
                                                </button>
                                            </div>
                                        </div>
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
                        <div class="settings-panel-content grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button type="button" @click="exportNativeBackup" :disabled="backupInProgress"
                                class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                                完整备份
                            </button>
                            <button type="button" @click="restoreNativeBackup" :disabled="backupInProgress"
                                class="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-import"></use></svg>
                                恢复备份
                            </button>
                        </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                            <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400 pb-4 select-none">
                    <span>Roleplay Hub</span>
                    <span v-if="appVersionName" class="font-mono">v{{ appVersionName }}</span>
                    <span v-if="appVersionCode" class="font-mono">(build {{ appVersionCode }})</span>
                    <span v-if="latestVersionName" class="text-green-500">→ v{{ latestVersionName }}</span>
                    <button @click="checkForUpdates(true)" :disabled="checkingUpdate" class="hover:text-primary-500 transition-colors ml-1.5" title="检查更新">
                        <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                    <button v-if="updateAvailable" @click="downloadAndInstallUpdate" :disabled="downloadingUpdate" class="ml-1.5 px-1.5 py-0.5 bg-green-600 text-white rounded text-[10px] font-bold hover:bg-green-500 transition-colors">
                        <template v-if="!downloadingUpdate">更新</template>
                        <template v-else>{{ Math.round(downloadProgress * 100) }}%</template>
                    </button>
                </div>

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
