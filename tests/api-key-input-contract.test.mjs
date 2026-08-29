import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, settingsHtml, app, apiConfigHtml, apiConfigState] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/SettingsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/ApiConfig.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useApiConfig.mjs', import.meta.url), 'utf8'),
]);

test('API Key input explicitly synchronizes WebView password and paste events', () => {
    assert.match(apiConfigHtml, /ref="apiKeyInput"\s+v-model="settings\.apiKey"/);
    assert.match(apiConfigHtml, /@input="syncApiKeyInput"\s+@change="syncApiKeyInput"/);
    assert.match(apiConfigHtml, /@compositionend="syncApiKeyInput"\s+@blur="syncApiKeyInput"/);
});

test('API actions read the live input before validation or iframe sync', () => {
    assert.match(app, /const fetchModels = async \(isManual = false\) => \{\s+const apiKey = syncApiKeyInput\(\)/);
    assert.match(app, /const checkApiStatus = async \(\) => \{\s+syncApiKeyInput\(\)/);
    assert.match(app, /const syncSettingsToGenerator = \(\) => \{\s+syncApiKeyInput\(\)/);
});

test('API Key input supports show/hide visibility toggle and paste from clipboard', () => {
    assert.match(apiConfigHtml, /:type="apiKeyVisible \? 'text' : 'password'"/);
    assert.match(apiConfigHtml, /@click="toggleApiKeyVisibility"/);
    assert.match(apiConfigHtml, /@click="pasteApiKeyFromClipboard"/);
    assert.match(apiConfigHtml, /autocomplete="off"\s+autocapitalize="none"\s+autocorrect="off"\s+spellcheck="false"/);
});

test('pasteApiKeyFromClipboard prefers the native clipboard plugin and writes settings.apiKey', () => {
    // apiKeyVisible lives in useApiConfig (Phase 2)
    assert.match(apiConfigState, /const apiKeyVisible = ref\(false\);/);
    assert.match(app, /const pasteApiKeyFromClipboard = async \(\) => \{/);
    assert.match(app, /window\.Capacitor\?\.Plugins\?\.NativeStorage/);
    assert.match(app, /typeof native\.clipboardRead === 'function'/);
    assert.match(app, /settings\.apiKey = text;/);
});

test('Android NativeStoragePlugin exposes clipboardRead', async () => {
    const java = await readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url), 'utf8');
    assert.match(java, /@PluginMethod\s+public void clipboardRead\(PluginCall call\)/);
    assert.match(java, /ClipboardManager clipboard = \(ClipboardManager\) getContext\(\)\.getSystemService\(Context\.CLIPBOARD_SERVICE\);/);
});
