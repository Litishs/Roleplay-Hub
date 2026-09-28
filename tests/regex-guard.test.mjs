// Regex backtracking guard tests: the shape matching of
// containsCatastrophicQuantifier plus processRegex's fail-closed behavior for
// dangerous scripts (skip with a log trail; the body neither freezes nor gets
// corrupted).
import assert from 'node:assert/strict';
import test from 'node:test';

const { useRegexPipeline } = await import('../src/composables/useRegexPipeline.mjs');
const { containsCatastrophicQuantifier } = useRegexPipeline({ regexScripts: { value: [] } });

test('heuristic: matches classic nested-quantifier ReDoS shapes', () => {
    for (const pattern of [
        '(a+)+b',              // quantified group nested in a quantifier
        '(?:\\w*)*x',          // same, non-capturing group
        '(a+|b)+c',            // quantified group with a branch carrying its own quantifier
        '(a|a*)+x'             // same, quantifier on the other branch
    ]) {
        assert.equal(containsCatastrophicQuantifier(pattern), true, pattern);
    }
});

test('heuristic: harmless patterns are not killed', () => {
    for (const pattern of [
        '(foo|bar)+z',         // branches are all literals, no backtracking risk
        'a+b',
        'o{2,4}',
        '(ab)+c',
        '[abc]+',
        '角色名字|另一个名字'
    ]) {
        assert.equal(containsCatastrophicQuantifier(pattern), false, pattern);
    }
});

test('processRegex: dangerous scripts skipped and logged, safe scripts replace normally', async () => {
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    try {
        const pipeline = useRegexPipeline({
            regexScripts: {
                value: [
                    { name: '危险正则', regex: '(a+)+b', flags: 'g', replacement: 'X' },
                    { name: '安全正则', regex: '(海|山)', flags: 'g', replacement: '🌊' }
                ]
            }
        });

        const output = pipeline.processRegex('看海aAAAAAb爬山', { isDisplay: true });
        assert.equal(output, '看🌊aAAAAAb爬🌊', 'dangerous script not executed, safe script replaced normally');
        assert.ok(errors.some(line => line.includes('危险正则') && line.includes('ReDoS')), 'interception must leave a log trail');
    } finally {
        console.error = originalError;
    }
});
