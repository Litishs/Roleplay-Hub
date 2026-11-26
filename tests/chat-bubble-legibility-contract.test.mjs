// Chat bubble legibility across every rendering path (2026-11-26).
//
// A role-play reply can arrive as four very different things, and each one used
// to be styled independently:
//   1. plain text            -> .msg-bubble-glass background + inherited colour
//   2. regex restyled spans  -> .rph-style-* colours injected by the 美化 packs
//   3. markdown blocks       -> .markdown-body code/pre/th/td/blockquote/...
//   4. HTML cards            -> a sandboxed iframe with the author's own document
//
// The first three are themed by this app and must flip with the theme. The
// fourth is authored against a light page and cannot see the app's theme, so it
// gets a light baseline instead.
//
// Regression these tests pin: .msg-bubble-glass forced `rgba(255,255,255,.88)
// !important` with no dark counterpart. Measured in dark mode the bubble was
// white with #f5f5f5 text (1.09:1), table headers 1.04:1, and pre blocks 1.04:1.
// The rule originally lived inside the mobile media block (upstream 8f9c9ec line
// 227, block ended at 302) and only drifted to global scope later, which is why
// the "forced-light mobile surface needs a dark twin" contract never saw it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Every colour that ends up on a bubble surface must come from a token whose
// dark value differs from its light value, or be inherited.
const THEMED_SELECTORS = [
    '.markdown-body code',
    '.markdown-body pre',
    '.markdown-body pre code',
    '.markdown-body blockquote',
    '.markdown-body a',
    '.markdown-body hr',
    '.markdown-body th, .markdown-body td',
    '.markdown-body th'
];

// Hard-coded light-theme neutrals that used to live in the markdown rules.
const LIGHT_ONLY_HEX = ['#f1f5f9', '#f8fafc', '#f9fafb', '#e5e7eb', '#e2e8f0', '#1f2937', '#6b7280', '#2563eb', '#1d4ed8'];

test('the bubble background is token-driven and not forced light', async () => {
    const css = await read('assets/css/styles.css');

    const rule = css.match(/\.msg-bubble-glass\s*\{([^}]*)\}/);
    assert.ok(rule, '.msg-bubble-glass must exist');
    assert.match(rule[1], /background-color:\s*rgb\(var\(--bg-surface\)\s*\/\s*0\.88\)/,
        'the bubble surface must come from the --bg-surface token');
    assert.doesNotMatch(rule[1], /!important/,
        'a forced declaration here would override the token-mapped bg-* utilities');
    assert.doesNotMatch(rule[1], /255,\s*255,\s*255/,
        'no literal white: it is what made the dark bubble unreadable');
});

test('the bubble rule is not hiding inside the mobile media block', async () => {
    // It started there and drifted out; a global rule must be themed properly,
    // which is what this file's other assertions cover. Pin the scope so a later
    // move back into the media query is a deliberate decision, not an accident.
    const css = await read('assets/css/styles.css');
    const start = css.indexOf('@media (max-width: 768px) {');
    let i = start + '@media (max-width: 768px) {'.length;
    let depth = 1;
    while (i < css.length && depth) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') depth -= 1;
        i += 1;
    }
    const block = css.slice(start, i);
    assert.doesNotMatch(block, /\.msg-bubble-glass\s*\{/, 'the bubble rule is global, not mobile-only');
});

test('markdown elements inside bubbles use theme tokens instead of light hex', async () => {
    const css = await read('assets/css/styles.css');

    for (const selector of THEMED_SELECTORS) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
        assert.ok(rule, `${selector} must exist`);
        const body = rule[1];
        for (const hex of LIGHT_ONLY_HEX) {
            assert.ok(!body.toLowerCase().includes(hex),
                `${selector} still hard-codes ${hex}, which does not flip in dark mode`);
        }
        // Every colour declaration must read a token.
        for (const decl of body.matchAll(/(?:^|;)\s*(?:background-color|color|border-top|border-left):\s*([^;]+);/g)) {
            const value = decl[1].trim();
            if (value === 'inherit' || value === 'transparent') continue;
            // Shorthands like `border-top: 1px solid rgb(...)` are fine as long as
            // the colour inside resolves through a token.
            const colourPart = value.match(/rgb\(var\(--[a-z0-9-]+\)[^)]*\)/);
            assert.ok(colourPart || value === 'none',
                `${selector} colour "${value}" must resolve through a token`);
        }
    }
});

test('every token the markdown rules use is defined for both themes', async () => {
    const css = await read('assets/css/styles.css');
    const rawTokens = await read('assets/css/tokens.css');
    // The file documents the two namespaces in comments before defining them, and
    // a comment can mention [data-theme='dark'] — strip them before splitting.
    const tokens = rawTokens.replace(/\/\*[\s\S]*?\*\//g, '');

    const used = new Set();
    for (const selector of THEMED_SELECTORS) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
        for (const match of rule[1].matchAll(/rgb\(var\(--([a-z0-9-]+)\)/g)) used.add(match[1]);
    }
    assert.ok(used.size >= 5, `expected several tokens, got ${[...used].join(', ')}`);

    const darkStart = tokens.indexOf("[data-theme='dark']");
    const lightBlock = tokens.slice(0, darkStart);
    const darkBlock = tokens.slice(darkStart);
    for (const name of used) {
        assert.ok(lightBlock.includes(`--${name}:`), `tokens.css has no light value for --${name}`);
        assert.ok(darkBlock.includes(`--${name}:`), `tokens.css has no dark value for --${name}`);
    }
});

test('regex restyle spans keep a dark counterpart', async () => {
    const css = await read('assets/css/styles.css');
    // The 美化 packs inject these; they sit on the bubble surface, so a light-only
    // colour would be unreadable once the bubble goes dark.
    for (const name of ['dialogue', 'action', 'speaker', 'inner']) {
        assert.match(css, new RegExp(`\\.rph-style-${name}\\s*\\{[^}]*color:`), `.rph-style-${name} needs a light colour`);
        assert.match(css, new RegExp(`\\[data-theme='dark'\\] \\.rph-style-${name}\\s*\\{[^}]*color:`),
            `.rph-style-${name} needs a dark counterpart`);
    }
});

test('HTML cards get a light baseline because they cannot see the app theme', async () => {
    const utils = await read('src/modules/utils.mjs');
    const app = await read('src/modules/app.mjs');

    // The card document is a sandboxed, author-written page. It has no access to
    // the host's tokens, so it is given a light page of its own instead.
    assert.match(utils, /const lightBaseline = 'html,body\{background:#ffffff;color:#111827;\}'/,
        'the card document needs an explicit light baseline');
    assert.match(utils, /\+ lightBaseline \+/, 'the baseline must be injected into every card document');

    // And the frame shell around it must stay white rather than follow --bg-surface.
    assert.match(app, /iframe\.style\.backgroundColor = '#ffffff'/);
    assert.doesNotMatch(app, /bg-white block executable-html-frame/, 'the shell must not use the theme-mapped utility');
});
