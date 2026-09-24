// useSettingsState — user persona + app settings state (Phase 2, roadmap 2.1)
//
// Owns every settings-domain state declaration previously inlined in app.mjs
// setup(): the user persona reactive + profile list, the central `settings`
// reactive (API/model/context/token-budget/display/image/TTS defaults),
// context token budget constants, theme/font normalization and resolution
// helpers, settings UI option constants, and the settings panel accordion
// state.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic
//   (theme/font DOM application, profile CRUD, persistence stay in app.mjs).
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - DEFAULT_API_PROVIDER_ID / DEFAULT_API_CONFIG live here because the
//   `settings` reactive needs them at construction; the API config domain
//   destructures them from this composable at its original declaration site.
// - Token estimation utilities (estimateTokens/estimateMessagesTokens) and
//   the API key editing helpers stay in app.mjs until their own roadmap step.

import { ref, reactive, computed } from 'vue';

export function useSettingsState() {
    // --- User persona + profiles ---
    const user = reactive({
        name: '请前往设置自定义你的名称',
        description: '',
        avatar: '',
        person: 'second', //记录人称偏好：second 或 third
    });
    const userProfiles = ref([]);
    const activeProfileId = ref(null);
    const showProfileDropdown = ref(false);

    // --- Context size constants ---
    const MAX_CONTEXT_SIZE = 1000000;
    const CONTEXT_TOKEN_BUDGET_DEFAULT = 26000;
    const CONTEXT_TOKEN_BUDGET_MIN = 8000;
    const CONTEXT_TOKEN_BUDGET_MAX = 64000;

    // --- Default API configuration (consumed by settings defaults) ---
    const DEFAULT_API_PROVIDER_ID = 'sta1n';
    const DEFAULT_API_CONFIG = {
        apiUrl: 'https://cdn.sta1n.cn/v1',
        apiKey: '',
        model: '', // Default selected
        qualityModel: '',
        balancedModel: '',
        fastModel: ''
    };

    // --- Central settings ---
    const settings = reactive({
        apiUrl: DEFAULT_API_CONFIG.apiUrl,
        apiKey: DEFAULT_API_CONFIG.apiKey,
        apiProviderId: DEFAULT_API_PROVIDER_ID,
        apiProviderKeys: {},
        customApiUrl: '',
        customApiUrl2: '',
        model: DEFAULT_API_CONFIG.qualityModel,
        contextSize: MAX_CONTEXT_SIZE,
        contextTokenBudget: CONTEXT_TOKEN_BUDGET_DEFAULT,
        maxOutputTokens: 4096,
        worldInfoTokenBudget: 4000,     // 世界书 token 预算（0=不限）
        chatProviderId: '',             // 聊天供应商，空=回退设置页当前浏览的供应商
        visionModel: '',                // 识图模型：用户发送图片时用聊天供应商调用它生成图片描述
        temperature: 1.0,
        reasoningEffort: '',            // inline panel: '', none, low, medium, high, max
        autoFetchModels: true,
        stream: true,
        // 网络超时（秒）：guard 实际使用前经 runtime-policy.resolveRequestTimeouts
        // clamp 在 [10, 1800] 区间，非法/缺失回退默认值，所以这里不需要 normalize。
        requestFirstByteTimeout: 60,    // 等待服务器响应头
        requestFirstTokenTimeout: 60,   // 等待首个输出 token（推理模型建议调大）
        requestStreamIdleTimeout: 120,  // 流式输出空闲
        requestTotalTimeout: 600,       // 单次生成总时长
        styleFilterEnabled: true,       // inline panel: strip AI-cliché fragments from replies
        showLatestUsageBar: false,      // inline panel: latest request token usage bar
        activeToolAggressiveness: 'adaptive',
        activeToolAggressivenessVersion: 2,

        useCharacterBackground: true,
        immersiveMode: false,
        uiTemplateEnabled: false,
        uiTemplateModel: '',
        uiTemplateAnalysisDepth: 4,
        uiTemplateInjectContext: false,
        uiTemplateMainModelAnalysis: true,
        uiTemplateBatchMode: true,
        uiTemplateJsonMode: true,
        uiTemplateMaxOutputTokens: 4096, // sub-model analysis budget, decoupled from chat maxOutputTokens
        fontFamily: 'modern',
        fontFamilyVersion: 4,
        fontSize: window.innerWidth > 768 ? 16 : 14,
        themeMode: 'system',
        imageGenKey: '',
        imageModel: 'nai-diffusion-4-5-full',   // 生图版本（NAI model id，-1/-5 为每次生成扣点）
        imageGenProviderId: 'sta1n',
        imageStyle: 'vertical',
        customImageArtists: '',
        imageSize: '竖图',
        imageGenCount: 2,
        ttsEnabled: false,
        ttsAutoPlay: false,
        ttsService: 'system',
        ttsVoice: '',
        ttsCloudProviderId: 'custom',
        ttsCloudBaseUrl: '',
        ttsCloudModel: '',
        ttsCloudVoice: '',
        ttsCloudApiKey: '',
        ttsCloudSpeed: 1.0,
        ttsRate: 1.0,
        ttsPitch: 1.0,
        ttsDialogueOnly: false,
        ttsSkipActions: false,
        ttsMaxChars: 2000,
        qualityModel: DEFAULT_API_CONFIG.qualityModel,
        balancedModel: DEFAULT_API_CONFIG.balancedModel,
        fastModel: DEFAULT_API_CONFIG.fastModel,
        qualityModelProvider: '',       // slot-bound chat provider; '' = model name only (legacy slots)
        balancedModelProvider: '',
        fastModelProvider: '',
        slotProviderBindingVersion: 0   // one-time migration flag (see useDataLoader)
    });

    // --- Token budget getters (pure reads of settings) ---
    const getContextTokenBudget = () => {
        const budget = Number(settings.contextTokenBudget);
        return Number.isFinite(budget) && budget > 0
            ? Math.max(CONTEXT_TOKEN_BUDGET_MIN, Math.min(CONTEXT_TOKEN_BUDGET_MAX, Math.round(budget)))
            : 0;
    };
    const getMaxOutputTokens = () => {
        const value = Number(settings.maxOutputTokens);
        return Number.isFinite(value) ? Math.max(256, Math.min(8192, Math.round(value))) : 4096;
    };
    const getWorldInfoTokenBudget = () => {
        const value = Number(settings.worldInfoTokenBudget);
        return Number.isFinite(value) ? Math.max(0, Math.min(16000, Math.round(value))) : 0;
    };

    // --- Font family normalization (pure; DOM application stays in app.mjs) ---
    const normalizeFontFamily = (value) => ['modern', 'serif', 'system'].includes(value) ? value : 'modern';

    // --- Theme resolution (pure; DOM/system-bar application stays in app.mjs) ---
    const THEME_MODES = ['system', 'light', 'dark'];
    const normalizeThemeMode = (value) => THEME_MODES.includes(value) ? value : 'system';
    const themeMedia = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    const resolveTheme = () => {
        const mode = normalizeThemeMode(settings.themeMode);
        return mode === 'system' ? (themeMedia && themeMedia.matches ? 'dark' : 'light') : mode;
    };

    // --- Settings UI option constants ---
    const fontFamilyOptions = [
        { value: 'modern', label: '现代通用字体' },
        { value: 'serif', label: '衬线字体' },
        { value: 'system', label: '系统字体' }
    ];
    const themeModeOptions = [
        { value: 'system', label: '跟随系统' },
        { value: 'light', label: '浅色' },
        { value: 'dark', label: '深色' }
    ];
    const imageStyleOptions = [
        { value: 'vertical', label: '韩漫小清新风' },
        { value: 'comicDoujin', label: '动漫同人风' },
        { value: 'r18', label: '2.5D唯美风' },
        { value: 'lolita25d', label: '2.5D唯美风（萝）' },
        { value: 'anime', label: '本子里番风' },
        { value: 'galgame', label: 'GalGame风' },
        { value: 'custom', label: '自定义' }
    ];
    // 生图版本（upstream STA1N parity）：V4.5 每张 -1 点，V5 每张 -5 点
    const imageModelOptions = [
        { value: 'nai-diffusion-4-5-full', label: 'V4.5 完整版（-1）' },
        { value: 'nai-diffusion-5-full', label: 'V5 完整版（-5）' }
    ];
    // V5 尚不支持这些画风的 artist 串，选中 V5 时从下拉里隐藏
    const v5UnsupportedImageStyles = new Set(['r18', 'lolita25d', 'anime']);
    const getImageModelName = (value) => (imageModelOptions.find(option => option.value === value)?.label
        || imageModelOptions[0].label).replace(/（[^）]*）$/, '');
    const availableImageStyleOptions = computed(() => settings.imageModel === 'nai-diffusion-5-full'
        ? imageStyleOptions.filter(option => !v5UnsupportedImageStyles.has(option.value))
        : imageStyleOptions);
    const imageSizeOptions = [
        { value: '竖图', label: '竖图' },
        { value: '横图', label: '横图' },
        { value: '方图', label: '方图' }
    ];
    const imageGenCountOptions = [2, 3, 4, 5, 6, 7, 8].map(count => ({
        value: count,
        label: `${count} 张`
    }));

    // --- Settings panel UI state ---
    const settingsHelpTopic = ref('');
    const settingsSectionsOpen = reactive({
        user: false,
        api: false,
        advanced: false,
        localData: false
    });

    return {
        user,
        userProfiles,
        activeProfileId,
        showProfileDropdown,
        MAX_CONTEXT_SIZE,
        CONTEXT_TOKEN_BUDGET_DEFAULT,
        CONTEXT_TOKEN_BUDGET_MIN,
        CONTEXT_TOKEN_BUDGET_MAX,
        DEFAULT_API_PROVIDER_ID,
        DEFAULT_API_CONFIG,
        settings,
        getContextTokenBudget,
        getMaxOutputTokens,
        getWorldInfoTokenBudget,
        normalizeFontFamily,
        THEME_MODES,
        normalizeThemeMode,
        themeMedia,
        resolveTheme,
        fontFamilyOptions,
        themeModeOptions,
        imageStyleOptions,
        imageModelOptions,
        availableImageStyleOptions,
        getImageModelName,
        v5UnsupportedImageStyles,
        imageSizeOptions,
        imageGenCountOptions,
        settingsHelpTopic,
        settingsSectionsOpen
    };
}
