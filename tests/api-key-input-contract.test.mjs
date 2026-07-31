import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8'),
]);

test('API Key input explicitly synchronizes WebView password and paste events', () => {
    assert.match(html, /ref="apiKeyInput"\s+v-model="settings\.apiKey"/);
    assert.match(html, /@input="syncApiKeyInput"\s+@change="syncApiKeyInput"/);
    assert.match(html, /@compositionend="syncApiKeyInput"\s+@blur="syncApiKeyInput"/);
});

test('API actions read the live input before validation or iframe sync', () => {
    assert.match(app, /const fetchModels = async \(isManual = false\) => \{\s+const apiKey = syncApiKeyInput\(\)/);
    assert.match(app, /const checkApiStatus = async \(\) => \{\s+syncApiKeyInput\(\)/);
    assert.match(app, /const syncSettingsToGenerator = \(\) => \{\s+syncApiKeyInput\(\)/);
});
