// Contract tests for the API settings page upstream sync (2026-09):
// Task A - merged slot selector: ApiConfig.vue opens the model picker in
//   'quickModels' mode; ModalDialog.vue shows a 3-slot tab bar and commits
//   through app.mjs selectQuickModels.
// Task B - image-gen status: checkImageGenStatus probes IMAGE_GEN_BASE_URL
//   and fetchQuota restores the real /api/api/getUser request.
// See documents/API连接与服务页-上游同步工程方案.md
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [apiConfigHtml, modalDialogHtml, app, settingsStateSource, apiConfigSource] = await Promise.all([
    readFile(new URL('../src/components/settings/ApiConfig.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/ModalDialog.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useApiConfig.mjs', import.meta.url), 'utf8'),
]);

// --- Task A: merged slot selector ---

test('ApiConfig.vue collapses the three preset slots into one quickModels selector', () => {
    assert.match(apiConfigHtml, /@click="openModelSelector\('quickModels'\)"/,
        'the merged dropdown must open the picker in quickModels mode');
    assert.match(apiConfigHtml,
        /已配置 \{\{ \[settings\.qualityModel, settings\.balancedModel, settings\.fastModel\]\.filter\(Boolean\)\.length \}\} \/ 3 个槽位/,
        'the dropdown must show the configured / 3 slots summary');
    // The three independent slot inputs are gone.
    assert.ok(!apiConfigHtml.includes("openModelSelector('qualityModel')"), 'qualityModel slot input removed');
    assert.ok(!apiConfigHtml.includes("openModelSelector('balancedModel')"), 'balancedModel slot input removed');
    assert.ok(!apiConfigHtml.includes("openModelSelector('fastModel')"), 'fastModel slot input removed');
});

test('ModalDialog.vue supports the slot-batch mode next to single-model mode', () => {
    assert.match(modalDialogHtml, /const isSlotMode = computed\(\(\) => ctx\.modelSelectionTarget && ctx\.modelSelectionTarget\.value === 'quickModels'\)/,
        'slot mode is derived solely from modelSelectionTarget === quickModels');
    assert.match(modalDialogHtml, /const draftSlotModels = ref\(\[\'', '', ''\]\)/,
        'slot drafts preload as three empty strings');
    assert.match(modalDialogHtml, /const chooseSlotModel = \(modelId\) => \{/);
    assert.match(modalDialogHtml, /draftSlotModels\.value\[idx\] = draftSlotModels\.value\[idx\] === modelId \? '' : modelId;/,
        'clicking the same model again clears the slot');
    assert.match(modalDialogHtml, /ctx\.selectQuickModels\?\.\(\[\.\.\.draftSlotModels\.value\]\)/,
        'closing the picker commits drafts via appContext selectQuickModels');
    assert.match(modalDialogHtml, /@click="isSlotMode \? chooseSlotModel\(model\.id\) : selectModel\(model\.id, model\._providerId\)"/,
        'single-model mode keeps using selectModel');
});

test('app.mjs exposes selectQuickModels and commits all three slots', () => {
    assert.match(app, /const selectQuickModels = \(slotModels\) => \{/);
    assert.match(app, /settings\.qualityModel = slotModels\[0\] \|\| '';/);
    assert.match(app, /settings\.balancedModel = slotModels\[1\] \|\| '';/);
    assert.match(app, /settings\.fastModel = slotModels\[2\] \|\| '';/);
    assert.match(app, /modelMode\.value = modeMap\[nonEmptyIdx\];/,
        'the active chat mode follows the first non-empty slot');
    assert.match(app, /fetchModels, selectModel, selectQuickModels, sendMessage/,
        'selectQuickModels is exposed through appContext for ModalDialog');
});

// --- Task B: image-gen status + quota ---

test('ApiConfig.vue renders the image-gen card from live status and quota', () => {
    assert.match(apiConfigHtml,
        /imageGenStatus === 'connected' \? 'bg-green-500 shadow-green-200' :\s+imageGenStatus === 'checking' \? 'bg-yellow-400 animate-pulse shadow-yellow-200' :\s+imageGenStatus === 'error' \? 'bg-red-500 shadow-red-200' : 'bg-gray-300/,
        'the status dot is driven by imageGenStatus instead of a hardcoded gray');
    assert.match(apiConfigHtml, /\{\{ quotaValue \}\} 次/, 'remaining quota renders when available');
    assert.match(apiConfigHtml, /settings\.imageGenKey \? '查询失败' : '未配置密钥'/,
        'no key or a failed query falls back to readable text');
    assert.ok(!apiConfigHtml.includes('placeholder="生图服务暂不可用"'),
        'the hardcoded "unavailable" placeholder is gone from the key input');
    assert.ok(!apiConfigHtml.includes('type="password" :disabled="imageGenUnavailable"'),
        'the image-gen key input stays editable so quota can be queried');
});

test('app.mjs probes the image-gen service and folds it into checkAllStatuses', () => {
    assert.match(app, /const IMAGE_GEN_BASE_URL = 'https:\/\/nai\.sta1n\.cn';/,
        'image-gen base URL is a module-level constant');
    assert.match(app, /const checkImageGenStatus = async \(\) => \{/);
    assert.match(app, /signal => fetch\(IMAGE_GEN_BASE_URL, \{ method: 'HEAD', mode: 'no-cors', signal \}\),\s+\(\) => true/,
        'HEAD probe accepts the no-cors opaque response as connected');
    assert.match(app, /const checkAllStatuses = \(\) => \{\s+checkApiStatus\(\);\s+checkImageGenStatus\(\);\s+fetchQuota\(\);\s+\};/,
        'checkAllStatuses runs API status, image-gen status and quota');
});

test('app.mjs fetchQuota restores the real getUser request and error handling', () => {
    assert.match(app, /fetch\(\`\$\{IMAGE_GEN_BASE_URL\}\/api\/api\/getUser\`, \{/,
        'quota is fetched from the image-gen service');
    assert.match(app, /body: JSON\.stringify\(\{ toUserId: imageGenToken \}\)/,
        'the imageGenKey is sent as toUserId');
    assert.match(app, /catch \(e\) \{\s+console\.error\('Quota fetch error:', e\);\s+quotaError\.value = true;\s+\} finally \{/,
        'network/parse failures flip quotaError instead of silently zeroing');
    assert.ok(!app.includes('不再向任何生图服务商请求配额'), 'the disabled quota stub is removed');
});

// --- STA1N onboarding (default provider + image-gen recommendation) ---

test('STA1N is the default API provider and the image-gen section recommends it', () => {
    assert.match(settingsStateSource, /const DEFAULT_API_PROVIDER_ID = 'sta1n';/,
        'new installs default to the STA1N provider');
    assert.match(settingsStateSource, /apiUrl: 'https:\/\/cdn\.sta1n\.cn\/v1',/,
        'the default API config points at the STA1N gateway');
    assert.match(apiConfigSource, /id: 'sta1n',\s+name: 'STA1N API',\s+apiUrl: 'https:\/\/cdn\.sta1n\.cn\/v1'/,
        'STA1N is the first entry of the provider catalogue');
    assert.match(apiConfigHtml, /获取生图密钥/,
        'the image-gen settings section links to the key page');
    assert.match(apiConfigHtml, /推荐 STA1N 生图服务（nai\.sta1n\.cn）/,
        'the image-gen settings section spells out the STA1N site');
    assert.ok(apiConfigHtml.includes('placeholder="STA1N-..."'),
        'the image-gen key input hints the STA1N key format');
    assert.match(apiConfigHtml, /const openExternal = async \(url\) => \{/,
        'external links open via Capacitor Browser with a window.open fallback');
    assert.match(app,
        /if \(!getImageGenProviderById\(settings\.imageGenProviderId\)\) \{\s+settings\.imageGenProviderId = imageGenProviderOptions\[0\]\?\.id \|\| '';/,
        'legacy persisted provider ids are normalized after settings load');
});

test('the "获取API" link only shows while the STA1N provider is selected', () => {
    assert.match(apiConfigHtml,
        /<button type="button" v-if="selectedApiProvider\.id === 'sta1n'"\s+@click="openExternal\('https:\/\/cdn\.sta1n\.cn\/keys'\)"/,
        'the key-page shortcut is conditional on the STA1N provider');
});

test('the generation settings section collapses as an in-page accordion', () => {
    assert.match(apiConfigHtml, /const genSectionOpen = ref\(false\);/,
        'generation section starts collapsed');
    assert.match(apiConfigHtml, /@click="genSectionOpen = !genSectionOpen"/,
        'the section header toggles the accordion');
    assert.match(apiConfigHtml, /v-show="genSectionOpen"/,
        'cards stay mounted (v-show) so inputs keep their state');
});