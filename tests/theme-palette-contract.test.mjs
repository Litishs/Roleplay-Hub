// P4 (2026-11-25): the remaining dark overrides reference palette variables
// instead of hard-coded neutrals, so changing the charcoal palette means
// editing the [data-theme='dark'] variable block only.
//
// Scope note: semantic tints (red/green/blue/… surfaces) are intentionally
// still literal — mapping them needs a semantic palette decision (P3/next).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PALETTE_HEX = [
    '#121212', '#1a1a1a', '#212121', '#2b2b2b', '#303030', '#262626',
    '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373',
    '#141414', '#161616', '#1c1c1c', '#232323', '#242424', '#2a2a2a',
    '#3a3a3a', '#8c8c8c', '#9a9a9a', '#b0b0b0', '#93c5fd', '#525252'
];
const PALETTE_RGBA_BASES = ['26,26,26', '18,18,18', '33,33,33', '48,48,48', '82,82,82', '163,163,163', '229,229,229'];

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function darkBlocks(source) {
    const css = stripComments(source);
    const blocks = [];
    let i = 0;
    const n = css.length;
    while (i < n) {
        if (css[i] === '{') {
            let j = i + 1;
            let depth = 1;
            while (j < n && depth) {
                if (css[j] === '{') depth += 1;
                else if (css[j] === '}') depth -= 1;
                j += 1;
            }
            let selStart = i;
            while (selStart > 0 && css[selStart - 1] !== '}') selStart -= 1;
            const selector = css.slice(selStart, i);
            blocks.push({ selector, body: css.slice(i + 1, j - 1) });
            i = j;
            continue;
        }
        i += 1;
    }
    return blocks;
}

test('dark rules contain no hard-coded palette neutrals', async () => {
    const css = await read('assets/css/styles.css');
    const rules = darkBlocks(css).filter(({ selector }) => (
        selector.includes("[data-theme='dark']") && selector.trim() !== "[data-theme='dark']"
    ));
    assert.ok(rules.length > 100, `expected the dark override set, got ${rules.length}`);

    const offenders = [];
    for (const { selector, body } of rules) {
        const lower = body.toLowerCase();
        for (const hex of PALETTE_HEX) {
            if (lower.includes(hex)) offenders.push(`${selector.trim()} -> ${hex}`);
        }
        for (const base of PALETTE_RGBA_BASES) {
            if (body.includes(base)) offenders.push(`${selector.trim()} -> rgba(${base},…)`);
        }
    }
    assert.deepEqual(offenders, [], 'dark rules must reference the palette variables instead');
});

test('the dark block defines the component palette used by the rules', async () => {
    const css = await read('assets/css/styles.css');
    const darkBlock = darkBlocks(css).find(({ selector }) => selector.trim() === "[data-theme='dark']");
    assert.ok(darkBlock, 'the dark variable block must exist');

    const expected = {
        '--d-bg': '#121212',
        '--d-surface': '#1a1a1a',
        '--d-surface-2': '#212121',
        '--d-surface-3': '#2b2b2b',
        '--d-border': '#303030',
        '--d-border-soft': '#262626',
        '--d-text': '#f5f5f5',
        '--d-text-2': '#e5e5e5',
        '--d-text-3': '#d4d4d4',
        '--d-text-4': '#a3a3a3',
        '--d-text-5': '#737373',
        '--d-well': '#141414',
        '--d-sunken': '#161616',
        '--d-field': '#1c1c1c',
        '--d-hover': '#232323',
        '--d-raised': '#242424',
        '--d-divider': '#2a2a2a',
        '--d-border-strong': '#3a3a3a',
        '--d-text-muted': '#8c8c8c',
        '--d-text-label': '#9a9a9a',
        '--d-text-value': '#b0b0b0',
        '--d-accent': '#93c5fd'
    };
    for (const [name, value] of Object.entries(expected)) {
        assert.ok(darkBlock.body.includes(`${name}: ${value};`), `${name} must be ${value}`);
    }
});

test('every component palette variable is actually referenced by a dark rule', async () => {
    const css = await read('assets/css/styles.css');
    const body = darkBlocks(css)
        .filter(({ selector }) => selector.includes("[data-theme='dark']") && selector.trim() !== "[data-theme='dark']")
        .map(({ body: ruleBody }) => ruleBody)
        .join('\n');
    const names = ['--d-well', '--d-sunken', '--d-field', '--d-hover', '--d-raised',
        '--d-divider', '--d-border-strong', '--d-text-muted', '--d-text-label',
        '--d-text-value', '--d-accent'];
    for (const name of names) {
        assert.ok(body.includes(`var(${name})`), `${name} must be used by at least one rule`);
    }
});

test('semantic tints stay literal until a semantic palette lands', async () => {
    const css = await read('assets/css/styles.css');
    const body = darkBlocks(css)
        .filter(({ selector }) => selector.includes("[data-theme='dark']") && selector.trim() !== "[data-theme='dark']")
        .map(({ body: ruleBody }) => ruleBody)
        .join('\n');
    // Spot-check a few tints that P4 deliberately leaves alone.
    for (const tint of ['#19332f', '#3a2229', '#713c46', '#2b2340']) {
        assert.ok(body.includes(tint), `${tint} is out of P4 scope and must stay`);
    }
});