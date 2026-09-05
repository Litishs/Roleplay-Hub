// Runtime (ESM import) tests for src/modules/cot-builder.mjs.
// The COT preset content adapts to memory / UI-template / opening-tag state;
// these tests pin the branch structure that app.mjs's seeding watch relies on.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCotPresetContent, buildAnalysisTagInstruction } from '../src/modules/cot-builder.mjs';

test('buildAnalysisTagInstruction switches tag, language and optional sections', () => {
    const cot = buildAnalysisTagInstruction('cot', { memoryEnabled: true, uiTemplateEnabled: true }, '结尾。');
    assert.ok(cot.includes('<cot>'));
    assert.ok(!cot.includes('使用中文'), 'cot tag keeps the default language rule');
    assert.ok(cot.includes('[记忆整理]'));
    assert.ok(cot.includes('[变量更新分析]'));
    assert.ok(cot.includes('[设定分析]'));
    assert.ok(cot.endsWith('结尾。'));

    const thinking = buildAnalysisTagInstruction('thinking', {}, '尾。');
    assert.ok(thinking.includes('<thinking>'));
    assert.ok(thinking.includes('使用中文'), 'thinking tag explicitly asks for Chinese');
    assert.ok(!thinking.includes('[记忆整理]'));
    assert.ok(thinking.includes('[情景意图分析]'));
});

test('buildCotPresetContent default body uses thinking_protocol with cot tag', () => {
    const content = buildCotPresetContent();
    assert.ok(content.startsWith('<thinking_protocol>'));
    assert.ok(content.includes('<cot>'));
    assert.ok(content.includes('</thinking_protocol>'));
    assert.ok(!content.includes('[记忆整理]'));
    assert.ok(!content.includes('[变量更新分析]'));
});

test('buildCotPresetContent toggles memory and UI-template sections', () => {
    const withMemory = buildCotPresetContent({ memoryEnabled: true });
    assert.ok(withMemory.includes('[记忆整理]'));
    assert.ok(withMemory.includes('向量记忆'));

    const withVariables = buildCotPresetContent({ uiTemplateAnalysisEnabled: true });
    assert.ok(withVariables.includes('[变量更新分析]'));

    const withBoth = buildCotPresetContent({ memoryEnabled: true, uiTemplateAnalysisEnabled: true, useThinkingOpening: true });
    assert.ok(withBoth.includes('<thinking>'));
    assert.ok(withBoth.includes('[记忆整理]'));
    assert.ok(withBoth.includes('[变量更新分析]'));
});

test('buildCotPresetContent prefill phases wrap or strip the base content', () => {
    const base = '<cot>old plan</cot>\n实际正文';
    const stripped = buildCotPresetContent({ prefillPhase: 1, prefillEnabled: false, prefillBaseContent: base });
    assert.equal(stripped, '实际正文', 'prefill disabled returns the base content minus stale analysis tags');

    const phase1 = buildCotPresetContent({ prefillPhase: 1, prefillEnabled: true, prefillBaseContent: base, memoryEnabled: true });
    assert.ok(phase1.startsWith('<cot>\n'));
    assert.ok(phase1.includes('怎样避免写偏'), 'phase 1 is the difficulty-analysis stage');
    assert.ok(phase1.includes('[记忆整理]'));
    assert.ok(phase1.trimEnd().endsWith('实际正文'));

    const phase2 = buildCotPresetContent({ prefillPhase: 2, prefillEnabled: true, prefillBaseContent: base });
    assert.ok(phase2.includes('切换成“直接续写”'));
    assert.ok(!phase2.includes('[记忆整理]'), 'memory section only injected when enabled');
});
