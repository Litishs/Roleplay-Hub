import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, styles, presetManager, settingsState, sideNav, indexHtml, dataManager] = await Promise.all([
    readFile(new URL('../src/components/views/SettingsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/PresetManager.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/SideNav.vue', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/DataManager.vue', import.meta.url), 'utf8')
]);

const settingsStart = 0;
const settingsEnd = html.length;
const settingsView = html;

test('设置页五个区块按四组排列并保持原有顺序', () => {
    assert.ok(settingsEnd > settingsStart);
    assert.equal((settingsView.match(/class="settings-accordion-trigger"/g) || []).length, 5);

    // 2026-11-12 grouped redesign: section captions carry the grouping.
    const captions = ['账户', '连接与模型', '外观与语音', '数据'];
    const captionPositions = captions.map(label => settingsView.indexOf(`class="settings-group-caption">${label}`));
    assert.ok(captionPositions.every(position => position > -1), `group captions must exist: ${captions.join(', ')}`);
    assert.deepEqual([...captionPositions].sort((a, b) => a - b), captionPositions, 'group captions keep their order');
    // Each caption is owned by a group section with an accessible label.
    assert.equal((settingsView.match(/class="settings-group"/g) || []).length, 4);
    assert.equal((settingsView.match(/class="settings-group-card"/g) || []).length, 4);
    // The per-section accent modifiers are gone: the five icons share one system.
    for (const modifier of ['api', 'advanced', 'voice', 'local']) {
        assert.doesNotMatch(settingsView, new RegExp(`settings-accordion--${modifier}`));
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
    // The plugin marketplace is a standalone sidebar view (plugins-panel), not a settings collapsible section
    assert.doesNotMatch(settingsView, /plugins-settings-panel/);
});

test('plugin marketplace is a standalone sidebar view', () => {
    assert.match(app, /PluginsPanel: AsyncPluginsPanel/);
    assert.match(app, /const AsyncPluginsPanel = defineAsyncComponent\(\(\) => import\('\.\.\/components\/views\/PluginsPanel\.vue'\)\);/);
    assert.match(indexHtml, /<plugins-panel v-if="currentView === 'plugins'"><\/plugins-panel>/);
    // The sidebar entry comes after "Character Management" (character button first, then the marketplace button)
    // 2026-11-12: the character manager moved out of the sidebar (it now lives
    // behind the home header), so the order check anchors on 会话 instead.
    assert.ok(
        sideNav.indexOf("currentView = 'home'") < sideNav.indexOf("currentView = 'plugins'"),
        'sidebar order: conversation list before the plugin marketplace'
    );
});

test('用户与 API 设置默认折叠且语音区保持默认折叠', () => {
    assert.match(app, /const ttsSettingsExpanded = ref\(false\);/);
    // settingsSectionsOpen lives in useSettingsState (Phase 2)
    assert.match(settingsState, /const settingsSectionsOpen = reactive\(\{\s*user: false,\s*api: false,\s*advanced: false,\s*localData: false\s*\}\);/);
});

test('紧凑用户设置保留人设管理和全部编辑能力', () => {
    assert.match(presetManager, /user-settings-toolbar/);
    assert.match(presetManager, /user-settings-profile-trigger/);
    assert.match(presetManager, /@click="createNewProfile"/);
    assert.match(presetManager, /@click="deleteProfile\(activeProfileId\)"/);
    assert.match(presetManager, /@change="handleUserAvatarUpload"/);
    assert.match(presetManager, /v-model="user\.name"/);
    assert.match(presetManager, /@click="togglePerson\('second'\)"/);
    assert.match(presetManager, /@click="togglePerson\('third'\)"/);
    assert.match(presetManager, /v-model="user\.description"/);
});

test('头像徽标用相机图标，角色名输入框内用铅笔图标', () => {
    // The badge opens the image picker, so a camera says what happens; a pencil
    // there read as "edit the profile", which was the ambiguity to remove.
    const badge = presetManager.slice(
        presetManager.indexOf('user-settings-avatar-edit'),
        presetManager.indexOf('</span>', presetManager.indexOf('user-settings-avatar-edit'))
    );
    assert.ok(badge.includes('<circle'), 'the camera lens is present');
    assert.ok(!badge.includes('M15.232 5.232'), 'the old pencil path is gone from the badge');
    assert.match(presetManager, /title="更换头像" aria-label="更换头像"/);

    // The name field gets a pencil inside it, signalling editable text.
    assert.match(presetManager, /class="settings-form-control settings-form-control--with-icon"/);
    assert.ok(presetManager.includes('settings-form-control-icon'));
    // The in-field icon must be decorative: no pointer capture, and the input
    // reserves room so text never runs under it.
    assert.match(styles, /\.settings-form-control-icon \{[\s\S]{0,400}pointer-events: none;/);
    assert.match(styles, /input\.settings-form-control--with-icon \{\s*padding-right: 2\.25rem;/);
});

test('设置分组卡片包含窄屏布局和低亮度深色覆盖', () => {
    assert.match(styles, /\.settings-stack\s*\{/);
    assert.match(styles, /\.settings-group-caption\s*\{/);
    assert.match(styles, /\.settings-group-card\s*\{/);
    assert.match(styles, /\.settings-accordion \+ \.settings-accordion\s*\{[^}]*border-top/, 'rows in one group are split by a hairline');
    assert.match(styles, /@media \(max-width: 640px\)/);
    assert.match(styles, /\.settings-group-card\s*\{[\s\S]{0,220}background: var\(--surface-card-bg\)/, 'the card uses the shared surface token');
    assert.match(styles, /\[data-theme='dark'\] \{[\s\S]{0,1600}--surface-card-bg: #1a1a1a;/, 'dark card values come from the shared token');
    assert.match(styles, /\[data-theme='dark'\] \.settings-panel-body\s*\{/);
    assert.match(styles, /background: var\(--d-sunken\);/);
    // Icons are monochrome: no per-section tinted tiles left behind.
    assert.doesNotMatch(styles, /\.settings-accordion--(api|advanced|voice|local) \.settings-accordion-icon/);
});

test('状态用胶囊表达，错误不再与被美化数值同色', () => {
    assert.match(styles, /\.settings-accordion-badge\s*\{/);
    assert.match(styles, /\.settings-accordion-badge--bad\s*\{[^}]*color: #b91c1c/, 'failure badge has an explicit danger colour');
    assert.match(styles, /\.settings-accordion-badge--ok\s*\{[^}]*color: #047857/, 'healthy badge has an explicit success colour');
    assert.match(styles, /\[data-theme='dark'\] \.settings-accordion-badge--bad\s*\{[^}]*color: #f87171/, 'failure badge keeps its contrast in dark mode');

    // The panel derives tone from the connection state instead of printing text.
    assert.match(settingsView, /const apiBadge = computed\(\(\) => \{/);
    assert.match(settingsView, /status === 'connected'[\s\S]{0,120}settings-accordion-badge--ok/);
    assert.match(settingsView, /status === 'error'[\s\S]{0,120}settings-accordion-badge--bad/);
    assert.match(settingsView, /:class="apiBadge\.className"/);
});

test('每个可折叠行都保留 aria 与 inert 契约', () => {
    const triggers = settingsView.match(/class="settings-accordion-trigger"/g) || [];
    assert.equal(triggers.length, 5);
    // Four rows read settingsSectionsOpen.*, the voice row reads ttsSettingsExpanded;
    // the diagnostics help toggle is the only other aria-expanded in this view.
    const sectionExpanded = (settingsView.match(/:aria-expanded="settingsSectionsOpen\./g) || []).length;
    const ttsExpanded = (settingsView.match(/:aria-expanded="ttsSettingsExpanded"/g) || []).length;
    assert.equal(sectionExpanded + ttsExpanded, 5, 'every row reports its expanded state');
    assert.equal((settingsView.match(/class="settings-collapse"/g) || []).length, 5);
    assert.equal((settingsView.match(/:inert="/g) || []).length, 5, 'collapsed panels stay inert');
    // 本机数据 keeps its own value instead of restating the description.
    assert.match(settingsView, /<span class="settings-accordion-value">备份 · 恢复<\/span>/);
});

test('本机数据 shows 导出备份 / 导入备份 as one blue two-column row', () => {
    // Wording follows the user's vocabulary (导入/导出), not the old
    // 完整备份/恢复备份 pair.
    assert.ok(dataManager.includes('导出备份'));
    assert.ok(dataManager.includes('导入备份'));
    assert.ok(!dataManager.includes('完整备份'), 'the old export label is gone');
    assert.ok(!dataManager.includes('恢复备份'), 'the old restore label is gone');
    // Both buttons share one row at every width: the old markup was
    // grid-cols-1 sm:grid-cols-2, which stacked them on phones.
    assert.ok(dataManager.includes('grid grid-cols-2 gap-3'),
        'the row is two columns on every viewport');
    assert.ok(!dataManager.includes('sm:grid-cols-2'), 'no stacked fallback');
    // Emphasis is the primary blue on both, per AGENTS §2.7 (no green buttons).
    assert.equal((dataManager.match(/bg-primary-600 hover:bg-primary-700/g) || []).length, 2,
        'both buttons use the primary emphasis colour');
    assert.ok(!/bg-emerald-\d{3}/.test(dataManager), 'the emerald export button is gone');
    assert.ok(!/bg-white hover:bg-gray-50 border/.test(dataManager),
        'the secondary-looking restore button now matches the export one');
});
