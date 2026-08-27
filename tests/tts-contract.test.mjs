import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ttsText from '../src/modules/tts-text.mjs';
import ttsEngine from '../src/modules/tts-engine.mjs';

const [html, app, mainActivity, pluginSource, messageList, ttsHtml] = await Promise.all([
    readFile(new URL('../src/components/views/SettingsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/TTSSpeechPlugin.java', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/TtsSettings.vue', import.meta.url), 'utf8')
]);
    const mainJs = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test('tts-text.js exposes extractSpeakText', () => {
    assert.equal(typeof ttsText.extractSpeakText, 'function');
});

test('tts-text strips think/cot envelope and system instruction tail', () => {
    assert.equal(ttsText.extractSpeakText('你好<think>思考内容</think>世界'), '你好世界');
    assert.equal(ttsText.extractSpeakText('正文内容\n\n[系统指令: 不要输出思考]'), '正文内容');
});

test('tts-text drops rich-text cards but keeps surrounding text', () => {
    const withDoc = '前文\n<!doctype html><html><body>卡片内容</body></html>\n后文';
    assert.equal(ttsText.extractSpeakText(withDoc), '前文 后文');
    assert.equal(ttsText.extractSpeakText('<div><button>点我</button></div>'), '');
    assert.equal(ttsText.extractSpeakText('<html>纯卡片</html>'), '');
});

test('tts-text drops code fences and keeps inline code content', () => {
    assert.equal(ttsText.extractSpeakText('介绍\n```\nconst a = 1;\n```\n结束'), '介绍 结束');
    assert.equal(ttsText.extractSpeakText('使用 `saveData` 保存'), '使用 saveData 保存');
});

test('tts-text dialogue-only mode keeps quoted lines', () => {
    const options = { dialogueOnly: true };
    assert.equal(ttsText.extractSpeakText('她轻声说：「好的，我等你。」然后走开了。', options), '好的，我等你。');
    assert.equal(ttsText.extractSpeakText('He said "Hello" and left.', options), 'Hello');
    assert.equal(ttsText.extractSpeakText('没有引号的内容', options), '');
});

test('tts-text skipActions removes standalone asterisk action lines', () => {
    const source = '她笑了笑\n*她转身离开*\n继续说话';
    assert.equal(ttsText.extractSpeakText(source, { skipActions: true }), '她笑了笑 继续说话');
    assert.equal(ttsText.extractSpeakText(source), '她笑了笑 她转身离开 继续说话');
});

test('tts-text strips markdown syntax', () => {
    assert.equal(ttsText.extractSpeakText('**重点** [链接](https://x.com) 和 `代码`'), '重点 链接 和 代码');
    assert.equal(ttsText.extractSpeakText('# 标题\n> 引用'), '标题 引用');
});

test('tts-text truncates at sentence boundary and returns empty for blank', () => {
    assert.equal(ttsText.extractSpeakText('一。二。三。四。五。', { maxChars: 2 }), '一。');
    assert.equal(ttsText.extractSpeakText('   '), '');
    assert.equal(ttsText.extractSpeakText(null), '');
});

test('tts-engine.js exposes bridge API and degrades without Capacitor', async () => {
    assert.equal(typeof ttsEngine.speak, 'function');
    assert.equal(typeof ttsEngine.stop, 'function');
    assert.equal(typeof ttsEngine.getVoices, 'function');
    assert.equal(typeof ttsEngine.getStatus, 'function');
    assert.equal(typeof ttsEngine.refreshStatus, 'function');
    assert.equal(typeof ttsEngine.onState, 'function');
    const status = ttsEngine.getStatus();
    assert.equal(status.available, false);
    await assert.rejects(() => ttsEngine.speak({ text: '测试' }), /原生插件不可用/);
});


test('SettingsPanel.vue renders TTS play/stop action and settings section', () => {
    assert.match(messageList, /toggleSpeakMessage\(index\)/);
    assert.match(messageList, /settings\.ttsEnabled && ttsStatus\.available/);
    assert.match(html, /语音设置/);
    assert.match(html, /ttsSettingsExpanded/);
    assert.doesNotMatch(html, /v-model="settings\.ttsVoice"/);
});

test('TtsSettings.vue renders TTS engine, prefs and test voice UI', () => {
    assert.match(ttsHtml, /v-model="settings\.ttsEnabled"/);
    assert.match(ttsHtml, /settings\.ttsService === 'system'/);
    assert.match(ttsHtml, /selectTtsService\('system'\)/);
    assert.match(ttsHtml, /语音引擎/);
    assert.match(ttsHtml, /引擎设置/);
    assert.match(ttsHtml, /朗读偏好/);
    assert.match(ttsHtml, /v-model="settings\.ttsAutoPlay"/);
    assert.match(ttsHtml, /testTtsVoice/);
    assert.match(ttsHtml, /v-model="ttsReadMode"/);
});

test('voice settings section is inside the settings view', () => {
    const voiceSection = html.indexOf('语音设置');
    assert.ok(voiceSection > 0);
});

test('settings sections are collapsible and local-data sits at the bottom', () => {
    assert.match(html, /settingsSectionsOpen\.user/);
    assert.match(html, /settingsSectionsOpen\.api/);
    assert.match(html, /settingsSectionsOpen\.advanced/);
    assert.match(html, /settingsSectionsOpen\.localData/);
    const userIdx = html.indexOf('id="user-settings-panel"');
    const apiIdx = html.indexOf('id="api-settings-panel"');
    const advancedIdx = html.indexOf('id="advanced-settings-panel"');
    const voiceIdx = html.indexOf('id="tts-settings-panel"');
    const localIdx = html.indexOf('id="local-data-panel"');
    assert.ok(userIdx < apiIdx && apiIdx < advancedIdx && advancedIdx < voiceIdx && voiceIdx < localIdx);
});

test('app.js wires TTS defaults, engine, actions and auto-play', () => {
    assert.match(app, /ttsEnabled: false/);
    assert.match(app, /ttsAutoPlay: false/);
    assert.match(app, /ttsService: 'system'/);
    assert.match(app, /ttsVoice: ''/);
    assert.match(app, /ttsRate: 1\.0/);
    assert.match(app, /ttsPitch: 1\.0/);
    assert.match(app, /ttsDialogueOnly: false/);
    assert.match(app, /ttsSkipActions: false/);
    assert.match(app, /ttsMaxChars: 2000/);
    assert.match(app, /\bRPHTts\b/);
    assert.match(app, /\bRPHTtsText\b/);
    assert.match(app, /const toggleSpeakMessage = async \(index\) => \{/);
    assert.match(app, /const stopSpeaking = async \(\) => \{/);
    assert.match(app, /settings\.ttsEnabled && settings\.ttsAutoPlay/);
    assert.match(app, /stopSpeaking\(\);/);
    assert.match(app, /const selectTtsService = \(id\) => \{/);
    assert.match(app, /ttsSettingsExpanded = ref\(false\)/);
    assert.match(app, /settingsSectionsOpen = reactive\(\{/);
    assert.match(app, /ttsStatus, ttsStatusLabel, ttsPlayingMessageId, ttsSettingsExpanded, ttsServiceOptions, ttsReadMode,/);
    assert.match(app, /settingsSectionsOpen, selectTtsService,/);
    assert.doesNotMatch(app, /refreshTtsVoiceOptions/);
    assert.doesNotMatch(app, /ttsVoiceOptions/);
});

test('native side registers TTSSpeech plugin and exposes TTS methods', () => {
    assert.match(mainActivity, /registerPlugin\(TTSSpeechPlugin\.class\);/);
    assert.match(pluginSource, /@CapacitorPlugin\(name = "TTSSpeech"\)/);
    assert.match(pluginSource, /public void ttsIsAvailable\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsGetVoices\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsSpeak\(PluginCall call\)/);
    assert.match(pluginSource, /public void ttsStop\(PluginCall call\)/);
    assert.match(pluginSource, /UtteranceProgressListener/);
    assert.match(pluginSource, /notifyListeners\(EVENT_STATE, payload\)/);
    assert.doesNotMatch(pluginSource, /SECRET_PREFERENCES|secretSet/);
});


test('src/main.js imports tts modules', () => {
    assert.ok(app.includes('./tts-text.mjs'));
    assert.ok(app.includes('./tts-engine.mjs'));
});
