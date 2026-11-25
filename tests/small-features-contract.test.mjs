// Small-features pack (2026-11-25): SecretInput, message-aware toast icons and
// the plaza theme bridge. Text assertions mostly, plus the pure toast rule map.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { getToastIcon } from '../src/modules/toast-icons.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('toast icons map common messages and stay silent otherwise', () => {
    assert.equal(getToastIcon('已复制到剪贴板'), 'icon-copy');
    assert.equal(getToastIcon('已保存'), 'icon-check');
    assert.equal(getToastIcon('已删除该对话'), 'icon-delete');
    assert.equal(getToastIcon('已导入角色卡'), 'icon-import');
    assert.equal(getToastIcon('已导出备份'), 'icon-export');
    assert.equal(getToastIcon('保存失败'), 'icon-alert');
    assert.equal(getToastIcon('请先选择角色'), 'icon-info');
    assert.equal(getToastIcon('普通提示'), '');
    assert.equal(getToastIcon(null), '');
});

test('the sprite carries the icons the toast rules use', async () => {
    const html = await read('index.html');
    for (const icon of ['icon-copy', 'icon-check', 'icon-alert', 'icon-info']) {
        assert.match(html, new RegExp(`<symbol id="${icon}"`), `${icon} must exist in the sprite`);
    }
});

test('showToast attaches the message-aware icon; the toast renders it', async () => {
    const app = await read('src/modules/app.mjs');
    assert.match(app, /import \{ getToastIcon \} from '\.\/toast-icons\.mjs'/);
    assert.match(app, /toasts\.value\.push\(\{ id, message, type, action, icon: getToastIcon\(message\) \}\)/);

    const toast = await read('src/components/common/ToastNotification.vue');
    assert.match(toast, /v-if="toast\.icon"/);
    assert.match(toast, /<use :href="'#' \+ toast\.icon"><\/use>/);
    assert.match(toast, /toastIconClass/);
});

test('SecretInput never logs and copies via the clipboard with a fallback', async () => {
    const component = await read('src/components/common/SecretInput.vue');
    assert.match(component, /emits: \['update:modelValue'\]/);
    assert.match(component, /navigator\.clipboard\.writeText\(value\)/);
    assert.match(component, /document\.execCommand\('copy'\)/);
    assert.doesNotMatch(component, /console\.(log|info|warn|error)/, 'secret values must never be logged');
    assert.match(component, /visible \? 'text' : 'password'/);
});

test('every key field goes through SecretInput', async () => {
    for (const file of [
        'src/components/settings/ApiConfig.vue',
        'src/components/settings/TtsSettings.vue',
        'src/components/views/WorldInfoPanel.vue'
    ]) {
        const source = await read(file);
        assert.match(source, /SecretInput/, `${file} must import SecretInput`);
        assert.match(source, /<secret-input/, `${file} must render the component`);
        assert.doesNotMatch(source, /type="password"/, `${file} still has a raw password input`);
    }

    // The main API key field keeps its paste/visibility buttons; copy joins them.
    const api = await read('src/components/settings/ApiConfig.vue');
    assert.match(api, /copyApiKeyToClipboard/);
    assert.match(api, /title="复制 API Key"/);
});

test('SecretInput actions reveal on focus or hover only', async () => {
    const css = await read('assets/css/styles.css');
    assert.match(css, /\.secret-input__actions\s*\{[\s\S]*?opacity:\s*0/);
    assert.match(css, /\.secret-input:focus-within \.secret-input__actions\s*\{/);
    assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\.secret-input:hover \.secret-input__actions/);
});

test('plaza theme bridge validates origin and source before replying', async () => {
    const app = await read('src/modules/app.mjs');
    assert.match(app, /const handleSquareThemeMessage = \(event\) => \{/);
    assert.match(app, /event\.data\?\.type !== 'RPH_FORUM_THEME_REQUEST'/);
    assert.match(app, /event\.source !== frame\.contentWindow/);
    assert.match(app, /if \(event\.origin !== origin\) return;/);
    assert.match(app, /target\.postMessage\(\{ type: 'RPHUB_THEME', theme: getResolvedTheme\(\) \}, origin\)/);
    assert.match(app, /window\.addEventListener\('message', handleSquareThemeMessage\)/);
    // Theme changes push to the plaza without waiting for a new request.
    assert.match(app, /broadcastSquareTheme\(\);\s*\n\s*\};\s*\n\s*watch\(\(\) => settings\.themeMode/);
});