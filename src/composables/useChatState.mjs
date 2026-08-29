// useChatState — chat conversation state (Phase 2, roadmap 2.1)
//
// Owns the chat-domain state previously inlined in app.mjs setup(): the
// conversation history plus render-window constants/state, generation busy
// flags (generating/receiving/thinking/remote), active-tool continuation
// runtime, the chat input and its mobile keyboard/viewport measurement
// guards, context-viewer snapshot state, conversation stats, and the
// generation timer state. Also returns the two state-derived computeds whose
// dependencies are entirely inside this domain (lastContextTotalLength,
// estimatedGenerationTime).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic
//   (sending/regeneration/persistence/scroll handling and the
//   tool-inline-work computeds, which depend on app.mjs helpers, stay in
//   app.mjs).
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - Mutable non-reactive guards are destructured with `let` in app.mjs so
//   existing reassignment sites keep working.

import { ref, computed } from 'vue';
import { RPHRuntimePolicy } from '../modules/runtime-policy.mjs';

export function useChatState() {
    // --- Generation busy flags ---
    const isGenerating = ref(false);
    const isRemoteGenerating = ref(false); // 新增：远程生成状态
    const remoteEstimatedTime = ref(null); // 新增：远程预计时间
    const isReceiving = ref(false);
    const isThinking = ref(false);

    // --- Active tool continuation runtime ---
    const activeToolContinuationMessageId = ref(null);
    const activeToolContinuationToolCallId = ref(null);
    const activeToolContinuationHasResponse = ref(false);
    const activeToolHandoffPending = ref(false);
    const activeToolQueueRunning = ref(false);
    const activeToolContinuationPending = ref(false);
    let activeToolQueueAbortController = null;
    const abortController = ref(null);

    // --- Pending tool result contexts (consumed by the generation pipeline) ---
    const pendingActiveToolContext = ref('');
    const activeToolResultContexts = ref([]);

    // --- Chat input ---
    const userInput = ref('');

    // --- Chat container / input element refs ---
    const chatContainer = ref(null);
    const isChatFullscreen = ref(false);
    const isMobileKeyboardOpen = ref(false);
    // 焦点进入角色卡（executable-html iframe）内输入框时为 true，
    // 用于隐藏底部聊天输入栏，避免它遮挡卡片内容/输入框。
    const isExternalInputFocused = ref(false);
    const inputBox = ref(null);
    const messageElements = ref([]);
    let mobileViewportRaf = null;
    let mobileKeyboardBlurTimer = null;
    let chatInputComposing = false;
    let chatInputSyncRaf = null;
    let chatInputResizeRaf = null;
    let lastAppliedMobileViewportHeight = 0;
    let lastAppliedMobileKeyboardInset = 0;
    let lastAppliedMobileBackgroundHeight = 0;

    // --- Conversation history + render window ---
    const chatHistory = ref([]);
    const CHAT_RENDER_INITIAL_LIMIT = RPHRuntimePolicy?.limits?.chatInitial || 20;
    const CHAT_RENDER_BATCH_SIZE = RPHRuntimePolicy?.limits?.chatBatch || 10;
    const CHAT_RENDER_MAX_LIMIT = RPHRuntimePolicy?.limits?.chatMaximum || 40;
    const CHAT_ESTIMATED_MESSAGE_HEIGHT = 180;
    const chatRenderLimit = ref(CHAT_RENDER_INITIAL_LIMIT);
    const chatRenderStart = ref(0);
    let isLoadingEarlierChatMessages = false;
    let isLoadingLaterChatMessages = false;
    let isChatTopUnlockArmed = true;

    // --- Last request context snapshot (context viewer) ---
    const lastContextMessages = ref([]);
    const lastTriggeredWorldInfos = ref([]);
    const lastContextTotalLength = computed(() => lastContextMessages.value.reduce(
        (total, message) => total + String(message?.content || '').length,
        0
    ));

    // --- Conversation stats ---
    const chatRoundStats = ref({ floors: 0 });
    const conversationBodyLength = ref(0);
    const summaryCompressedBodyLength = ref(0);
    let chatStatsTimer = null;

    // --- Generation timer ---
    const recentGenerationTimes = ref([]);
    const currentWaitTime = ref('0.0');
    // waitTimer moved to useMessageSender (Phase 2.2): every read/write of it
    // lives inside the generation pipeline, which is now a deps-injecting
    // composable that owns the handle privately.
    const longPressTimer = ref(null);
    const estimatedGenerationTime = computed(() => {
        if (recentGenerationTimes.value.length === 0) return null;
        const total = recentGenerationTimes.value.reduce((sum, item) => {
            // Compatibility: handle both number and object
            const duration = typeof item === 'number' ? item : item.duration;
            return sum + duration;
        }, 0);
        return (total / recentGenerationTimes.value.length / 1000).toFixed(1);
    });

    return {
        isGenerating,
        isRemoteGenerating,
        remoteEstimatedTime,
        isReceiving,
        isThinking,
        activeToolContinuationMessageId,
        activeToolContinuationToolCallId,
        activeToolContinuationHasResponse,
        activeToolHandoffPending,
        activeToolQueueRunning,
        activeToolContinuationPending,
        activeToolQueueAbortController,
        abortController,
        pendingActiveToolContext,
        activeToolResultContexts,
        userInput,
        chatContainer,
        isChatFullscreen,
        isMobileKeyboardOpen,
        isExternalInputFocused,
        inputBox,
        messageElements,
        mobileViewportRaf,
        mobileKeyboardBlurTimer,
        chatInputComposing,
        chatInputSyncRaf,
        chatInputResizeRaf,
        lastAppliedMobileViewportHeight,
        lastAppliedMobileKeyboardInset,
        lastAppliedMobileBackgroundHeight,
        chatHistory,
        CHAT_RENDER_INITIAL_LIMIT,
        CHAT_RENDER_BATCH_SIZE,
        CHAT_RENDER_MAX_LIMIT,
        CHAT_ESTIMATED_MESSAGE_HEIGHT,
        chatRenderLimit,
        chatRenderStart,
        isLoadingEarlierChatMessages,
        isLoadingLaterChatMessages,
        isChatTopUnlockArmed,
        lastContextMessages,
        lastTriggeredWorldInfos,
        lastContextTotalLength,
        chatRoundStats,
        conversationBodyLength,
        summaryCompressedBodyLength,
        chatStatsTimer,
        recentGenerationTimes,
        currentWaitTime,
        longPressTimer,
        estimatedGenerationTime
    };
}
