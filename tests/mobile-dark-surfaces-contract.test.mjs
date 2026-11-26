// Mobile dark-mode surfaces (2026-11-25).
//
// @media (max-width: 768px) contains older "compensate for blur" rules that
// force near-white backgrounds with !important. Since !important beats the
// token-mapped utilities, every one of them needs an explicit dark
// counterpart or phones show white panels in dark mode.
//
// Both halves also carry :not(.rph-glass) since 2026-11-26: surfaces that opt
// into the material layer must not be flattened back to a solid fill. The
// assertions below pin that guard as well as the dark twin.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MOBILE_BLOCK_START = '@media (max-width: 768px) {';

function mobileBlock(css) {
    const start = css.indexOf(MOBILE_BLOCK_START);
    assert.ok(start >= 0, 'the mobile media block must exist');
    let i = start + MOBILE_BLOCK_START.length;
    let depth = 1;
    while (i < css.length && depth) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') depth -= 1;
        i += 1;
    }
    return css.slice(start, i);
}

test('every forced-light mobile surface has a dark counterpart', async () => {
    const css = await read('assets/css/styles.css');
    // The material guard sits at different positions in different selectors
    // (`.a:not(.rph-glass):hover` vs `.a:not(.rph-glass)`), so drop it before
    // matching and assert the pairing on the bare selector.
    const block = mobileBlock(css).replace(/:not\(\.rph-glass\)/g, '');

    const surfaces = {
        '.desc-panel': 'rgb(var(--bg-surface) / 0.97)',
        '.desc-close-btn:hover': 'rgb(var(--overlay-white) / 0.08)',
        '.msg-name-tag': 'rgb(var(--bg-surface) / 0.7)',
        '.typing-bubble': 'rgb(var(--bg-surface) / 0.88)',
        '.typing-timer-badge': 'rgb(var(--bg-surface) / 0.7)',
        '.input-island': 'rgb(var(--bg-surface) / 0.9)',
        '.wi-footer': 'rgb(var(--bg-gray-50) / 0.95)',
        '.toast-item': 'rgb(var(--bg-surface) / 0.97)'
    };

    for (const [selector, expected] of Object.entries(surfaces)) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\[data-theme='dark'\\] ${escaped}\\s*\\{[^}]*${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        assert.match(block, pattern, `${selector} needs a dark counterpart inside the mobile block`);
    }
});

test('the light mobile rules and their dark counterparts are balanced', async () => {
    const css = await read('assets/css/styles.css');
    // Comments mention .rph-glass too; strip them so only real selectors are scanned.
    const block = mobileBlock(css)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/:not\(\.rph-glass\)/g, '');
    // Any mobile rule that forces a white-ish value with !important must have a
    // dark twin; this catches a new light panel added without one.
    const names = new Set();
    for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = match[2];
        if (!body.includes('255, 255, 255') || !body.includes('!important')) continue;
        const selector = match[1].match(/\.([a-z][a-z0-9_-]*)/);
        if (selector) names.add(selector[1]);
    }
    assert.ok(names.size >= 6, `expected the legacy light surfaces, got ${[...names].join(', ')}`);
    for (const name of names) {
        assert.ok(
            block.includes(`[data-theme='dark'] .${name}`),
            `.${name} is forced light but has no dark counterpart`
        );
    }
});

test('both halves of every compensation rule skip material surfaces', async () => {
    const css = await read('assets/css/styles.css');
    const block = mobileBlock(css);
    // A compensation rule without the guard would override the material recipe
    // (its !important beats the recipe's plain declarations), so a surface that
    // opted in would silently stay solid.
    const guarded = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector, body]) => body.includes('!important') && /background/.test(body))
        .map(([, selector]) => selector);
    const offenders = guarded.filter((selector) => selector.includes('.rph-glass') === false
        && /\.(toast-item|desc-panel|desc-panel-overlay|desc-close-btn|msg-name-tag|typing-bubble|typing-timer-badge|input-island|input-area-mobile|sinan-hud|wi-footer)/.test(selector));
    assert.deepEqual(offenders, [], 'compensation rules must carry :not(.rph-glass)');
});
