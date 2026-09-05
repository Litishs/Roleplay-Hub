// Runtime (ESM import) tests for src/modules/utils.mjs pure helpers.
// The module is imported directly — all DOM references live inside function
// bodies, so a bare import is safe in Node. These tests complement the
// text-assertion contracts by pinning actual behavior of the shared helpers.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    generateUUID, parseCot, formatTokenCount, formatTokenAggregate, getTokenUsageCategory,
    escapeRegexText, normalizeTavilyExtractUrl, stripCodeBlocksForToolDetection,
    removeActiveToolCallRawsFromText, cleanActiveToolCallReason, stripUiTemplateContextInjection,
    runWithConcurrency, collapseNativeReasoning, throwApiError, stringifyErrorDetail,
    formatAIResponseForConsole, readUsageNumber, debounce, buildKeywordToolSnippet, stringifyUiSchema
} from '../src/modules/utils.mjs';

test('generateUUID produces canonical v4-shaped ids', () => {
    const id = generateUUID();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, generateUUID());
});

test('parseCot extracts think/cot content and handles unclosed tags', () => {
    assert.deepEqual(parseCot('hello'), { cot: '', main: 'hello', sys: '', isFinished: false });
    const closed = parseCot('<think>reasoning</think>story body');
    assert.equal(closed.cot, 'reasoning');
    assert.equal(closed.main, 'story body');
    assert.equal(closed.isFinished, true);
    // Unclosed tag: content still captured, main keeps the remainder.
    const unclosed = parseCot('<cot>partial plan\nmain continues');
    assert.ok(unclosed.cot.includes('partial plan'));
    // Tolerates malformed closing tags (missing slash / stray spaces).
    const sloppy = parseCot('<cot>plan<cot>tail');
    assert.ok(sloppy.cot.includes('plan'));
});

test('token formatters handle nullish and aggregate input', () => {
    assert.equal(formatTokenCount(undefined), '0');
    assert.equal(formatTokenCount(1234), '1,234');
    assert.equal(formatTokenAggregate(0, 3), '0');
    assert.equal(formatTokenAggregate(1500000, 2), '1.5M');
    assert.equal(getTokenUsageCategory('summary'), 'memory');
    assert.equal(getTokenUsageCategory('embedding'), 'memory');
    assert.equal(getTokenUsageCategory('ui_template'), 'variables');
    assert.equal(getTokenUsageCategory('generation'), 'chat');
});

test('regex escaping and code block stripping', () => {
    assert.equal(escapeRegexText('a.b*c'), 'a\\.b\\*c');
    assert.equal(escapeRegexText(null), '');
    assert.equal(stripCodeBlocksForToolDetection('before ```js\ncode()\n``` after'), 'before  after');
    assert.equal(stripCodeBlocksForToolDetection('~~~py\ncode\n~~~ x'), ' x');
});

test('removeActiveToolCallRawsFromText honours explicit indices and falls back to indexOf', () => {
    const text = 'AAA BBB CCC';
    assert.equal(
        removeActiveToolCallRawsFromText(text, [{ raw: 'BBB', index: 0 }]),
        ' BBB CCC',
        'explicit index 0 removes the prefix by length, not the first occurrence of raw'
    );
    assert.equal(
        removeActiveToolCallRawsFromText(text, [{ raw: 'BBB' }]),
        'AAA  CCC',
        'without an index the raw text is matched'
    );
});

test('normalizeTavilyExtractUrl trims trailing punctuation and rejects non-http schemes', () => {
    assert.equal(normalizeTavilyExtractUrl('www.example.com。'), 'https://www.example.com/');
    // Trailing ')' is treated as sentence punctuation and stripped.
    assert.equal(normalizeTavilyExtractUrl('https://example.com/a(b)'), 'https://example.com/a(b');
    assert.equal(normalizeTavilyExtractUrl('ftp://example.com'), '');
    assert.equal(normalizeTavilyExtractUrl('not a url'), '');
    assert.equal(normalizeTavilyExtractUrl(''), '');
});

test('runWithConcurrency keeps result order and respects the worker limit', async () => {
    let active = 0;
    let maxActive = 0;
    const result = await runWithConcurrency([40, 10, 30, 20], 2, async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, value));
        active -= 1;
        return value * 2;
    });
    assert.deepEqual(result, [80, 20, 60, 40]);
    assert.ok(maxActive <= 2, `concurrency must not exceed limit (was ${maxActive})`);
});

test('collapseNativeReasoning only auto-closes unseen assistant reasoning', () => {
    const message = { role: 'assistant', reasoning: ' thinking ', isReasoningOpen: true };
    collapseNativeReasoning(message);
    assert.equal(message.isReasoningOpen, false);
    assert.equal(message.isReasoningAutoCollapsed, true);
    // User-toggled or already-collapsed messages are left alone.
    const toggled = { role: 'assistant', reasoning: 'x', isReasoningUserToggled: true, isReasoningOpen: true };
    collapseNativeReasoning(toggled);
    assert.equal(toggled.isReasoningOpen, true);
});

test('throwApiError marks the error as an API error', () => {
    assert.throws(() => throwApiError('boom'), (error) => error.isApiError === true && error.message === 'boom');
});

test('stringifyErrorDetail and stringifyUiSchema handle primitives and objects', () => {
    assert.equal(stringifyErrorDetail(null), '');
    assert.equal(stringifyErrorDetail('plain'), 'plain');
    assert.equal(stringifyErrorDetail({ a: 1 }), '{\n  "a": 1\n}');
    assert.equal(stringifyUiSchema(undefined), '');
    assert.equal(stringifyUiSchema('raw'), 'raw');
    assert.equal(stringifyUiSchema({ b: 2 }), '{\n  "b": 2\n}');
});

test('formatAIResponseForConsole wraps reasoning in a thinking block', () => {
    assert.equal(formatAIResponseForConsole('body'), 'body');
    assert.equal(formatAIResponseForConsole('body', 'thought'), '<thinking>\nthought\n</thinking>\n\nbody');
});

test('readUsageNumber returns the first finite non-negative rounded value', () => {
    // NB: null coerces to 0, so it short-circuits — documented quirk.
    assert.equal(readUsageNumber(null), 0);
    assert.equal(readUsageNumber('12.6', 5), 13);
    assert.equal(readUsageNumber(undefined, -1, 3), 3);
    assert.equal(readUsageNumber('x'), null);
});

test('debounce coalesces bursts into a single trailing call', async () => {
    let calls = 0;
    let lastArg = null;
    const debounced = debounce((value) => { calls += 1; lastArg = value; }, 30);
    debounced('a');
    debounced('b');
    await new Promise(resolve => setTimeout(resolve, 10));
    debounced('c');
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(calls, 1);
    assert.equal(lastArg, 'c');
});

test('buildKeywordToolSnippet keeps short text and slices long text around the first match', () => {
    const short = 'short text';
    assert.equal(buildKeywordToolSnippet(short, ['short']), short);
    const long = `${'x'.repeat(500)}needle${'y'.repeat(1500)}`;
    const snippet = buildKeywordToolSnippet(long, ['needle']);
    assert.ok(snippet.startsWith('...'));
    assert.ok(snippet.endsWith('...'));
    assert.ok(snippet.includes('needle'));
    assert.ok(snippet.length < long.length);
});

test('stripUiTemplateContextInjection removes complete and unterminated state blocks', () => {
    const text = 'head<ui_template_state_context>secret</ui_template_state_context>tail';
    assert.equal(stripUiTemplateContextInjection(text), 'headtail');
    assert.equal(stripUiTemplateContextInjection('head<ui_template_state_context>truncated'), 'head');
});
