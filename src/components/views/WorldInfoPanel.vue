<template>
            <div v-if="currentView === 'worldinfo'" class="management-view">
                <settings-page-header title="世界书" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                        </svg>
                    </template>
                    <button @click="openExportModal('worldinfo')" class="settings-icon-button" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importWorldInfo" class="hidden">
                    </label>
                    <button @click="createWorldInfo" class="settings-create-button" title="新建条目">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>
                <!-- Activation Settings -->
                <div
                    class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <button @click="showWorldInfoSettings = !showWorldInfoSettings"
                        :class="['w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all font-bold',
                                     showWorldInfoSettings ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50']">
                        <span class="flex items-center">
                            <div
                                :class="['p-1.5 rounded-lg mr-3 transition-colors', showWorldInfoSettings ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                    </path>
                                </svg>
                            </div>
                            全局世界信息/知识书激活设置
                        </span>
                        <svg :class="{'transform rotate-180': showWorldInfoSettings}"
                            class="w-5 h-5 transition-transform duration-300" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                            </path>
                        </svg>
                    </button>
                    <div v-show="showWorldInfoSettings" class="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 text-sm">
                            <!-- Scan Depth -->
                            <div>
                                <div class="flex justify-between items-center mb-1">
                                    <label class="font-medium text-gray-600">扫描深度</label>
                                    <span class="text-primary-600 font-mono bg-primary-50 px-2 py-0.5 rounded">{{
                                        worldInfoSettings.scanDepth }}</span>
                                </div>
                                <input type="range" v-model.number="worldInfoSettings.scanDepth" min="0" max="20"
                                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600">
                            </div>
                            <!-- Max Scan Depth -->
                            <div>
                                <div class="flex justify-between items-center mb-1">
                                    <label class="font-medium text-gray-600">最大扫描深度</label>
                                    <span class="text-primary-600 font-mono bg-primary-50 px-2 py-0.5 rounded">{{
                                        worldInfoSettings.maxDepth }}</span>
                                </div>
                                <input type="range" v-model.number="worldInfoSettings.maxDepth" min="0" max="50"
                                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600">
                            </div>
                            <!-- World Info Token Budget -->
                            <div>
                                <div class="flex justify-between items-center mb-1">
                                    <label class="font-medium text-gray-600">世界书 Token 预算</label>
                                    <span class="text-primary-600 font-mono bg-primary-50 px-2 py-0.5 rounded">{{
                                        settings.worldInfoTokenBudget > 0 ? settings.worldInfoTokenBudget + ' tok' : '不限'
                                        }}</span>
                                </div>
                                <input type="range" v-model.number="settings.worldInfoTokenBudget" min="0" max="16000" step="500"
                                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600">
                                <div class="text-[10px] text-gray-400 mt-1">超预算时按优先级裁剪（常驻优先，触发按 order），始终保底保留最高优先常驻与触发各一条；0 表示不限。与角色卡描述重复的条目自动去重。</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="worldinfo-list" class="space-y-4">
                    <div v-for="(entry, index) in worldInfo" :key="(entry.comment || '') + '_' + index"
                        class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex justify-between items-center">
                        <div class="flex-1 min-w-0 mr-4 flex items-center">
                            <div class="cursor-move text-gray-400 mr-3 hover:text-gray-600" title="拖动排序">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 8h16M4 16h16"></path>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center">
                                    <h3 class="font-bold text-gray-800 truncate">{{ entry.comment || '未命名条目' }}</h3>
                                    <span class="hidden md:inline-flex ml-2 text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0"
                                        :class="entry.scope === 'global' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'">
                                        {{ entry.scope === 'global' ? '全局' : '绑定' }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-4 flex-shrink-0">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" :checked="entry.enabled"
                                    @change="setWorldInfoEnabled(entry, $event.target.checked, $event)" class="settings-toggle-input sr-only">
                                <div class="settings-toggle"></div>
                            </label>
                            <div class="flex space-x-1 border-l border-gray-200 pl-4">
                                <button @click="editWorldInfo(index)"
                                    class="item-action-button item-action-button--edit"
                                    title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                                <button @click="deleteWorldInfo(index)"
                                    class="item-action-button item-action-button--delete"
                                    title="删除">
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

        <!-- Modals -->

        <!-- No Memory Needed Modal -->
        <div v-if="showNoMemoryNeededModal"
            class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-sm flex flex-col shadow-2xl transform transition-all scale-100 overflow-hidden">
                <div
                    class="bg-gradient-to-r from-primary-50 to-purple-50 p-6 flex flex-col items-center justify-center text-center border-b border-gray-100">
                    <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                        <svg class="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-bold text-gray-900 mb-1">无需补录</h3>
                    <p class="text-sm text-gray-500">当前没有遗漏的记忆分片</p>
                </div>
                <div class="bg-gray-50 p-4 flex justify-center border-t border-gray-100">
                    <button @click="showNoMemoryNeededModal = false"
                        class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all active:scale-95 w-full">
                        我知道了
                    </button>
                </div>
            </div>
        </div>

        <!-- Author Notice Modal (首次启动致谢) -->
        <div v-if="showAuthorNoticeModal"
            class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-md flex flex-col shadow-2xl transform transition-all scale-100 overflow-hidden relative">
                <div class="bg-gradient-to-r from-primary-50 to-purple-50 p-5 border-b border-gray-100">
                    <h3 class="text-xl font-bold text-gray-900">致谢与来源</h3>
                    <p class="text-xs text-gray-500 mt-1">本项目基于 STA1N 的开源项目二次开发</p>
                </div>
                <div class="p-5 space-y-3 text-sm text-gray-600">
                    <p>本项目最初由 <b>STA1N</b> 创作并开源（<span class="font-mono text-xs text-gray-500">github.com/STA1N156/RP-Hub</span>），遵循 <b>CC BY-NC 4.0</b> 许可协议。</p>
                    <p>由 <b>Litishs</b> 二次开发，封装为 Android 应用，并持续维护。</p>
                    <p class="text-xs text-gray-400">请保留署名、禁止商用；如需商业授权，请联系原作者 STA1N。</p>
                </div>
                <div class="p-4 flex justify-end border-t border-gray-100">
                    <button @click="closeAuthorNoticeModal"
                        class="px-8 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all active:scale-95">
                        知道了
                    </button>
                </div>
            </div>
        </div>

        <!-- User Setup Modal -->
        <div v-if="showUserSetupModal"
            class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-md flex flex-col shadow-2xl transform transition-all scale-100">
                <div class="p-6">
                    <div
                        class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 text-primary-600 mb-4 mx-auto">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900 mb-2 text-center">欢迎使用 RolePlay Hub</h3>
                    <p class="text-sm text-gray-500 mb-6 text-center">为了获得更好的沉浸式体验，请先进行个性化设置。</p>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">您的称呼 <span
                                    class="text-red-500">*</span></label>
                            <input ref="userSetupNameInput" v-model="tempUserSetup.name" type="text"
                                @input="syncUserSetupName" @change="syncUserSetupName"
                                @compositionend="syncUserSetupName"
                                class="w-full bg-gray-50/60 border border-gray-300 rounded-lg px-4 py-2 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all"
                                placeholder="角色对您的称呼">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">旁白叙事视角</label>
                            <div class="segmented-switch">
                                <div class="segmented-switch__indicator"
                                    :class="{ 'is-right': tempUserSetup.person === 'third' }"></div>
                                <button @click="tempUserSetup.person = 'second'"
                                    class="segmented-switch__option"
                                    :class="{ 'is-active': tempUserSetup.person === 'second' }">
                                    第二人称 (你)
                                </button>
                                <button @click="tempUserSetup.person = 'third'"
                                    class="segmented-switch__option"
                                    :class="{ 'is-active': tempUserSetup.person === 'third' }">
                                    第三人称 ({{ tempUserSetup.name || '您的称呼' }})
                                </button>
                            </div>
                            <p class="mt-1.5 text-[11px] text-gray-400 px-1"></p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">详细设定 (可选)</label>
                            <textarea v-model="tempUserSetup.description" rows="6"
                                class="w-full bg-gray-50/60 border border-gray-300 rounded-lg px-4 py-2 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all resize-y"
                                placeholder="例如：您的外貌、性格、人设等..."></textarea>
                        </div>

                    </div>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-xl">
                    <button @pointerdown="syncUserSetupName" @click="saveUserSetup" type="button"
                        class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        保存并开始
                    </button>
                </div>
            </div>
        </div>
        <!-- Confirmation Modal -->
        <div v-if="showConfirmModal"
            class="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-sm flex flex-col shadow-2xl transform transition-all scale-100">
                <div class="p-6 text-center">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                        <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">确认操作</h3>
                    <p class="text-sm text-gray-500 whitespace-pre-wrap" v-html="confirmMessage"></p>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-xl">
                    <button @click="handleConfirm" type="button"
                        class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                        确认
                    </button>
                    <button @click="handleCancel" type="button"
                        class="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                        取消
                    </button>
                </div>
            </div>
        </div>

        <!-- Chat Import Confirmation Modal -->
        <div v-if="showChatImportDialog"
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="fixed inset-0" @click="cancelChatImport"></div>
            <div class="compact-modal-panel">
                <div class="p-6">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">导入聊天记录</h3>
                    <p class="text-sm text-gray-600 mb-4">
                        将把 <span class="font-semibold text-gray-900">{{ chatImportDialog.validCount }}</span> 条聊天记录导入到角色
                        <span class="font-semibold text-gray-900">{{ chatImportDialog.characterName }}</span>。
                        <template v-if="chatImportDialog.totalCount > chatImportDialog.validCount">
                            其中 <span class="text-amber-600 font-semibold">{{ chatImportDialog.totalCount - chatImportDialog.validCount }}</span> 行因格式无效被跳过。
                        </template>
                    </p>
                    <div class="flex flex-col gap-2">
                        <button @click="confirmChatImportOverwrite" type="button"
                            class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm transition-colors">
                            覆盖现有聊天记录
                        </button>
                        <button @click="confirmChatImportAppend" type="button"
                            class="w-full inline-flex justify-center rounded-lg border border-primary-300 shadow-sm px-4 py-2 bg-primary-50 text-base font-medium text-primary-700 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm transition-colors">
                            追加到现有聊天记录
                        </button>
                        <button @click="cancelChatImport" type="button"
                            class="w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm transition-colors">
                            取消
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Import Preview / Conflict Summary Modal -->
        <div v-if="showImportPreview"
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="fixed inset-0" @click="cancelImportPreview"></div>
            <div class="compact-modal-panel">
                <div class="p-6">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">{{ importPreview.title }}</h3>
                    <p class="text-sm text-gray-600 mb-4">导入前预览（共 {{ importPreview.totalCount }} 条）：</p>
                    <div class="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm mb-4">
                        <div class="flex items-center justify-between px-4 py-2.5">
                            <span class="text-gray-600">将导入</span>
                            <span class="font-semibold text-primary-700">{{ importPreview.newCount }}</span>
                        </div>
                        <div class="flex items-center justify-between px-4 py-2.5">
                            <span class="text-gray-600">检测到重复（跳过）</span>
                            <span class="font-semibold text-amber-600">{{ importPreview.duplicateCount }}</span>
                        </div>
                        <div v-if="importPreview.invalidCount > 0" class="flex items-center justify-between px-4 py-2.5">
                            <span class="text-gray-600">格式无效（跳过）</span>
                            <span class="font-semibold text-red-600">{{ importPreview.invalidCount }}</span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button @click="confirmImportPreview" type="button"
                            class="flex-1 inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm transition-colors">
                            导入
                        </button>
                        <button @click="cancelImportPreview" type="button"
                            class="flex-1 inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm transition-colors">
                            取消
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Model Selector Modal -->
        <transition name="fade">
            <div v-if="showModelSelector"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div
                    class="bg-white rounded-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] h-[90vh] flex flex-col shadow-2xl transform transition-all scale-100">
                    <div class="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-gray-800">选择模型</h3>
                        <button @click="showModelSelector = false"
                            class="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="p-4 border-b border-gray-100 flex flex-col gap-3">
                        <input v-model="modelSearchQuery" type="text"
                            :placeholder="modelSelectionTarget === 'memoryEmbeddingModel' ? '已锁定：embedding' : '检索模型...'"
                            :readonly="modelSelectionTarget === 'memoryEmbeddingModel'"
                            :title="modelSelectionTarget === 'memoryEmbeddingModel' ? '模型选择已锁定' : ''"
                            :class="['w-full border rounded-lg px-4 py-2 focus:outline-none transition-all shadow-sm', modelSelectionTarget === 'memoryEmbeddingModel' ? 'bg-gray-100 border-gray-200 text-gray-400 placeholder-gray-400 cursor-not-allowed shadow-none select-none' : 'bg-gray-50/60 border-gray-300 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:shadow-md']">

                        <!-- Model Category Tags -->
                        <div class="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto custom-scrollbar items-center py-1">
                            <button v-for="tag in providerTags" :key="tag.id" @click="activeProviderTag = tag.id" :class="[
                                    'flex items-center px-3 py-1.5 text-xs font-bold rounded-full transition-all border outline-none active:scale-95 whitespace-nowrap',
                                    activeProviderTag === tag.id
                                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 shadow-sm'
                                ]">
                                <span class="leading-none">{{ tag.name }}</span>
                                <span class="ml-1.5 opacity-70 font-mono text-[11px] leading-none">{{ tag.count }}</span>
                            </button>
                        </div>
                        <div class="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto custom-scrollbar items-center py-1">
                            <button v-for="tag in modelTags" :key="tag.name" @click="activeModelTag = tag.name" :class="[
                                    'flex items-center px-3.5 py-1.5 text-xs font-bold rounded-full transition-all border outline-none active:scale-95 whitespace-nowrap',
                                    activeModelTag === tag.name
                                        ? 'bg-primary-50 text-primary-700 border-primary-300 shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 shadow-sm'
                                ]">
                                <span class="leading-none">{{ tag.name === 'all' ? '全部' : (tag.name === 'other' ? '其他' :
                                    tag.name.toUpperCase()) }}</span>
                                <span class="ml-1.5 opacity-60 font-mono text-[11px] leading-none">{{ tag.count
                                    }}</span>
                            </button>
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 min-h-[300px]">
                        <div v-if="filteredModels.length === 0"
                            class="flex flex-col items-center justify-center py-12 text-gray-400">
                            <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z">
                                </path>
                            </svg>
                            未找到模型或正在加载...
                        </div>
                        <div class="space-y-1">
                            <button v-for="model in filteredModels" :key="model._providerId + ':' + model.id" @click="selectModel(model.id, model._providerId)"
                                class="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-colors flex justify-between items-center group border border-transparent hover:border-gray-100 active:bg-gray-100">
                                <span class="min-w-0">
                                    <span
                                        class="block text-gray-700 font-mono font-medium group-hover:text-primary-600 transition-colors">{{
                                        model.id }}</span>
                                    <span class="block text-[10px] text-gray-400 mt-0.5">{{
                                        getProviderDisplayName(model._providerId) }}</span>
                                </span>
                                <span
                                    v-if="(modelSelectionTarget === 'memoryEmbeddingModel' ? memorySettings.embeddingModel : (modelSelectionTarget === 'memoryClassicModel' ? memorySettings.classicModel : settings[modelSelectionTarget])) === model.id"
                                    class="text-primary-600 bg-primary-50 p-1 rounded-full shadow-sm">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Character Editor Modal -->
        <!-- Add Character Selection Modal -->
        <div v-if="showAddCharacterMenu"
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="fixed inset-0" @click="showAddCharacterMenu = false"></div>
            <div class="compact-modal-panel">
                <div class="p-6">
                    <h3 class="text-xl font-bold text-gray-900 mb-6 flex items-center">
                        <svg class="w-6 h-6 mr-2 text-primary-600" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                            </path>
                        </svg>
                        添加角色卡
                    </h3>
                    <div class="grid grid-cols-1 gap-3">
                        <button @click="createNewCharacter(); showAddCharacterMenu = false"
                            class="choice-card group">
                            <div class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 4v16m8-8H4"></path>
                                </svg>
                            </div>
                            <div class="text-left">
                                <div class="font-bold">新建角色卡</div>
                                <div class="text-xs text-gray-500">从零开始创建一个新角色</div>
                            </div>
                        </button>

                        <label class="choice-card group">
                            <div class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                </svg>
                            </div>
                            <div class="text-left flex-1">
                                <div class="font-bold">导入角色卡</div>
                                <div class="text-xs text-gray-500">导入 .png 或 .json 文件</div>
                            </div>
                            <input type="file" accept=".png,.json"
                                @change="importCharacter($event); showAddCharacterMenu = false" class="hidden">
                        </label>

                        <label class="choice-card group">
                            <div class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z">
                                    </path>
                                </svg>
                            </div>
                            <div class="text-left flex-1">
                                <div class="font-bold">导入聊天记录</div>
                                <div class="text-xs text-gray-500">导入 .jsonl 格式的聊天数据</div>
                            </div>
                            <input type="file" accept=".jsonl"
                                @change="importCharacter($event); showAddCharacterMenu = false" class="hidden">
                        </label>
                    </div>

                    <button @click="showAddCharacterMenu = false"
                        class="mt-6 w-full py-3 text-red-500 font-medium hover:text-red-600 transition-colors">
                        取消
                    </button>
                </div>
            </div>
        </div>

        <!-- Character Editor Modal -->
        <div v-if="showCharacterEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
            <div
                class="bg-white md:rounded-2xl border-0 md:border border-gray-200 w-full max-w-2xl h-full md:h-[750px] flex flex-col shadow-2xl overflow-hidden">
                <div class="p-3 md:p-5 border-b border-gray-100 flex flex-col gap-4 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg md:text-xl font-bold text-gray-800 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                </path>
                            </svg>
                            {{ editingCharacter.id !== undefined ? '编辑角色' : '新建角色' }}
                        </h3>
                        <button @click="closeCharacterEditor"
                            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-full transition-all">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <!-- Tab Switcher -->
                    <div class="flex p-1 bg-gray-200/50 rounded-xl overflow-x-auto no-scrollbar gap-1">
                        <button @click="editorTab = 'basic'"
                            :class="['flex-1 px-4 py-2 text-sm font-bold transition-all rounded-lg whitespace-nowrap', editorTab === 'basic' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50']">
                            基础
                        </button>
                        <button @click="editorTab = 'description'"
                            :class="['flex-1 px-4 py-2 text-sm font-bold transition-all rounded-lg whitespace-nowrap', editorTab === 'description' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50']">
                            描述
                        </button>
                        <button @click="editorTab = 'personality'"
                            :class="['flex-1 px-4 py-2 text-sm font-bold transition-all rounded-lg whitespace-nowrap', editorTab === 'personality' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50']">
                            人设
                        </button>
                        <button @click="editorTab = 'first_mes'"
                            :class="['flex-1 px-4 py-2 text-sm font-bold transition-all rounded-lg whitespace-nowrap', editorTab === 'first_mes' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50']">
                            开场白
                        </button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-3 md:p-8 custom-scrollbar flex flex-col bg-gray-50/30">
                    <!-- Basic (Name & Avatar) -->
                    <div v-if="editorTab === 'basic'"
                        class="animate-fade-in flex-1 flex flex-col gap-4 md:gap-6 items-center justify-center min-h-0">
                        <div class="flex flex-col items-center flex-shrink min-h-0">
                            <div
                                class="w-auto h-[40vh] md:h-[45vh] aspect-[2/3] bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative group shadow-xl ring-4 ring-white">
                                <img :src="editingCharacter?.data?.avatar" class="w-full h-full object-cover">
                                <label
                                    class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[2px]">
                                    <svg class="w-8 h-8 text-white mb-2" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z">
                                        </path>
                                    </svg>
                                    <span class="text-white font-bold text-sm">更换图片</span>
                                    <input type="file" accept="image/*" @change="handleAvatarUpload" class="hidden">
                                </label>
                            </div>
                        </div>
                        <div class="w-full max-w-md space-y-2 flex-shrink-0">
                            <div class="text-center">
                                <label
                                    class="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">角色名称</label>
                                <input v-model="editingCharacter.data.name" type="text"
                                    class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-lg font-bold shadow-inner transition-all text-center"
                                    placeholder="输入角色名称...">
                            </div>
                        </div>
                    </div>
                    <!-- Description -->
                    <div v-if="editorTab === 'description'" class="animate-fade-in h-full flex flex-col">
                        <div class="flex justify-between items-center mb-2">
                            <label class="block text-sm font-bold text-gray-600">简短描述</label>
                            <span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{
                                (editingCharacter.data.description || '').length }} 字</span>
                        </div>
                        <textarea v-model="editingCharacter.data.description"
                            class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed"
                            placeholder="对角色的简短介绍..."></textarea>
                    </div>

                    <!-- Personality -->
                    <div v-if="editorTab === 'personality'" class="animate-fade-in h-full flex flex-col">
                        <div class="flex justify-between items-center mb-2">
                            <label class="block text-sm font-bold text-gray-600">具体人设</label>
                            <span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{
                                (editingCharacter.data.personality || '').length }} 字</span>
                        </div>
                        <textarea v-model="editingCharacter.data.personality"
                            class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed"
                            placeholder="详细的角色性格、外貌、喜好等设定..."></textarea>
                    </div>

                    <!-- First Message -->
                    <div v-if="editorTab === 'first_mes'" class="animate-fade-in h-full flex flex-col">
                        <div class="flex justify-between items-center mb-2">
                            <label class="block text-sm font-bold text-gray-600">开场白</label>
                            <span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{
                                (editingCharacter.data.first_mes || '').length }} 字</span>
                        </div>
                        <textarea v-model="editingCharacter.data.first_mes"
                            class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed"
                            placeholder="角色在对话开始时说的第一句话..."></textarea>
                    </div>
                </div>
                <div class="p-3 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="closeCharacterEditor"
                        class="px-6 py-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl transition-all font-bold text-sm shadow-sm active:scale-95">取消</button>
                    <button @click="saveCharacter"
                        class="px-8 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all font-bold text-sm shadow-md hover:shadow-lg active:scale-95 flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存角色
                    </button>
                </div>
            </div>
        </div>

        <!-- Preset Editor Modal -->
        <div v-if="showPresetEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-3 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                <!-- Header -->
                <div
                    class="editor-modal-header">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                </path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editingPreset.id !== undefined
                                ? '编辑预设' : '新建预设' }}</h3>
                            <p class="text-xs text-gray-500">{{ getPresetRoleLabel(editingPreset.data) }}</p>
                        </div>
                    </div>
                    <button @click="showPresetEditor = false"
                        class="modal-close-button">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Body -->
                <div class="flex-1 p-6 space-y-6 bg-gray-50/30 overflow-y-auto custom-scrollbar">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">预设名称</label>
                        <input v-model="editingPreset.data.name" type="text"
                            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm font-medium"
                            placeholder="例如：沉浸式叙事">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">注入位置</label>
                        <custom-select v-model="editingPreset.data.role" :options="presetRoleOptions"
                            button-class="font-medium">
                        </custom-select>
                    </div>
                    <div>
                        <label
                            class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex justify-between">
                            <span>{{ getPresetRoleLabel(editingPreset.data) }}内容</span>
                            <span
                                class="text-[10px] font-normal normal-case bg-gray-100 px-1.5 rounded text-gray-500">{{
                                (editingPreset.data.content || '').length }} 字符</span>
                        </label>
                        <textarea v-model="editingPreset.data.content" rows="12"
                            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[200px]"
                            placeholder="在此输入预设内容..."></textarea>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="showPresetEditor = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="savePreset"
                        class="modal-primary-button">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存预设
                    </button>
                </div>
            </div>
        </div>

        <!-- UI Template Editor Modal -->
        <div v-if="showUiTemplateEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-3 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-4xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                <div
                    class="editor-modal-header">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5">
                                </path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editingUiTemplate.id !== undefined
                                ? '编辑UI模板' : '新建UI模板' }}</h3>
                            <p class="text-xs text-gray-500">HTML状态栏 + 变量JSON</p>
                        </div>
                    </div>
                    <button @click="showUiTemplateEditor = false"
                        class="modal-close-button">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50/30 space-y-6">
                    <div class="segmented-switch segmented-switch--slim">
                        <div class="segmented-switch__indicator"
                            :class="{ 'is-right': editingUiTemplate.tab !== 'history' }"></div>
                        <button @click="editingUiTemplate.tab = 'history'"
                            class="segmented-switch__option"
                            :class="{ 'is-active': editingUiTemplate.tab === 'history' }">
                            <span>变更记录</span>
                        </button>
                        <button @click="editingUiTemplate.tab = 'edit'"
                            class="segmented-switch__option"
                            :class="{ 'is-active': editingUiTemplate.tab === 'edit' }">
                            <span>编辑内容</span>
                        </button>
                    </div>

                    <div v-if="editingUiTemplate.tab === 'history'" class="space-y-4">
                        <div class="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
                            <div>
                                <div class="text-base font-bold text-gray-800">变更记录</div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold text-primary-600">{{ (editingUiTemplate.data.changeLog || []).length }}</div>
                            </div>
                        </div>

                        <div v-if="!(editingUiTemplate.data.changeLog || []).length"
                            class="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
                            暂无变更记录
                        </div>

                        <div v-else class="space-y-3">
                            <div v-for="(log, logIndex) in (editingUiTemplate.data.changeLog || [])"
                                :key="log.id || logIndex"
                                class="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                                <div class="font-bold text-gray-800">第 {{ log.turn || '?' }} 轮</div>

                                <div v-if="log.reason" class="mt-3 rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                                    {{ log.reason }}
                                </div>

                                <div class="mt-3 space-y-3">
                                    <div v-for="(change, key) in (log.changes || {})" :key="key"
                                        class="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                                        <div class="text-xs font-bold text-gray-700 mb-2">{{ key }}</div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div class="bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 leading-relaxed">
                                                <span class="font-bold text-gray-400">前：</span><span class="whitespace-pre-wrap break-words">{{ formatUiTemplateChangeValue(change && change.from) }}</span>
                                            </div>
                                            <div class="bg-white border border-primary-100 rounded-lg px-3 py-2 text-xs text-gray-800 leading-relaxed">
                                                <span class="font-bold text-primary-500">后：</span><span class="whitespace-pre-wrap break-words">{{ formatUiTemplateChangeValue(change && change.to) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">模板名称</label>
                            <input v-model="editingUiTemplate.data.name" type="text"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                placeholder="例如：角色状态栏">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                            <custom-select v-model="editingUiTemplate.data.scope" :options="scopeOptions">
                            </custom-select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">插入位置</label>
                            <custom-select v-model="editingUiTemplate.data.placement" :options="uiTemplatePlacementOptions">
                            </custom-select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">排序</label>
                            <input v-model.number="editingUiTemplate.data.order" type="number"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                placeholder="100">
                        </div>
                    </div>

                    <details class="group bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        <summary
                            class="list-none cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                            <span class="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                HTML模板
                            </span>
                            <span class="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                                <span class="group-open:hidden">展开</span>
                                <span class="hidden group-open:inline">折叠</span>
                                <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </span>
                        </summary>
                        <textarea v-model="editingUiTemplate.data.htmlTemplate" rows="22"
                            class="w-full bg-white border-0 border-t border-gray-100 rounded-none px-4 py-3 text-gray-800 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:outline-none font-mono text-sm shadow-inner leading-relaxed resize-y min-h-[460px]"
                            placeholder="<section>...</section>"></textarea>
                    </details>
                    <div v-if="hasUiTemplateScripts(editingUiTemplate.data.htmlTemplate)"
                        class="bg-red-50/70 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 leading-relaxed">
                        该模板包含可执行脚本（&lt;script&gt;、内联事件属性或 iframe）。模板脚本在 Shadow DOM 中运行但不受沙箱隔离，仅在你信任其来源时保存使用。
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">变量JSON</label>
                            <textarea v-model="editingUiTemplate.data.variableStateText" rows="22"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[460px]"
                                placeholder='{"status":"平稳","equipment":[{"slot":"武器","name":"短剑","durability":80}]}'></textarea>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">变量说明（给AI参考，可选）</label>
                            <textarea v-model="editingUiTemplate.data.variableSchemaText" rows="22"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[460px]"
                                placeholder="例如：status 表示角色当前身体和情绪状态；location 表示当前场景地点；relationship 表示双方关系变化。"></textarea>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">原始状态预览</label>
                        <div class="ui-template-preview w-full bg-white p-0 overflow-visible min-h-[460px]">
                            <ui-template-frame :html="renderEditingUiTemplatePreview()"></ui-template-frame>
                        </div>
                    </div>
                    </div>
                </div>

                <div v-if="editingUiTemplate.tab === 'edit'"
                    class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="showUiTemplateEditor = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="saveUiTemplate"
                        class="modal-primary-button">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存模板
                    </button>
                </div>
            </div>
        </div>

        <!-- Regex Editor Modal -->
        <div v-if="showRegexEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-3 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-lg flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                <div
                    class="editor-modal-header">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editingRegex.id !== undefined
                                ? '编辑正则脚本' : '新建正则脚本' }}</h3>
                            <p class="text-xs text-gray-500">匹配与替换规则</p>
                        </div>
                    </div>
                    <button @click="showRegexEditor = false"
                        class="modal-close-button">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-gray-50/30">
                    <!-- Name -->
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">脚本名称</label>
                        <input v-model="editingRegex.data.name" type="text"
                            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                            placeholder="例如：去除多余空行">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                        <custom-select v-model="editingRegex.data.scope" :options="scopeOptions"
                            button-class="bg-white">
                        </custom-select>
                    </div>

                    <!-- Regex & Flags -->
                    <div class="grid grid-cols-4 gap-3">
                        <div class="col-span-3">
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">正则表达式</label>
                            <div class="relative">
                                <span
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">/</span>
                                <input v-model="editingRegex.data.regex" type="text"
                                    class="w-full bg-white border border-gray-200 rounded-xl pl-6 pr-4 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                    placeholder="pattern">
                                <span
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">/</span>
                            </div>
                        </div>
                        <div class="col-span-1">
                            <label
                                class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Flags</label>
                            <input v-model="editingRegex.data.flags" type="text"
                                class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm text-center"
                                placeholder="gim">
                        </div>
                    </div>

                    <!-- Replacement -->
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">替换内容</label>
                        <textarea v-model="editingRegex.data.replacement" rows="9"
                            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm resize-y min-h-[190px]"
                            placeholder="支持 $1, $2 等捕获组引用"></textarea>
                    </div>

                    <!-- Advanced Options Accordion -->
                    <details class="group border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                        <summary
                            class="flex items-center justify-between p-4 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors select-none">
                            <span class="text-sm font-bold text-gray-700 flex items-center">
                                <svg class="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                    </path>
                                </svg>
                                高级选项 (生效位置、深度、模式)
                            </span>
                            <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform duration-300"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </summary>
                        <div class="p-5 border-t border-gray-200 space-y-5 bg-gray-50/30">
                            <!-- Placement -->
                            <div>
                                <label
                                    class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">生效位置</label>
                                <div class="flex gap-3">
                                    <label v-for="(label, val) in {1: '用户消息', 2: 'AI消息'}" :key="val"
                                        :class="['flex-1 flex items-center space-x-2 cursor-pointer p-2 rounded-xl border transition-all select-none shadow-sm active:scale-95',
                                                   editingRegex.data.placement && editingRegex.data.placement.includes(Number(val)) ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-100 text-gray-600 hover:border-primary-200']">
                                        <input type="checkbox"
                                            :checked="editingRegex.data.placement && editingRegex.data.placement.includes(Number(val))"
                                            @change="togglePlacement(Number(val))" class="hidden">
                                        <div
                                            :class="['w-4 h-4 rounded flex items-center justify-center border transition-colors',
                                                     editingRegex.data.placement && editingRegex.data.placement.includes(Number(val)) ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300']">
                                            <svg v-if="editingRegex.data.placement && editingRegex.data.placement.includes(Number(val))"
                                                class="w-3 h-3 text-white" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="4"
                                                    d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        </div>
                                        <span class="text-xs font-bold">{{ label }}</span>
                                    </label>
                                </div>
                            </div>

                            <!-- Mode -->
                            <div class="grid grid-cols-2 gap-3">
                                <label v-for="(label, key) in {markdownOnly: '仅用户可见', promptOnly: '仅AI可见'}"
                                    :key="key"
                                    :class="['flex items-center space-x-2 cursor-pointer p-2 rounded-xl border transition-all select-none shadow-sm active:scale-95',
                                               editingRegex.data[key] ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-100 text-gray-600 hover:border-primary-200']">
                                    <input type="checkbox" v-model="editingRegex.data[key]"
                                        @change="$event.target.checked && (key === 'markdownOnly' ? (editingRegex.data.promptOnly = false) : (editingRegex.data.markdownOnly = false))"
                                        class="hidden">
                                    <div
                                        :class="['w-4 h-4 rounded flex items-center justify-center border transition-colors',
                                                 editingRegex.data[key] ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300']">
                                        <svg v-if="editingRegex.data[key]" class="w-3 h-3 text-white" fill="none"
                                            stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="4"
                                                d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </div>
                                    <span class="text-xs font-bold">{{ label }}</span>
                                </label>
                            </div>

                            <!-- Depth -->
                            <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200/50">
                                <div>
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">最小深度</label>
                                    <input type="number" v-model.number="editingRegex.data.minDepth"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                        placeholder="无限制">
                                </div>
                                <div>
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">最大深度</label>
                                    <input type="number" v-model.number="editingRegex.data.maxDepth"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                        placeholder="无限制">
                                </div>
                            </div>
                        </div>
                    </details>
                </div>

                <div
                    class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="showRegexEditor = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="saveRegex"
                        class="modal-primary-button">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存脚本
                    </button>
                </div>
            </div>
        </div>

        <!-- Active Tool Editor Modal -->
        <div v-if="showActiveToolEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-3xl flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
                <div
                    class="editor-modal-header">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z">
                                </path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 leading-tight">编辑工具</h3>
                            <p class="text-xs text-gray-500">{{ editingActiveTool.data.name || '未命名工具' }}</p>
                        </div>
                    </div>
                    <button @click="showActiveToolEditor = false"
                        class="modal-close-button">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-gray-50/30">
                    <div class="max-w-2xl mx-auto text-center">
                        <div
                            class="w-14 h-14 mx-auto rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm border border-primary-100">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z">
                                </path>
                            </svg>
                        </div>
                        <h3 class="mt-4 text-xl md:text-2xl font-bold text-gray-900 leading-tight">
                            {{ editingActiveTool.data.name || '未命名工具' }}
                        </h3>
                        <p class="mt-3 text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
                            {{ getActiveToolDisplayDescription(editingActiveTool.data) }}
                        </p>
                    </div>

                    <div class="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-5 md:p-6 shadow-sm">
                        <div class="flex items-center justify-between gap-4 mb-5">
                            <div>
                                <div class="text-sm font-bold text-gray-800">返回条数</div>
                                <div class="text-xs text-gray-500 mt-1">控制每次工具检索返回的内容条数</div>
                            </div>
                            <div class="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                {{ editingActiveTool.data.resultCount || 8 }} 条
                            </div>
                        </div>
                        <input v-model.number="editingActiveTool.data.resultCount" type="range"
                            :min="getActiveToolResultCountMin(editingActiveTool.data)"
                            :max="getActiveToolResultCountMax(editingActiveTool.data)" step="1"
                            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600">
                        <div class="mt-2 flex justify-between text-[11px] text-gray-400 font-medium">
                            <span>{{ getActiveToolResultCountMin(editingActiveTool.data) }} 条</span>
                            <span>{{ getActiveToolResultCountMax(editingActiveTool.data) }} 条</span>
                        </div>
                    </div>

                    <div v-if="isWebActiveTool(editingActiveTool.data)"
                        class="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tavily API Key</label>
                            <input v-model.trim="editingActiveTool.data.tavilyApiKey"
                                type="password"
                                class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all"
                                placeholder="tvly-...">
                        </div>
                    </div>
                </div>

                <div
                    class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="showActiveToolEditor = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="saveActiveTool"
                        class="modal-primary-button">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存工具
                    </button>
                </div>
            </div>
        </div>

        <!-- Auto Image Gen Inquiry Modal -->
        <div v-if="showAutoImageGenModal"
            class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-md flex flex-col shadow-2xl transform transition-all scale-100 overflow-hidden">
                <div class="bg-gradient-to-r from-primary-50 to-blue-50 p-6 border-b border-gray-100">
                    <div class="flex items-center gap-3">
                        <div
                            class="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z">
                                </path>
                            </svg>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900">自动生图</h3>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-gray-600 leading-relaxed text-center text-lg font-medium">是否为此角色卡开启 <span
                            class="font-bold text-primary-600">自动生图</span> 功能？</p>

                    <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                        <div class="flex items-start mb-3">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-yellow-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clip-rule="evenodd" />
                                </svg>
                            </div>
                            <h4 class="ml-2 text-sm font-bold text-yellow-800">注意事项</h4>
                        </div>
                        <ul class="list-disc list-outside ml-9 space-y-1.5 text-sm text-yellow-700">
                            <li>您可以在 “世界书 -> 自动生图” 手动管理此功能。</li>
                            <li>前往 “设置” 可以切换生图风格与比例。</li>
                        </ul>
                    </div>
                </div>
                <div class="bg-gray-50 p-4 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100">
                    <button @click="setAutoImageGen(false)"
                        class="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-200 transition-all active:scale-95">
                        暂不开启
                    </button>
                    <button @click="setAutoImageGen(true)"
                        class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                        立即开启
                    </button>
                </div>
            </div>
        </div>

        <!-- Export Selection Modal -->
        <div v-if="showExportModal"
            class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-lg flex flex-col shadow-2xl max-h-[80vh] overflow-hidden">
                <div
                    class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <h3 class="text-lg font-bold text-gray-800">选择导出项目</h3>
                    <button @click="showExportModal = false"
                        class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="p-2 border-b border-gray-100 flex justify-between items-center bg-white">
                    <button @click="selectAllExportItems"
                        class="px-3 py-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">全选</button>
                    <span class="text-xs text-gray-500">已选: {{ selectedExportIndices.size }}</span>
                    <button @click="deselectAllExportItems"
                        class="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消全选</button>
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    <div v-for="(item, index) in exportItems" :key="index" @click="toggleExportSelection(index)"
                        class="flex items-center p-4 rounded-lg border cursor-pointer transition-all select-none"
                        :class="selectedExportIndices.has(index) ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200 hover:border-primary-300'">
                        <div class="flex-shrink-0 mr-4">
                            <div
                                :class="['w-6 h-6 rounded border flex items-center justify-center transition-colors',
                                         selectedExportIndices.has(index) ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300']">
                                <svg v-if="selectedExportIndices.has(index)" class="w-4 h-4 text-white" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                        d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-gray-900 truncate text-base">{{ item.name || item.comment ||
                                '未命名' }}</div>
                        </div>
                    </div>
                </div>

                <div
                    class="p-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                    <button @click="showExportModal = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="confirmExport" :disabled="selectedExportIndices.size === 0"
                        class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-bold text-sm active:scale-95 flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                        </svg>
                        导出选中 ({{ selectedExportIndices.size }})
                    </button>
                </div>
            </div>
        </div>

        <!-- Character Export Selection Modal -->
        <div v-if="showCharacterExportModal"
            class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div class="fixed inset-0" @click="showCharacterExportModal = false"></div>
            <div class="compact-modal-panel">
                <div class="p-6">
                    <h3 class="text-xl font-bold text-gray-900 mb-6 flex items-center">
                        <svg class="w-6 h-6 mr-2 text-primary-600" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                        </svg>
                        导出选项
                    </h3>

                    <div class="grid grid-cols-1 gap-3">
                        <button @click="confirmCharacterExport('json')"
                            class="choice-card">
                            <div
                                class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <div class="font-bold text-base mb-0.5">导出为 JSON 文件</div>
                                <div class="text-[11px] text-gray-500">导出角色卡数据 .json</div>
                            </div>
                        </button>

                        <button @click="confirmCharacterExport('png')"
                            class="choice-card">
                            <div
                                class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <div class="font-bold text-base mb-0.5">导出为 PNG 文件</div>
                                <div class="text-[11px] text-gray-500">导出带头像图片的角色卡 .png</div>
                            </div>
                        </button>

                        <button @click="confirmCharacterExport('chat')"
                            class="choice-card">
                            <div
                                class="choice-card__icon">
                                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z">
                                    </path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <div class="font-bold text-base mb-0.5">导出聊天记录</div>
                                <div class="text-[11px] text-gray-500">单独导出当前角色的聊天记录 .jsonl</div>
                            </div>
                        </button>
                    </div>

                    <button @click="showCharacterExportModal = false"
                        class="mt-6 w-full py-3 text-red-500 font-medium hover:text-red-600 transition-colors">
                        取消
                    </button>
                </div>
            </div>
        </div>

        <!-- World Info Editor Modal -->
        <div v-if="showWorldInfoEditor"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-3 animate-fade-in">
            <div
                class="bg-white rounded-2xl border border-gray-200 w-full max-w-3xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                <!-- Header -->
                <div
                    class="editor-modal-header">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253">
                                </path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editingWorldInfo.id !==
                                undefined ? '编辑世界书' : '新建世界书' }}</h3>
                            <p class="text-xs text-gray-500">世界书条目</p>
                        </div>
                    </div>
                    <button @click="showWorldInfoEditor = false"
                        class="modal-close-button">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Body -->
                <div class="flex-1 p-6 space-y-6 bg-gray-50/30 overflow-y-auto custom-scrollbar">

                    <!-- 1. 基础信息 & 触发条件 -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Left: Basic -->
                        <div class="space-y-4">
                            <div>
                                <label
                                    class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">名称/备注
                                    (Comment)</label>
                                <input v-model="editingWorldInfo.data.comment" type="text"
                                    class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm font-medium"
                                    placeholder="例如：主城描述">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                                <custom-select v-model="editingWorldInfo.data.scope" :options="scopeOptions">
                                </custom-select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">主关键词
                                    (Keys)</label>
                                <div class="relative">
                                    <input
                                        :value="worldInfoKeysText"
                                        @input="updateEditingWorldInfoKeys($event.target.value)"
                                        type="text"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm"
                                        placeholder="逗号分隔，留空则需勾选'常驻'">
                                </div>
                                <div v-if="editingWorldInfo.data.keys && editingWorldInfo.data.keys.length"
                                    class="mt-2 flex flex-wrap gap-1.5">
                                    <span v-for="(key, keyIndex) in editingWorldInfo.data.keys"
                                        :key="'wi-key-' + keyIndex + '-' + key"
                                        :title="key"
                                        class="inline-flex items-center max-w-full rounded-xl border border-primary-100 bg-primary-50 px-2.5 py-1.5 text-xs font-bold text-primary-700 shadow-sm">
                                        <span :class="editingWorldInfo.data.useRegex ? 'break-all whitespace-normal leading-relaxed' : 'truncate'">{{ key }}</span>
                                    </span>
                                </div>
                            </div>
                            <!-- Match Strategy Tags -->
                            <div class="flex flex-wrap gap-2">
                                <label
                                    :class="['flex-1 flex items-center justify-center space-x-1.5 cursor-pointer px-3 py-1.5 border rounded-xl transition-all select-none shadow-sm active:scale-95',
                                               editingWorldInfo.data.useRegex ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300']">
                                    <input type="checkbox" v-model="editingWorldInfo.data.useRegex"
                                        @change="updateEditingWorldInfoKeys(worldInfoKeysText)" class="hidden">
                                    <svg v-if="editingWorldInfo.data.useRegex" class="w-3.5 h-3.5" fill="none"
                                        stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                            d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    <span class="text-xs font-bold">正则匹配</span>
                                </label>
                                <label
                                    :class="['flex-1 flex items-center justify-center space-x-1.5 cursor-pointer px-3 py-1.5 border rounded-xl transition-all select-none shadow-sm active:scale-95',
                                               editingWorldInfo.data.constant ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300']"
                                    title="常驻条目无需关键词触发，启用后始终插入">
                                    <input type="checkbox" v-model="editingWorldInfo.data.constant"
                                        class="hidden">
                                    <svg v-if="editingWorldInfo.data.constant" class="w-3.5 h-3.5" fill="none"
                                        stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                            d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    <span class="text-xs font-bold">始终常驻</span>
                                </label>
                            </div>
                        </div>

                        <!-- Right: Position & Probability -->
                        <div
                            class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                            <div class="space-y-4">
                                <div>
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">插入位置</label>
                                    <custom-select v-model="editingWorldInfo.data.position" :options="worldInfoPositionOptions"
                                        button-class="bg-white text-sm focus:ring-4 focus:ring-primary-500/10"
                                        menu-class="text-sm">
                                    </custom-select>
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs text-gray-500 mb-1">顺序</label>
                                        <input type="number" v-model.number="editingWorldInfo.data.order"
                                            class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                            placeholder="100">
                                    </div>
                                    <div>
                                        <label
                                            class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">触发概率
                                            (%)</label>
                                        <div
                                            :class="['flex items-center border rounded-xl transition-all overflow-hidden shadow-sm',
                                                     editingWorldInfo.data.useProbability ? 'border-primary-300 ring-2 ring-primary-500/10' : 'border-gray-200 opacity-60']">
                                            <button
                                                @click="editingWorldInfo.data.useProbability = !editingWorldInfo.data.useProbability"
                                                :class="['px-3 py-2 transition-colors border-r',
                                                             editingWorldInfo.data.useProbability ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-100 text-gray-400 border-gray-200']">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                                </svg>
                                            </button>
                                            <input type="number" v-model.number="editingWorldInfo.data.probability"
                                                min="0" max="100"
                                                class="w-full bg-white px-3 py-1.5 text-sm font-bold text-gray-700 focus:outline-none"
                                                :disabled="!editingWorldInfo.data.useProbability" placeholder="100">
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label
                                        class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">自定义扫描深度</label>
                                    <input type="number" v-model.number="editingWorldInfo.data.scanDepth"
                                        class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                        placeholder="默认">
                                </div>
                                <div v-if="editingWorldInfo.data.position === 'at_depth'"
                                    class="pt-2 border-t border-gray-100">
                                    <label class="block text-xs text-gray-500 mb-1">插入深度 <span
                                            class="text-[10px] text-gray-400">@D</span></label>
                                    <input type="number" v-model.number="editingWorldInfo.data.depth"
                                        class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                        placeholder="4">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Content (Central Area) -->
                    <div>
                        <label
                            class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex justify-between">
                            <span>内容</span>
                            <span
                                class="text-[10px] font-normal normal-case bg-gray-100 px-1.5 rounded text-gray-500">{{
                                (editingWorldInfo.data.content || '').length }} 字符</span>
                        </label>
                        <textarea v-model="editingWorldInfo.data.content" rows="12"
                            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[260px]"
                            placeholder="在此输入世界书条目的具体内容..."></textarea>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0 wi-footer">
                    <button @click="showWorldInfoEditor = false"
                            class="modal-secondary-button">取消</button>
                    <button @click="saveWorldInfo"
                        class="modal-primary-button">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                            </path>
                        </svg>
                        保存条目
                    </button>
                </div>
            </div>
        </div>

        <!-- Context Viewer Modal -->
        <transition enter-active-class="transition-opacity duration-300 ease-modal-fade" enter-from-class="opacity-0"
            enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200 ease-in"
            leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="showContextViewerModal"
                class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 sm:p-6"
                @click.self="showContextViewerModal = false">
                <div
                    class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh] sm:max-h-[85vh] border border-gray-200/50 relative">

                    <!-- Header -->
                    <div
                        class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                        <div class="flex items-center space-x-3">
                            <div class="text-blue-600">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                    </path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 pr-10">真实上下文请求</h3>
                                <p class="mt-0.5 text-xs font-medium text-gray-500">
                                    共 {{ chatRoundStats.floors }} 楼 · 总字数 {{ Number(lastContextTotalLength || 0).toLocaleString() }}
                                </p>
                            </div>
                        </div>
                        <button @click="showContextViewerModal = false"
                            class="text-gray-400 hover:text-red-500 transition-colors bg-gray-100 hover:bg-red-50 p-2 rounded-full absolute top-4 right-4 z-50">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>

                    <!-- Content (Scrollable) -->
                    <div
                        class="p-5 overflow-y-auto flex-1 space-y-3 bg-gray-50 custom-scrollbar overscroll-contain relative">

                        <!-- World Info Summary (Now scrolls with content) -->
                        <details class="group bg-blue-50/80 border border-blue-200/60 rounded-xl shadow-sm mb-4">
                            <summary
                                class="font-bold text-blue-800 flex items-center p-4 text-sm cursor-pointer select-none outline-none">
                                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253">
                                    </path>
                                </svg>
                                <span>本次插入的世界书 (共 {{ lastTriggeredWorldInfos.length }} 项)</span>
                                <div class="ml-auto flex items-center">
                                    <svg class="w-4 h-4 text-blue-500 group-open:rotate-180 transition-transform duration-300"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </div>
                            </summary>
                            <div class="px-4 pb-4 pt-0">
                                <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                    <div v-for="(wi, idx) in lastTriggeredWorldInfos" :key="'wi-'+idx"
                                        class="bg-blue-100 text-blue-700 border-blue-200 px-2.5 py-1.5 rounded-md text-xs shadow-sm border flex flex-col justify-center">
                                        <span class="font-bold pb-0.5">{{ wi.name }}</span>
                                        <span v-if="wi.triggers"
                                            class="text-blue-600/90 border-blue-200/50 font-normal text-[10px] mt-0.5 pt-0.5 border-t leading-none">{{
                                            wi.triggers === '常驻' ? '常驻' : wi.name && wi.name.startsWith('角色记忆') ? wi.triggers : '触发: ' +
                                            wi.triggers }}</span>
                                    </div>
                                    <span v-if="lastTriggeredWorldInfos.length === 0"
                                        class="text-blue-500/80 text-sm italic">未触发任何世界书或世界书功能关闭。</span>
                                </div>
                            </div>
                        </details>

                        <!-- Messages List -->
                        <div class="space-y-3 pb-4">
                            <div v-for="(msg, index) in lastContextMessages" :key="index"
                                class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md group/msg">
                                <details class="group">
                                    <summary
                                        class="flex flex-col p-3.5 bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer select-none transition-colors gap-2">
                                        <div class="flex flex-row justify-between items-center w-full">
                                            <div class="flex items-center gap-2">
                                                <span :class="{
                                                        'bg-green-100 text-green-700 border border-green-200 shadow-sm': msg.isMemory,
                                                        'bg-red-100 text-red-700 border border-red-200 shadow-sm': msg.role === 'system' && !msg.isMemory,
                                                        'bg-green-100 text-green-700 border border-green-200 shadow-sm': msg.role === 'user',
                                                        'bg-purple-100 text-purple-700 border border-purple-200 shadow-sm': msg.role === 'assistant'
                                                    }"
                                                    class="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider flex items-center justify-center min-w-[70px] whitespace-nowrap">
                                                    <span v-if="msg.floor" class="opacity-70 mr-1 font-bold">F{{ msg.floor }}</span> {{
                                                    msg.isMemory ? '记忆' : msg.role }}
                                                </span>
                                                <span
                                                    class="font-bold bg-white border border-gray-200 shadow-sm text-gray-500 px-2.5 rounded-full py-0.5 text-[11px]">{{
                                                    msg.content.length }} 字符</span>
                                            </div>

                                            <div class="flex items-center flex-shrink-0 ml-2">
                                                <svg class="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform duration-300"
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>

                                        <!-- Triggers inside Messages (Always show names, both mobile and desktop) -->
                                        <div v-if="msg.wiTriggers && msg.wiTriggers.length > 0"
                                            class="flex flex-wrap gap-1.5 items-center w-full">
                                            <div v-for="(trigger, tIdx) in msg.wiTriggers" :key="tIdx"
                                                class="bg-blue-100 text-blue-700 border-blue-200 px-2 py-0.5 rounded flex flex-col border">
                                                <span class="text-[11px] font-semibold tracking-wide">{{ trigger.name
                                                    }}</span>
                                                <span v-if="trigger.triggers"
                                                    class="text-blue-600/90 border-blue-200/50 text-[9px] font-normal mt-[1px] pt-[1px] border-t leading-[10px]">{{
                                                    trigger.triggers === '常驻' ? '常驻' : trigger.name && trigger.name.startsWith('角色记忆') ?
                                                    trigger.triggers : '触发: ' + trigger.triggers }}</span>
                                            </div>
                                        </div>
                                    </summary>

                                    <div class="p-4 bg-white border-t border-gray-100 text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar decoration-clone selection:bg-blue-200 selection:text-blue-900 break-words"
                                        v-html="msg.renderedContent">
                                    </div>
                                </details>
                            </div>

                            <div v-if="lastContextMessages.length === 0"
                                class="flex flex-col items-center justify-center py-12 text-gray-400">
                                <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                    </path>
                                </svg>
                                <p>暂无上下文记录，请先执行一次生成请求。</p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </transition>

        <!-- Story Branch Modal -->
        <transition enter-active-class="transition-opacity duration-300 ease-out" enter-from-class="opacity-0"
            enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200 ease-in"
            leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="showStoryBranchModal"
                class="fixed inset-0 z-[120] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 sm:p-6"
                @click.self="showStoryBranchModal = false">
                <div
                    class="w-full max-w-6xl h-[92vh] sm:h-[88vh] bg-white rounded-2xl shadow-2xl border border-gray-200/70 overflow-hidden flex flex-col">
                    <div class="px-5 sm:px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between flex-shrink-0">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2.5">
                                <div class="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <use href="#icon-story-branch"></use>
                                    </svg>
                                </div>
                                <div class="min-w-0">
                                    <h3 class="text-lg font-bold text-gray-800">剧情分支</h3>
                                    <p class="text-xs text-gray-500 mt-0.5 truncate">
                                        当前分支：{{ currentStoryBranch?.name || '主线' }}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button @click="showStoryBranchModal = false"
                            class="w-9 h-9 rounded-full bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>

                    <div class="story-route-modal-body custom-scrollbar">
                        <section class="story-route-map-panel">
                            <div class="story-route-map-scroll custom-scrollbar"
                                :class="{ 'is-single-route': storyBranches.length === 1, 'is-dragging': storyRouteMapDragging }"
                                @pointerdown="startStoryRouteDrag" @pointermove="moveStoryRouteDrag"
                                @pointerup="endStoryRouteDrag" @pointercancel="endStoryRouteDrag"
                                @lostpointercapture="endStoryRouteDrag" @dragstart.prevent>
                                <div class="story-route-canvas"
                                    :style="{ width: storyRouteMap.width + 'px', height: storyRouteMap.height + 'px' }">
                                    <svg class="story-route-links" :width="storyRouteMap.width"
                                        :height="storyRouteMap.height"
                                        :viewBox="'0 0 ' + storyRouteMap.width + ' ' + storyRouteMap.height"
                                        aria-hidden="true">
                                        <path v-for="link in storyRouteMap.links" :key="link.id" :d="link.path"
                                            class="story-route-link"
                                            :class="{ 'is-active': link.isActive, 'is-selected': link.isSelected }">
                                        </path>
                                    </svg>
                                    <button v-for="node in storyRouteMap.nodes" :key="node.id"
                                        @click="handleStoryRouteNodeClick(node.id)"
                                        class="story-route-node"
                                        :class="{ 'is-current': node.isActive, 'is-selected': node.isSelected, 'is-on-route': node.isOnActiveRoute, 'is-on-selected-route': node.isOnSelectedRoute }"
                                        :style="{ left: node.x + 'px', top: node.y + 'px' }"
                                        :title="'选择分支：' + node.name">
                                        <span class="story-route-node-checkpoint" aria-hidden="true"></span>
                                        <span class="story-route-node-copy">
                                            <span v-if="node.id === 'main'" class="story-route-node-type">起点</span>
                                            <strong>{{ node.name }}</strong>
                                            <small>{{ node.floorCount }} 楼 · {{ node.wordCountText }} 字</small>
                                        </span>
                                        <span v-if="node.isActive" class="story-route-node-current">当前</span>
                                    </button>
                                </div>
                            </div>
                        </section>

                        <div class="story-route-actions">
                            <button
                                @click="switchStoryBranch(selectedStoryRouteNode.id)"
                                :disabled="storyBranchSwitching || !selectedStoryRouteNode || selectedStoryRouteNode.isActive"
                                class="story-route-enter-button"
                                :title="selectedStoryRouteNode?.isActive ? '已在当前分支' : '进入当前选中的分支'">
                                {{ storyBranchSwitching ? '切换中' : '进入' }}
                            </button>
                            <button @click="openStoryBranchNameEditor"
                                :disabled="storyBranchSwitching || !selectedStoryRouteNode || selectedStoryRouteNode.id === 'main'"
                                class="story-route-edit-button"
                                :title="!selectedStoryRouteNode ? '请先选择分支' : selectedStoryRouteNode.id === 'main' ? '主线名称不可修改' : '编辑当前选中的分支名称'">
                                编辑
                            </button>
                            <button @click="deleteSelectedStoryBranch"
                                :disabled="storyBranchSwitching || !selectedStoryRouteCanDelete"
                                :title="selectedStoryRouteCanDelete ? '删除当前选中的分支' : '请选择可删除的分支（主线不可删除）'"
                                class="story-route-delete-button">
                                删除
                            </button>
                        </div>

                    </div>
                </div>
            </div>

        </transition>

        <!-- Story Branch Name Editor -->
        <transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
            enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150"
            leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="showStoryBranchNameEditor"
                class="fixed inset-0 z-[180] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
                @click.self="showStoryBranchNameEditor = false">
                <div class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
                    <h3 class="text-lg font-bold text-gray-800">编辑分支名称</h3>
                    <p class="mt-1 text-sm text-gray-500">名称最多 30 个字。</p>
                    <input v-model="storyBranchNameDraft" maxlength="30" autofocus
                        @keyup.enter="saveStoryBranchName" @keyup.esc="showStoryBranchNameEditor = false"
                        class="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        placeholder="输入分支名称">
                    <div class="mt-5 flex justify-end gap-2">
                        <button @click="showStoryBranchNameEditor = false"
                            class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50">
                            取消
                        </button>
                        <button @click="saveStoryBranchName" :disabled="storyBranchSwitching"
                            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </transition>

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
