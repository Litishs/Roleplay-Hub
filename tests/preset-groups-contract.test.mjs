// preset-groups contract — task 1 (default/custom preset groups + COT builder).
//
// Locks the task-1 contract by text assertions (AGENTS.md §2.2):
// - default-presets.mjs is aligned to upstream (去User中心化 present, COT static entry
//   removed) and exports DEFAULT_PRESET_DEFINITIONS_VERSION.
// - cot-builder.mjs exports the dynamic COT builder and is imported by app.mjs.
// - app.mjs seeds presets into groups (default + custom), migrates legacy presets,
//   force-syncs the default group on version bump, and exposes group management
//   (setActivePresetGroup / createPresetGroup / deletePresetGroup).
// - useMessageSender consumes only the enabled group's enabled presets (functional
//   presets stay active); saveData persists preset_groups + applied version.
// - PresetsPanel.vue renders groups as accordions with a group-level toggle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'));

const [presets, app, sender, loader, panel] = await Promise.all([
    read('src/modules/default-presets.mjs'),
    read('src/modules/app.mjs'),
    read('src/composables/useMessageSender.mjs'),
    read('src/composables/useDataLoader.mjs'),
    read('src/components/views/PresetsPanel.vue')
]);

test('default-presets.mjs aligns to upstream and exposes a definition version', () => {
    assert.ok(presets.includes('name: "去User中心化"'), '新增去User中心化预设');
    assert.ok(presets.includes('DEFAULT_PRESET_DEFINITIONS_VERSION = 1'), '定义版本常量存在');
    assert.match(presets, /export \{ DEFAULT_PRESET_DEFINITIONS, DEFAULT_PRESET_DEFINITIONS_VERSION \}/, '导出定义与版本');
    // COT 静态条目已移除，改由 cot-builder 动态生成
    assert.ok(!presets.includes('contentWithMemory'), '静态 COT contentWithMemory 已移除');
    assert.ok(!presets.includes('name: "COT"'), '静态 COT 条目已移除');
});

test('cot-builder.mjs exports the dynamic builder and is wired into app.mjs', () => {
    assert.ok(app.includes("import { buildCotPresetContent } from './cot-builder.mjs';"), 'app.mjs 导入 COT 构建器');
    assert.ok(app.includes("import { DEFAULT_PRESET_DEFINITIONS, DEFAULT_PRESET_DEFINITIONS_VERSION } from './default-presets.mjs';"), 'app.mjs 导入定义版本');
});

test('app.mjs seeds presets into groups and migrates legacy presets', () => {
    assert.ok(app.includes('const presetGroups = ref([]);'), '分组状态存在');
    assert.ok(app.includes('const presetDefinitionsVersionApplied = ref(null);'), '已应用版本状态存在');
    // 首次迁移：旧数据（无 group 字段）归入自定义组；旧内置预设默认关闭（D5.1）
    assert.match(app, /presets\.value\.some\(p => !p\.group\)/, '检测无分组旧数据');
    assert.ok(app.includes("return { ...p, group: 'custom', enabled: isLegacyBuiltin ? false : (p.enabled !== false) };"), '旧内置转自定义并默认关闭');
    // 默认预设组存在
    assert.ok(app.includes("presetGroups.value.unshift({ id: 'default', name: '默认预设', builtin: true, enabled: true });"), '播种默认预设组');
});

test('app.mjs force-syncs the default group on definition version bump', () => {
    assert.ok(app.includes('const versionChanged = presetDefinitionsVersionApplied.value !== DEFAULT_PRESET_DEFINITIONS_VERSION;'), '版本变化检测');
    assert.ok(app.includes('if (versionChanged) {'), '版本变化分支');
    assert.match(app, /presets\.value\.filter\(p => p\.group !== 'default' \|\| defNames\.has\(p\.name\) \|\| p\.systemManaged\)/, '移除已下架的默认组预设');
});

test('app.mjs syncs COT content dynamically and watches its drivers', () => {
    assert.ok(app.includes('const syncCotPresetContent = () => {'), 'COT 动态同步函数');
    assert.ok(app.includes('buildCotPresetContent({'), 'COT 内容由构建器生成');
    assert.ok(app.includes('prefillPhase: index + 1,'), '破限预注入按 prefillPhase 联动');
    assert.ok(app.includes('], syncCotPresetContent);'), 'COT 内容随记忆/UI模板/模型 watch 重算');
});

test('app.mjs exposes preset group management', () => {
    assert.ok(app.includes('const setActivePresetGroup = (groupId) => {'), '互斥启用分组');
    assert.ok(app.includes('const createPresetGroup = ({ name = \'\', seedFromDefault = false } = {}) => {'), '新建分组（含基于默认预设选项）');
    assert.ok(app.includes('const deletePresetGroup = (groupId) => {'), '删除分组');
    assert.ok(app.includes('if (!group || group.builtin) return;'), '默认预设组不可删除');
    assert.ok(app.includes('presetGroups, setActivePresetGroup, createPresetGroup, deletePresetGroup,'), '分组状态与函数暴露给模板');
});

test('saveData persists preset_groups and the applied definition version', () => {
    assert.ok(app.includes("await setStoredValue('preset_groups', presetGroups.value);"), '持久化 preset_groups');
    assert.ok(app.includes("await setStoredValue('preset_definitions_version', presetDefinitionsVersionApplied.value);"), '持久化已应用版本');
});

test('useDataLoader restores preset_groups and the applied version', () => {
    assert.ok(loader.includes('presetGroups,'), '加载器接收 presetGroups 依赖');
    assert.ok(loader.includes('presetDefinitionsVersionApplied,'), '加载器接收版本依赖');
    assert.ok(loader.includes("getStoredValue('preset_groups')"), '读取 preset_groups');
    assert.ok(loader.includes("getStoredValue('preset_definitions_version')"), '读取已应用版本');
});

test('useMessageSender consumes only the enabled group\u2019s enabled presets', () => {
    assert.ok(sender.includes('presetGroups,'), '发送器接收分组依赖');
    assert.ok(sender.includes("const activeGroupId = presetGroups.value.find(g => g.enabled)?.id || 'default';"), '定位启用分组');
    assert.match(sender, /p\.systemManaged \|\| p\.name === 'COT' \|\| p\.group === activeGroupId/, '功能预设始终参与，内容预设按启用分组过滤');
});

test('PresetsPanel renders groups as accordions with a group-level toggle', () => {
    assert.ok(panel.includes('settings-accordion'), '手风琴容器');
    assert.ok(panel.includes('settings-accordion-trigger'), '手风琴触发器');
    assert.ok(panel.includes('settings-collapse'), '折叠面板');
    assert.ok(panel.includes('settings-toggle'), '组级滑块开关');
    assert.ok(panel.includes('setActivePresetGroup(group.id)'), '组级滑块调用互斥启用');
    assert.ok(panel.includes('deletePresetGroup(group.id)'), '删除分组按钮');
    assert.ok(panel.includes('createPresetGroup?.({ name: newGroupName.value, seedFromDefault: newGroupSeed.value === \'default\' })'), '新建分组支持基于默认预设/空白分组');
    assert.ok(panel.includes('group.builtin'), '内置标记');
});

test('PresetsPanel top bar is group-level and uses white buttons', () => {
    // 顶栏改为分组级操作：导出分组 / 导入分组 / 新建分组（白色 settings-icon-button）
    assert.ok(panel.includes("openExportModal('presets')"), '顶栏导出分组');
    assert.ok(panel.includes('importPresets'), '顶栏导入分组');
    assert.ok(panel.includes('openCreateGroupModal'), '顶栏新建分组');
    assert.ok(panel.includes('title="导出分组"'), '导出分组按钮');
    assert.ok(panel.includes('title="导入分组"'), '导入分组按钮');
    assert.ok(panel.includes('title="新建分组"'), '新建分组按钮');
});

test('PresetsPanel adds in-group create/delete entry buttons (blue)', () => {
    // 展开分组后组内新建预设（蓝色 settings-create-button），条目编辑/删除
    assert.ok(panel.includes('createPreset(group.id)'), '组内新建预设传入当前分组');
    assert.ok(panel.includes('settings-create-button'), '组内新建预设为蓝色按钮');
    assert.ok(panel.includes('editPreset(item.index)'), '条目编辑按钮');
    assert.ok(panel.includes('deletePreset(item.index)'), '条目删除按钮');
});

test('PresetsPanel create-group modal uses the app overlay pattern (not daisyUI dialog)', () => {
    // 修复：新建分组弹窗用应用自带 fixed overlay 模态，而非 dialog+daisyUI
    assert.ok(panel.includes('class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"'), 'fixed overlay 模态容器');
    assert.ok(panel.includes('modal-primary-button'), '模态主按钮样式');
    assert.ok(panel.includes('showCreateGroupModal = false'), '关闭弹窗');
    assert.ok(!panel.includes('<dialog'), '不再使用 dialog 元素');
});

test('app.mjs createPreset accepts a target group', () => {
    assert.ok(app.includes("const createPreset = (groupId) => {"), 'createPreset 接收分组参数');
    assert.ok(app.includes("group: groupId || 'default'"), '新预设归属指定分组');
});
