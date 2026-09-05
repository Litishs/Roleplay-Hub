<template>
    <!-- Model Selector Modal (moved from WorldInfoPanel.vue: must be reachable from Settings/Memory/UiTemplate panels) -->
    <transition name="fade">
        <div v-if="showModelSelector"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div
                class="bg-white rounded-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] h-[90vh] flex flex-col shadow-2xl transform transition-all scale-100">
                <div class="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-gray-800">{{ isSlotMode ? '聊天模型' : '选择模型' }}</h3>
                    <button @click="closeModelSelector"
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
                <!-- 槽位 tab 栏（仅 quickModels 模式） -->
                <div v-if="isSlotMode" class="flex gap-2 p-4 border-b border-gray-100">
                    <button v-for="(_, idx) in draftSlotModels" :key="idx"
                        type="button" @click="activeSlot = idx"
                        :class="[
                            'flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            activeSlot === idx
                                ? 'border-primary-300 bg-primary-50 text-primary-700 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                        ]">
                        <span class="block text-xs font-bold mb-1">槽位 {{ idx + 1 }}</span>
                        <span class="block truncate text-[11px] font-mono"
                              :title="draftSlotModels[idx]">{{ draftSlotModels[idx] || '未选择' }}</span>
                    </button>
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
                        <button v-for="model in filteredModels" :key="model._providerId + ':' + model.id"
                            @click="isSlotMode ? chooseSlotModel(model.id) : selectModel(model.id, model._providerId)"
                            class="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-colors flex justify-between items-center group border border-transparent hover:border-gray-100 active:bg-gray-100">
                            <span class="min-w-0">
                                <span
                                    class="block text-gray-700 font-mono font-medium group-hover:text-primary-600 transition-colors">{{
                                    model.id }}</span>
                                <span class="block text-[10px] text-gray-400 mt-0.5">{{
                                    getProviderDisplayName(model._providerId) }}</span>
                            </span>
                            <span
                                v-if="isSlotMode
                                    ? isSlotSelected(model.id)
                                    : (modelSelectionTarget === 'memoryEmbeddingModel' ? memorySettings.embeddingModel : (modelSelectionTarget === 'memoryClassicModel' ? memorySettings.classicModel : settings[modelSelectionTarget])) === model.id"
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
</template>

<script>
import { inject, computed, ref, watch } from "vue";
export default {
  setup() {
    const ctx = inject("appContext") || {};

    // --- quickModels 双模式支持 ---
    // 模型选择器同时支持：单模型模式（默认，target !== 'quickModels'）
    // 槽位批量模式（target === 'quickModels'，顶部 tab 栏 + 批量分配）
    const isSlotMode = computed(() => ctx.modelSelectionTarget && ctx.modelSelectionTarget.value === 'quickModels');
    const activeSlot = ref(0);
    const draftSlotModels = ref(['', '', '']);

    // 弹窗打开时初始化槽位草稿
    watch(ctx.showModelSelector, (visible) => {
      if (visible && isSlotMode.value) {
        draftSlotModels.value = [
          (ctx.settings && ctx.settings.qualityModel) || '',
          (ctx.settings && ctx.settings.balancedModel) || '',
          (ctx.settings && ctx.settings.fastModel) || ''
        ];
        activeSlot.value = 0;
      }
    });

    const chooseSlotModel = (modelId) => {
      const idx = activeSlot.value;
      draftSlotModels.value = [...draftSlotModels.value];
      draftSlotModels.value[idx] = draftSlotModels.value[idx] === modelId ? '' : modelId;
    };

    const closeModelSelector = () => {
      if (isSlotMode.value) {
        ctx.selectQuickModels?.([...draftSlotModels.value]);
      }
      if (ctx.showModelSelector) ctx.showModelSelector.value = false;
    };

    // 槽位模式下的 ✓ 判定：当前激活 tab 绑定的模型 === 被点击模型
    const isSlotSelected = (modelId) =>
      isSlotMode.value && draftSlotModels.value[activeSlot.value] === modelId;

    return {
      ...ctx,
      isSlotMode,
      activeSlot,
      draftSlotModels,
      chooseSlotModel,
      closeModelSelector,
      isSlotSelected,
    };
  }
};
</script>
