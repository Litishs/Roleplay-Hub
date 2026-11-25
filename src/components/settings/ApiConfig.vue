<template>
    <div class="settings-panel-content space-y-6">
        <!-- Integrated Service Status Monitoring -->
        <div class="mb-6 pb-6 border-b border-gray-100">
            <h4
                class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                <span>服务连接状态</span>
                <span class="flex items-center gap-3">
                    <button @pointerdown="syncApiKeyInput" @click="refreshBalances" :disabled="balancesLoading"
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium flex items-center hit-expand [--hit-out:-14px] disabled:opacity-50 disabled:cursor-default">
                        <svg :class="['w-3 h-3 mr-1', balancesLoading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 3v2m0 14v2m9-9h-2M5 12H3m13.66-6.66l-1.42 1.42M8.76 15.24l-1.42 1.42m10.32 0l-1.42-1.42M8.76 8.76L7.34 7.34">
                            </path>
                        </svg>
                        刷新余额
                    </button>
                    <button @pointerdown="syncApiKeyInput" @click="checkAllStatuses"
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium flex items-center hit-expand [--hit-out:-14px]">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                            </path>
                        </svg>
                        立即检测
                    </button>
                </span>
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
                    <div :class="['w-2.5 h-2.5 rounded-full mr-3 shadow-sm flex-shrink-0',
                        imageGenStatus === 'connected' ? 'bg-green-500 shadow-green-200' :
                        imageGenStatus === 'checking' ? 'bg-yellow-400 animate-pulse shadow-yellow-200' :
                        imageGenStatus === 'error' ? 'bg-red-500 shadow-red-200' : 'bg-gray-300']"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-0.5">
                            <div class="flex items-center gap-1.5 min-w-0 text-xs font-bold text-gray-700 truncate">
                                <span>生图服务</span>
                                <span class="text-gray-400">·</span>
                                <span class="text-gray-500 font-medium whitespace-nowrap">
                                    <span v-if="quotaLoading">获取中...</span>
                                    <span v-else-if="quotaError || !settings.imageGenKey">
                                        {{ settings.imageGenKey ? '查询失败' : '未配置密钥' }}
                                    </span>
                                    <span v-else>{{ quotaValue }} 次</span>
                                </span>
                            </div>
                            <span v-if="imageGenStatus === 'connected'"
                                class="text-xs font-mono font-medium text-teal-600">{{ imageGenLatency }}ms</span>
                        </div>
                    </div>
                </div>
                <!-- Account balance per configured provider (2026-11-25) -->
                <div v-for="item in balanceRows" :key="item.id" class="model-setting-row">
                    <div :class="['w-2.5 h-2.5 rounded-full mr-3 shadow-sm flex-shrink-0',
                        item.entry.status === 'ok'
                            ? (item.guardState === 'blocked' ? 'bg-red-500 shadow-red-200'
                                : (item.guardState === 'warn' ? 'bg-amber-400 shadow-amber-200' : 'bg-green-500 shadow-green-200'))
                            : (item.entry.status === 'error' ? 'bg-red-500 shadow-red-200' : 'bg-gray-300')]"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center gap-2 mb-0.5">
                            <div class="text-xs font-bold text-gray-700 truncate">
                                {{ item.label }} 余额
                            </div>
                            <span :class="['text-xs font-mono font-medium whitespace-nowrap',
                                item.guardState === 'blocked' ? 'text-red-600' : (item.guardState === 'warn' ? 'text-amber-600' : 'text-teal-600')]">
                                {{ item.display }}
                            </span>
                        </div>
                        <div v-if="item.detail" class="text-[10px] text-gray-400 truncate">{{ item.detail }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main API Inputs -->
        <div class="grid grid-cols-1 gap-5">
            <div class="group">
                <div class="mb-2 ml-1 flex items-center justify-between gap-3">
                    <label
                        class="text-xs font-bold text-gray-500 uppercase tracking-wider">API
                        提供商</label>
                    <button type="button" v-if="selectedApiProvider.id === 'sta1n'"
                        @click="openExternal('https://cdn.sta1n.cn/keys')"
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium flex items-center hit-expand [--hit-out:-14px]">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14">
                            </path>
                        </svg>
                        获取API
                    </button>
                </div>
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
                        class="absolute left-4 top-0 bottom-0 flex items-center text-gray-400 group-focus-within:text-teal-500 transition-colors pointer-events-none">
                        <svg class="w-5 h-5" style="display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
                            </path>
                        </svg>
                    </div>
                    <input v-model="settings.apiUrl" type="text" inputmode="url"
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
                        class="absolute left-4 top-0 bottom-0 flex items-center text-gray-400 group-focus-within:text-teal-500 transition-colors pointer-events-none">
                        <svg class="w-5 h-5" style="display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        class="absolute right-1.5 top-0 bottom-0 flex items-center gap-1">
                        <button type="button" @click="pasteApiKeyFromClipboard"
                            title="从剪贴板粘贴 API Key"
                            class="h-9 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold border border-teal-100 transition-all active:scale-95 flex items-center gap-1 leading-none hit-expand [--hit-out:-4px]"
                            style="line-height: 1;">
                            <svg class="flex-shrink-0" style="display:block;width:1em;height:1em" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                            </svg>
                            <span class="flex-shrink-0" style="line-height:1">粘贴</span>
                        </button>
                        <button type="button" @click="toggleApiKeyVisibility"
                            :title="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                            class="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 flex items-center justify-center transition-all active:scale-95 flex-shrink-0 hit-expand [--hit-out:-4px]">
                            <svg v-if="!apiKeyVisible" class="w-4 h-4" style="display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                            </svg>
                            <svg v-else class="w-4 h-4" style="display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 2026-09-06: removed the teal "当前绑定" summary card — it duplicated
                 the quick-settings slot selector and the two could disagree. -->

            <!-- 聊天模型 + 识图模型 -->
            <div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div class="group">
                    <label
                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">聊天模型</label>
                    <div class="relative" @click="openModelSelector('quickModels')">
                        <div
                            class="w-full bg-gray-50/60 border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-800 font-medium
                                   flex items-center justify-between cursor-pointer hover:bg-white hover:border-teal-300 hover:shadow-md
                                   transition-all active:scale-[0.99]">
                            <span class="truncate mr-2 text-sm">
                                已配置 {{ [settings.qualityModel, settings.balancedModel, settings.fastModel].filter(Boolean).length }} / 3 个槽位
                            </span>
                            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                    </div>
                </div>
                <div class="group">
                    <label
                        class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">识图模型</label>
                    <div class="relative" @click="openModelSelector('visionModel')">
                        <div
                            class="w-full bg-gray-50/60 border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-800 font-medium
                                   flex items-center justify-between cursor-pointer hover:bg-white hover:border-teal-300 hover:shadow-md
                                   transition-all active:scale-[0.99]">
                            <span class="truncate mr-2 text-sm font-mono" :class="{ 'text-gray-400': !settings.visionModel }">
                                {{ settings.visionModel || '请选择模型' }}
                            </span>
                            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.269 2.943 9.542 7-1.273 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z M15 12a3 3 0 11-6 0 3 3 0 016 0z">
                                </path>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
            <button @pointerdown="syncApiKeyInput" @click="fetchModels(true)"
                class="mt-3 w-full px-4 py-3 bg-white hover:bg-teal-50 text-gray-600 hover:text-teal-700 rounded-lg border border-gray-200 hover:border-teal-200 transition-all shadow-sm active:scale-95 whitespace-nowrap font-medium flex items-center justify-center text-sm"
                title="刷新列表">
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                    </path>
                </svg>
                刷新可用模型列表
            </button>

            <!-- 聊天参数（温度 / 输出长度上限 / 网络超时） -->
            <!-- overflow-hidden 只在折叠时启用：展开后必须放开，否则卡内的说明气泡会被卡片边界切掉。 -->
            <div :class="['settings-subsection-card mt-1', chatParamsOpen ? '' : 'overflow-hidden']">
                <div class="flex items-center justify-between gap-3 pl-4 pr-3 py-1.5">
                    <button type="button" @click="chatParamsOpen = !chatParamsOpen"
                        class="flex flex-1 items-center rounded-lg py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-left transition-colors hover:text-gray-600 group">
                    <svg class="w-4 h-4 mr-2 text-gray-400 transition-colors group-hover:text-gray-600" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 9v10m4-16v16m4-10v10M3 9h18M3 15h18">
                        </path>
                    </svg>
                    <span>聊天参数</span>
                    <svg :class="['w-4 h-4 ml-1.5 text-gray-400 transition-all duration-300 group-hover:text-gray-600', chatParamsOpen ? 'rotate-180' : '']"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M19 9l-7 7-7-7"></path>
                    </svg>
                    </button>
                    <button type="button" @click="restoreChatParamsDefaults"
                        class="shrink-0 text-xs normal-case font-medium text-gray-400 hover:text-teal-600 transition-colors hit-expand [--hit-out:-14px]">
                        恢复默认
                    </button>
                </div>
                <div class="grid"
                    :style="{ gridTemplateRows: chatParamsOpen ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease' }">
                    <div :class="['min-h-0', chatParamsOpen ? '' : 'overflow-hidden']">
                        <div class="flex flex-col gap-1 px-3 pb-3">
                            <!-- 每行：标签 + 圈问号 + 数值 + 滑杆，同一行 -->
                            <div class="flex items-center gap-2.5 rounded-xl bg-gray-50/60 border border-gray-100 px-3 py-2">
                                <span class="relative flex w-[5.5rem] flex-none items-center">
                                    <label class="text-xs font-bold text-gray-500 truncate">温度</label>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'temperature' ? '' : 'temperature'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'temperature' }"
                                        :aria-expanded="settingsHelpTopic === 'temperature'"
                                        aria-label="查看温度说明">
                                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                    <div v-if="settingsHelpTopic === 'temperature'" class="settings-help-popover">
                                        <span class="settings-help-popover-content">越低越稳定保守，越高越发散有创意。角色扮演常用 0.8–1.1；需要严格遵守设定时调低。</span>
                                    </div>
                                </span>
                                <input v-model.number="settings.temperature" type="range" min="0" max="1" step="0.01"
                                    aria-label="温度"
                                    class="min-w-0 flex-1 touch-range cursor-pointer">
                                <span class="w-9 flex-none text-right text-xs font-mono text-teal-600">{{ settings.temperature }}</span>
                            </div>

                            <div class="flex items-center gap-2.5 rounded-xl bg-gray-50/60 border border-gray-100 px-3 py-2">
                                <span class="relative flex w-[5.5rem] flex-none items-center">
                                    <label class="text-xs font-bold text-gray-500 truncate">输出上限</label>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'maxOutputTokens' ? '' : 'maxOutputTokens'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'maxOutputTokens' }"
                                        :aria-expanded="settingsHelpTopic === 'maxOutputTokens'"
                                        aria-label="查看输出长度上限说明">
                                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                    <div v-if="settingsHelpTopic === 'maxOutputTokens'" class="settings-help-popover">
                                        <span class="settings-help-popover-content">单次回复的最大输出 token 数。推理型模型会先消耗一部分用于思考，设得太低可能出现「只有思考没有正文」。</span>
                                    </div>
                                </span>
                                <input v-model.number="settings.maxOutputTokens" type="range" min="256" max="8192" step="256"
                                    aria-label="输出长度上限"
                                    class="min-w-0 flex-1 touch-range cursor-pointer">
                                <span class="w-9 flex-none text-right text-xs font-mono text-teal-600">{{ settings.maxOutputTokens }}</span>
                            </div>

                            <!-- 网络超时：低频设置，默认收起；4 个滑杆各 44px 触摸高度，
                                 全部常驻会把这张卡撑到 400px 以上。 -->
                            <div class="mt-1 rounded-xl bg-gray-50/60 border border-gray-100 px-3 py-2">
                                <div class="relative flex items-center gap-1">
                                    <button type="button" @click="timeoutsOpen = !timeoutsOpen"
                                        class="flex min-w-0 items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider transition-colors hover:text-gray-600"
                                        :aria-expanded="timeoutsOpen">
                                        <span>网络超时</span>
                                        <svg :class="['h-3 w-3 transition-transform duration-200', timeoutsOpen ? 'rotate-180' : '']"
                                            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'requestTimeouts' ? '' : 'requestTimeouts'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'requestTimeouts' }"
                                        :aria-expanded="settingsHelpTopic === 'requestTimeouts'"
                                        aria-label="查看网络超时说明">
                                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                    <span v-if="!timeoutsOpen" class="ml-auto text-[10px] font-mono text-gray-400 truncate">
                                        {{ settings.requestFirstTokenTimeout }}s 首token
                                    </span>
                                    <span v-else class="ml-auto text-[10px] font-mono text-gray-400">秒</span>
                                    <!-- is-above：气泡向上展开，避免被下方折叠容器裁掉 -->
                                    <div v-if="settingsHelpTopic === 'requestTimeouts'" class="settings-help-popover is-above">
                                        <span class="settings-help-popover-content">
                                            单位：秒（10–1800），改后下一次请求生效。推理模型或本地部署较慢时，优先调大「首 token 等待」。
                                            <span class="mt-1 block">
                                                <span v-for="item in requestTimeoutItems" :key="item.key" class="block">
                                                    · {{ item.label }}：{{ item.description }}
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                </div>
                                <div class="grid"
                                    :style="{ gridTemplateRows: timeoutsOpen ? '1fr' : '0fr', transition: 'grid-template-rows 250ms ease' }">
                                    <div :class="['min-h-0', timeoutsOpen ? '' : 'overflow-hidden']">
                                        <div class="flex flex-col gap-1 pt-1">
                                            <div v-for="item in requestTimeoutItems" :key="item.key" class="flex items-center gap-2.5">
                                                <span class="w-[5.5rem] flex-none truncate text-[11px] font-bold text-gray-500">{{ item.label }}</span>
                                                <input v-model.number="settings[item.key]" type="range" min="10" max="1800"
                                                    step="10" @change="normalizeRequestTimeout(item.key)"
                                                    :aria-label="item.label"
                                                    class="min-w-0 flex-1 touch-range cursor-pointer">
                                                <span class="w-9 flex-none text-right text-[11px] font-mono text-teal-600 whitespace-nowrap">{{ settings[item.key] }}s</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 余额提醒与阈值守卫（2026-11-25） -->
            <!-- overflow-hidden 只在折叠时启用：它负责裁剪 grid-rows 动画溢出的内容，
                 但展开后必须放开，否则卡内的说明气泡会被卡片边界切掉。 -->
            <div :class="['settings-subsection-card mt-1', balanceGuardOpen ? '' : 'overflow-hidden']">
                <div class="flex items-center justify-between gap-3 pl-4 pr-3 py-1.5">
                    <button type="button" @click="balanceGuardOpen = !balanceGuardOpen"
                        class="flex flex-1 items-center rounded-lg py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-left transition-colors hover:text-gray-600 group">
                        <svg class="w-4 h-4 mr-2 text-gray-400 transition-colors group-hover:text-gray-600" fill="none"
                            stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M3 10h18M7 15h4m-8 4h18a1 1 0 001-1V6a1 1 0 00-1-1H3a1 1 0 00-1 1v12a1 1 0 001 1z">
                            </path>
                        </svg>
                        <span>余额提醒</span>
                        <span class="ml-2 text-[10px] font-medium normal-case tracking-normal text-gray-400">
                            {{ balanceGuardModeLabel }}
                        </span>
                        <svg :class="['w-4 h-4 ml-1.5 text-gray-400 transition-all duration-300 group-hover:text-gray-600', balanceGuardOpen ? 'rotate-180' : '']"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <button type="button" @click="restoreBalanceGuardDefaults"
                        class="shrink-0 text-xs normal-case font-medium text-gray-400 hover:text-teal-600 transition-colors hit-expand [--hit-out:-14px]">
                        恢复默认
                    </button>
                </div>
                <div class="grid"
                    :style="{ gridTemplateRows: balanceGuardOpen ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease' }">
                    <div :class="['min-h-0', balanceGuardOpen ? '' : 'overflow-hidden']">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-4 pt-1.5">
                            <div class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 md:col-span-2">
                                <label
                                    class="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <span class="relative flex items-center">
                                        <span>查询供应商余额</span>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'providerBalanceQuery' ? '' : 'providerBalanceQuery'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'providerBalanceQuery' }"
                                            :aria-expanded="settingsHelpTopic === 'providerBalanceQuery'"
                                            aria-label="查看余额查询说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'providerBalanceQuery'" class="settings-help-popover">
                                            <span class="settings-help-popover-content">开启后会在启动与手动刷新时向已配置密钥的供应商查询账户余额。关闭则完全不出网，也不显示余额行。</span>
                                        </div>
                                    </span>
                                    <span class="relative inline-flex flex-none items-center">
                                        <input type="checkbox" v-model="settings.providerBalanceQueryEnabled"
                                            class="settings-toggle-input sr-only" aria-label="查询供应商余额">
                                        <span class="settings-toggle settings-toggle--compact settings-toggle--solid"></span>
                                    </span>
                                </label>
                            </div>
                            <div class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 md:col-span-2">
                                <div class="relative flex items-center mb-2">
                                    <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">余额守卫</label>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'balanceGuard' ? '' : 'balanceGuard'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'balanceGuard' }"
                                        :aria-expanded="settingsHelpTopic === 'balanceGuard'"
                                        aria-label="查看余额守卫说明">
                                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                    <div v-if="settingsHelpTopic === 'balanceGuard'" class="settings-help-popover">
                                        <span class="settings-help-popover-content">余额来自各供应商的查询接口（DeepSeek / Moonshot / OpenRouter / SiliconFlow / STA1N 中转站），缓存超过 30 分钟不参与判断。默认关闭：余额更新有延迟，拦截可能误伤。</span>
                                    </div>
                                </div>
                                <div class="grid grid-cols-3 gap-1 rounded-xl bg-white border border-gray-200 p-1">
                                    <button v-for="option in balanceGuardModeOptions" :key="option.value"
                                        type="button" @click="settings.balanceGuardMode = option.value"
                                        :class="['min-h-[40px] rounded-lg text-[13px] font-bold transition-all active:scale-[0.98]',
                                            settings.balanceGuardMode === option.value
                                                ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-100'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50']">
                                        {{ option.label }}
                                    </button>
                                </div>
                            </div>
                            <div v-if="settings.balanceGuardMode !== 'off'"
                                class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                                <div class="relative flex items-center justify-between mb-2">
                                    <span class="relative flex items-center">
                                        <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">提醒阈值</label>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'balanceWarn' ? '' : 'balanceWarn'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'balanceWarn' }"
                                            :aria-expanded="settingsHelpTopic === 'balanceWarn'"
                                            aria-label="查看提醒阈值说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'balanceWarn'" class="settings-help-popover">
                                            <span class="settings-help-popover-content">余额低于此值时提示（按供应商币种）。</span>
                                        </div>
                                    </span>
                                    <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ settings.balanceWarnBelow }}</span>
                                </div>
                                <input v-model.number="settings.balanceWarnBelow" type="number" min="0" step="1"
                                    class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm">
                            </div>
                            <div v-if="settings.balanceGuardMode === 'block'"
                                class="bg-gray-50/60 p-4 rounded-xl border border-gray-100 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                                <div class="relative flex items-center justify-between mb-2">
                                    <span class="relative flex items-center">
                                        <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">停止阈值</label>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'balanceBlock' ? '' : 'balanceBlock'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'balanceBlock' }"
                                            :aria-expanded="settingsHelpTopic === 'balanceBlock'"
                                            aria-label="查看停止阈值说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'balanceBlock'" class="settings-help-popover">
                                            <span class="settings-help-popover-content">余额低于此值后发送前会弹一次确认，可继续。</span>
                                        </div>
                                    </span>
                                    <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ settings.balanceBlockBelow }}</span>
                                </div>
                                <input v-model.number="settings.balanceBlockBelow" type="number" min="0" step="1"
                                    class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Generation Settings (Integrated) -->
            <div class="settings-subsection-card mt-1 overflow-hidden">
                <div class="flex items-center justify-between gap-3 pl-4 pr-3 py-1.5">
                    <button type="button" @click="genSectionOpen = !genSectionOpen"
                        class="flex flex-1 items-center rounded-lg py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-left transition-colors hover:text-gray-600 group">
                        <svg class="w-4 h-4 mr-2 text-gray-400 transition-colors group-hover:text-gray-600" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                            </path>
                        </svg>
                        <span>生图设置</span>
                        <svg :class="['w-4 h-4 ml-1.5 text-gray-400 transition-all duration-300 group-hover:text-gray-600', genSectionOpen ? 'rotate-180' : '']"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <button type="button" @click="restoreImageGenDefaults"
                        class="shrink-0 text-xs normal-case font-medium text-gray-400 hover:text-teal-600 transition-colors hit-expand [--hit-out:-14px]">
                        恢复默认
                    </button>
                    <button type="button" @click="openExternal('https://cdn.sta1n.cn/keys')"
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium">
                        获取生图密钥
                    </button>
                </div>
                <div class="grid"
                    :style="{ gridTemplateRows: genSectionOpen ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease' }">
                    <div :class="['min-h-0', genSectionOpen ? '' : 'overflow-hidden']">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-4 pt-1.5">
                    <!-- Image Key -->
                    <div
                        class="generation-setting-card">
                        <div class="relative mb-2 flex items-center justify-between gap-2">
                            <span class="relative flex items-center">
                                <label class="text-xs font-bold text-gray-500 uppercase tracking-wider">自动生图密钥</label>
                                <button type="button"
                                    @click.stop="settingsHelpTopic = settingsHelpTopic === 'imageGenKey' ? '' : 'imageGenKey'"
                                    class="settings-help-trigger"
                                    :class="{ 'is-open': settingsHelpTopic === 'imageGenKey' }"
                                    :aria-expanded="settingsHelpTopic === 'imageGenKey'"
                                    aria-label="查看自动生图密钥说明">
                                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                    </svg>
                                </button>
                                <div v-if="settingsHelpTopic === 'imageGenKey'" class="settings-help-popover">
                                    <span class="settings-help-popover-content">推荐 STA1N 生图服务（nai.sta1n.cn）。密钥与聊天 API Key 分开保存，只用于生图请求。</span>
                                </div>
                            </span>
                            <button type="button" @click="openExternal('https://cdn.sta1n.cn/keys')"
                                class="shrink-0 text-teal-600 hover:underline cursor-pointer text-[10px] font-medium hit-expand [--hit-out:-10px]">获取密钥</button>
                        </div>
                        <input v-model="settings.imageGenKey" type="password"
                            class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                            placeholder="STA1N-...">
                    </div>

                    <!-- Image Model (生图版本) -->
                    <div
                        class="generation-setting-card">
                        <label
                            class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">生图版本</label>
                        <custom-select v-model="settings.imageModel" :options="imageModelOptions" :disabled="imageGenUnavailable"
                            button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-teal-400 focus:ring-teal-100"
                            menu-class="text-sm">
                        </custom-select>
                    </div>

                    <!-- Image Style -->
                    <div
                        class="generation-setting-card">
                        <label
                            class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">生图风格</label>
                        <custom-select v-model="settings.imageStyle" :options="availableImageStyleOptions" :disabled="imageGenUnavailable"
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
</template>

<script>
import { inject, ref, computed } from "vue";
import { RPHubCustomSelect as CustomSelect } from "../../modules/ui-select.mjs";
import { RPHRuntimePolicy } from "../../modules/runtime-policy.mjs";
import { CHAT_PARAMS_CARD_DEFAULTS, IMAGE_GEN_CARD_DEFAULTS, BALANCE_GUARD_CARD_DEFAULTS } from "../../composables/useSettingsState.mjs";
import { formatBalance, evaluateBalanceGuard, isBalanceStale } from "../../modules/provider-balance.mjs";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.

// 网络超时配置项的展示定义（默认值单一来源是 runtime-policy.limits.requestTimeout）。
// `description` 只出现在「网络超时」的圈问号气泡里。文案刻意压到一行内：四条
// 说明并排会撑出 230px 高的气泡，被外层折叠容器裁掉。
const requestTimeoutItems = [
    { key: 'requestFirstByteTimeout', label: '首字节等待', description: '等服务器响应头' },
    { key: 'requestFirstTokenTimeout', label: '首 token 等待', description: '等模型开口，推理模型建议 120–300s' },
    { key: 'requestStreamIdleTimeout', label: '流式空闲', description: '多久没新内容算中断' },
    { key: 'requestTotalTimeout', label: '单次生成总时长', description: '整轮上限' }
];

const timeoutDefaultsSeconds = {
    requestFirstByteTimeout: RPHRuntimePolicy.limits.requestTimeout.firstByteMs / 1000,
    requestFirstTokenTimeout: RPHRuntimePolicy.limits.requestTimeout.firstTokenMs / 1000,
    requestStreamIdleTimeout: RPHRuntimePolicy.limits.requestTimeout.streamIdleMs / 1000,
    requestTotalTimeout: RPHRuntimePolicy.limits.requestTimeout.totalMs / 1000
};

// 输入失焦时的兜底校验：非法回退默认，合法 clamp 到 [10, 1800] 秒。
// 发送侧 runtime-policy.resolveRequestTimeouts 还有二次封顶，双保险。
const normalizeRequestTimeout = (key, settings) => {
    const value = Number(settings[key]);
    const minimum = RPHRuntimePolicy.limits.requestTimeoutMinSeconds;
    const maximum = RPHRuntimePolicy.limits.requestTimeoutMaxSeconds;
    settings[key] = Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, Math.round(value)))
        : timeoutDefaultsSeconds[key];
};

export default {
  components: { CustomSelect },
    setup() {
        const ctx = inject("appContext");
        const openExternal = async (url) => {
            const browser = window.Capacitor?.Plugins?.Browser;
            if (browser) await browser.open({ url });
            else window.open(url, '_blank', 'noopener,noreferrer');
        };
        const genSectionOpen = ref(false);
        // Chat params default open (core generation controls); collapsible like 生图设置.
        const chatParamsOpen = ref(true);
        // 网络超时默认收起：四个滑杆是低频设置，常驻会把卡片撑到 400px 以上。
        // 折叠时标题行右侧仍显示「首 token 等待」，最常调的那一项保持可见。
        const timeoutsOpen = ref(false);
        // 余额提醒默认折叠：它是可选的保护措施，不该和核心生成选项抢位置。
        const balanceGuardOpen = ref(false);
        const balanceGuardModeOptions = [
            { value: 'off', label: '关闭' },
            { value: 'warn', label: '仅提醒' },
            { value: 'block', label: '提醒并拦截' }
        ];
        const balanceGuardModeLabel = computed(() => (
            balanceGuardModeOptions.find(option => option.value === ctx?.settings?.balanceGuardMode)?.label || '关闭'
        ));
        const restoreBalanceGuardDefaults = () => {
            if (!ctx?.settings) return;
            Object.assign(ctx.settings, BALANCE_GUARD_CARD_DEFAULTS);
            ctx.showToast?.('余额提醒已恢复默认（关闭）', 'success');
        };
        // 余额行以「缓存里实际有余额的供应商」为准，而不是以供应商目录为准：
        // 自定义项指向已知 host（如 api.moonshot.cn）时目录里只有「自定义」这个名字，
        // 而余额能力来自 host。以缓存 key 遍历，两种来源都能显示。
        const balanceRows = computed(() => {
            // 关闭查询后不再展示任何余额行：残留的旧数字比没有数字更容易误导。
            if (!ctx?.settings?.providerBalanceQueryEnabled) return [];
            const balances = ctx?.providerBalances || {};
            return Object.keys(balances).map(providerId => {
                const entry = balances[providerId] || {};
                const guardState = evaluateGuardState(entry, ctx?.settings);
                return {
                    id: providerId,
                    // 缓存条目自带 label（写入时由 profile 决定）；老数据没有则退回目录名。
                    label: entry.label || ctx?.getProviderDisplayName?.(providerId) || providerId,
                    entry,
                    guardState,
                    display: formatBalance(entry),
                    detail: buildBalanceDetail(entry)
                };
            });
        });
        // 判定复用 provider-balance 的纯函数：守卫与 UI 必须用同一套阈值语义，
        // 否则「红色显示」和「发送被拦」会在边界值上给出相反答案。
        const evaluateGuardState = (entry, settings) => {
            if (entry?.status !== 'ok' || entry?.unlimited) return 'off';
            const verdict = evaluateBalanceGuard({
                amount: entry?.amount,
                mode: settings?.balanceGuardMode,
                warnBelow: settings?.balanceWarnBelow,
                blockBelow: settings?.balanceBlockBelow
            });
            return verdict.state;
        };
        // 第二行只放供应商给的可解释信息，不臆造汇率或合计。
        const buildBalanceDetail = (entry) => {
            if (!entry) return '';
            if (entry.status === 'unsupported') return '该供应商未开放余额查询';
            if (entry.status === 'no-key') return '填入密钥后可查询';
            if (entry.status === 'error') return '查询失败，显示上次结果';
            if (entry.status === 'exhausted') return '供应商报告余额不足';
            const parts = [];
            // 陈旧值必须自己承认陈旧：否则用户会把半小时前的数字当成实时余额。
            if (isBalanceStale(entry)) parts.push('数据已过期');
            if (entry.unlimited) parts.push('无额度上限');
            if (Number.isFinite(entry.used)) parts.push(`已用 ${formatBalance({ amount: entry.used, currency: entry.currency })}`);
            if (Number.isFinite(entry.limit)) parts.push(`额度 ${formatBalance({ amount: entry.limit, currency: entry.currency })}`);
            if (Number.isFinite(entry.toppedUp)) parts.push(`充值 ${formatBalance({ amount: entry.toppedUp, currency: entry.currency })}`);
            if (Number.isFinite(entry.granted)) parts.push(`赠送 ${formatBalance({ amount: entry.granted, currency: entry.currency })}`);
            if (Number.isFinite(entry.voucher)) parts.push(`代金券 ${formatBalance({ amount: entry.voucher, currency: entry.currency })}`);
            return parts.join(' · ');
        };
        const refreshBalances = () => {
            ctx?.refreshAllProviderBalances?.({ silent: false });
        };
        // 恢复默认：把当前卡片承载的设置项重置为 useSettingsState 导出的默认值。
        // 只动偏好项——imageGenKey 是凭据，刻意不在 IMAGE_GEN_CARD_DEFAULTS 里，保留不动。
        const restoreChatParamsDefaults = () => {
            if (!ctx?.settings) return;
            Object.assign(ctx.settings, CHAT_PARAMS_CARD_DEFAULTS);
            ctx.showToast?.('聊天参数已恢复默认', 'success');
        };
        const restoreImageGenDefaults = () => {
            if (!ctx?.settings) return;
            Object.assign(ctx.settings, IMAGE_GEN_CARD_DEFAULTS);
            ctx.showToast?.('生图设置已恢复默认，密钥保留', 'success');
        };
        return {
            ...(ctx || {}),
            openExternal,
            genSectionOpen,
            chatParamsOpen,
            timeoutsOpen,
            balanceGuardOpen,
            balanceGuardModeOptions,
            balanceGuardModeLabel,
            restoreBalanceGuardDefaults,
            balanceRows,
            refreshBalances,
            requestTimeoutItems,
            normalizeRequestTimeout: (key) => normalizeRequestTimeout(key, ctx?.settings),
            restoreChatParamsDefaults,
            restoreImageGenDefaults
        };
    }
};
</script>
