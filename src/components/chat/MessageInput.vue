<template>
                <!-- Input Area (Floating Island) -->
                <div v-show="!isExternalInputFocused"
                    class="absolute bottom-0 left-0 right-0 w-full p-2 md:p-3 z-30 pointer-events-none flex justify-center flex-shrink-0 transition-all duration-300 input-area-mobile">
                    <div
                        class="w-full max-w-lg pointer-events-auto p-2.5 md:p-3 bg-white/90 backdrop-blur-xl border border-white/40 shadow-lg rounded-3xl ring-1 ring-black/5 transition-all duration-300 flex flex-col input-island">
                        <div class="relative w-full flex justify-between items-center mb-2 px-1">
                            <!-- Left controls: AutoImage -->
                            <div class="flex items-center gap-2">
                                <!-- Auto Image Button -->
                                <button @click="toggleAutoImageGen" :disabled="imageGenUnavailable"
                                    :class="[isAutoImageGenEnabled ? 'bg-primary-500 text-white shadow-primary-500/30 border-primary-500' : 'bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-gray-200 shadow-sm']"
                                    class="rounded-full w-8 h-8 flex items-center justify-center border transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                    :title="imageGenUnavailable ? '生图服务暂不可用' : '自动生图开关'">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z">
                                        </path>
                                    </svg>
                                </button>
                                <!-- Instruction Button -->
                                <div class="relative instruction-panel-container">
                                    <button @click="showInstructionPanel = !showInstructionPanel"
                                        :class="[sysInstruction.trim() ? 'bg-primary-500 text-white shadow-primary-500/30 border-primary-500' : 'bg-white text-gray-500 hover:text-primary-600 hover:bg-gray-50 border-gray-200 shadow-sm']"
                                        class="rounded-full w-8 h-8 flex items-center justify-center border transition-all active:scale-95"
                                        title="单次系统指令">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                                            </path>
                                        </svg>
                                    </button>
                                    <!-- Instruction Panel Popover -->
                                    <transition enter-active-class="transition-all duration-150 ease-out"
                                        enter-from-class="opacity-0 translate-y-2 scale-95"
                                        enter-to-class="opacity-100 translate-y-0 scale-100"
                                        leave-active-class="transition-all duration-100 ease-in"
                                        leave-from-class="opacity-100 translate-y-0 scale-100"
                                        leave-to-class="opacity-0 translate-y-2 scale-95">
                                        <div v-if="showInstructionPanel"
                                            class="absolute bottom-full left-0 mb-4 z-50 pointer-events-auto w-[250px] md:w-[320px] transform-gpu origin-bottom-left">
                                            <div
                                                class="bg-white/95 backdrop-blur-xl border border-gray-200 shadow-xl rounded-2xl p-3 flex flex-col gap-2 ring-1 ring-black/5">
                                                <div class="flex justify-between items-center mb-1 px-1">
                                                    <span class="text-xs font-bold text-gray-600 flex items-center">
                                                        <svg class="w-3.5 h-3.5 mr-1 text-primary-500" fill="none"
                                                            stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                                                            </path>
                                                        </svg>
                                                        临时指令
                                                    </span>
                                                    <button @click="showInstructionPanel = false"
                                                        class="text-gray-400 hover:text-red-500 transition-colors bg-gray-100 hover:bg-red-50 p-1 rounded-full">
                                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                                            viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                                <textarea v-model="sysInstruction"
                                                    class="w-full h-20 p-2.5 text-sm text-gray-700 bg-gray-50/30 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:bg-white transition-all shadow-inner resize-none custom-scrollbar"
                                                    placeholder="输入您想让AI遵守的临时规范指令... (随下次发送附带)"></textarea>
                                            </div>
                                        </div>
                                    </transition>
                                </div>
                                <!-- Context Viewer Button -->
                                <button @click="showContextViewerModal = true"
                                    class="rounded-full w-8 h-8 flex items-center justify-center border transition-all active:scale-95 bg-white text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shadow-sm"
                                    title="查看真实上下文请求">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                        </path>
                                    </svg>
                                </button>
                                <!-- Story Branch Button -->
                                <button @click="openStoryBranchModal"
                                    class="relative rounded-full w-8 h-8 flex items-center justify-center border transition-all active:scale-95 bg-white text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shadow-sm"
                                    :title="'剧情分支：' + (currentStoryBranch?.name || '主线')">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <use href="#icon-story-branch"></use>
                                    </svg>
                                </button>
                            </div>

                        </div>
                        <div class="relative w-full flex items-end gap-2 px-1">
                            <textarea role="textbox" aria-multiline="true"
                                @input="handleChatInput" @compositionstart="handleChatCompositionStart"
                                @compositionend="handleChatCompositionEnd" @focus="handleChatInputFocus"
                                @blur="handleChatInputBlur" @keydown="handleChatInputKeydown"
                                @paste="handleChatInputPaste" placeholder="输入消息..."
                                class="chat-input-box flex-1 bg-gray-100/70 text-gray-800 rounded-xl px-4 py-1.5 md:px-4 md:py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 border border-transparent shadow-sm transition-all duration-150 focus:bg-white chat-input-scrollbar resize-none overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-[1.4] min-h-[32px] md:min-h-[34px] max-h-[56px] md:max-h-[64px]"
                                ref="inputBox"></textarea>

                            <!-- Send/Stop Button -->
                            <div class="flex-shrink-0 flex items-center gap-1">
                                <button v-if="!isConversationBusy" @pointerdown="prepareChatInputSend" @click="sendMessage"
                                    class="p-2 md:p-2.5 bg-primary-600 text-white rounded-2xl md:hover:bg-primary-700 md:hover:shadow-lg md:hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all shadow-md flex items-center justify-center w-[44px] h-[44px] md:w-[46px] md:h-[46px]"
                                    title="发送">
                                    <svg class="w-5 h-5 transform rotate-90" fill="none"
                                        stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                    </svg>
                                </button>
                                <button v-else @click="stopGeneration"
                                    class="p-2 md:p-2.5 bg-red-500 text-white rounded-2xl md:hover:bg-red-600 md:hover:shadow-lg md:hover:-translate-y-0.5 active:scale-95 transition-all shadow-md flex items-center justify-center w-[44px] h-[44px] md:w-[46px] md:h-[46px]"
                                    title="中止生成">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
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
