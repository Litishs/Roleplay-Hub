// useUiState — app shell UI state (Phase 2, roadmap 2.1)
//
// Owns every app-shell UI state declaration previously inlined in app.mjs
// setup(): the global confirm modal, current view / sidebar / navigation
// flags, editor & settings panel visibility flags, version and update-check
// display state, quota display state, toast list, and the user-setup modal
// draft. Also returns the three pure state-manipulation helpers that only
// touch this domain (showVueConfirmModal, toggleAdvancedNav,
// syncUserSetupName).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic
//   (update checking, download/install, persistence all stay in app.mjs).
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - Mutable non-reactive guards are destructured with `let` in app.mjs so
//   existing reassignment sites keep working.

import { ref, reactive } from 'vue';

export function useUiState() {
    // --- Global confirm modal ---
    // Button labels are configurable per call (e.g. importing a backup shows
    // 取消/立即导入); empty strings fall back to the generic labels in
    // ConfirmDialog.vue.
    const globalConfirmModal = ref({
        show: false,
        title: '',
        message: '',
        confirmLabel: '',
        cancelLabel: '',
        onConfirm: null,
        onCancel: null
    });

    const showVueConfirmModal = (title, message, labels = {}) => {
        return new Promise((resolve) => {
            globalConfirmModal.value = {
                show: true,
                title,
                message,
                confirmLabel: labels.confirmLabel || '',
                cancelLabel: labels.cancelLabel || '',
                onConfirm: () => {
                    globalConfirmModal.value.show = false;
                    resolve(true);
                },
                onCancel: () => {
                    globalConfirmModal.value.show = false;
                    resolve(false);
                }
            };
        });
    };

    // --- Release notes are rendered inline in the settings footer (UpdateChecker)
    // instead of a modal; only the dismiss flag lives here.

    // --- View / navigation shell ---
    // The app lands on the conversation list; the chat is a detail view.
    const currentView = ref('home');
    let nativeAppStateListener = null;
    let nativeBackButtonListener = null;
    // Narrow-screen tab shell (2026-11-23): Back returns a detail view to the
    // page it was opened from. Entries are { view, from }; the rules live in
    // src/modules/tab-navigation.mjs.
    const navStack = ref([]);
    // True while a text field on a tab-root page holds focus. The native shell
    // lifts the WebView above the keyboard, which would leave the tab bar
    // floating right over it.
    const isRootTextFocused = ref(false);
    const isSidebarCollapsed = ref(false);
    const isAdvancedNavOpen = ref(false);
    const toggleAdvancedNav = () => {
        if (isSidebarCollapsed.value) {
            isSidebarCollapsed.value = false;
            isAdvancedNavOpen.value = true;
            return;
        }
        isAdvancedNavOpen.value = !isAdvancedNavOpen.value;
    };

    // "在线" collapsible nav group (角色卡生成 / 万相广场) — same expand
    // semantics as the 高级 group: clicking while the sidebar is collapsed
    // expands the sidebar and opens the group in one step.
    const isOnlineNavOpen = ref(false);
    const toggleOnlineNav = () => {
        if (isSidebarCollapsed.value) {
            isSidebarCollapsed.value = false;
            isOnlineNavOpen.value = true;
            return;
        }
        isOnlineNavOpen.value = !isOnlineNavOpen.value;
    };

    // --- App version display ---
    const appVersionName = ref('');
    const appVersionCode = ref('');
    // --- Build type (release/debug), read from native BuildInfoPlugin ---
    const appBuildType = ref('');

    // --- Panel / modal flags ---
    const showDescriptionPanel = ref(false);
    const showModelSelector = ref(false);
    const modelSelectionTarget = ref('model');
    const showChatModelSelector = ref(false);
    const showPresetEditor = ref(false);
    const showUiTemplateEditor = ref(false);
    const showRegexEditor = ref(false);
    const showActiveToolEditor = ref(false);
    const showUserSetupModal = ref(false);
    const showAutoImageGenModal = ref(false);
    const showInstructionPanel = ref(false);
    const showContextViewerModal = ref(false);

    // --- UI template update run status ---
    // (run lifecycle guards uiTemplateUpdateSeq/AbortController moved to
    // useUiTemplatePipeline — Phase 3.0)
    const uiTemplateUpdateStatus = reactive({ state: 'idle', message: '待命', time: 0, remaining: 0, targetMessageId: null });

    // --- User setup modal draft ---
    const tempUserSetup = reactive({ name: '', description: '', person: 'second' });
    const userSetupNameInput = ref(null);
    const syncUserSetupName = event => {
        const eventTarget = event?.target;
        const input = eventTarget?.tagName === 'INPUT' ? eventTarget : userSetupNameInput.value;
        if (input) tempUserSetup.name = input.value;
    };

    // --- Quota display state (image generation quota is currently unavailable) ---
    const quotaValue = ref(0);
    const quotaLoading = ref(false);
    const quotaError = ref(false);
    const backupInProgress = ref(false);

    // --- Update check display state ---
    const updateAvailable = ref(false);
    const updateInfo = ref(null);
    const checkingUpdate = ref(false);
    const lastUpdateCheck = ref(null);
    const latestVersionName = ref('');
    // True once the user has dismissed the update announcement today; the
    // settings-footer card hides until the date rolls over.
    const updateNoticeDismissedToday = ref(false);

    // --- Notice / legacy confirm modal flags ---
    const showAuthorNoticeModal = ref(false);
    const showConfirmModal = ref(false);
    const confirmMessage = ref('');
    const confirmCallback = ref(null);

    // --- Toasts ---
    const toasts = ref([]);
    let toastIdSeed = 0;

    return {
        globalConfirmModal,
        showVueConfirmModal,
        currentView,
        navStack,
        isRootTextFocused,
        nativeAppStateListener,
        nativeBackButtonListener,
        isSidebarCollapsed,
        isAdvancedNavOpen,
        toggleAdvancedNav,
        isOnlineNavOpen,
        toggleOnlineNav,
        appVersionName,
        appVersionCode,
        appBuildType,
        showDescriptionPanel,
        showModelSelector,
        modelSelectionTarget,
        showChatModelSelector,
        showPresetEditor,
        showUiTemplateEditor,
        showRegexEditor,
        showActiveToolEditor,
        showUserSetupModal,
        showAutoImageGenModal,
        showInstructionPanel,
        showContextViewerModal,
        uiTemplateUpdateStatus,
        tempUserSetup,
        userSetupNameInput,
        syncUserSetupName,
        quotaValue,
        quotaLoading,
        quotaError,
        backupInProgress,
        updateAvailable,
        updateInfo,
        checkingUpdate,
        lastUpdateCheck,
        latestVersionName,
        updateNoticeDismissedToday,
        showAuthorNoticeModal,
        showConfirmModal,
        confirmMessage,
        confirmCallback,
        toasts,
        toastIdSeed
    };
}
