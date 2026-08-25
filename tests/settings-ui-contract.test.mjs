import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, styles] = await Promise.all([
    readFile(new URL('../src/components/views/SettingsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8')
]);

const settingsStart = 0;
const settingsEnd = html.length;
const settingsView = html;

test('设置页五个区块使用统一折叠卡片并保持原有顺序', () => {
    assert.ok(settingsEnd > settingsStart);
    assert.equal((settingsView.match(/class="settings-accordion-trigger"/g) || []).length, 5);

    for (const modifier of ['user', 'api', 'advanced', 'voice', 'local']) {
        assert.match(settingsView, new RegExp(`settings-accordion--${modifier}`));
    }

    const panelIds = [
        'user-settings-panel',
        'api-settings-panel',
        'advanced-settings-panel',
        'tts-settings-panel',
        'local-data-panel'
    ];
    const positions = panelIds.map(id => settingsView.indexOf(`id="${id}"`));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('用户与 API 设置默认折叠且语音区保持默认折叠', () => {
    assert.match(app, /const ttsSettingsExpanded = ref\(false\);/);
    assert.match(app, /const settingsSectionsOpen = reactive\(\{\s*user: false,\s*api: false,\s*advanced: false,\s*localData: false\s*\}\);/);
});

test('紧凑用户设置保留人设管理和全部编辑能力', () => {
    assert.match(settingsView, /user-settings-toolbar/);
    assert.match(settingsView, /user-settings-profile-trigger/);
    assert.match(settingsView, /@click="createNewProfile"/);
    assert.match(settingsView, /@click="deleteProfile\(activeProfileId\)"/);
    assert.match(settingsView, /@change="handleUserAvatarUpload"/);
    assert.match(settingsView, /v-model="user\.name"/);
    assert.match(settingsView, /@click="togglePerson\('second'\)"/);
    assert.match(settingsView, /@click="togglePerson\('third'\)"/);
    assert.match(settingsView, /v-model="user\.description"/);
});

test('设置卡片包含窄屏布局和低亮度深色覆盖', () => {
    assert.match(styles, /\.settings-stack\s*\{/);
    assert.match(styles, /\.settings-accordion-trigger\s*\{/);
    assert.match(styles, /@media \(max-width: 640px\)/);
    assert.match(styles, /\[data-theme='dark'\] \.settings-accordion\s*\{/);
    assert.match(styles, /\[data-theme='dark'\] \.settings-panel-body\s*\{/);
    assert.match(styles, /background: #151d27;/);
});
