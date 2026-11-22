// Contract test: v6 content-addressed identity (L1).
//
// canonicalMemoryText is the single normalization definition shared by
// covers.h hashes and the summarizeBatch input. These locks keep the
// definition deterministic (v6 design doc §16 risk 4): state-dependent
// strippers must never enter it, the UI-template regexes must match the
// app.mjs copies, and hashing must stay synchronous + stable.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    HASH_VERSION,
    canonicalMemoryText,
    canonicalMessageHash,
    clearHashCache,
    contentHash
} from '../src/modules/content-hash.mjs';

const [app, hashModule] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/content-hash.mjs', import.meta.url), 'utf8')
]);

test('content hash: canonical text keeps main + sys and drops CoT', () => {
    const canonical = canonicalMemoryText('<cot>思维链内容</cot>正文内容\n\n[系统指令:\n规则甲]');
    assert.ok(!canonical.includes('思维链内容'), 'CoT must not participate in identity');
    assert.ok(canonical.includes('正文内容'), 'main text kept');
    assert.ok(canonical.includes('规则甲'), 'trailing system instruction kept');
});

test('content hash: canonical text strips deterministic UI-template blocks', () => {
    const raw = [
        '正文开头',
        '<ui_template_state_context>{"a":1}</ui_template_state_context>',
        '<ui_template_updates>{"updates":[]}</ui_template_updates>'
    ].join('\n');
    const canonical = canonicalMemoryText(raw);
    assert.ok(canonical.includes('正文开头'));
    assert.ok(!canonical.includes('ui_template_state_context'));
    assert.ok(!canonical.includes('ui_template_updates'));
    // An unclosed update block (truncated stream tail) is stripped too.
    assert.equal(canonicalMemoryText('正文\n<ui_template_updates>{"updates":['), '正文');
});

test('content hash: canonical definition is setting-independent', () => {
    // The image-gen stripper is state-dependent (isAutoImageGenEnabled):
    // letting it into the hash path means toggling the setting invalidates
    // the whole ledger (v6 §16 risk 4). Lock the exclusion by source text.
    const codeOnly = hashModule.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!codeOnly.includes('stripDisabledImageGenContext'));
    assert.ok(!codeOnly.includes('isAutoImageGenEnabled'));
    // Only deterministic strippers are imported.
    const importLine = hashModule.split('\n').find(line => line.includes("from './utils.mjs'"));
    assert.ok(importLine.includes('parseCot'));
    assert.ok(importLine.includes('stripUiTemplateContextInjection'));
});

test('content hash: UI-template strip regexes match the app.mjs copies', () => {
    // app.mjs keeps its own strip function (used by send/display paths);
    // the canonical definition must not drift from it.
    assert.ok(app.includes('<ui_template_updates\\b[^>]*>[\\s\\S]*?<\\/ui_template_updates>'));
    assert.ok(hashModule.includes('<ui_template_updates\\b[^>]*>[\\s\\S]*?<\\/ui_template_updates>'));
    assert.ok(app.includes('<ui_template_updates\\b[^>]*>[\\s\\S]*$'));
    assert.ok(hashModule.includes('<ui_template_updates\\b[^>]*>[\\s\\S]*$'));
});

test('content hash: FNV-1a is synchronous, stable and 32-bit hex', () => {
    assert.equal(HASH_VERSION, 1);
    const first = contentHash('同一个内容');
    assert.match(first, /^[0-9a-f]{8}$/);
    assert.equal(contentHash('同一个内容'), first, 'deterministic');
    assert.notEqual(contentHash('另一个内容'), first, 'content-sensitive');
    assert.equal(contentHash(''), contentHash(''));
    // String input and message-like input hash identically.
    assert.equal(
        contentHash(canonicalMemoryText('消息正文')),
        contentHash(canonicalMemoryText({ content: '消息正文' }))
    );
});

test('content hash: message hash cache returns identical values', () => {
    clearHashCache();
    const first = canonicalMessageHash({ content: '<cot>x</cot>正文' });
    assert.equal(canonicalMessageHash({ content: '<cot>x</cot>正文' }), first, 'cache hit equals recompute');
    clearHashCache();
    assert.equal(canonicalMessageHash({ content: '<cot>x</cot>正文' }), first, 'cleared cache recomputes the same value');
    assert.equal(canonicalMessageHash(''), contentHash(''));
});

test('content hash: summarize input is built from canonical text', () => {
    // The reconcile snapshot feeds canonical text into the digest prompt;
    // hashing the same canonical text keeps "what counts as a change" and
    // "what the model read" identical (v6 §16 risk 4 decision).
    assert.ok(app.includes('userText: canonicalMemoryText(turnInfo.user?.content)'));
    assert.ok(app.includes('assistantText: canonicalMemoryText(turnInfo.assistant?.content)'));
    assert.ok(app.includes("lib.buildDigestMessages({"));
    assert.ok(!app.includes('lib.buildRewriteMessages({'), 'the old rewrite prompt is no longer used by the chain');
});