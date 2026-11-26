<template>
            <div v-if="currentView === 'memory'" class="management-view">
                <settings-page-header title="记忆系统" @back="goBack">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                        </svg>
                    </template>
                    <button @click="exportMemories()" class="settings-icon-button" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importMemories" class="hidden">
                    </label>
                        <button @click="clearAllMemories()"
                            class="inline-flex min-h-[44px] items-center gap-1 px-3 py-2 bg-white text-red-600 rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-all text-xs font-bold"
                            title="清空并重建记忆（原文保留，摘要与信息卡从聊天记录重建；手动记忆保留）">
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
                                    class="inline-flex items-center text-xs px-3 py-1.5 bg-gradient-to-r from-primary-50 to-blue-50 hover:from-primary-100 hover:to-blue-100 text-primary-700 rounded-lg border border-primary-200/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow font-medium active:scale-95 hit-expand [--hit-out:-8px]">
                                    <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
                                        </path>
                                    </svg>
                                    <span>立即总结</span>
                                </button>
                                <button type="button" @click="compactMemoryNow()"
                                    :disabled="!memorySettings.enabled"
                                    class="inline-flex items-center text-xs px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 rounded-lg border border-gray-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow font-medium active:scale-95 hit-expand [--hit-out:-8px]">
                                    <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 6h16M4 12h10M4 18h7">
                                        </path>
                                    </svg>
                                    <span>手动压实</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="memorySettings.enabled" class="mb-3 animate-fade-in">
                            <div class="rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-xs leading-relaxed text-primary-800">
                                滚动记忆引擎：原文是唯一真相源，窗口内直接读取原文；窗口外由滚动摘要（长期 + 短期）+ 信息卡（角色状态 / 未决伏笔）+ 手动记忆覆盖，旧对话可经记忆目录按需取回。
                            </div>
                        </div>
                        <!-- Expandable Settings -->
                        <div v-if="memorySettings.enabled"
                            class="space-y-3 pt-3 border-t border-gray-100 animate-fade-in">
                            <div class="space-y-3">
                                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                    <label class="text-xs font-medium text-gray-500">记忆供应商（滚动总结）</label>
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
                                                <span class="settings-help-popover-content">决定最近多少轮原文保留在上下文中（8–40 轮），更早的轮次会由滚动摘要覆盖，可经记忆目录按需取回。数值越大，保留的原文越多、上下文占用也越高。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            activeKeepFloors + ' 楼'
                                            }}</span>
                                    </div>
                                    <input type="range" v-model.number="keepFloorsSlider" :min="keepFloorsSliderMin" :max="keepFloorsSliderMax" step="2"
                                        class="w-full touch-range cursor-pointer">
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
                                        class="w-full touch-range cursor-pointer">
                                </div>
                                <!-- v6 L5: hierarchical compaction (design doc §9.1).
                                         Off = flat ledger; the manual button above
                                         still works for one explicit sweep. -->
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100 mt-2">
                                    <div class="flex items-center justify-between">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">层级压实</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'compaction' ? '' : 'compaction'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'compaction' }"
                                                :aria-expanded="settingsHelpTopic === 'compaction'"
                                                aria-label="查看层级压实说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'compaction'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">同一层级的批次摘要攒够阈值后，自动重写成一段更连贯的长期要点（下层条目保留为折叠来源，可展开追溯）。关闭后记忆退回逐批平铺，注入内容仍是完整历史但叙述更碎片化。</span>
                                            </div>
                                        </div>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" v-model="memorySettings.compactionEnabled" class="settings-toggle-input sr-only">
                                            <div class="settings-toggle settings-toggle--compact"></div>
                                        </label>
                                    </div>
                                </div>
                                <div v-if="memorySettings.compactionEnabled"
                                    class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100 mt-2">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">压实阈值</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'compactionFanout' ? '' : 'compactionFanout'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'compactionFanout' }"
                                                :aria-expanded="settingsHelpTopic === 'compactionFanout'"
                                                aria-label="查看压实阈值说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'compactionFanout'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">同层摘要超过这个条数时折叠成一条更高层的长期要点（4–8）。数值越小长期摘要越紧凑、API 调用越频繁；越大越省调用，但单次压实输入更长。</span>
                                            </div>
                                        </div>
                                        <span class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                            {{ memorySettings.compactionFanout }} 条/组
                                        </span>
                                    </div>
                                    <input type="range" v-model.number="memorySettings.compactionFanout" :min="compactFanoutMin" :max="compactFanoutMax" step="1"
                                        class="w-full touch-range cursor-pointer">
                                </div>
                                <div class="relative bg-gray-50/60 p-3 rounded-xl border border-gray-100 mt-2">
                                    <div class="flex justify-between items-center mb-2">
                                        <div class="relative flex items-center">
                                            <label class="text-xs font-medium text-gray-500">信息卡过期标注</label>
                                            <button type="button"
                                                @click.stop="settingsHelpTopic = settingsHelpTopic === 'profileStale' ? '' : 'profileStale'"
                                                class="settings-help-trigger"
                                                :class="{ 'is-open': settingsHelpTopic === 'profileStale' }"
                                                :aria-expanded="settingsHelpTopic === 'profileStale'"
                                                aria-label="查看信息卡过期标注说明">
                                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                                </svg>
                                            </button>
                                            <div v-if="settingsHelpTopic === 'profileStale'" class="settings-help-popover is-above">
                                                <span class="settings-help-popover-content">信息卡条目引用的原文轮次超过这个间隔后，会在注入与面板中标注「未再出现」（10–100 轮）。标注只提示可能过期，不会删除条目。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{ memorySettings.profileStaleAfter }} 轮</span>
                                    </div>
                                    <input type="range" v-model.number="memorySettings.profileStaleAfter" min="10" max="100" step="5"
                                        class="w-full touch-range cursor-pointer">
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
                                                <span class="settings-help-popover-content">给每轮注入模型的上下文设一个 token 上限（不含输出）。超预算时按顺序收缩：先减自动召回条目，再压缩历史楼层（至少保留 6 楼现场窗口），保证对话质量优先。0 表示不限制。</span>
                                            </div>
                                        </div>
                                        <span
                                            class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{{
                                            settings.contextTokenBudget > 0 ? Number(settings.contextTokenBudget).toLocaleString() + ' tok' : '不限'
                                            }}</span>
                                    </div>
                                    <input type="range" v-model.number="settings.contextTokenBudget" min="0" max="64000" step="1000"
                                        class="w-full touch-range cursor-pointer">
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                    </div>

                <!-- v6 §20: migration status line. Derived from storage
                     only; the sweep runs in the background and never blocks
                     this page. Visible even with the engine off, because
                     adoption is pure bookkeeping. -->
                <div v-if="currentScopeMigrationStatus"
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <div class="px-4 pb-3 pt-3 space-y-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-bold text-gray-400">迁移状态</span>
                            <span class="text-[11px] text-gray-600">{{ migrationStatusLabel }}</span>
                            <span v-if="memoryMigration.running"
                                class="text-[10px] font-mono text-primary-700">后台迁移 {{ memoryMigration.done }}/{{ memoryMigration.total }}</span>
                            <div class="ml-auto flex items-center gap-1.5">
                                <button v-if="currentScopeMigrationStatus.status === 'pending'"
                                    type="button" @click="migrateAllMemoryNow()"
                                    class="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary-600 text-white active:scale-95 transition-all">
                                    立即迁移
                                </button>
                                <button type="button" @click="exportMemories()"
                                    class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">
                                    导出备份
                                </button>
                            </div>
                        </div>
                        <div v-if="memoryMigration.running" class="h-1 rounded-full bg-gray-200 overflow-hidden">
                            <div class="h-full rounded-full bg-primary-500 transition-all"
                                :style="{ width: migrationPercent + '%' }"></div>
                        </div>
                        <p class="text-[10px] text-gray-400 leading-relaxed">
                            迁移与总结都是逐条原子落盘：任何时刻退出应用最多丢失正在写入的一条，下次启动自动补齐。
                        </p>
                    </div>
                </div>

                <!-- Memory Ledger View (v6 L4): directory / info-card tabs.
                     Retrieval stays the TOC + tool_memory; the card tab is the
                     v5 M2 read/edit/lock UX on top of fact entries. -->
                <div v-if="memorySettings.enabled"
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <div class="w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all font-bold text-gray-700 bg-white">
                        <span class="flex items-center min-w-0">
                            <div class="p-1.5 rounded-lg mr-3 bg-gray-100 text-gray-500 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 7h16M4 12h10M4 17h7"></path>
                                </svg>
                            </div>
                            <span class="truncate">记忆账本</span>
                        </span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <div class="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                                {{ memoryStats.digests }} 条 · {{ memoryStats.coveredTurns }} 轮
                            </div>
                        </div>
                    </div>

                    <div class="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                        <div class="grid grid-cols-3 gap-2">
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">摘要条目</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.digests }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">覆盖轮数</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.coveredTurns }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">失效条目</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.stale }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">信息卡</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.facts }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">手动记忆</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.pins }}</div>
                            </div>
                            <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                                <div class="text-[10px] font-bold text-gray-400 mb-1">折叠历史</div>
                                <div class="text-lg font-black text-gray-800">{{ memoryStats.folded }}</div>
                            </div>
                        </div>

                        <!-- v6 L5 §13: budget health block. The view hard-
                             truncates to these caps, so this is the visible
                             proof of the injection upper bound. -->
                        <div class="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-2">
                            <div class="flex items-center justify-between">
                                <span class="text-[10px] font-bold text-gray-400">注入预算（实际 / 上限）</span>
                                <span class="text-[10px] font-mono text-gray-400">实际注入 ≤ 各块上限之和</span>
                            </div>
                            <div v-for="row in memoryBudgetRows" :key="row.key" class="space-y-1">
                                <div class="flex items-center justify-between text-[10px]">
                                    <span class="text-gray-500">{{ row.label }}</span>
                                    <span :class="['font-mono', row.over ? 'text-amber-600' : 'text-gray-500']">
                                        {{ row.used }} / {{ row.budget }} tok
                                    </span>
                                </div>
                                <div class="h-1 rounded-full bg-gray-200 overflow-hidden">
                                    <div class="h-full rounded-full bg-primary-500" :style="{ width: row.percent + '%' }"></div>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center justify-between gap-3">
                            <div class="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
                                <button type="button" @click="memoryLedgerTab = 'toc'"
                                    :class="['px-3 py-1.5 text-xs font-bold rounded-lg transition-all', memoryLedgerTab === 'toc' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500']">
                                    记忆目录
                                </button>
                                <button type="button" @click="memoryLedgerTab = 'card'"
                                    :class="['px-3 py-1.5 text-xs font-bold rounded-lg transition-all', memoryLedgerTab === 'card' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500']">
                                    信息卡
                                </button>
                            </div>
                            <span class="text-[10px] font-mono text-gray-400">
                                {{ memoryLedgerTab === 'toc' ? memoryTocEntries.length + ' 条 · tool_memory 可取全文' : memoryStats.lockedFacts + ' 条已锁定' }}
                            </span>
                        </div>

                        <!-- Directory tab -->
                        <div v-if="memoryLedgerTab === 'toc'" class="space-y-4">
                            <div class="space-y-2">
                                <div v-if="memoryTocEntries.length === 0" class="py-6 text-center text-sm text-gray-400">
                                    还没有账本条目，聊够 {{ memorySettings.keepFloors }} 轮后自动生成
                                </div>
                                <div v-else class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                                    <div v-for="item in memoryTocEntries" :key="item.entryId"
                                        class="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm cursor-pointer hover:border-gray-200 hover:shadow transition-all"
                                        title="点击查看记忆原文"
                                        @click="openMemoryEntryDetail(item.entryId)">
                                        <div class="flex items-center gap-2 flex-wrap mb-1">
                                            <span v-if="item.ref"
                                                class="text-[10px] font-mono font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-md px-1.5 py-0.5">M{{ item.ref }}</span>
                                            <span class="text-[10px] font-mono text-primary-700 bg-primary-50 border border-primary-100 rounded-md px-2 py-0.5">{{ item.label }}</span>
                                            <span v-if="item.level > 0" class="text-[10px] font-mono text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-1.5 py-0.5">L{{ item.level }}</span>
                                            <span class="text-[10px] font-mono text-gray-400">{{ item.tokens }} tok</span>
                                            <button v-if="item.level > 0" type="button" @click.stop="toggleFoldSources(item.entryId)"
                                                class="text-[10px] font-bold text-primary-700 active:scale-95 transition-all">
                                                {{ foldedSourcesOpen[item.entryId] ? '收起来源' : '折叠来源' }}
                                            </button>
                                        </div>
                                        <p class="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{{ item.summary }}</p>
                                        <div v-if="foldedSourcesOpen[item.entryId]" class="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                                            <div v-for="source in foldedSourcesFor(item.entryId)" :key="source.entryId"
                                                class="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2">
                                                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                                                    <span class="text-[10px] font-mono text-gray-400">L{{ source.level }}</span>
                                                    <span class="text-[10px] font-mono text-gray-400">{{ formatSourceRange(source) }}</span>
                                                    <span v-if="source.stale" class="text-[10px] text-amber-600">已失效</span>
                                                </div>
                                                <p class="text-[11px] text-gray-500 leading-relaxed whitespace-pre-line">{{ source.text }}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Folded summaries (long/short + batch projection) -->
                            <div class="space-y-3">
                                <div v-if="!memorySummaries || (!memorySummaries.long && !memorySummaries.short)"
                                    class="py-6 text-center text-sm text-gray-400">
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
                                                :class="['text-[10px] px-2 py-1 rounded-lg border', b.status === 'done' ? 'bg-gray-50 border-gray-200 text-gray-600' : b.status === 'failed' ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-100 text-gray-500']">
                                                第 {{ b.fromTurn }}–{{ b.toTurn }} 轮{{ b.status === 'done' ? '·已总结' : b.status === 'failed' ? '·失败' : '' }}
                                            </span>
                                        </div>
                                    </div>
                                    <!-- Story timeline: summary batches + open plot lines +
                                         character profiles — a vertical look back at the story. -->
                                    <div v-if="(memorySummaries.batches || []).some(b => b.status === 'done')"
                                        class="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                                        <div class="text-[10px] font-bold text-gray-400 mb-2">剧情时间线</div>
                                        <ol class="relative border-l-2 border-primary-100 ml-2 space-y-3">
                                            <li v-for="(b, idx) in [...memorySummaries.batches].filter(b => b.status === 'done').sort((a, b) => (a.toTurn || 0) - (b.toTurn || 0))"
                                                :key="'tl-batch-' + idx" class="ml-4 relative">
                                                <span class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary-400 border-2 border-white shadow-sm"></span>
                                                <p class="text-xs font-bold text-gray-700">第 {{ b.fromTurn }}–{{ b.toTurn }} 轮
                                                    <span class="text-[10px] text-gray-400 font-normal">章节总结完成{{ b.at ? ' · ' + new Date(b.at).toLocaleDateString() : '' }}</span>
                                                </p>
                                            </li>
                                            <li v-for="(plot, idx) in (memoryCard.openPlots || []).filter(p => p.status !== 'closed')"
                                                :key="'tl-plot-' + idx" class="ml-4 relative">
                                                <span class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white shadow-sm"></span>
                                                <p class="text-xs font-bold text-amber-600">进行中的剧情线
                                                    <span class="text-[10px] text-gray-400 font-normal">{{ plot.lastSeenTurn ? '· 至第 ' + plot.lastSeenTurn + ' 轮' : '' }}</span>
                                                </p>
                                                <p class="text-xs text-gray-600 leading-relaxed mt-0.5">{{ plot.summary }}</p>
                                            </li>
                                            <li v-for="(character, idx) in (memoryCard.characters || [])"
                                                :key="'tl-char-' + idx" class="ml-4 relative">
                                                <span class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white shadow-sm"></span>
                                                <p class="text-xs font-bold text-indigo-500">人物档案 · {{ character.name || '未命名' }}</p>
                                                <p class="text-xs text-gray-600 leading-relaxed mt-0.5">{{ character.status }}</p>
                                            </li>
                                        </ol>
                                    </div>
                                </template>
                            </div>
                        </div>

                        <!-- Info-card tab (v5 M2 UX on fact entries) -->
                        <div v-else class="space-y-4">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-[11px] font-bold text-gray-500">角色动态状态</span>
                                    <button type="button" @click="startAddFact('character')"
                                        class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-primary-700 active:scale-95 transition-all">
                                        ＋ 添加角色
                                    </button>
                                </div>
                                <div v-if="!memoryCard.characters.length" class="py-4 text-center text-sm text-gray-400">
                                    暂无角色状态；聊出窗口后由记忆模型自动维护，也可手动添加
                                </div>
                                <div v-for="character in memoryCard.characters" :key="character.entryId"
                                    class="rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                                    <div class="flex items-start justify-between gap-2">
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                <span class="text-xs font-bold text-gray-700">{{ character.name }}</span>
                                                <span v-if="character.manual" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500">已锁定</span>
                                                <span v-if="character.stale" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-amber-600">第 {{ character.lastSeenTurn }} 轮后未再出现</span>
                                            </div>
                                            <p class="text-xs text-gray-600 mt-1 whitespace-pre-line">{{ character.status }}</p>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
                                            <button type="button" @click="startEditFact(character, 'character')"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">编辑</button>
                                            <button type="button" @click="toggleFactLock(character)"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">{{ character.manual ? '解锁' : '锁定' }}</button>
                                            <button type="button" @click="removeFact(character)"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 active:scale-95 transition-all">删除</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-[11px] font-bold text-gray-500">未决伏笔</span>
                                    <button type="button" @click="startAddFact('plot')"
                                        class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-primary-700 active:scale-95 transition-all">
                                        ＋ 添加伏笔
                                    </button>
                                </div>
                                <div v-if="!memoryCard.openPlots.length" class="py-4 text-center text-sm text-gray-400">
                                    暂无未决伏笔
                                </div>
                                <div v-for="plot in memoryCard.openPlots" :key="plot.entryId"
                                    class="rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                                    <div class="flex items-start justify-between gap-2">
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                <span :class="['text-xs font-bold', plot.status === 'closed' ? 'text-gray-400 line-through' : 'text-gray-700']">{{ plot.summary }}</span>
                                                <span v-if="plot.deadline" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500">{{ plot.deadline }}</span>
                                                <span v-if="plot.status === 'closed'" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500">已关闭</span>
                                                <span v-if="plot.manual" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500">已锁定</span>
                                                <span v-if="plot.stale" class="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-amber-600">第 {{ plot.lastSeenTurn }} 轮后未再出现</span>
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
                                            <button type="button" @click="togglePlotStatus(plot)"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">{{ plot.status === 'closed' ? '重开' : '关闭' }}</button>
                                            <button type="button" @click="startEditFact(plot, 'plot')"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">编辑</button>
                                            <button type="button" @click="toggleFactLock(plot)"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">{{ plot.manual ? '解锁' : '锁定' }}</button>
                                            <button type="button" @click="removeFact(plot)"
                                                class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 active:scale-95 transition-all">删除</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div v-if="factDraft.open" class="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-3 space-y-2">
                                <div class="text-[11px] font-bold text-primary-700">
                                    {{ factDraft.entryId ? '编辑' : '新增' }}{{ factDraft.factKind === 'plot' ? '伏笔' : '角色状态' }}
                                </div>
                                <template v-if="factDraft.factKind === 'plot'">
                                    <label class="block text-[10px] text-gray-500">伏笔内容</label>
                                    <textarea v-model="factDraft.factKey" rows="2"
                                        class="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none"></textarea>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-[10px] text-gray-500">截止表达（可空）</label>
                                            <input v-model="factDraft.deadline" type="text"
                                                class="w-full mt-1 px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] text-gray-500">状态</label>
                                            <select v-model="factDraft.status"
                                                class="w-full mt-1 px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none">
                                                <option value="open">进行中</option>
                                                <option value="closed">已关闭</option>
                                            </select>
                                        </div>
                                    </div>
                                </template>
                                <template v-else>
                                    <label class="block text-[10px] text-gray-500">角色名称</label>
                                    <input v-model="factDraft.factKey" type="text"
                                        class="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none">
                                    <label class="block text-[10px] text-gray-500">当前动态状态</label>
                                    <textarea v-model="factDraft.text" rows="2"
                                        class="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none"></textarea>
                                </template>
                                <div class="flex items-center justify-end gap-2">
                                    <button type="button" @click="cancelFactDraft"
                                        class="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">取消</button>
                                    <button type="button" @click="submitFact"
                                        class="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white active:scale-95 transition-all">保存并锁定</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Manual memory (v6 L4 / v5 M2): user-authored pins. -->
                <div v-if="memorySettings.enabled"
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <div class="w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all font-bold text-gray-700 bg-white">
                        <span class="flex items-center min-w-0">
                            <div class="p-1.5 rounded-lg mr-3 bg-gray-100 text-gray-500 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                                </svg>
                            </div>
                            <span class="truncate">手动记忆</span>
                        </span>
                        <div class="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                            {{ memoryStats.pinsEnabled }} / {{ memoryPinsLimit }} 启用
                        </div>
                    </div>
                    <div class="px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
                        <div class="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px] text-gray-500 leading-relaxed">
                            手动记忆由你手写、置顶注入，摘要链永不改写；「清空重建」会保留它们。
                        </div>
                        <div v-if="!memoryPins.length" class="py-4 text-center text-sm text-gray-400">
                            还没有手动记忆，写下必须让角色记住的设定
                        </div>
                        <div v-for="pin in memoryPins" :key="pin.entryId"
                            class="rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                            <div class="flex items-start justify-between gap-2">
                                <p :class="['text-xs leading-relaxed whitespace-pre-line min-w-0', pin.enabled ? 'text-gray-700' : 'text-gray-400 line-through']">{{ pin.text }}</p>
                                <div class="flex items-center gap-1.5 flex-shrink-0">
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" :checked="pin.enabled" @change="togglePin(pin)" class="settings-toggle-input sr-only">
                                        <div class="settings-toggle settings-toggle--compact"></div>
                                    </label>
                                    <button type="button" @click="startPinEdit(pin)"
                                        class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">编辑</button>
                                    <button type="button" @click="removePin(pin)"
                                        class="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 active:scale-95 transition-all">删除</button>
                                </div>
                            </div>
                            <div class="text-[10px] font-mono text-gray-400 mt-1">{{ pin.tokens }} tok</div>
                        </div>
                        <div class="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 space-y-2">
                            <textarea v-model="pinDraft.text" rows="2" :maxlength="memoryPinTextLimit"
                                placeholder="写一条必须记住的设定…"
                                class="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:border-primary-300 focus:outline-none"></textarea>
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-[10px] text-gray-400">{{ pinDraft.text.length }} / {{ memoryPinTextLimit }} 字 · 启用上限 {{ memoryPinsLimit }} 条</span>
                                <div class="flex items-center gap-2">
                                    <button v-if="pinDraft.entryId" type="button" @click="cancelPinEdit"
                                        class="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 active:scale-95 transition-all">取消</button>
                                    <button type="button" @click="submitPin"
                                        class="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white active:scale-95 transition-all">{{ pinDraft.entryId ? '保存修改' : '添加' }}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- World Info View -->

            <!-- M2: full text of a ledger entry, opened by clicking a TOC row. -->
            <div v-if="memoryEntryDetail"
                class="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
                @click.self="memoryEntryDetail = null">
                <div
                    class="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 max-h-[80vh] flex flex-col overflow-hidden">
                    <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span v-if="memoryEntryDetail.ref"
                                class="text-xs font-mono font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-md px-2 py-0.5">M{{ memoryEntryDetail.ref }}</span>
                            <span class="text-sm font-bold text-gray-800">记忆原文</span>
                            <span v-if="memoryEntryDetail.stale" class="text-[10px] text-amber-600">已失效</span>
                        </div>
                        <button type="button" @click="memoryEntryDetail = null"
                            class="text-gray-400 hover:text-gray-700 transition-colors p-1.5 rounded-full hover:bg-gray-100">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12">
                                </path>
                            </svg>
                        </button>
                    </div>
                    <p class="px-5 py-3 text-xs text-gray-500 whitespace-pre-line leading-relaxed overflow-y-auto custom-scrollbar flex-1">{{
                        memoryEntryDetail.text }}</p>
                </div>
            </div>
</template>

<script>
import { computed, inject, reactive, ref } from "vue";
import SettingsPageHeader from "../common/SettingsPageHeader.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { SettingsPageHeader },
  setup() {
    const ctx = inject("appContext") || {};
    // v6 L4: panel-local editor state. Ledger truth stays in app.mjs; these
    // drafts only drive the inline forms.
    const memoryLedgerTab = ref("toc");
    const pinDraft = reactive({ entryId: "", text: "" });
    const factDraft = reactive({
      open: false,
      entryId: "",
      factKind: "character",
      factKey: "",
      text: "",
      status: "open",
      deadline: ""
    });
    // v6 L5: folded-source expansion is panel-local state; ledger truth
    // (base[] chain) stays in app.mjs.
    const foldedSourcesOpen = reactive({});
    const toggleFoldSources = (entryId) => {
      foldedSourcesOpen[entryId] = !foldedSourcesOpen[entryId];
    };
    const foldedSourcesFor = (entryId) => (
      foldedSourcesOpen[entryId] ? ctx.getMemoryEntryBase?.(entryId) || [] : []
    );
    const formatSourceRange = (source) => {
      if (!source || !source.fromTurn) return "历史";
      return source.fromTurn === source.toTurn
        ? `第 ${source.fromTurn} 轮`
        : `第 ${source.fromTurn}–${source.toTurn} 轮`;
    };
    const migrationPercent = computed(() => {
      const state = ctx.memoryMigration;
      if (!state || !state.total) return 0;
      return Math.min(100, Math.round((state.done / state.total) * 100));
    });
    // Budget health block (§13): actual injected tokens vs the view caps.
    const memoryBudgetRows = computed(() => {
      const stats = ctx.memoryBudgetStats?.value;
      if (!stats) return [];
      return [
        { key: "long", label: "长期摘要", ...stats.long },
        { key: "short", label: "短期摘要", ...stats.short },
        { key: "toc", label: "记忆目录", ...stats.toc },
        { key: "card", label: "信息卡", ...stats.card }
      ].map(row => ({
        ...row,
        percent: row.budget > 0 ? Math.min(100, Math.round((row.used / row.budget) * 100)) : 0,
        over: row.budget > 0 && row.used > row.budget
      }));
    });

    const startAddFact = (factKind) => {
      Object.assign(factDraft, {
        open: true,
        entryId: "",
        factKind,
        factKey: "",
        text: "",
        status: "open",
        deadline: ""
      });
    };

    const startEditFact = (item, factKind) => {
      Object.assign(factDraft, factKind === "plot" ? {
        open: true,
        entryId: item.entryId,
        factKind,
        factKey: item.summary || "",
        text: item.summary || "",
        status: item.status === "closed" ? "closed" : "open",
        deadline: item.deadline || ""
      } : {
        open: true,
        entryId: item.entryId,
        factKind,
        factKey: item.name || "",
        text: item.status || "",
        status: "open",
        deadline: ""
      });
    };

    const cancelFactDraft = () => { factDraft.open = false; };

    const submitFact = async () => {
      const payload = factDraft.factKind === "plot"
        ? {
            entryId: factDraft.entryId || undefined,
            factKind: "plot",
            factKey: factDraft.factKey,
            text: factDraft.factKey,
            status: factDraft.status,
            deadline: factDraft.deadline
          }
        : {
            entryId: factDraft.entryId || undefined,
            factKind: "character",
            factKey: factDraft.factKey,
            text: factDraft.text
          };
      const saved = await ctx.saveMemoryFact?.(payload);
      if (saved) cancelFactDraft();
    };

    const removeFact = (item) => ctx.deleteMemoryFact?.(item.entryId);
    const toggleFactLock = (item) => ctx.toggleMemoryFactLock?.(item.entryId);
    const togglePlotStatus = (item) => ctx.toggleMemoryPlotStatus?.(item.entryId);

    const startPinEdit = (pin) => {
      pinDraft.entryId = pin.entryId;
      pinDraft.text = pin.text;
    };
    const cancelPinEdit = () => {
      pinDraft.entryId = "";
      pinDraft.text = "";
    };
    const submitPin = async () => {
      const saved = pinDraft.entryId
        ? await ctx.updateMemoryPin?.(pinDraft.entryId, pinDraft.text)
        : await ctx.addMemoryPin?.(pinDraft.text);
      if (saved) cancelPinEdit();
    };
    const removePin = (pin) => ctx.deleteMemoryPin?.(pin.entryId);
    const togglePin = (pin) => ctx.toggleMemoryPinEnabled?.(pin.entryId);

    // M2: clicking a TOC row opens the entry's full text (the directory only
    // shows the truncated summary). Detail state is panel-local; the ledger
    // lookup itself lives in app.mjs.
    const memoryEntryDetail = ref(null);
    const openMemoryEntryDetail = (entryId) => {
      memoryEntryDetail.value = ctx.getMemoryEntryDetail?.(entryId) || null;
    };

    return {
      ...ctx,
      memoryLedgerTab,
      memoryEntryDetail,
      openMemoryEntryDetail,
      pinDraft,
      factDraft,
      memoryBudgetRows,
      migrationPercent,
      foldedSourcesOpen,
      toggleFoldSources,
      foldedSourcesFor,
      formatSourceRange,
      startAddFact,
      startEditFact,
      cancelFactDraft,
      submitFact,
      removeFact,
      toggleFactLock,
      togglePlotStatus,
      startPinEdit,
      cancelPinEdit,
      submitPin,
      removePin,
      togglePin
    };
  }
};
</script>
