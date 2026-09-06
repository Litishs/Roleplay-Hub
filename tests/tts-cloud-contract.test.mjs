import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ttsText from '../src/modules/tts-text.mjs';
import ttsCloudEngine from '../src/modules/tts-cloud-engine.mjs';

const [engineSource, app, settingsState, apiConfig, dataLoader, ttsHtml, storageRepo, capacitorConfig, mainActivity] = await Promise.all([
    readFile(new URL('../src/modules/tts-cloud-engine.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useApiConfig.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useDataLoader.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/TtsSettings.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/storage-repository.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url), 'utf8')
]);

// --- tts-text.splitSpeechChunks ---

test('splitSpeechChunks keeps short text whole and rejects blank', () => {
    assert.deepEqual(ttsText.splitSpeechChunks('你好世界'), ['你好世界']);
    assert.deepEqual(ttsText.splitSpeechChunks('   '), []);
    assert.deepEqual(ttsText.splitSpeechChunks(null), []);
});

test('splitSpeechChunks cuts long text at sentence boundaries', () => {
    const text = '第一句话。第二句话！第三句话？第四句话；第五句话。';
    const chunks = ttsText.splitSpeechChunks(text, 15);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.join(''), text);
    chunks.forEach((chunk) => assert.ok(chunk.length <= 15, `chunk too long: ${chunk}`));
});

test('splitSpeechChunks keeps closing quotes attached and hard-splits run-ons', () => {
    const quoted = '他说：「' + '啊'.repeat(30) + '。」然后转身离开。';
    const chunks = ttsText.splitSpeechChunks(quoted, 20);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.join('').length, quoted.length);
    // No sentence boundary at all: hard split still caps chunk length.
    const runOn = '字'.repeat(55);
    ttsText.splitSpeechChunks(runOn, 20).forEach((chunk) => assert.ok(chunk.length <= 20));
});

// --- tts-cloud-engine facade ---

test('tts-cloud-engine exposes the same facade shape as the system engine', () => {
    ['speak', 'stop', 'getStatus', 'refreshStatus', 'configure', 'onState'].forEach((fn) => {
        assert.equal(typeof ttsCloudEngine[fn], 'function', `${fn} missing`);
    });
});

test('tts-cloud-engine rejects speak before configuration and after configure guards', async () => {
    await assert.rejects(() => ttsCloudEngine.speak({ text: '测试' }), /Base URL/);
    ttsCloudEngine.configure({ baseUrl: 'https://api.example.com/v1/' });
    assert.equal(ttsCloudEngine.getStatus().available, true);
    await assert.rejects(() => ttsCloudEngine.speak({ text: '   ' }), /没有可朗读的文本/);
    await ttsCloudEngine.stop();
    ttsCloudEngine.configure({});
    assert.equal(ttsCloudEngine.getStatus().available, false);
});

// --- request contract (text assertions; fetch/audio need a WebView) ---

test('cloud engine posts the OpenAI-compatible speech contract', () => {
    assert.match(engineSource, /fetch\(`\$\{baseUrl\}\/audio\/speech`/);
    assert.match(engineSource, /'Authorization': `Bearer \$\{apiKey\}`/);
    assert.match(engineSource, /response_format: format/);
    assert.match(engineSource, /model: model \|\| 'tts-1'/);
    assert.match(engineSource, /AbortController/);
    assert.match(engineSource, /FETCH_TIMEOUT_MS = 30000/);
    assert.match(engineSource, /splitSpeechChunks/);
    assert.match(engineSource, /URL\.createObjectURL/);
    assert.match(engineSource, /URL\.revokeObjectURL/);
});

test('cloud engine never logs prompt text or the api key', () => {
    assert.doesNotMatch(engineSource, /console\.log/);
    assert.doesNotMatch(engineSource, /console\.(info|debug|error)/);
    // the only console call site is the warn-free engine; no text/key variable may be logged
    assert.doesNotMatch(engineSource, /console\.warn\([^)]*(safeText|apiKey|chunk)/);
});

// --- settings & persistence ---

test('cloud tts settings exist and the api key is secret-bearing', () => {
    assert.match(settingsState, /ttsCloudProviderId: 'custom'/);
    assert.match(settingsState, /ttsCloudBaseUrl: ''/);
    assert.match(settingsState, /ttsCloudModel: ''/);
    assert.match(settingsState, /ttsCloudVoice: ''/);
    assert.match(settingsState, /ttsCloudApiKey: ''/);
    assert.match(settingsState, /ttsCloudSpeed: 1\.0/);
    assert.match(storageRepo, /apiKey\|imageGenKey\|apiProviderKeys\|tavilyApiKey\|ttsCloudApiKey/);
});

test('useApiConfig exposes tts provider options with a custom escape hatch', () => {
    assert.match(apiConfig, /const ttsProviderOptions = \[/);
    assert.match(apiConfig, /id: 'openai',/);
    assert.match(apiConfig, /id: 'custom',/);
    assert.match(apiConfig, /name: '自定义（OpenAI 兼容）'/);
    assert.match(apiConfig, /getTtsProviderById/);
    assert.match(apiConfig, /ttsProviderOptions,\r?\n\s*getTtsProviderById,/);
});

test('saved ttsService=local migrates back to system on load', () => {
    assert.match(dataLoader, /if \(settings\.ttsService === 'local'\) settings\.ttsService = 'system';/);
});

// --- app.mjs orchestration ---

test('app.mjs wires the cloud engine with fallback to system voice', () => {
    assert.match(app, /import RPHCloudTts from '\.\/tts-cloud-engine\.mjs';/);
    assert.match(app, /\{ id: 'cloud', name: '云端 API'/);
    assert.match(app, /const syncCloudTtsConfig = \(\) => \{/);
    assert.match(app, /const speakTtsTextViaCloud = async \(text\) => \{/);
    assert.match(app, /settings\.ttsService === 'cloud'/);
    assert.match(app, /云端语音失败，改用系统语音朗读/);
    assert.match(app, /RPHCloudTts\.stop\(\)/);
    assert.match(app, /ttsCloudProviderOptions: ttsProviderOptions, ttsCloudVoiceOptions, ttsCloudModelOptions, onTtsCloudProviderChange,/);
    // local engine must stay gone
    assert.doesNotMatch(app, /tts-local-engine|LocalTTS|zipvoice|ZipVoice/);
});

test('TtsSettings.vue renders the cloud engine card and config form', () => {
    assert.match(ttsHtml, /selectTtsService\('cloud'\)/);
    assert.match(ttsHtml, /v-model="settings\.ttsCloudProviderId"/);
    assert.match(ttsHtml, /@change="onTtsCloudProviderChange"/);
    assert.match(ttsHtml, /v-model\.trim="settings\.ttsCloudBaseUrl"/);
    assert.match(ttsHtml, /type="password" v-model="settings\.ttsCloudApiKey"/);
    assert.match(ttsHtml, /v-model\.number="settings\.ttsCloudSpeed" min="0\.25" max="4"/);
    assert.match(ttsHtml, /ttsCloudModelOptions/);
    assert.match(ttsHtml, /ttsCloudVoiceOptions/);
    // pitch slider is disabled for the cloud engine
    assert.match(ttsHtml, /:disabled="settings\.ttsService === 'cloud'"/);
});

test('webview allows media playback without a user gesture (autoplay tts)', () => {
    assert.match(capacitorConfig, /"mediaPlaybackRequiresUserGesture": false/);
});

test('local tts native plugin stays unregistered and system tts keeps working', () => {
    assert.doesNotMatch(mainActivity, /LocalTTSPlugin/);
    assert.match(mainActivity, /registerPlugin\(TTSSpeechPlugin\.class\);/);
});
