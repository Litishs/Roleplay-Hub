import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import localTtsEngine from '../assets/js/tts-local-engine.js';

const [html, app, mainActivity, pluginSource, buildGradle, gitignore] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/LocalTTSPlugin.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8')
]);

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
        assert.match(voice.url, /^https:\/\//);
        assert.match(voice.url, /\.tar\.bz2$/);
        assert.match(voice.mirrorUrl, /^https:\/\//);
        assert.equal(typeof voice.sizeMb, 'number');
        assert.ok(voice.sizeMb > 0);
    }
});

test('tts-local-engine degrades gracefully without Capacitor', async () => {
    const status = localTtsEngine.getStatus();
    assert.equal(status.available, false);
    assert.equal(status.checked, false);
    await assert.rejects(() => localTtsEngine.speak({ text: 'test' }), /plugin unavailable|No local voice/);
});

test('index.html loads tts-local-engine.js between tts-engine.js and app.js', () => {
    const appIdx = html.indexOf('assets/js/app.js');
    const engineIdx = html.indexOf('assets/js/tts-engine.js');
    const localIdx = html.indexOf('assets/js/tts-local-engine.js');
    assert.ok(engineIdx > 0 && engineIdx < appIdx);
    assert.ok(localIdx > engineIdx && localIdx < appIdx);
});

test('index.html renders local voice management UI and drops the placeholder', () => {
    assert.match(html, /v-else class="bg-gray-50\/60 p-3 rounded-xl border border-gray-100 space-y-3"/);
    assert.match(html, /installLocalTtsVoice\(voice\.id\)/);
    assert.match(html, /removeLocalTtsVoice\(voice\.id\)/);
    assert.match(html, /cancelLocalTtsInstall/);
    assert.match(html, /localTtsInstallPercent/);
    assert.match(html, /v-model="settings\.ttsLocalVoice"/);
    assert.match(html, /localTtsVoiceOptions/);
    assert.doesNotMatch(html, /暂未接入/);
});

test('app.js marks the local engine available and dispatches speak by service', () => {
    assert.match(app, /\{ id: 'local', name: '本地模型', desc: 'On-device neural TTS, voices download on demand', available: true \}/);
    assert.match(app, /ttsLocalVoice: ''/);
    assert.match(app, /const speakTtsText = async \(text\) => \{/);
    assert.match(app, /settings\.ttsService === 'local'/);
    assert.match(app, /globalThis\.RPHLocalTts/);
    assert.match(app, /const speakTtsTextViaSystem = async \(text\) => \{/);
    assert.match(app, /falling back to system TTS/);
    assert.match(app, /const stopSpeaking = async \(\) => \{/);
    assert.match(app, /await localEngine\.stop\(\)/);
    assert.match(app, /localTtsStatus, localTtsVoices, localTtsInstall, localTtsInstallPercent, localTtsVoiceOptions,/);
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
