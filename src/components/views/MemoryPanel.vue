<template>
            <div v-if="currentView === 'memory'" class="management-view">
                <settings-page-header title="记忆系统" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                        </svg>
                    </template>
                    <template #title-extra>
                        <span v-if="isAnyMemoryProcessing"
                                class="ml-2 inline-flex items-center justify-center text-primary-600 bg-primary-50 w-6 h-6 rounded-full border border-primary-200"
                                title="正在处理记忆">
                                <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                        stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                                    </path>
                                </svg>
                            </span>
                    </template>
                    <button @click="exportMemories()" class="settings-icon-button" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importMemories" class="hidden">
                    </label>
                        <button @click="clearAllMemories()"
                            class="inline-flex items-center gap-1 px-2.5 py-2 bg-white text-red-600 rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-all text-xs font-bold"
                            title="清空并重建记忆（原文保留，摘要与关系从聊天记录重建）">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                            清空重建
                        </button>
                </settings-page-header>

                <!-- Memory Settings (Collapsible like World Info) -->
                <div
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <button @click="showMemorySettings = !showMemorySettings; settingsHelpTopic = ''"
                        class="settings-collapse-trigger" aria-controls="memory-settings-panel"
                        :aria-expanded="showMemorySettings"
                        :class="['w-full flex justify-between items-center px-4 py-3 rounded-xl font-bold',
                                     showMemorySettings ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50']">
                        <span class="flex items-center">
                            <div
                                :class="['p-1.5 rounded-lg mr-3 transition-colors', showMemorySettings ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                    </path>
                                </svg>
                            </div>
                            记忆引擎设置
                        </span>
                        <span class="flex items-center gap-3 flex-shrink-0">
                            <span class="text-xs font-bold"
                                :class="memorySettings.enabled ? 'text-primary-600' : 'text-gray-400'">
                                {{ memorySettings.enabled ? '已开启' : '已关闭' }}
                            </span>
                            <svg :class="{'transform rotate-180': showMemorySettings}"
                                class="settings-collapse-chevron w-5 h-5" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                                </path>
                            </svg>
                        </span>
                    </button>
                    <div id="memory-settings-panel" class="settings-collapse"
                        :class="{ 'is-open': showMemorySettings }"
                        :aria-hidden="!showMemorySettings" :inert="!showMemorySettings">
                        <div class="settings-collapse__inner">
                            <div class="settings-collapse__content px-4 pb-4 pt-3 border-t border-gray-100">
                        <!-- System Toggle & Extract -->
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center space-x-3">
                                <span class="text-sm font-bold text-gray-700">记忆引擎</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" v-model="memorySettings.enabled" class="settings-toggle-input sr-only">
                                    <div class="settings-toggle settings-toggle--compact"></div>
                                </label>
                            </div>
                            <div class="flex items-center gap-2">


                                <button type="button" @click="runRollingSummaryCheck({ force: true })"
                                    :disabled="!memorySettings.enabled"
                                    class="inline-flex items-center text-xs px-3 py-1.5 bg-gradient-to-r from-primary-50 to-blue-50 hover:from-primary-100 hover:to-blue-100 text-primary-700 rounded-lg border border-primary-200/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow font-medium active:scale-95">
                                    <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
                                        </path>
                                    </svg>
                                    <span>立即总结</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="memorySettings.enabled" class="mb-3 animate-fade-in">
                            <div class="rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-xs leading-relaxed text-primary-800">
                                滚动记忆引擎：原文是唯一真相源，窗口内直接读取原文；窗口外由滚动摘要（长期 + 短期）+ 固定信息卡（角色状态 / 有向关系 / 未决伏笔）覆盖，旧对话可经原文检索按需召回。
                            </div>
                        </div>
                        <!-- Expandable Settings -->
                        <div v-if="memorySettings.enabled"
                            class="space-y-3 pt-3 border-t border-gray-100 animate-fade-in">
                            <div class="space-y-3">
                                <div class="p-3 rounded-xl border border-gray-100 bg-white/60">
                                    <label class="text-xs font-medium text-gray-500 block mb-2">嵌入后端</label>
                                    <div class="segmented-switch segmented-switch--compact w-full">
                                        <div class="segmented-switch__indicator" :class="{ 'is-right': memorySettings.embeddingBackend !== 'api' }"></div>
                                        <div class="segmented-switch__option" :class="{ 'is-active': memorySettings.embeddingBackend === 'api' }">
                                            <button type="button" @click="memorySettings.embeddingBackend = 'api'" class="absolute inset-0 rounded-lg" aria-label="使用 API 嵌入"></button>
                                            <span class="relative z-10 pointer-events-none">API</span>
                                        </div>
                                        <div class="segmented-switch__option" :class="{ 'is-active': memorySettings.embeddingBackend === 'local' }">
                                            <button type="button" @click="memorySettings.embeddingBackend = 'local'" class="absolute inset-0 rounded-lg" aria-label="使用本地模型嵌入"></button>
                                            <span class="relative z-10 pointer-events-none">本地(离线)</span>
                                        </div>
                                    </div>
                                    <div v-if="memorySettings.embeddingBackend === 'local'" class="mt-3 space-y-2">
                                        <div>
                                            <label class="text-xs font-medium text-gray-500">本地模型</label>
                                            <custom-select v-model="memorySettings.localEmbeddingModel" :options="localEmbeddingModelOptions" button-class="rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:border-teal-400 focus:ring-teal-100" menu-class="text-sm"></custom-select>
                                        </div>
                                        <div class="flex items-center justify-between gap-2">
                                            <span class="text-xs text-gray-500">{{ localEmbeddingStatusLabel }}</span>
                                            <button type="button" @click="preloadLocalEmbedding()" class="text-xs px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-medium border border-teal-100 transition-all active:scale-95">预加载模型</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <label class="text-xs font-medium text-gray-500">记忆供应商（滚动总结 / 嵌入）</label>
                                    <select v-model="memorySettings.memoryProviderId"
                                        class="w-full mt-2 px-3 py-2 text-sm bg-white/80 border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none transition-all">
                                        <option v-for="p in memoryProviderSelectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
                                    </select>
                                    <div class="text-[10px] text-gray-400 mt-1.5">当前记忆请求使用：<span class="font-mono text-teal-600">{{ memoryProviderLabel }}</span>。留空则跟随聊天供应商，可同时保存多家 Key。</div>
                                </div>
                                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <label class="text-xs font-medium text-gray-500">记忆模型（滚动总结 / 固定信息卡）</label>
                                    <button type="button" @click="openModelSelector('memoryClassicModel')"
                                        class="w-full mt-2 px-3 py-2 text-left text-sm bg-white/80 border border-gray-200 rounded-xl hover:border-primary-300 transition-all">
                                        <span class="font-mono text-teal-600">{{ memorySettings.classicModel || '未选择（跟随聊天模型）' }}</span>
                                    </button>
                                    <div class="text-[10px] text-gray-400 mt-1.5">滚动总结与固定信息卡刷新使用的模型；由记忆供应商提供。</div>
                                </div>
                                <div v-if="memorySettings.embeddingBackend === 'api'" class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <div class="relative mb-2 flex items-center">
                                        <label class="text-xs font-medium text-gray-500">向量嵌入模型</label>
                                        <button type="button"
                                            @click.stop="settingsHelpTopic = settingsHelpTopic === 'embeddingModel' ? '' : 'embeddingModel'"
                                            class="settings-help-trigger"
                                            :class="{ 'is-open': settingsHelpTopic === 'embeddingModel' }"
                                            :aria-expanded="settingsHelpTopic === 'embeddingModel'"
                                            aria-label="查看向量嵌入模型说明">
                                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                            </svg>
                                        </button>
                                        <div v-if="settingsHelpTopic === 'embeddingModel'" class="settings-help-popover">
                                            <span class="settings-help-popover-content">用于把对话转换成可比较的向量坐标，它不是聊天模型。</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">记忆召回分片数</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'vectorTopK' ? '' : 'vectorTopK'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'vectorTopK' }"
                                                :aria-expanded="settingsHelpTopic === 'vectorTopK'"
                                                aria-label="查看记忆召回分片数说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'vectorTopK'" class="settings-help-popover">
                                                <span class="settings-help-popover-content">限制每次最多带入多少条相关记忆。数值越大，能带回的细节越多，也更容易混入关联较弱的内容；数值越小，内容更精简，但可能遗漏有用细节。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            memorySettings.vectorTopK || 10 }} 个分片</span>
                                    </div>
                                    <input type="range" v-model.number="memorySettings.vectorTopK" min="10" max="20" step="1"
                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                </div>
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">最低召回相关度</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'similarity' ? '' : 'similarity'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'similarity' }"
                                                :aria-expanded="settingsHelpTopic === 'similarity'"
                                                aria-label="查看最低召回相关度说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'similarity'" class="settings-help-popover">
                                                <span class="settings-help-popover-content">控制记忆分片的最低匹配程度。数值越高，不相关内容越少，但可能漏掉间接相关的记忆；数值越低，召回的记忆分片越多，同时也会增加关联较弱的结果。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            memorySettings.similarityThreshold + '%'
                                            }}</span>
                                    </div>
                                    <input type="range" v-model.number="memorySettings.similarityThreshold" min="40" max="70" step="5"
                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                </div>
                            </div>

                            <!-- Context Compression Settings -->
                            <div class="pt-3 border-t border-gray-100 mt-1">
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">保留最近楼层</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'keepFloors' ? '' : 'keepFloors'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'keepFloors' }"
                                                :aria-expanded="settingsHelpTopic === 'keepFloors'"
                                                aria-label="查看保留最近楼层说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'keepFloors'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">决定最近多少轮原文保留在上下文中（8–40 轮），更早的轮次会由滚动摘要覆盖，可经原文检索按需召回。数值越大，保留的原文越多、上下文占用也越高。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            activeKeepFloors + ' 楼'
                                            }}</span>
                                    </div>
                                    <input type="range" v-model.number="keepFloorsSlider" :min="keepFloorsSliderMin" :max="keepFloorsSliderMax" step="2"
                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                </div>
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100 mt-2">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">总结批次大小</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'summaryBatch' ? '' : 'summaryBatch'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'summaryBatch' }"
                                                :aria-expanded="settingsHelpTopic === 'summaryBatch'"
                                                aria-label="查看总结批次大小说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'summaryBatch'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">每攒满多少轮窗口外的旧对话就总结一批（4–24 轮）。数值越小总结越频繁、摘要更新越及时，但 API 调用成本越高；数值越大越省，单批内容也越多。</span>
                                            </div>
                                        </div>
                                        <span class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                            {{ memorySettings.summaryBatchSize }} 轮/批
                                        </span>
                                    </div>
                                    <input type="range" v-model.number="summaryBatchSizeSlider" min="4" max="24" step="2"
                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                </div>
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100 mt-2">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">上下文 Token 预算</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'contextBudget' ? '' : 'contextBudget'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'contextBudget' }"
                                                :aria-expanded="settingsHelpTopic === 'contextBudget'"
                                                aria-label="查看上下文预算说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'contextBudget'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">给每轮注入模型的上下文设一个 token 上限（不含输出）。超预算时按顺序收缩：先减记忆分片证据，再压缩历史楼层（至少保留 6 楼现场窗口），保证对话质量优先。0 表示不限制。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            settings.contextTokenBudget > 0 ? Number(settings.contextTokenBudget).toLocaleString() + ' tok' : '不限'
                                            }}</span>
                                    </div>
                                    <input type="range" v-model.number="settings.contextTokenBudget" min="0" max="64000" step="1000"
                                        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                    </div>

                <!-- Vector Memory View -->
                <div v-if="memorySettings.enabled && memorySettings.mode === 'vector'"
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <div class="w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all font-bold text-gray-700 bg-white">
                        <span class="flex items-center min-w-0">
                            <div class="p-1.5 rounded-lg mr-3 bg-gray-100 text-gray-500 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 7h16M4 12h10M4 17h7"></path>
                                </svg>
                            </div>
                            <span class="truncate">向量记忆</span>
                        </span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <div class="grid grid-cols-2 gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                                <button type="button" @click="setMemoryGraphView('list')"
                                    :class="['px-2.5 py-1 text-xs font-bold rounded-md transition-all', memoryGraphView === 'list' ? 'bg-white text-primary-700 shadow-sm border border-primary-100' : 'text-gray-400 hover:text-gray-600']">
                                    检索
                                </button>
                                <button type="button" @click="setMemoryGraphView('summary')"
                                    :class="['px-2.5 py-1 text-xs font-bold rounded-md transition-all', memoryGraphView === 'summary' ? 'bg-white text-primary-700 shadow-sm border border-primary-100' : 'text-gray-400 hover:text-gray-600']">
                                    摘要
                                </button>
                            </div>
                            <div class="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                                {{ memoryGraphView === 'summary' ? (memorySummaries ? memorySummaries.batches.length : 0) + ' 批摘要' : memoryStats.vector + ' 个分片' }}
                            </div>
                        </div>
                    </div>

                    <div class="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                        <div v-show="memoryGraphView === 'list'" class="space-y-4">
                        <div v-if="sliceBuildStatus.status !== 'idle' && memoryStats.vector === 0"
                            :class="['rounded-xl px-3 py-2.5 text-xs font-bold border flex items-center gap-2',
                                sliceBuildStatus.status === 'building' ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : sliceBuildStatus.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-emerald-50 border-emerald-100 text-emerald-700']">
                            <span v-if="sliceBuildStatus.status === 'building'"
                                class="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></span>
                            <span class="flex-1">
                                <template v-if="sliceBuildStatus.status === 'building'">正在生成原文分片…</template>
                                <template v-else-if="sliceBuildStatus.status === 'error'">分片生成失败：{{ sliceBuildStatus.message }}</template>
                                <template v-else>{{ sliceBuildStatus.message }}</template>
                            </span>
                            <button v-if="sliceBuildStatus.status === 'error'" type="button"
                                @click="startVectorBatchMemoryExtraction({ manual: true })"
                                class="flex-shrink-0 px-2 py-1 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors">
                                重试
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">总分片</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.vector }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">覆盖轮数</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.vectorTurns }}</div>
                            </div>
                        </div>

                        <form @submit.prevent="searchVectorMemories()" class="flex flex-col sm:flex-row gap-2">
                            <input v-model="vectorMemorySearchQuery"
                                :disabled="isVectorMemorySearching"
                                class="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50/60 border border-gray-200 rounded-xl focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                placeholder="输入需要检索的内容">
                            <button type="submit"
                                :disabled="isVectorMemorySearching || !vectorMemorySearchQuery.trim() || memoryStats.vector === 0"
                                class="min-h-[42px] px-4 py-2.5 text-sm font-bold rounded-xl bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all">
                                {{ isVectorMemorySearching ? '检索中' : '检索记忆' }}
                            </button>
                            <button v-if="vectorMemorySearchQuery || vectorMemorySearchResults.length > 0 || vectorMemorySearchError"
                                type="button" @click="clearVectorMemorySearch()"
                                class="px-3 py-2 text-xs font-bold rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 active:scale-95 transition-all">
                                清空
                            </button>
                        </form>

                        <div v-if="vectorMemorySearchError"
                            class="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                            {{ vectorMemorySearchError }}
                        </div>

                        <div v-if="vectorMemorySearchResults.length > 0" class="space-y-2">
                            <div class="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-500">
                                <span class="flex items-center gap-2 flex-wrap">
                                    <span>记忆分片 · {{ vectorMemorySearchResults.length }} / 20</span>
                                </span>
                                <div class="grid grid-cols-2 gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                                    <button type="button" @click="vectorMemorySearchSortMode = 'time'"
                                        :class="['px-2 py-1 rounded-md transition-all', vectorMemorySearchSortMode === 'time' ? 'bg-white text-primary-700 shadow-sm border border-primary-100' : 'text-gray-400 hover:text-gray-600']">
                                        时间
                                    </button>
                                    <button type="button" @click="vectorMemorySearchSortMode = 'score'"
                                        :class="['px-2 py-1 rounded-md transition-all', vectorMemorySearchSortMode === 'score' ? 'bg-white text-primary-700 shadow-sm border border-primary-100' : 'text-gray-400 hover:text-gray-600']">
                                        相关度
                                    </button>
                                </div>
                            </div>
                            <div class="space-y-2">
                                <div v-for="mem in displayedVectorMemorySearchResults" :key="mem.id"
                                    class="rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                                    <div class="flex items-center gap-2 flex-wrap mb-1.5">
                                        <span class="text-[10px] font-mono text-primary-700 bg-primary-50 border border-primary-100 rounded-md px-2 py-0.5">
                                            第 {{ mem.turn || '?' }} 轮
                                        </span>
                                        <span class="text-[10px] font-mono text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5">
                                            相关度 {{ (mem.vectorSearchScore * 100).toFixed(1) }}%
                                        </span>
                                    </div>
                                    <p class="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{{ mem.paragraph || mem.summary }}</p>
                                </div>
                            </div>
                        </div>
                        </div>

                        <!-- Memory Summary Panel（滚动摘要，P2） -->
                        <div v-show="memoryGraphView === 'summary'" class="space-y-3">
                            <div v-if="!memorySummaries || (!memorySummaries.long && !memorySummaries.short)"
                                class="py-8 text-center text-sm text-gray-400">
                                还没有摘要，聊够 {{ memorySettings.keepFloors }} 轮后自动生成
                            </div>
                            <template v-else>
                                <div v-if="memorySummaries.long" class="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                                    <div class="text-[10px] font-bold text-gray-400 mb-1">长期摘要</div>
                                    <p class="text-xs text-gray-700 whitespace-pre-line">{{ memorySummaries.long }}</p>
                                </div>
                                <div v-if="memorySummaries.short" class="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                                    <div class="text-[10px] font-bold text-gray-400 mb-1">短期摘要</div>
                                    <p class="text-xs text-gray-700 whitespace-pre-line">{{ memorySummaries.short }}</p>
                                </div>
                                <div v-if="memorySummaries.batches.length > 0"
                                    class="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                                    <div class="text-[10px] font-bold text-gray-400 mb-1">总结批次</div>
                                    <div class="flex flex-wrap gap-1.5">
                                        <span v-for="(b, idx) in memorySummaries.batches" :key="idx"
                                            :class="['text-[10px] px-2 py-1 rounded-lg border', b.status === 'done' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : b.status === 'failed' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-gray-50 border-gray-100 text-gray-500']">
                                            第 {{ b.fromTurn }}–{{ b.toTurn }} 轮{{ b.status === 'done' ? '·已总结' : b.status === 'failed' ? '·失败' : '' }}
                                        </span>
                                    </div>
                                </div>
                            </template>
                        </div>

                    </div>
                </div>

            </div>

            <!-- World Info View -->
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
