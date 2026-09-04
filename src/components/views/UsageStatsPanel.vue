<template>
            <div v-if="currentView === 'usage'" class="management-view">
                <settings-page-header title="用量统计" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18"></path>
                        </svg>
                    </template>
                    <button v-if="tokenUsageHistory.length > 0" @click="clearTokenUsageHistory"
                        class="flex-shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 text-red-600 shadow-sm transition-all hover:border-red-100 hover:bg-red-50 active:scale-95"
                        title="清空记录" aria-label="清空 Token 用量记录">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div class="mb-4 flex items-center gap-2">
                    <div class="segmented-switch segmented-switch--compact segmented-switch--four min-w-0 flex-1">
                        <div class="segmented-switch__indicator" :class="{
                            'is-position-2': tokenUsageFilter === 'chat',
                            'is-position-3': tokenUsageFilter === 'memory',
                            'is-position-4': tokenUsageFilter === 'variables'
                        }"></div>
                        <button type="button" @click="tokenUsageFilter = 'all'"
                            class="segmented-switch__option" :class="{ 'is-active': tokenUsageFilter === 'all' }">
                            全部
                        </button>
                        <button type="button" @click="tokenUsageFilter = 'chat'"
                            class="segmented-switch__option" :class="{ 'is-active': tokenUsageFilter === 'chat' }">
                            主对话
                        </button>
                        <button type="button" @click="tokenUsageFilter = 'memory'"
                            class="segmented-switch__option" :class="{ 'is-active': tokenUsageFilter === 'memory' }">
                            记忆系统
                        </button>
                        <button type="button" @click="tokenUsageFilter = 'variables'"
                            class="segmented-switch__option" :class="{ 'is-active': tokenUsageFilter === 'variables' }">
                            变量分析
                        </button>
                    </div>
                    <div class="token-usage-time-filter-container relative flex-none">
                        <button type="button" @click="showTokenUsageTimeFilter = !showTokenUsageTimeFilter"
                            class="flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-all active:scale-95"
                            :class="tokenUsageTimeFilter === 'all' ? 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700' : 'border-primary-200 bg-primary-50 text-primary-600'"
                            :title="'时间范围：' + tokenUsageTimeFilterLabel" aria-label="筛选 Token 记录时间范围"
                            :aria-expanded="showTokenUsageTimeFilter">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>
                            </svg>
                        </button>
                        <transition enter-active-class="transition duration-150 ease-out"
                            enter-from-class="opacity-0 translate-y-1 scale-95"
                            enter-to-class="opacity-100 translate-y-0 scale-100"
                            leave-active-class="transition duration-100 ease-in"
                            leave-from-class="opacity-100 translate-y-0 scale-100"
                            leave-to-class="opacity-0 translate-y-1 scale-95">
                            <div v-if="showTokenUsageTimeFilter"
                                class="absolute right-0 top-full z-30 mt-2 w-36 origin-top-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                                <button v-for="option in tokenUsageTimeFilterOptions" :key="option.value" type="button"
                                    @click="tokenUsageTimeFilter = option.value; showTokenUsageTimeFilter = false"
                                    class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                                    :class="tokenUsageTimeFilter === option.value ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'">
                                    <span>{{ option.label }}</span>
                                    <svg v-if="tokenUsageTimeFilter === option.value" class="h-4 w-4" fill="none"
                                        stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </button>
                            </div>
                        </transition>
                    </div>
                </div>

                <div class="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div class="grid grid-cols-2">
                        <div class="relative border-r border-gray-100 p-4 md:p-5">
                            <div class="flex items-center gap-2 text-[11px] font-medium text-gray-400">
                                <span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>
                                <div class="flex items-center">
                                    <span>输入</span>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'totalInputTokens' ? '' : 'totalInputTokens'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'totalInputTokens' }"
                                        :aria-expanded="settingsHelpTopic === 'totalInputTokens'"
                                        aria-label="查看总输入 Token 说明">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-2 flex items-end gap-1 font-mono leading-none">
                                <span class="text-lg font-bold text-gray-800">{{ formatTokenAggregate(tokenUsageStats.inputTokens, tokenUsageStats.inputTokensReports) }}</span>
                                <span class="inline-flex items-center gap-0.5 text-base font-normal text-gray-400">
                                    <svg class="h-4 w-4 flex-none" fill="none" stroke="currentColor" aria-hidden="true"><use href="#icon-arrow-down"></use></svg>
                                    {{ formatTokenAggregate(tokenUsageStats.cacheReadTokens, tokenUsageStats.cacheReadTokensReports) }}
                                </span>
                            </div>
                            <div v-if="settingsHelpTopic === 'totalInputTokens'" class="settings-help-popover token-usage-help-popover">
                                <span class="settings-help-popover-content">汇总当前类型和时间筛选范围内，API 实际返回的输入 Token。右侧灰色数字表示其中的缓存读取 Token，已经包含在输入总量内；接口未提供时按 0 统计。</span>
                            </div>
                        </div>
                        <div class="relative p-4 md:p-5">
                            <div class="flex items-center gap-2 text-[11px] font-medium text-gray-400">
                                <span class="h-1.5 w-1.5 rounded-full bg-yellow-400"></span>
                                <div class="flex items-center">
                                    <span>输出</span>
                                    <button type="button"
                                        @click.stop="settingsHelpTopic = settingsHelpTopic === 'totalOutputTokens' ? '' : 'totalOutputTokens'"
                                        class="settings-help-trigger"
                                        :class="{ 'is-open': settingsHelpTopic === 'totalOutputTokens' }"
                                        :aria-expanded="settingsHelpTopic === 'totalOutputTokens'"
                                        aria-label="查看总输出 Token 说明">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-2 flex items-end gap-1 font-mono leading-none">
                                <span class="text-lg font-bold text-gray-800">{{ formatTokenAggregate(tokenUsageStats.outputTokens, tokenUsageStats.outputTokensReports) }}</span>
                            </div>
                            <div v-if="settingsHelpTopic === 'totalOutputTokens'" class="settings-help-popover token-usage-help-popover is-right">
                                <span class="settings-help-popover-content">汇总当前类型和时间筛选范围内，API 实际返回的输出 Token。没有返回用量的字段按 0 统计。</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold text-gray-700">请求日志</h3>
                    <span class="text-[11px] text-gray-400">共 {{ filteredTokenUsageHistory.length }} 条</span>
                </div>
                <div v-if="displayedTokenUsageHistory.length > 0" class="space-y-3">
                    <article v-for="record in displayedTokenUsageHistory" :key="record.id"
                        class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300">
                        <div class="mb-3 flex items-start gap-3">
                            <div class="min-w-0 flex-1">
                                <div class="flex min-w-0 items-center gap-2">
                                    <span class="flex flex-shrink-0 items-center gap-1.5 text-sm font-semibold text-gray-600">
                                        <span class="h-1.5 w-1.5 rounded-full bg-primary-400"></span>
                                        {{ getTokenUsageTypeLabel(record.type) }}
                                    </span>
                                    <span class="min-w-0 flex-1 truncate text-sm text-gray-600" :title="record.model">{{ record.model || '未知模型' }}</span>
                                </div>
                                <div v-if="record.characterName || record.detail" class="mt-1.5 min-w-0 truncate text-xs text-gray-400">
                                    {{ [record.characterName, record.detail].filter(Boolean).join(' · ') }}
                                </div>
                            </div>
                            <time class="flex-shrink-0 text-xs text-gray-400">{{ formatTokenUsageTime(record.timestamp) }}</time>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3">
                                <div class="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                    <span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>输入
                                </div>
                                <div class="mt-1.5 flex items-end gap-1 font-mono leading-none">
                                    <span class="text-base font-bold text-gray-800">{{ formatTokenCount(record.inputTokens) }}</span>
                                    <span class="inline-flex items-center gap-0.5 text-sm font-normal text-gray-400">
                                        <svg class="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" aria-hidden="true"><use href="#icon-arrow-down"></use></svg>
                                        {{ formatTokenCount(record.cacheReadTokens) }}
                                    </span>
                                </div>
                            </div>
                            <div class="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3">
                                <div class="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                    <span class="h-1.5 w-1.5 rounded-full bg-yellow-400"></span>输出
                                </div>
                                <div class="mt-1.5 flex items-end gap-1 font-mono leading-none">
                                    <span class="text-base font-bold text-gray-800">{{ formatTokenCount(record.outputTokens) }}</span>
                                </div>
                            </div>
                        </div>
                    </article>
                    <nav v-if="tokenUsagePageCount > 1" class="flex items-center justify-center gap-2 pt-1" aria-label="Token 记录分页">
                        <button type="button" @click="tokenUsagePage--" :disabled="tokenUsagePage === 1"
                            class="pagination-button">
                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                            </svg>
                            上一页
                        </button>
                        <span class="min-w-[58px] text-center text-xs font-mono text-gray-500">{{ tokenUsagePage }} / {{ tokenUsagePageCount }}</span>
                        <button type="button" @click="tokenUsagePage++" :disabled="tokenUsagePage === tokenUsagePageCount"
                            class="pagination-button">
                            下一页
                            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </button>
                    </nav>
                </div>
                <div v-else class="rounded-2xl border border-dashed border-gray-200 bg-white/60 py-12 text-center">
                    <div class="text-sm font-medium text-gray-500">{{ tokenUsageHistory.length > 0 ? '当前分类还没有记录' : '还没有 Token 用量记录' }}</div>
                    <div class="mt-1 text-xs text-gray-400">{{ tokenUsageHistory.length > 0 ? '可以切换其他分类查看' : '完成一次 API 请求后会显示在这里' }}</div>
                </div>
            </div>

            <!-- Memory View -->
</template>

<script>
import { inject } from "vue";
import SettingsPageHeader from "../common/SettingsPageHeader.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { SettingsPageHeader },
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>
