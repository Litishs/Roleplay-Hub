<template>
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
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium flex items-center">
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
                            class="h-9 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold border border-teal-100 transition-all active:scale-95 flex items-center gap-1 leading-none"
                            style="line-height: 1;">
                            <svg class="flex-shrink-0" style="display:block;width:1em;height:1em" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                            </svg>
                            <span class="flex-shrink-0" style="line-height:1">粘贴</span>
                        </button>
                        <button type="button" @click="toggleApiKeyVisibility"
                            :title="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                            class="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 flex items-center justify-center transition-all active:scale-95 flex-shrink-0">
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

            <!-- 聊天模型（合并槽位选择器） -->
            <div class="mt-5">
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
            </div>



            <!-- Generation Settings (Integrated) -->
            <div class="pt-6 border-t border-gray-100 mt-6">
                <div class="flex items-center justify-between gap-3">
                    <button type="button" @click="genSectionOpen = !genSectionOpen"
                        class="flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider text-left group">
                        <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                            </path>
                        </svg>
                        <span>生成参数</span>
                        <svg :class="['w-4 h-4 ml-1.5 text-gray-400 transition-transform duration-200', genSectionOpen ? 'rotate-180' : '']"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <button type="button" @click="openExternal('https://cdn.sta1n.cn/keys')"
                        class="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium">
                        获取生图密钥
                    </button>
                </div>
                <div v-show="genSectionOpen" class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <input v-model="settings.imageGenKey" type="password"
                            class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 text-sm focus:ring-2 focus:ring-teal-100 focus:border-teal-400 focus:outline-none transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                            placeholder="STA1N-...">
                        <div class="text-[10px] text-gray-400 mt-1.5">推荐 STA1N 生图服务（nai.sta1n.cn），密钥可在
                            <button type="button" @click="openExternal('https://cdn.sta1n.cn/keys')"
                                class="text-teal-600 hover:underline cursor-pointer">cdn.sta1n.cn</button>
                            获取</div>
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
</template>

<script>
import { inject, ref } from "vue";
import { RPHubCustomSelect as CustomSelect } from "../../modules/ui-select.mjs";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
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
        return { ...(ctx || {}), openExternal, genSectionOpen };
    }
};
</script>
