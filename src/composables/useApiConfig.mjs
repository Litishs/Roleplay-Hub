// useApiConfig — API provider & model-selector state (Phase 2, roadmap 2.1)
//
// Owns the API-configuration state previously inlined in app.mjs setup():
// the named provider catalogue and custom provider definitions, image
// generation provider options (extension point, currently empty), connection
// status/latency display state, the model browser state (search/tag filters
// and fetched model lists), and the API key input helpers that are pure
// state manipulation. Also returns the pure provider resolver helpers
// (getApiProviderById/getApiProviderByUrl/normalizeApiProviderUrl/...).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic
//   (provider normalization against settings, model fetching, connection
//   checks and clipboard reading stay in app.mjs).
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - DEFAULT_API_PROVIDER_ID / DEFAULT_API_CONFIG live in useSettingsState
//   (the settings reactive needs them at construction); selectedApiProviderId
//   and the settings-dependent computeds therefore stay in app.mjs.

import { ref, reactive, computed } from 'vue';

export function useApiConfig() {
// --- Image generation provider options (STA1N image-hosting service) ---
// enforceSpecialRules (useSpecialRules.mjs) resolves the provider through
// getImageGenProviderById(<persisted imageGenProviderId>) and reads .apiUrl as
// the /generate base; a resolvable provider here is what unlocks the
// image-gen controls, the NAI画图正则 and the 自动生图 world info entry.
const imageGenProviderOptions = [
    {
        id: 'sta1n',
        name: 'STA1N 生图',
        apiUrl: 'https://nai.sta1n.cn',
        models: [
            { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion 4.5 Full' }
        ]
    }
];
const getImageGenProviderById = (id) => imageGenProviderOptions.find(provider => provider.id === id);
const imageGenUnavailable = computed(() => imageGenProviderOptions.length === 0);

    // --- Named API provider catalogue ---
    const apiProviderOptions = [
        {
            id: 'sta1n',
            name: 'STA1N API',
            apiUrl: 'https://cdn.sta1n.cn/v1',
            icon: 'https://picui.ogmua.cn/s1/2026/08/21/6a87a751bf871.webp'
        },
        {
            id: 'deepseek',
            name: 'DeepSeek',
            apiUrl: 'https://api.deepseek.com/v1',
            icon: 'https://www.deepseek.com/favicon.ico'
        },
        {
            id: 'openrouter',
            name: 'OpenRouter',
            apiUrl: 'https://openrouter.ai/api/v1',
            icon: 'https://openrouter.ai/favicon.ico'
        },
        {
            id: 'siliconflow',
            name: 'SiliconFlow',
            apiUrl: 'https://api.siliconflow.cn/v1',
            icon: 'https://siliconflow.cn/favicon.ico'
        },
        {
            id: 'bailian',
            name: '阿里百炼',
            apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            icon: 'https://www.aliyun.com/favicon.ico'
        },
        {
            id: 'zhipu',
            name: '智谱',
            apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
            icon: ''
        }
    ];

    // --- Connection status display state ---
    const apiStatus = ref('unknown'); // 'unknown', 'checking', 'connected', 'error'
    const apiLatency = ref(0);
    const imageGenStatus = ref('unknown');
    const imageGenLatency = ref(0);

    // --- API key input (sync/validation logic stays in app.mjs) ---
    const apiKeyInput = ref(null);
    const apiKeyVisible = ref(false);
    const toggleApiKeyVisibility = () => { apiKeyVisible.value = !apiKeyVisible.value; };

    // --- Custom provider definitions + pure resolvers ---
    const customApiProviderOption = {
        id: 'custom',
        name: '自定义',
        apiUrl: '',
        icon: ''
    };
    const customApiProviderOption2 = {
        id: 'custom2',
        name: '自定义2',
        apiUrl: '',
        icon: ''
    };
    const customApiProviderOptions = [customApiProviderOption, customApiProviderOption2];
    const isCustomApiProviderId = (id) => customApiProviderOptions.some(provider => provider.id === id);
    const getCustomApiUrlKey = (id) => id === 'custom2' ? 'customApiUrl2' : 'customApiUrl';
    const normalizeApiProviderUrl = (url) => String(url || '').replace(/\/+$/, '').toLowerCase();
    const getApiProviderById = (id) => apiProviderOptions.find(provider => provider.id === id);
    const getApiProviderByUrl = (url) => {
        const currentUrl = normalizeApiProviderUrl(url);
        return apiProviderOptions.find(provider => normalizeApiProviderUrl(provider.apiUrl) === currentUrl);
    };

    // --- Model browser state ---
    const modelSearchQuery = ref('');
    const activeModelTag = ref('all');
    const popularModelFamilies = ['claude', 'gemini', 'deepseek', 'llama', 'glm', 'minimax', 'moonshot', 'grok'];
    const availableModels = ref([]);
    const providerModels = reactive({});
    const activeProviderTag = ref('all');

    // --- Quality/balanced/fast mode selection (settings write-back stays in app.mjs) ---
    const currentModelMode = ref('quality');

    // --- Provider selector panel flag ---
    const showApiProviderSelector = ref(false);

    return {
        imageGenProviderOptions,
        getImageGenProviderById,
        imageGenUnavailable,
        apiProviderOptions,
        apiStatus,
        apiLatency,
        imageGenStatus,
        imageGenLatency,
        apiKeyInput,
        apiKeyVisible,
        toggleApiKeyVisibility,
        customApiProviderOption,
        customApiProviderOption2,
        customApiProviderOptions,
        isCustomApiProviderId,
        getCustomApiUrlKey,
        normalizeApiProviderUrl,
        getApiProviderById,
        getApiProviderByUrl,
        modelSearchQuery,
        activeModelTag,
        popularModelFamilies,
        availableModels,
        providerModels,
        activeProviderTag,
        currentModelMode,
        showApiProviderSelector
    };
}
