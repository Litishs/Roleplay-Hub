<template>
            <div v-if="currentView === 'characters'" class="management-view">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3">
                    <div class="flex items-center justify-between w-full md:w-auto">
                        <div class="flex items-center">
                            <button @click="toggleMobileMenu"
                                class="md:hidden mr-3 p-2 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm active:scale-95 transition-all flex-shrink-0">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
                            </button>
                            <h2 class="text-xl md:text-2xl font-bold text-gray-900 flex items-center">
                                <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                    </path>
                                </svg>
                                角色卡管理
                            </h2>
                        </div>

                        <!-- Mobile Quick Actions -->
                        <div class="flex md:hidden items-center space-x-2" v-if="!isBatchDeleteMode">
                            <button @click="toggleBatchDeleteMode"
                                class="p-2.5 bg-white text-red-500 rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-all"
                                title="批量删除">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                            </button>
                            <button @click="showAddCharacterMenu = true"
                                class="p-2.5 bg-primary-600 text-white rounded-xl shadow-sm active:scale-95 transition-all"
                                title="添加角色卡">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 4v16m8-8H4"></path>
                                </svg>
                            </button>
                        </div>

                        <!-- Mobile Batch Delete Actions -->
                        <div class="flex md:hidden items-center space-x-2" v-else>
                            <button @click="toggleBatchDeleteMode"
                                class="p-2.5 bg-white text-gray-600 rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-all"
                                title="取消选择">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                            <button @click="batchDeleteCharacters" :disabled="selectedCharacterIndices.size === 0"
                                class="relative p-2.5 bg-red-600 text-white rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50"
                                title="确认删除">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                                <span
                                    class="absolute -top-1 -right-1 bg-white text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-200 shadow-sm leading-none"
                                    v-if="selectedCharacterIndices.size > 0">{{ selectedCharacterIndices.size }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Search Controls -->
                    <div class="flex flex-1 w-full md:w-auto md:max-w-md gap-2" v-if="!isBatchDeleteMode">
                        <div class="relative flex-1 group">
                            <input v-model="characterSearchQuery" type="text" placeholder="检索角色卡名称或描述..."
                                class="w-full bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-sm group-hover:border-gray-300">
                            <div class="absolute left-3 top-0 bottom-0 flex items-center text-gray-400 transition-colors group-focus-within:text-primary-500 pointer-events-none">
                                <svg class="w-5 h-5" style="display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div class="hidden md:flex space-x-2 md:space-x-3 w-full md:w-auto pb-1" v-if="!isBatchDeleteMode">
                        <button @click="toggleBatchDeleteMode"
                            class="flex-1 md:flex-none justify-center px-3 md:px-5 py-2.5 bg-white hover:bg-gray-50 text-red-600 rounded-xl border border-gray-200 transition-all shadow-sm hover:shadow flex items-center text-sm font-bold">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                </path>
                            </svg>
                            删除
                        </button>
                        <button @click="showAddCharacterMenu = true"
                            class="flex-1 md:flex-none justify-center px-3 md:px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all shadow-sm hover:shadow flex items-center text-sm font-bold">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M12 4v16m8-8H4"></path>
                            </svg>
                            添加
                        </button>
                    </div>
                    <div class="hidden md:flex space-x-2 md:space-x-3 w-full md:w-auto" v-else>
                        <button @click="toggleBatchDeleteMode"
                            class="flex-1 md:flex-none justify-center px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200 transition-all shadow-sm hover:shadow flex items-center text-sm font-bold">
                            取消选择
                        </button>
                        <button @click="batchDeleteCharacters" :disabled="selectedCharacterIndices.size === 0"
                            class="flex-1 md:flex-none justify-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-sm hover:shadow flex items-center text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                </path>
                            </svg>
                            确认删除 ({{ selectedCharacterIndices.size }})
                        </button>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredCharacters.length === 0"
                    class="flex flex-col items-center justify-center py-32 text-center animate-fade-in">
                    <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6 text-gray-300">
                        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                            </path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">未找到匹配的角色卡</h3>
                    <p class="text-gray-500 max-w-xs mx-auto mb-6">尝试更换检索关键词，或者创作一个属于你的角色卡！</p>
                    <div class="flex flex-col md:flex-row gap-3 justify-center">
                        <button v-if="characterSearchQuery" @click="characterSearchQuery = ''"
                            class="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                            清除检索
                        </button>
                        <button @click="currentView = 'generator'"
                            class="px-6 py-2.5 bg-primary-50 text-primary-600 rounded-xl font-bold hover:bg-primary-100 transition-colors flex items-center justify-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            前往角色卡工坊
                        </button>
                    </div>
                </div>

                <!-- Mobile View (Grid) -->
                <div class="md:hidden grid grid-cols-2 gap-4">
                    <div v-for="char in displayedCharacters" :key="'mobile-'+char.uuid"
                        class="char-grid-item relative aspect-[2/3] rounded-2xl overflow-hidden shadow-md transition-[transform,shadow,border-color] duration-300 border border-gray-100"
                        :class="{'ring-4 ring-primary-500 ring-offset-2': currentCharacter && currentCharacter.uuid === char.uuid && !isBatchDeleteMode}"
                        @pointerdown="beginCharacterCardPress"
                        @pointerup="endCharacterCardPress"
                        @pointercancel="endCharacterCardPress"
                        @pointerleave="endCharacterCardPress"
                        @click="isBatchDeleteMode ? toggleCharacterSelection(char.originalIndex) : selectCharacter(char.originalIndex)">

                        <!-- Avatar Background -->
                        <img :src="char?.avatar" class="absolute inset-0 w-full h-full object-cover" loading="lazy">

                        <!-- Gradient Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                        <!-- Selection Indicator (Batch Delete) -->
                        <div v-if="isBatchDeleteMode"
                            class="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                            <div class="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                                :class="selectedCharacterIndices.has(char.originalIndex) ? 'bg-red-500 border-red-500' : 'bg-white/20 border-white/50'">
                                <svg v-if="selectedCharacterIndices.has(char.originalIndex)" class="w-6 h-6 text-white"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                        </div>

                        <!-- Current Active Badge -->
                        <div v-if="currentCharacter && currentCharacter.uuid === char.uuid && !isBatchDeleteMode"
                            class="absolute top-3 left-3 z-10">
                            <div
                                class="flex items-center text-[10px] font-bold text-white bg-green-600/60 backdrop-blur-xl px-2 py-1 rounded-full border border-white/30 shadow-lg">
                                <span
                                    class="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 shadow-[0_0_5px_rgba(74,222,128,0.8)]"></span>
                                当前使用
                            </div>
                        </div>

                        <!-- Quick Actions (Mobile Top Right) -->
                        <div class="absolute top-3 right-3 flex flex-col gap-2 z-20" v-if="!isBatchDeleteMode">
                            <button @click.stop="editCharacter(char.originalIndex)"
                                class="p-2 bg-white/20 backdrop-blur-md text-white rounded-full border border-white/20 active:bg-white/40 shadow-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                    </path>
                                </svg>
                            </button>
                            <button @click.stop="openCharacterExportModal(char.originalIndex)"
                                class="p-2 bg-white/20 backdrop-blur-md text-white rounded-full border border-white/20 active:bg-white/40 shadow-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            </button>
                            <button @click.stop="toggleCharacterFavorite(char.originalIndex)"
                                class="p-2 bg-white/20 backdrop-blur-md rounded-full border border-white/20 active:bg-white/40 shadow-lg transition-colors"
                                :class="isCharacterFavorite(char) ? 'text-amber-300' : 'text-white'"
                                :title="isCharacterFavorite(char) ? '取消收藏' : '收藏角色'"
                                :aria-label="isCharacterFavorite(char) ? '取消收藏' : '收藏角色'">
                                <svg class="w-4 h-4" :fill="isCharacterFavorite(char) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-star"></use></svg>
                            </button>

                        </div>

                        <!-- Info & Actions -->
                        <div class="absolute bottom-0 left-0 right-0 p-3 z-10">
                            <h3 class="text-white font-bold text-sm truncate mb-2 drop-shadow-md">{{ char.name }}</h3>

                            <div class="flex items-center justify-between" v-if="!isBatchDeleteMode">
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        class="px-1.5 py-0.5 bg-white/20 backdrop-blur-md text-white text-[8px] rounded border border-white/10">
                                        {{ getCharacterWICount(char) }} 世界书
                                    </span>
                                    <span
                                        class="px-1.5 py-0.5 bg-white/20 backdrop-blur-md text-white text-[8px] rounded border border-white/10">
                                        {{ getCharacterRegexCount(char) }} 正则
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Desktop View (Grid) -->
                <div class="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div v-for="char in displayedCharacters" :key="char.uuid"
                        class="char-grid-item bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-primary-400 hover:shadow-xl transition-[transform,shadow,border-color] duration-300 cursor-pointer group relative shadow-sm flex flex-col"
                        :class="{
                             'ring-4 ring-primary-500 ring-offset-2': currentCharacter && currentCharacter.uuid === char.uuid && !isBatchDeleteMode,
                             'ring-2 ring-red-500 border-red-500': isBatchDeleteMode && selectedCharacterIndices.has(char.originalIndex)
                         }"
                        @pointerdown="beginCharacterCardPress"
                        @pointerup="endCharacterCardPress"
                        @pointercancel="endCharacterCardPress"
                        @pointerleave="endCharacterCardPress"
                        @click="isBatchDeleteMode ? toggleCharacterSelection(char.originalIndex) : selectCharacter(char.originalIndex)">
                        <div class="aspect-w-2 aspect-h-3 relative h-[500px] overflow-hidden">
                            <img :src="char?.avatar"
                                class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                loading="lazy">
                            <div
                                class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity">
                            </div>

                            <!-- Status Tag Overlay -->
                            <div v-if="currentCharacter && currentCharacter.uuid === char.uuid && !isBatchDeleteMode"
                                class="absolute top-4 left-4 z-10">
                                <div
                                    class="flex items-center text-xs font-bold text-white bg-green-600/60 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/30 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.3)]">
                                    <span
                                        class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                                    当前使用
                                </div>
                            </div>

                            <!-- Quick Actions Overlay -->
                            <div class="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                v-if="!isBatchDeleteMode">
                                <button @click.stop="editCharacter(char.originalIndex)"
                                    class="p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-primary-600 rounded-full shadow-lg transition-all hover:scale-110"
                                    title="编辑角色">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                        </path>
                                    </svg>
                                </button>
                                <button @click.stop="openCharacterExportModal(char.originalIndex)"
                                    class="p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-primary-600 rounded-full shadow-lg transition-all hover:scale-110"
                                    title="导出角色">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                    </svg>
                                </button>
                                <button @click.stop="toggleCharacterFavorite(char.originalIndex)"
                                    class="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg transition-all hover:scale-110"
                                    :class="isCharacterFavorite(char) ? 'text-amber-500 hover:text-amber-600' : 'text-gray-700 hover:text-amber-500'"
                                    :title="isCharacterFavorite(char) ? '取消收藏' : '收藏角色'"
                                    :aria-label="isCharacterFavorite(char) ? '取消收藏' : '收藏角色'">
                                    <svg class="w-4 h-4" :fill="isCharacterFavorite(char) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-star"></use></svg>
                                </button>

                                <button @click.stop="deleteCharacter(char.originalIndex)"
                                    class="p-2 bg-white/90 backdrop-blur-sm text-red-500 hover:text-red-700 rounded-full shadow-lg transition-all hover:scale-110"
                                    title="删除角色">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                        </path>
                                    </svg>
                                </button>
                            </div>

                            <div class="absolute bottom-0 left-0 p-4 w-full">
                                <h3 class="text-xl font-bold text-white mb-1 truncate drop-shadow-lg">{{ char.name }}
                                </h3>
                                <div class="flex items-center gap-2">
                                    <span
                                        class="px-2 py-0.5 bg-white/20 backdrop-blur-md text-white text-[10px] rounded-md border border-white/10">
                                        {{ getCharacterWICount(char) }} 世界书
                                    </span>
                                    <span
                                        class="px-2 py-0.5 bg-white/20 backdrop-blur-md text-white text-[10px] rounded-md border border-white/10">
                                        {{ getCharacterRegexCount(char) }} 正则
                                    </span>
                                </div>
                            </div>

                            <!-- Batch Select Overlay -->
                            <div v-if="isBatchDeleteMode"
                                class="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity"
                                :class="selectedCharacterIndices.has(char.originalIndex) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
                                <div class="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-2xl transform transition-transform"
                                    :class="selectedCharacterIndices.has(char.originalIndex) ? 'scale-100' : 'scale-75'">
                                    <div class="w-12 h-12 rounded-full border-2 flex items-center justify-center"
                                        :class="selectedCharacterIndices.has(char.originalIndex) ? 'bg-red-500 border-red-500' : 'border-gray-300'">
                                        <svg v-if="selectedCharacterIndices.has(char.originalIndex)"
                                            class="w-8 h-8 text-white" fill="none" stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Load More Button -->
                <div v-if="characterDisplayLimit < filteredCharacters.length" class="mt-8 flex justify-center">
                    <button @click="loadMoreCharacters"
                        class="px-8 py-3 bg-white border border-gray-200 text-primary-600 font-bold rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 13l-7 7-7-7m14-8l-7 7-7-7"></path>
                        </svg>
                        加载更多角色 ({{ filteredCharacters.length - characterDisplayLimit }})
                    </button>
                </div>
            </div>

            <!-- Generator View -->
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
