// default-presets-v2 contract tests — the second built-in preset package
// (UI name 默认预设2) ported from upstream STA1N156/RP-Hub.
//
// Locks (AGENTS.md §2.2):
// - default-presets-v2.mjs exports the definition set + version and the v2 COT
//   builder (upstream's restructured thinking protocol).
// - Entry set/order mirrors the upstream seeding algorithm with our deliberate
//   deviations (storyPanels dropped, person presets systemManaged).
// - app.mjs seeds the 默认预设2 group ('default2') with its own version sync and
//   tombstones, without touching the 默认预设1 group.
//
// NOTE: this file intentionally contains no preset prose — entry contents are
// asserted structurally (tag names, section markers) or compared across files.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
    DEFAULT_PRESET_V2_DEFINITIONS,
    DEFAULT_PRESET_V2_DEFINITIONS_VERSION,
    buildCotPresetContentV2,
    buildAnalysisTagInstructionV2
} from '../src/modules/default-presets-v2.mjs';
import { DEFAULT_PRESET_DEFINITIONS } from '../src/modules/default-presets.mjs';
import { MEMORY_CITATION_COT_LINE } from '../src/modules/memory-citation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'));
const app = await read('src/modules/app.mjs');
const loader = await read('src/composables/useDataLoader.mjs');
const sender = await read('src/composables/useMessageSender.mjs');
const storageRepo = await read('src/modules/storage-repository.mjs');

// Final order produced by replicating upstream app.js syncBuiltinPreset calls
// (core presets first, then managed presets in upstream's sync order), minus
// the dropped storyPanels entry.
const EXPECTED_ORDER = [
    '破限',
    '破限预注入 · User 1',
    '破限预注入 · AI 1',
    '破限预注入 · User 2',
    '破限预注入 · AI 2',
    '防抢话',
    '防重复',
    '时间戳',
    '文风（抗八股）',
    'NSFW增强',
    '活人感',
    '人格内核',
    '去User中心化',
    '防神化',
    '第三人称',
    '第二人称',
    '禁止规则'
];

test('default preset v2 definitions are a well-formed, versioned set', () => {
    assert.equal(DEFAULT_PRESET_V2_DEFINITIONS_VERSION, 1, 'definition version starts at 1');
    assert.deepEqual(DEFAULT_PRESET_V2_DEFINITIONS.map(d => d.name), EXPECTED_ORDER, 'entry set/order mirrors the upstream seeding algorithm');
    const names = new Set();
    for (const preset of DEFAULT_PRESET_V2_DEFINITIONS) {
        assert.equal(typeof preset.name, 'string');
        assert.ok(preset.name.length > 0);
        assert.ok(!names.has(preset.name), `duplicate name: ${preset.name}`);
        names.add(preset.name);
        assert.ok(['system', 'user', 'assistant'].includes(preset.role), `valid role: ${preset.name}`);
        assert.equal(typeof preset.content, 'string');
        assert.ok(preset.content.length > 0, `non-empty content: ${preset.name}`);
    }
    const byName = Object.fromEntries(DEFAULT_PRESET_V2_DEFINITIONS.map(d => [d.name, d]));
    // Functional persona presets keep the systemManaged carrier semantics.
    assert.equal(byName['第二人称'].systemManaged, true);
    assert.equal(byName['第三人称'].systemManaged, true);
    // Deliberate deviation: upstream's storyPanels entry must not leak into a
    // repo without the story-panels feature.
    assert.ok(!names.has('剧情面板'), 'storyPanels entry dropped (no local feature)');
    // Roles of the pre-injection pairs match the default group's convention.
    const preinject = DEFAULT_PRESET_V2_DEFINITIONS.filter(p => p.name.startsWith('破限预注入 · User'));
    assert.ok(preinject.every(p => p.role === 'user'));
    const preinjectAi = DEFAULT_PRESET_V2_DEFINITIONS.filter(p => p.name.startsWith('破限预注入 · AI'));
    assert.ok(preinjectAi.every(p => p.role === 'assistant'));
});

test('v2 preset package differs from v1 where upstream changed it', () => {
    const v2ByName = Object.fromEntries(DEFAULT_PRESET_V2_DEFINITIONS.map(d => [d.name, d]));
    const v1ByName = Object.fromEntries(DEFAULT_PRESET_DEFINITIONS.map(d => [d.name, d]));
    // Upstream rewrote 禁止规则: new tag + 5 rules instead of the old 8-rule set.
    assert.ok(v2ByName['禁止规则'].content.includes('<writing_constraints>'), 'v2 禁止规则 uses the writing_constraints tag');
    assert.ok(!v2ByName['禁止规则'].content.includes('<prohibited_content>'), 'v2 禁止规则 dropped the old tag');
    assert.ok(v1ByName['禁止规则'].content.includes('<prohibited_content>'), 'v1 禁止规则 keeps the old tag');
    // The old tag wraps prose this repo does not duplicate; the new NSFW entry is
    // asserted structurally only (never embedded in tests).
    assert.ok(v2ByName['NSFW增强'].content.includes('<nsfw_rules>'), 'v2 NSFW entry keeps the nsfw_rules tag');
    assert.notEqual(v2ByName['破限'].content, v1ByName['破限'].content, 'v2 破限 is upstream\'s rewritten preset, not the local v1 text');
});

test('v2 COT builder implements upstream restructured thinking protocol', () => {
    assert.equal(typeof buildCotPresetContentV2, 'function');
    assert.equal(typeof buildAnalysisTagInstructionV2, 'function');
    const full = buildCotPresetContentV2({ memoryEnabled: true, uiTemplateAnalysisEnabled: true, useThinkingOpening: false });
    // 情景意图 split into 现场/输入; 剧情规划 split into 焦点/推进.
    assert.ok(full.includes('现场：') && full.includes('输入：'), '情景意图分析 split into 现场/输入');
    assert.ok(full.includes('焦点：') && full.includes('推进：'), '剧情规划 split into 焦点/推进');
    // [变量更新分析] moved after [剧情规划] (section bodies, not the label list).
    assert.ok(full.lastIndexOf('[剧情规划]') < full.lastIndexOf('[变量更新分析]'), '变量更新分析 section moved after 剧情规划');
    // nsfw_rules judgment moved out of [最终检查] into [剧情规划].
    const nsfwIdx = full.indexOf('<nsfw_rules>');
    assert.ok(nsfwIdx > full.lastIndexOf('[剧情规划]'), 'nsfw_rules judgment lives inside 剧情规划');
    assert.equal(full.slice(full.lastIndexOf('[最终检查]')).includes('nsfw_rules'), false, '最终检查 no longer carries the nsfw_rules judgment');
    // Memory citation line is our localized ledger wording.
    assert.ok(full.includes(MEMORY_CITATION_COT_LINE), 'memory citation line included when memory enabled');
    const noMemory = buildCotPresetContentV2({ memoryEnabled: false, uiTemplateAnalysisEnabled: false });
    assert.ok(!noMemory.includes('[记忆整理]'), 'memory section omitted when disabled');
    assert.ok(!noMemory.includes('[变量更新分析]'), 'variable section omitted when disabled');
    // Label instruction mirrors the new section order.
    const instruction = buildAnalysisTagInstructionV2('cot', { memoryEnabled: true, uiTemplateEnabled: true }, '检查');
    assert.ok(instruction.indexOf('[剧情规划]') < instruction.indexOf('[变量更新分析]'), 'label order: 剧情规划 before 变量更新分析');
});

test('v2 COT builder prefill phases mirror upstream behavior', () => {
    const base = buildCotPresetContentV2({ prefillPhase: 1, prefillEnabled: false, prefillBaseContent: 'BASE' });
    assert.equal(base, 'BASE', 'prefill disabled returns the stripped base content');
    const phase1 = buildCotPresetContentV2({ prefillPhase: 1, prefillEnabled: true, prefillBaseContent: 'BASE' });
    assert.ok(phase1.startsWith('<cot>') && phase1.endsWith('BASE'), 'prefill wraps the base content in a cot tag');
    assert.ok(phase1.includes('分析续写难点'), 'phase 1 keeps the difficulty-analysis framing');
    const phase2 = buildCotPresetContentV2({ prefillPhase: 2, prefillEnabled: true, prefillBaseContent: 'BASE', useThinkingOpening: true });
    assert.ok(phase2.startsWith('<thinking>') && phase2.includes('直接续写'), 'phase 2 keeps the switch-to-writing framing with thinking tag');
});

test('app.mjs seeds the 默认预设2 group without touching 默认预设1', () => {
    // Group creation + rename covered in preset-groups-contract.test.mjs; this
    // locks the v2-specific seeding loop shape.
    assert.ok(app.includes('const presetV2Definitions = Array.isArray(DEFAULT_PRESET_V2_DEFINITIONS) ? DEFAULT_PRESET_V2_DEFINITIONS : [];'), 'v2 definitions resolved');
    assert.ok(app.includes("const v2VersionChanged = presetDefinitionsV2VersionApplied.value !== DEFAULT_PRESET_V2_DEFINITIONS_VERSION;"), 'v2 version change detection');
    assert.ok(app.includes("presets.value.filter(p => p.group !== default2GroupId || v2DefNames.has(p.name) || p.systemManaged)"), 'v2 delisted entries removed on version bump');
    assert.ok(app.includes("if (!v2VersionChanged && deletedV2Names.has(def.name) && !def.systemManaged) continue;"), 'v2 tombstones respected between versions');
    assert.ok(app.includes("const seedGroupId = presetGroups.value.find(g => g.builtin && g.enabled)?.id || 'default';"), 'seed-from-default copies the enabled builtin group');
    // Tombstoning is per group.
    assert.ok(app.includes("const isV2 = preset.group === 'default2';"), 'deletePreset tombstones per group');
    // Persona forcing covers every copy, not just the first match.
    assert.match(app, /for \(const preset of presets\.value\) \{\s*if \(preset\.name === '第二人称'\) preset\.enabled = user\.person !== 'third';/, 'persona forcing loops over all preset copies');
});

test('storage repository validates the v2 tombstone array key', () => {
    assert.ok(storageRepo.includes("'rp_hub_deleted_default_v2_presets'"), 'v2 tombstone key joins the array-shape whitelist');
});
