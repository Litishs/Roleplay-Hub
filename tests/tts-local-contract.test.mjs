import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import localTtsEngine from '../src/modules/tts-local-engine.mjs';

const [html, app, mainActivity, pluginSource, buildGradle, gitignore, ttsHtml, settingsState] = await Promise.all([
    readFile(new URL('../src/components/views/SettingsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/LocalTTSPlugin.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/TtsSettings.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8')
]);
    const mainJs = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test('tts-local-engine.js exposes engine API and voice catalog', () => {
    assert.equal(typeof localTtsEngine.getStatus, 'function');
    assert.equal(typeof localTtsEngine.refreshStatus, 'function');
    assert.equal(typeof localTtsEngine.voices, 'function');
    assert.equal(typeof localTtsEngine.install, 'function');
    assert.equal(typeof localTtsEngine.cancelInstall, 'function');
    assert.equal(typeof localTtsEngine.remove, 'function');
    assert.equal(typeof localTtsEngine.speak, 'function');
    assert.equal(typeof localTtsEngine.stop, 'function');
    assert.equal(typeof localTtsEngine.onState, 'function');
    assert.equal(typeof localTtsEngine.onProgress, 'function');
    assert.ok(Array.isArray(localTtsEngine.VOICES) && localTtsEngine.VOICES.length >= 2);
});

test('voice catalog entries have https urls, mirrors, sizes and unique ids', () => {
    const ids = new Set();
    for (const voice of localTtsEngine.VOICES) {
        assert.match(voice.id, /^[\w.-]+$/);
        assert.ok(!ids.has(voice.id), `duplicate voice id: ${voice.id}`);
        ids.add(voice.id);
        assert.equal(typeof voice.sizeMb, 'number');
        assert.ok(voice.sizeMb > 0);
        if (Array.isArray(voice.files)) {
            // Multi-file bundle (ZipVoice model archive + raw vocoder)
            assert.equal(voice.type, 'zipvoice');
            assert.ok(voice.files.length > 0);
            for (const file of voice.files) {
                assert.match(file.url, /^https:\/\//);
                assert.equal(typeof file.kind, 'string');
                assert.ok(file.kind === 'archive' || file.kind === 'raw');
                if (file.kind === 'archive') assert.match(file.url, /\.tar\.bz2$/);
                if (file.mirrorUrl) assert.match(file.mirrorUrl, /^https:\/\//);
            }
        } else {
            assert.match(voice.url, /^https:\/\//);
            assert.match(voice.url, /\.tar\.bz2$/);
            assert.match(voice.mirrorUrl, /^https:\/\//);
        }
    }
});

test('tts-local-engine degrades gracefully without Capacitor', async () => {
    const status = localTtsEngine.getStatus();
    assert.equal(status.available, false);
    assert.equal(status.checked, false);
    await assert.rejects(() => localTtsEngine.speak({ text: 'test' }), /plugin unavailable|No local voice/);
});


test('TtsSettings.vue renders local voice management UI and drops the placeholder', () => {
    assert.match(ttsHtml, /v-else class="bg-gray-50\/60 p-3 rounded-xl border border-gray-100 space-y-3"/);
    assert.match(ttsHtml, /installLocalTtsVoice\(voice\.id\)/);
    assert.match(ttsHtml, /removeLocalTtsVoice\(voice\.id\)/);
    assert.match(ttsHtml, /cancelLocalTtsInstall/);
    assert.match(ttsHtml, /localTtsInstallPercent/);
    assert.match(ttsHtml, /v-model="settings\.ttsLocalVoice"/);
    assert.match(ttsHtml, /localTtsVoiceOptions/);
    assert.doesNotMatch(ttsHtml, /暂未接入/);
});

test('TtsSettings.vue renders clone voice reference controls for ZipVoice voices', () => {
    assert.match(ttsHtml, /localTtsSelectedVoiceIsClone/);
    assert.match(ttsHtml, /handleVoiceClipUpload/);
    assert.match(ttsHtml, /removeVoiceClip/);
    assert.match(ttsHtml, /v-model="settings\.ttsCloneReferenceText"/);
    assert.match(ttsHtml, /cloneVoiceReady/);
    assert.match(ttsHtml, /accept="audio\/\*"/);
});

test('app.js marks the local engine available and dispatches speak by service', () => {
    assert.match(app, /\{ id: 'local', name: '本地模型', desc: 'On-device neural TTS, voices download on demand', available: true \}/);
    assert.match(settingsState, /ttsLocalVoice: ''/);
    assert.match(app, /const speakTtsText = async \(text\) => \{/);
    assert.match(app, /settings\.ttsService === 'local'/);
    assert.match(app, /\bRPHLocalTts\b/);
    assert.match(app, /const speakTtsTextViaSystem = async \(text\) => \{/);
    assert.match(app, /falling back to system TTS/);
    assert.match(app, /const stopSpeaking = async \(\) => \{/);
    assert.match(app, /await localEngine\.stop\(\)/);
    assert.match(app, /localTtsStatus, localTtsVoices, localTtsInstall, localTtsInstallPercent, localTtsVoiceOptions,/);
    assert.match(app, /localTtsSelectedVoiceIsClone/);
    assert.match(app, /referenceUri = settings\.ttsCloneReferenceUri/);
    assert.match(app, /referenceText = settings\.ttsCloneReferenceText/);
    assert.match(app, /ttsLocalClearReference/);
});

test('MainActivity registers LocalTTSPlugin and the plugin exposes the method group', () => {
    assert.match(mainActivity, /registerPlugin\(LocalTTSPlugin\.class\);/);
    assert.match(pluginSource, /@CapacitorPlugin\(name = "LocalTTS"\)/);
    assert.match(pluginSource, /public void ttsLocalStatus\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalListVoices\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalDownload\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalDownloadCancel\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalDelete\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalSpeak\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalStop\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsLocalClearReference\(PluginCall call\)/);
});

test('LocalTTSPlugin uses sherpa-onnx streaming synthesis and AudioTrack playback', () => {
    assert.match(pluginSource, /new OfflineTts\(null, config\)/);
    assert.match(pluginSource, /generateWithCallback/);
    assert.match(pluginSource, /session\.sampleRate\(\)/);
    assert.match(pluginSource, /AudioTrack\.MODE_STREAM/);
    assert.match(pluginSource, /WRITE_BLOCKING/);
    assert.match(pluginSource, /requestAudioFocus|AudioFocusRequest/);
    assert.match(pluginSource, /notifyListeners\(EVENT_STATE, payload\)/);
    assert.match(pluginSource, /notifyListeners\(EVENT_MODEL, payload\)/);
    assert.match(pluginSource, /tts\.release\(\)/);
});

test('LocalTTSPlugin downloads, verifies and extracts tar.bz2 voice bundles', () => {
    assert.match(pluginSource, /TarArchiveInputStream/);
    assert.match(pluginSource, /BZip2CompressorInputStream/);
    assert.match(pluginSource, /HttpURLConnection/);
    assert.match(pluginSource, /MessageDigest\.getInstance\("SHA-256"\)/);
    assert.match(pluginSource, /getCanonicalPath/);
    assert.match(pluginSource, /renameTo\(target\)/);
});

test('build.gradle wires the AAR, kotlin-stdlib, commons-compress and arm64 filter', () => {
    assert.match(buildGradle, /include: \['\*\.jar', '\*\.aar'\], dir: 'libs'/);
    assert.match(buildGradle, /org\.apache\.commons:commons-compress:1\.27\.1/);
    assert.match(buildGradle, /org\.jetbrains\.kotlin:kotlin-stdlib/);
    assert.match(buildGradle, /abiFilters 'arm64-v8a'/);
});

test('prepare-local-tts script exists and libs dir stays untracked', async () => {
    await access(new URL('../scripts/prepare-local-tts.mjs', import.meta.url));
    const script = await readFile(new URL('../scripts/prepare-local-tts.mjs', import.meta.url), 'utf8');
    assert.match(script, /sherpa-onnx/);
    assert.match(script, /SHERPA_ONNX_MIRROR_URL/);
    assert.match(gitignore, /android\/app\/libs\//);
});


test('src/main.js imports tts-local-engine.js', () => {
    assert.ok(app.includes('./tts-local-engine.mjs'));
});
