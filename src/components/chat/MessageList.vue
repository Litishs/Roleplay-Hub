<template>
                <!-- Chat Messages -->
                <div ref="chatContainer" @click="showChatModelSelector = false"
                    @scroll="handleChatScroll"
                    class="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-14 md:pt-16 pb-44 md:pb-60 relative z-0 space-y-14 md:space-y-16 transition-all duration-500"
                    :class="!settings.useCharacterBackground || !currentCharacter || !currentCharacter?.avatar ? 'bg-gray-50' : ''">
                    <div v-if="summaryProgress" class="mx-auto max-w-2xl px-2 -mt-8 md:-mt-10">
                        <div :class="['flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold shadow-sm border',
                            summaryProgress.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : summaryProgress.status === 'running' ? 'bg-white border-primary-100 text-primary-700'
                            : 'bg-white border-emerald-100 text-emerald-700']">
                            <span v-if="summaryProgress.status === 'running'"
                                class="inline-block w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></span>
                            <span class="truncate">
                                <template v-if="summaryProgress.status === 'running'">正在总结 第 {{ summaryProgress.fromTurn }}–{{ summaryProgress.toTurn }} 轮…</template>
                                <template v-else-if="summaryProgress.status === 'failed'">第 {{ summaryProgress.fromTurn }}–{{ summaryProgress.toTurn }} 轮总结失败，稍后自动重试</template>
                                <template v-else>已总结 第 {{ summaryProgress.fromTurn }}–{{ summaryProgress.toTurn }} 轮</template>
                            </span>
                            <button v-if="summaryProgress.status === 'failed'" type="button"
                                @click="retryRollingSummary"
                                class="ml-auto flex-shrink-0 px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors">
                                重试
                            </button>
                            <button v-else type="button" @click="clearSummaryProgress"
                                class="ml-auto flex-shrink-0 px-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div v-if="!currentCharacter"
                        class="flex flex-col items-center justify-center h-full text-gray-500">
                        <div class="w-24 h-24 bg-gray-200 rounded-full mb-4 flex items-center justify-center">
                            <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                </path>
                            </svg>
                        </div>
                        <p class="mb-4 font-medium">请先选择或创建一个角色卡</p>
                        <button @click="currentView = 'characters'"
                            class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-bold">
                            前往角色管理
                        </button>
                    </div>
                    <div v-else-if="chatHistory.length === 0"
                        class="flex flex-col items-center justify-center h-full text-gray-400 opacity-60">
                        <img :src="currentCharacter?.avatar" class="w-24 h-24 rounded-full mb-4 opacity-50 grayscale">
                        <p>开始与 {{ currentCharacter.name }} 对话吧</p>
                    </div>

                    <template v-if="currentCharacter && chatHistory.length > 0">
                    <div v-if="chatTopSpacerHeight > 0" aria-hidden="true" :style="{ height: chatTopSpacerHeight + 'px' }"></div>
                    <template v-for="({ msg, index }, displayIndex) in displayedChatMessages" :key="msg.id || index">
                    <div ref="messageElements"
                        :data-role="msg.role"
                        :data-chat-index="index"
                        v-show="!(msg.role === 'assistant' && index === chatHistory.length - 1 && isThinking && !(msg.reasoning || parseCot(msg.content).cot || parseCot(msg.content).main || (msg.toolCalls && msg.toolCalls.length)))"
                        :class="['flex w-full scroll-reveal-container', settings.immersiveMode ? 'immersive-message-row' : '', msg.isSelf ? 'justify-end' : 'justify-start', msg.skipReveal ? 'reveal-active' : (settings.immersiveMode ? 'scroll-reveal-center' : (msg.isSelf ? 'scroll-reveal-right' : 'scroll-reveal-left'))]"
                        :style="{ transitionDelay: (displayIndex % 5) * 50 + 'ms' }">
                        <div
                            :class="['flex md:max-w-[75%] lg:max-w-[70%]', settings.immersiveMode ? 'immersive-message-shell max-w-full' : 'max-w-[99%]', messageUsesWideLayout(msg) ? 'w-full' : '', msg.isSelf ? 'flex-row-reverse' : 'flex-row']">
                            <!-- Avatar -->
                            <div v-show="!settings.immersiveMode"
                                :class="['flex-shrink-0 select-none', msg.shouldAnimate ? 'animate-message-fade-in' : '']">
                                <div v-if="msg.role === 'user'"
                                    :class="['w-9 h-9 rounded-full overflow-hidden shadow-sm transition-transform', msg.isSelf ? 'ml-1.5' : 'mr-1.5']">
                                    <img v-if="msg?.avatar || (msg?.isSelf && user?.avatar)"
                                        :src="msg?.avatar || user?.avatar" class="w-full h-full object-cover">
                                    <img v-else-if="!msg?.avatar && !msg?.isSelf && user?.avatar" :src="user?.avatar"
                                        class="w-full h-full object-cover"
                                        title="Fallback to user avatar for legacy messages">
                                    <div v-else
                                        class="w-full h-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-xs text-white">
                                        {{ (msg.name || user.name || 'U').charAt(0) }}
                                    </div>
                                </div>
                                <img v-else :src="currentCharacter?.avatar"
                                    class="w-9 h-9 rounded-full object-cover mr-1.5 border border-gray-200 shadow-sm transition-transform">
                            </div>

                            <div
                                :class="['flex flex-col min-w-0', settings.immersiveMode ? 'immersive-message-column' : '', messageUsesWideLayout(msg) ? 'flex-1 w-full' : '', msg.isSelf ? 'items-end' : 'items-start']">
                                <!-- Name (Outside Bubble) -->
                                <div v-show="!settings.immersiveMode"
                                    :class="['text-[10px] font-bold text-gray-600 mb-1 select-none px-1.5 py-0.5 rounded-md bg-white/50 backdrop-blur-sm border border-white/20 w-fit shadow-sm truncate max-w-[150px] md:max-w-[250px] msg-name-tag', msg.isSelf ? 'ml-auto mr-1' : 'mr-auto ml-1', msg.shouldAnimate ? 'animate-message-fade-in' : '']">
                                    {{ msg.name || (msg.role === 'user' ? user.name : (currentCharacter?.name || 'Unknown')) }}
                                </div>
                                <!-- Message Bubble -->
                                <div class="group relative"
                                    :class="{'w-full': messageUsesWideLayout(msg)}">
                                    <div
                                        :class="['p-0 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed overflow-hidden',
                                        msg.shouldAnimate && !(msg.role === 'assistant' && msg.reasoning) ? 'animate-message-in' : '',
                                        messageUsesWideLayout(msg) ? 'w-full' : '',
                                        msg.role === 'user' ? (msg.isSelf ? 'bg-blue-50/85 text-gray-900 shadow-[0_4px_12px_rgba(59,130,246,0.1)] border border-primary-300/50' : 'bg-white/70 text-gray-800 border border-white/40 shadow-card') :
                                        msg.role === 'system' ? 'bg-red-50/70 text-red-800 border border-red-200/40' :
                                        msg.isError ? 'bg-red-50/80 text-red-800 border border-red-300/50' :
                                        'bg-white/70 text-gray-800 border border-white/40 shadow-card',
                                        'backdrop-blur-md glass-stabilize msg-bubble-glass']">

                                        <div v-if="msg.isEditing_Message"
                                            class="relative z-10 animate-fade-in w-full p-3 md:p-4">
                                            <textarea v-model="msg.editMessageContent"
                                                :style="{ height: (msg.editMessageHeight || 160) + 'px' }"
                                                class="w-full min-h-[88px] max-h-[70vh] p-3 text-sm text-gray-700 bg-white/50 backdrop-blur-md rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:bg-white transition-all shadow-inner resize-y custom-scrollbar"
                                                placeholder="编辑消息..."></textarea>
                                            <div class="flex justify-end space-x-2 mt-3">
                                                <button @click="cancelEditMessage(index)"
                                                    class="px-4 py-1.5 text-xs font-bold text-gray-500 bg-white/80 hover:bg-white border border-gray-200 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-200">
                                                    取消
                                                </button>
                                                <button @click="saveEditMessage(index)"
                                                    class="px-4 py-1.5 text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500">
                                                    保存
                                                </button>
                                            </div>
                                        </div>
                                        <div v-else-if="msg.isTriggered && !msg.showRaw" @click="msg.showRaw = true"
                                            class="px-4 py-3 flex items-center space-x-2 text-primary-800/80 select-none cursor-pointer hover:bg-primary-50 transition-colors"
                                            :title="msg.content">
                                            <svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                            </svg>
                                            <span class="font-bold text-sm">触发了卡片交互 <span
                                                    class="text-[10px] opacity-60 ml-1"></span></span>
                                        </div>
                                        <div v-else-if="msg.isTriggered && msg.showRaw" @click="msg.showRaw = false"
                                            class="cursor-pointer hover:opacity-80 transition-opacity" title="点击收起">
                                            <div class="markdown-body"
                                                :style="settings.fontSize ? { fontSize: settings.fontSize + 'px' } : {}"
                                                v-html="renderMarkdown(msg.content, msg.role, false, !isMessageThinkingOrRunning(msg))">
                                            </div>
                                        </div>

                                        <div v-else class="message-content-wrapper"
                                            :class="{'w-full': messageUsesWideLayout(msg)}">
                                                                                        <!-- Unified Summary Timeline Part -->
                                            <div v-if="hasThinkingOrTools(msg)" class="native-thinking-wrapper">
                                                <div class="cot-ui native-thinking-card summary-timeline-card"
                                                    :class="{ 'is-live': isMessageThinkingOrRunning(msg), 'is-open': isThinkingSummaryOpen(msg) }">
                                                    <button type="button" class="cot-header native-thinking-header justify-between"
                                                        @click="toggleThinkingSummary(msg)">
                                                        <div class="flex items-center min-w-0">
                                                            <span v-if="isMessageThinkingOrRunning(msg)" class="live-dots thinking-summary-dots mr-2" aria-hidden="true"><i></i><i></i><i></i></span>
                                                            <svg v-else class="w-3.5 h-3.5 mr-2 flex-shrink-0 thinking-summary-bulb" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                                    d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5M9 18h6M10 22h4">
                                                                </path>
                                                            </svg>
                                                            <span class="text-sm font-bold truncate">Thinking</span>
                                                        </div>
                                                        <svg class="w-3.5 h-3.5 ml-2 opacity-60 chevron" fill="none"
                                                            stroke="currentColor" viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                        </svg>
                                                    </button>
                                                    <div class="cot-body native-thinking-body"
                                                        :class="{ 'is-open': isThinkingSummaryOpen(msg) }">
                                                        <div class="cot-inner native-thinking-inner">
                                                            <div class="relative pl-6 border-l border-gray-300/90 space-y-7 py-1 ml-3.5 pt-4 pb-4 pr-4">
                                                                <div v-for="step in getTimelineSteps(msg)" :key="step.id" class="relative group/step">
                                                                    <!-- Marker Node -->
                                                                    <div class="absolute -left-[38px] top-0 flex items-center justify-center w-7 h-5">
                                                                        <div class="w-3 h-3 rounded-full bg-white border-2 border-gray-400/80 shadow-sm transition-all group-hover/step:border-primary-500"
                                                                            :class="{ 'border-red-300': step.status === 'error', 'border-primary-400': step.status === 'running' || step.status === 'receiving' }">
                                                                        </div>
                                                                    </div>

                                                                    <!-- Content Box -->
                                                                    <div class="flex flex-col min-w-0">
                                                                        <div v-if="step.isReason" class="text-sm font-bold text-gray-700 leading-relaxed select-text whitespace-normal break-words">
                                                                            {{ step.title }}
                                                                        </div>
                                                                        <details v-else class="group/detail" @toggle="markThinkingSummaryDetailOpened(msg, $event)">
                                                                            <summary class="list-none outline-none cursor-pointer flex items-center justify-between gap-3 text-gray-500 text-xs leading-relaxed select-none hover:text-gray-900 transition-colors">
                                                                                <div class="flex items-center gap-2 min-w-0">
                                                                                    <span class="timeline-step-title-row text-sm font-bold text-gray-700 select-none">
                                                                                        <span class="timeline-step-title-text">{{ step.title }}</span>
                                                                                        <span v-if="step.type === 'thinking'" class="timeline-step-count">{{ step.charCount }} 字</span>
                                                                                        <span v-if="step.isLive || (step.type === 'tool' && step.status !== 'done' && step.status !== 'error')" class="timeline-tool-title-flow" aria-hidden="true">{{ step.type === 'thinking' ? (step.title + ' ' + step.charCount + ' 字') : step.title }}</span>
                                                                                    </span>
                                                                                    <svg v-if="step.status === 'done'" class="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                                                                                    </svg>
                                                                                    <span v-if="step.status === 'error'" class="bg-red-50 text-red-700 border border-red-100 rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap">失败</span>
                                                                                </div>
                                                                                <span class="text-[10px] text-primary-500 opacity-60 group-hover/detail:opacity-100 flex items-center gap-0.5 font-bold whitespace-nowrap flex-shrink-0 ml-auto">
                                                                                    详情
                                                                                    <svg class="w-2.5 h-2.5 transform group-open/detail:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                                                                    </svg>
                                                                                </span>
                                                                            </summary>
                                                                            <div class="mt-2 bg-gray-50 border border-gray-100/60 rounded-xl p-3 text-[13px] text-gray-700 overflow-x-auto custom-scrollbar shadow-inner select-text"
                                                                                :class="{ 'timeline-thinking-detail': step.type === 'thinking' }">
                                                                                <div v-if="step.type === 'thinking'" class="markdown-body"
                                                                                    :style="settings.fontSize ? { fontSize: (settings.fontSize - 1.5) + 'px' } : {}"
                                                                                    v-html="renderMarkdown(step.text, 'assistant', true)">
                                                                                </div>
                                                                                <div v-else class="tool-call-detail flex flex-col gap-3 text-[13px]">
                                                                                    <div class="flex justify-between items-center text-[13px] border-b border-gray-200 pb-2">
                                                                                        <span>调用标签: <code class="font-mono bg-white px-1 border rounded text-primary-600">&lt;{{ step.toolCall.callName }}&gt;</code></span>
                                                                                        <span class="text-gray-400 font-semibold">{{ getToolCallModeText(step.toolCall) }}</span>
                                                                                    </div>
                                                                                    <div class="flex flex-col gap-1.5">
                                                                                        <span class="text-xs font-semibold text-gray-500">参数输入:</span>
                                                                                        <pre class="bg-gray-50 p-3 rounded-lg border border-gray-200 font-mono text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar break-all">{{ step.toolCall.query }}</pre>
                                                                                    </div>
                                                                                    <div v-if="step.toolCall.error" class="text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mt-1 font-mono text-[13px] leading-relaxed">
                                                                                        {{ step.toolCall.error }}
                                                                                    </div>
                                                                                    <div v-else-if="step.toolCall.resultText" class="flex flex-col gap-1.5 mt-1">
                                                                                        <span class="text-xs font-semibold text-gray-500">执行输出:</span>
                                                                                        <pre class="bg-gray-50 p-3 rounded-lg border border-gray-200 font-mono text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap max-h-56 overflow-y-auto custom-scrollbar break-all">{{ step.toolCall.resultText }}</pre>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </details>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <!-- Active Tool Calls -->
                                            <div v-if="msg.role === 'assistant' && activeToolContinuationMessageId === msg.id && (isGenerating || isRemoteGenerating) && !activeToolContinuationHasResponse && !isThinking"
                                                class="active-tool-waiting">
                                                <div class="typing-indicator scale-125">
                                                    <span></span><span></span><span></span>
                                                </div>
                                                <generation-timer v-if="isGenerating" :wait-time="currentWaitTime"
                                                    :estimated-time="estimatedGenerationTime"
                                                    :remote-estimated-time="remoteEstimatedTime"
                                                    :remote="isRemoteGenerating"></generation-timer>
                                            </div>
                                            <div v-if="msg.role === 'assistant' && msg.uiTemplateBlocks && msg.uiTemplateBlocks.top && msg.uiTemplateBlocks.top.length"
                                                class="ui-template-message-block ui-template-message-block-top">
                                                <div v-for="(html, tIndex) in msg.uiTemplateBlocks.top"
                                                    :key="'msg-ui-top-' + index + '-' + tIndex"
                                                    class="w-full ui-template-render" @click="handleUiTemplateClick">
                                                    <ui-template-frame :html="html"></ui-template-frame>
                                                </div>
                                            </div>
                                            <div v-if="msg.role === 'assistant' && uiTemplateUpdateStatus.state === 'running' && uiTemplateUpdateStatus.targetMessageId === msg.id && activeUiTemplates.some(t => t.placement === 'top')"
                                                class="ui-template-message-block ui-template-message-block-top">
                                                <ui-template-pending></ui-template-pending>
                                            </div>
                                            <!-- CoT Part -->
                                            <!-- Main Part -->
                                            <template v-if="parseCot(msg.content).main">
                                                <template
                                                    v-if="index === chatHistory.length - 1 && (isGenerating || isRemoteGenerating)">
                                                    <div v-if="processMainContent(parseCot(msg.content).main, true).text"
                                                        class="markdown-body"
                                                        :style="settings.fontSize ? { fontSize: settings.fontSize + 'px' } : {}"
                                                        v-html="renderMarkdown(processMainContent(parseCot(msg.content).main, true).text, msg.role, false, !isMessageThinkingOrRunning(msg))">
                                                    </div>
                                                    <div v-if="processMainContent(parseCot(msg.content).main, true).showSpinner"
                                                        class="flex flex-col items-center justify-center p-8 w-full mt-2 gap-4 opacity-90">
                                                        <div class="ui-build-dots" aria-hidden="true"><i></i><i></i><i></i></div>
                                                        <span
                                                            class="text-[16px] font-bold tracking-wider text-blue-600/80">正在构建
                                                            UI 界面</span>
                                                    </div>
                                                </template>
                                                <template v-else>
                                                    <div class="markdown-body"
                                                        :style="settings.fontSize ? { fontSize: settings.fontSize + 'px' } : {}"
                                                        v-html="renderMarkdown(processMainContent(parseCot(msg.content).main, false).text, msg.role, false, !isMessageThinkingOrRunning(msg))">
                                                    </div>
                                                </template>
                                            </template>

                                            <!-- Sys Instruction Part -->
                                            <div v-if="parseCot(msg.content).sys"
                                                class="mt-2 mx-4 mb-3 p-3 bg-gradient-to-r from-gray-50/80 to-gray-100/50 backdrop-blur-sm rounded-xl border border-gray-200/60 shadow-sm flex flex-col gap-1.5 relative overflow-hidden group/sys">
                                                <div class="absolute inset-0 bg-white/40 pointer-events-none"></div>
                                                <div
                                                    class="flex items-center text-gray-500 font-bold text-xs uppercase tracking-wider relative z-10">
                                                    <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor"
                                                        viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                                                        </path>
                                                    </svg>
                                                    临时指令
                                                </div>
                                                <div class="text-gray-600 leading-relaxed font-medium markdown-body relative z-10"
                                                    :style="settings.fontSize ? { fontSize: (settings.fontSize - 1) + 'px' } : { fontSize: '13px' }"
                                                    v-html="renderMarkdown(parseCot(msg.content).sys, 'user', true, !isMessageThinkingOrRunning(msg))">
                                                </div>
                                            </div>
                                            <div v-if="msg.role === 'assistant' && msg.uiTemplateBlocks && msg.uiTemplateBlocks.bottom && msg.uiTemplateBlocks.bottom.length"
                                                class="ui-template-message-block ui-template-message-block-bottom">
                                                <div v-for="(html, tIndex) in msg.uiTemplateBlocks.bottom"
                                                    :key="'msg-ui-bottom-' + index + '-' + tIndex"
                                                    class="w-full ui-template-render" @click="handleUiTemplateClick">
                                                    <ui-template-frame :html="html"></ui-template-frame>
                                                </div>
                                            </div>
                                            <div v-if="msg.role === 'assistant' && uiTemplateUpdateStatus.state === 'running' && uiTemplateUpdateStatus.targetMessageId === msg.id && activeUiTemplates.some(t => t.placement === 'bottom')"
                                                class="ui-template-message-block ui-template-message-block-bottom">
                                                <ui-template-pending></ui-template-pending>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Message Actions -->
                                    <div v-if="!msg.isEditing_Message && !isMessageThinkingOrRunning(msg) && !(index === chatHistory.length - 1 && !msg.isSelf && (isGenerating || isRemoteGenerating)) && !(msg.isSelf && isConversationBusy && !chatHistory.slice(index + 1).some(m => m.isSelf))"
                                        :class="['message-action-bar absolute bottom-0 -mb-11 md:-mb-12 flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200', msg.isSelf ? 'right-0' : 'left-0']">
                                        <button v-if="index === chatHistory.length - 1"
                                            @click="regenerateMessage(index)"
                                            class="message-action-button"
                                            title="重新生成">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                                                </path>
                                            </svg>
                                        </button>
                                        <button @click="editMessage(index)"
                                            class="message-action-button"
                                            title="编辑">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z">
                                                </path>
                                            </svg>
                                        </button>
                                        <button @click="copyMessage(msg.content)"
                                            class="message-action-button"
                                            title="复制">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z">
                                                </path>
                                            </svg>
                                        </button>
                                        <button v-if="msg.role === 'assistant' && settings.ttsEnabled && ttsStatus.available && !isMessageThinkingOrRunning(msg) && ttsSpeakTextFor(msg)"
                                            @click="toggleSpeakMessage(index)"
                                            :disabled="ttsPlayingMessageId !== null && ttsPlayingMessageId !== msg.id"
                                            class="message-action-button"
                                            :class="{ 'message-action-button--active': ttsPlayingMessageId === msg.id }"
                                            :title="ttsPlayingMessageId === msg.id ? '停止朗读' : '朗读'">
                                            <svg v-if="ttsPlayingMessageId === msg.id" class="w-3.5 h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                                            </svg>
                                            <svg v-else class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"></path>
                                            </svg>
                                        </button>
                                        <button v-if="msg.role === 'assistant'" @click="createStoryBranch(index)"
                                            :disabled="storyBranchSwitching"
                                            class="message-action-button"
                                            title="从这里分支" aria-label="从这里创建分支">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24" aria-hidden="true">
                                                <use href="#icon-story-branch"></use>
                                            </svg>
                                        </button>
                                        <button v-if="msg.role === 'assistant' && msg.uiTemplateBlocks && (msg.uiTemplateBlocks.top?.length || msg.uiTemplateBlocks.bottom?.length) && settings.uiTemplateEnabled && uiTemplateUpdateStatus.state !== 'running'"
                                            @click="updateUiTemplatesFromChat({ manual: true, targetMessageId: msg.id })"
                                            class="message-action-button"
                                            title="重试变量分析">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                            </svg>
                                        </button>
                                        <button @click="deleteMessage(index)"
                                            class="message-action-button message-action-button--danger"
                                            title="删除">
                                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor"
                                                viewBox="0 0 24 24">
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
                    </template>
                    <div v-if="chatBottomSpacerHeight > 0" aria-hidden="true" :style="{ height: chatBottomSpacerHeight + 'px' }"></div>
                    </template>

                    <!-- Typing Indicator -->
                    <div v-if="(isGenerating || isRemoteGenerating) && !isReceiving && !isThinking && !hasActiveToolInlineWork"
                        :class="['flex w-full', settings.immersiveMode ? 'immersive-message-row justify-start' : 'justify-start']">
                        <div
                            :class="['flex flex-row', settings.immersiveMode ? 'immersive-message-shell max-w-[99%]' : 'max-w-[99%] md:max-w-[75%] lg:max-w-[70%]']">
                            <div v-show="!settings.immersiveMode" class="flex-shrink-0 animate-message-in"
                                style="animation-delay: 100ms;">
                                <img :src="currentCharacter?.avatar"
                                    class="w-9 h-9 rounded-full object-cover mr-1.5 border border-gray-200 shadow-sm">
                            </div>
                            <div :class="['flex flex-col min-w-0 items-start', settings.immersiveMode ? 'immersive-message-column' : '']">
                                <div v-show="!settings.immersiveMode"
                                    class="text-[10px] font-bold text-gray-600 mb-1 select-none px-1.5 py-0.5 rounded-md bg-white/50 backdrop-blur-sm border border-white/20 w-fit shadow-sm mr-auto ml-1 truncate max-w-[150px] md:max-w-[250px] msg-name-tag animate-message-in"
                                    style="animation-delay: 100ms;">
                                    {{ currentCharacter.name }}
                                </div>
                                <div :class="['min-w-[150px] min-h-[4.5rem] px-6 py-4 rounded-2xl bg-white/70 backdrop-blur-md glass-stabilize border border-white/40 shadow-card flex flex-col items-center justify-center gap-2 transition-all duration-500 typing-bubble animate-message-in', settings.immersiveMode ? '' : 'rounded-tl-none']"
                                    style="animation-delay: 100ms;">
                                    <div class="typing-indicator scale-125">
                                        <span></span><span></span><span></span>
                                    </div>
                                    <generation-timer v-if="isGenerating" :wait-time="currentWaitTime"
                                        :estimated-time="estimatedGenerationTime"
                                        :remote-estimated-time="remoteEstimatedTime"
                                        :remote="isRemoteGenerating"></generation-timer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
</template>

<script>
import { inject } from "vue";
import { UiTemplateFrame } from "../../modules/ui-template-frame.mjs";
import GenerationTimer from "../common/GenerationTimer.vue";
import UiTemplatePending from "../common/UiTemplatePending.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { UiTemplateFrame, GenerationTimer, UiTemplatePending },
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>
