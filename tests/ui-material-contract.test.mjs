// Interface material layer, M1 (2026-11-26): kill-switch whitelist, recipes,
// tier detection and refraction plumbing.
//
// Design record: documents/界面材质与页面底图工程方案.md.
//
// M1 ships zero visual change on purpose: no component carries .rph-glass yet,
// so the whitelist and the recipes are inert. What these tests pin is the shape
// of the contract the later milestones depend on — the whitelist form, the
// compensation guard, the variable sets, and the module's detection ladder.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

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

// Loads the ESM module into a vm context with a fake DOM surface. The module
// touches document/documentElement, CSS.supports and matchMedia only inside
// guarded helpers, so a minimal stub is enough to exercise the pure ladder.
async function loadGlassLens(overrides = {}) {
    const source = await read('src/modules/glass-lens.mjs');
    const clean = source.replace(/^export\s*\{[^}]*\};?\s*$/m, '');
    const context = vm.createContext({
        console,
        document: overrides.document || undefined,
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        CSS: overrides.CSS,
        ...overrides.globals
    });
    context.window = overrides.window || {};
    context.globalThis = context;
    vm.runInContext(clean, context, { filename: 'glass-lens.mjs' });
    return context;
}

test('the mobile backdrop-filter kill-switch is an opt-in whitelist', async () => {
    const css = await read('assets/css/styles.css');
    const block = mobileBlock(css);

    // The global rule must exclude the opt-in class, or no surface could ever
    // carry a material on a phone.
    assert.match(block, /\*:not\(\.rph-glass\)\s*\{[\s\S]*?backdrop-filter:\s*none !important/, 'kill-switch is whitelisted');
    // No unconditional kill-switch is left behind.
    assert.doesNotMatch(block, /\*\s*\{[^}]*backdrop-filter:\s*none/, 'no unconditional kill-switch is left');
    // The scrollbar rules stay on the bare * selector: putting them inside the
    // :not() rule would raise their specificity and could flip an unrelated
    // !important declaration. Pin that split so a later "tidy-up" cannot merge
    // them back together.
    assert.match(block, /\*\s*\{[\s\S]*?scrollbar-width:\s*none !important/, 'scrollbar rules stay on the bare * selector');
    assert.doesNotMatch(block, /\*:not\(\.rph-glass\)\s*\{[^}]*scrollbar-width/, 'scrollbar rules must not gain :not() specificity');
});

test('every mobile compensation rule skips material surfaces', async () => {
    const css = await read('assets/css/styles.css');
    const block = mobileBlock(css);
    const legacy = [
        '.toast-item', '.desc-panel-overlay', '.desc-panel', '.desc-close-btn',
        '.msg-name-tag', '.typing-bubble', '.typing-timer-badge',
        '.input-area-mobile', '.input-island', '.sinan-hud', '.wi-footer'
    ];
    for (const name of legacy) {
        const light = new RegExp(`\\${name}:not\\(\\.rph-glass\\)`, 'g');
        assert.ok(light.test(block), `${name} light rule must carry :not(.rph-glass)`);
    }
    // The dark twins need the same guard: !important would otherwise make a
    // glass panel opaque the moment the theme flips.
    for (const name of ['.desc-panel', '.desc-close-btn', '.msg-name-tag', '.typing-bubble',
        '.typing-timer-badge', '.input-island', '.sinan-hud', '.wi-footer', '.toast-item']) {
        const dark = new RegExp(`\\[data-theme='dark'\\] \\${name}:not\\(\\.rph-glass\\)`);
        assert.match(block, dark, `${name} dark twin must carry :not(.rph-glass)`);
    }
});

test('both recipes are variable sets with a light and a dark value', async () => {
    const css = await read('assets/css/styles.css');

    // Light values live in the material block, dark values in the palette block.
    const materialBlock = css.slice(css.indexOf('* 界面材质（M1 骨架'), css.indexOf('/* Mobile optimizations */'));
    assert.ok(materialBlock.length > 0, 'the material block must exist');

    const shared = ['--mat-blur', '--mat-blur-panel', '--mat-saturate', '--mat-tint', '--mat-tint-text',
        '--mat-line', '--mat-noise', '--glass-blur', '--glass-blur-tight', '--glass-blur-panel',
        '--glass-saturate', '--glass-tint', '--glass-rim', '--glass-rim-top', '--glass-rim-bottom',
        '--glass-refract', '--glass-band'];
    for (const name of shared) {
        assert.ok(materialBlock.includes(`${name}:`), `light value for ${name}`);
    }

    const darkOverrides = ['--mat-saturate', '--mat-tint', '--mat-tint-text', '--mat-line',
        '--glass-tint', '--glass-rim', '--glass-rim-top', '--glass-rim-bottom'];
    const paletteBlock = css.slice(css.indexOf("[data-theme='dark'] {", css.indexOf('深色模式覆盖规则')));
    const paletteBody = paletteBlock.slice(0, paletteBlock.indexOf('}'));
    for (const name of darkOverrides) {
        assert.ok(paletteBody.includes(`${name}:`), `dark value for ${name} in the palette block`);
    }
});

test('recipes are gated on the opt-in class and fall back to solid', async () => {
    const css = await read('assets/css/styles.css');
    // Every recipe rule selects .rph-glass plus its own variant, so a bare
    // variant class can never paint a surface by accident.
    for (const variant of ['rph-acrylic', 'rph-acrylic-panel', 'rph-glass-island', 'rph-glass-bar']) {
        assert.match(css, new RegExp(`\\.rph-glass\\.${variant}\\b`), `${variant} requires .rph-glass`);
    }
    // The solid tier strips blur from all four and swaps in an opaque fill.
    const solid = css.slice(css.indexOf("[data-effects='solid']"));
    for (const variant of ['rph-acrylic', 'rph-acrylic-panel', 'rph-glass-island', 'rph-glass-bar']) {
        assert.ok(solid.includes(`[data-effects='solid'] .rph-glass.${variant}`), `${variant} needs a solid fallback`);
    }
    assert.match(solid, /backdrop-filter:\s*none/);
    assert.match(solid, /background:\s*var\(--mat-tint-solid\)/);
    assert.match(solid, /background:\s*var\(--glass-tint-solid\)/);
});

test('glass-lens detects the three tiers and publishes the result', async () => {
    const source = await read('src/modules/glass-lens.mjs');
    // Contract surface for the later milestones.
    assert.match(source, /export\s*\{[\s\S]*detectMaterialTier/);
    assert.match(source, /export\s*\{[\s\S]*refreshLenses/);
    assert.match(source, /globalThis\.RPHGlassLens = RPHGlassLens/);
    assert.match(source, /window\.RPHGlassLens = RPHGlassLens/);
    // The displacement scale is a constant of the technique, not a knob:
    // scale 1 is under a pixel of movement, i.e. no visible refraction.
    assert.match(source, /scale:\s*'255'/);

    const context = await loadGlassLens({
        CSS: { supports: (property, value) => value.startsWith('url(') || value.startsWith('blur(') }
    });
    const { detectMaterialTier } = context.window.RPHGlassLens;
    assert.equal(detectMaterialTier({ enabled: true }), 'glass', 'url() support means real refraction');
    assert.equal(detectMaterialTier({ enabled: false }), 'solid', 'the user switch wins');
    assert.equal(detectMaterialTier({ enabled: 'false' }), 'solid', 'stringified false is still off');

    const blurOnly = await loadGlassLens({ CSS: { supports: (property, value) => value.startsWith('blur(') } });
    assert.equal(blurOnly.window.RPHGlassLens.detectMaterialTier({ enabled: true }), 'acrylic');

    const none = await loadGlassLens({ CSS: { supports: () => false } });
    assert.equal(none.window.RPHGlassLens.detectMaterialTier({ enabled: true }), 'solid');
});

test('reduced transparency forces the solid tier', async () => {
    const context = await loadGlassLens({
        CSS: { supports: () => true },
        window: { matchMedia: (query) => ({ matches: query.includes('reduced-transparency') }) }
    });
    assert.equal(context.window.RPHGlassLens.detectMaterialTier({ enabled: true }), 'solid');
});

test('the tier is written to data-effects and mirrored into runtime policy', async () => {
    const app = await read('src/modules/app.mjs');
    const lens = await read('src/modules/glass-lens.mjs');

    assert.match(lens, /document\.documentElement\.dataset\.effects = next/, 'the module owns the attribute write');
    assert.match(app, /initGlassLens\(/, 'app.mjs wires the module');
    assert.match(app, /RPHRuntimePolicy\.setMaterialTier\(tier\)/, 'the detected tier is recorded for diagnostics');
    assert.match(app, /watch\(\(\) => settings\.uiGlassEffects, glassLens\.apply\)/, 'the toggle re-applies immediately');
    assert.match(app, /glassLens\.dispose\(\)/, 'the resize listener is torn down');
});

test('the effect switch defaults to on and travels through the app context', async () => {
    const settingsState = await read('src/composables/useSettingsState.mjs');
    assert.match(settingsState, /uiGlassEffects: true/, 'effects are on by default');

    const app = await read('src/modules/app.mjs');
    const ctx = app.slice(app.indexOf('const __ctx = {'));
    assert.ok(ctx.slice(0, 4000).includes('materialEffectsTier'), 'components read the tier from __ctx');
});

test('index.html hosts the refraction filter definitions', async () => {
    const html = await read('index.html');
    assert.match(html, /<defs id="rph-lens-defs"><\/defs>/, 'the hidden defs host must exist');
    assert.match(html, /aria-hidden="true"[\s\S]{0,200}width: 0; height: 0/, 'it must not take layout space');
});

test('the material budget is part of the performance contract', async () => {
    const { RPHRuntimePolicy } = await import('../src/modules/runtime-policy.mjs');
    assert.equal(RPHRuntimePolicy.limits.backdropSurfaces, 6);
    assert.equal(RPHRuntimePolicy.limits.refractionLenses, 2);
    assert.ok(Object.isFrozen(RPHRuntimePolicy.limits));
});

test('M2 acrylic surfaces are opted in, per-message ones only on wide screens', async () => {
    // M2 (2026-11-26) turns the acrylic frames on. The per-message surfaces are
    // the exception: they exist once per message, so phones would blow the ≤6
    // backdrop-filter budget and they use the desktop-only variant instead.
    const acrylic = {
        'src/components/chat/ConversationList.vue': /conversation-list__head rph-glass rph-acrylic/,
        'src/components/common/SettingsPageHeader.vue': /settings-page-header rph-glass rph-acrylic/,
        'src/components/common/ToastNotification.vue': /toast-item rph-glass rph-acrylic/,
        'src/components/chat/CharacterInfo.vue': /desc-panel rph-glass rph-acrylic-panel/
    };
    for (const [file, pattern] of Object.entries(acrylic)) {
        assert.match(await read(file), pattern, `${file} opts into acrylic`);
    }

    const messageList = await read('src/components/chat/MessageList.vue');
    assert.match(messageList, /message-action-bar[^']*rph-acrylic-wide/, 'action bar is desktop-only acrylic');
    assert.equal((messageList.match(/msg-name-tag rph-acrylic-wide/g) || []).length, 2, 'both name tags are desktop-only');
    // The typing bubble is at most one per screen, so it keeps the material on phones.
    assert.match(messageList, /typing-bubble rph-glass rph-acrylic/);

    // The desktop-only variant must not carry .rph-glass: on phones that class is
    // the whitelist that lets a backdrop-filter through, and these stay solid.
    assert.doesNotMatch(messageList, /rph-glass rph-acrylic-wide|rph-acrylic-wide rph-glass/);

    // The workshop Back ball floats over an iframe: cross-document composition
    // per frame is exactly what §14.3 rules out, so it stays solid.
    const embedded = await read('src/components/common/EmbeddedViewContent.vue');
    assert.doesNotMatch(embedded, /class="embedded-back-ball rph-glass/);
});

test('every floating control uses acrylic, not liquid glass', async () => {
    // 2026-11-26 review: the liquid-glass recipe (edge refraction + specular rim)
    // read as fake at phone size, and the one surface where it could shine — the
    // tab bar — is dominated by a moving highlight that cannot carry a blur.
    // Every former glass surface now uses the acrylic recipe.
    const bar = await read('src/components/common/BottomTabBar.vue');
    assert.match(bar, /class="bottom-tab-bar rph-glass rph-acrylic"/, 'the tab bar is acrylic');
    assert.doesNotMatch(bar, /rph-glass-bar/, 'no liquid-glass variant is left on the bar');

    const input = await read('src/components/chat/MessageInput.vue');
    assert.match(input, /input-island rph-glass rph-acrylic/, 'the input dock is acrylic');
    assert.doesNotMatch(input, /rph-glass-island/, 'no liquid-glass variant is left on the dock');
    // The dock's own Tailwind blur must be gone, or it would carry two blurs.
    assert.doesNotMatch(input, /bg-white\/90 backdrop-blur-xl/);
    assert.match(input, /class="chat-input-box[^"]*"/, 'the textarea itself stays a plain textarea (IME-safe)');

    // Nothing opts into the liquid-glass variants any more.
    const files = ['src/components/chat/MessageList.vue', 'src/components/common/ToastNotification.vue',
        'src/components/chat/ConversationList.vue', 'src/components/common/SettingsPageHeader.vue',
        'src/components/views/SettingsPanel.vue', 'src/components/views/PluginsPanel.vue',
        'src/components/views/CharacterPanel.vue'];
    for (const file of files) {
        const source = await read(file);
        assert.ok(!/rph-glass-island|rph-glass-bar/.test(source), `${file} must not use a liquid-glass variant`);
    }

    // The sliding highlight was removed on 2026-11-27 (the active tab fills
    // its icon instead), so there is no transform-animated pill left to keep
    // a backdrop-filter off.
    assert.doesNotMatch(bar, /bottom-tab__slider/, 'no slider pill is left');
});

test('the management headers are acrylic too', async () => {
    // These three render the header inline rather than through
    // SettingsPageHeader, so they were missed when the component got the recipe
    // and the settings page kept its flat opaque strip.
    for (const file of ['SettingsPanel', 'PluginsPanel', 'CharacterPanel']) {
        const source = await read(`src/components/views/${file}.vue`);
        assert.match(source, /class="management-header rph-glass rph-acrylic/, `${file} header is acrylic`);
    }
    const css = await read('assets/css/styles.css');
    // The opaque fill skips opted-in headers; only the geometry is unconditional.
    assert.match(css, /\.management-header:not\(\.rph-glass\)/);
    assert.match(css, /\.management-header\.rph-glass \{[\s\S]{0,160}position: sticky;/);
});

test('the chat dock follows the theme instead of pinning dark', async () => {
    const css = await read('assets/css/styles.css');
    // Pinning a dark variant broke light themes: the dock stayed dark, and the
    // white-glyph rules reached the quick-settings popover nested inside it,
    // which rendered white-on-white.
    assert.doesNotMatch(css, /\.chat-view-root \.rph-glass\.rph-glass-island \{[\s\S]{0,300}--glass-tint:/,
        'the dock must not override the tint per theme');
    assert.doesNotMatch(css, /\.rph-glass-island \.text-gray-/, 'no white-glyph override inside the dock');
    // It carries a little more body than a page header: the artwork behind is arbitrary.
    assert.match(css, /\.chat-view-root \.rph-glass\.rph-acrylic \{[\s\S]{0,300}background-color: var\(--mat-tint-text\);/);
});

test('the refraction pass skips hidden surfaces and rebuilds them when shown', async () => {
    const lens = await read('src/modules/glass-lens.mjs');
    // A surface inside a hidden view has no geometry, so the pass must skip it
    // (and drop any filter it still carries) rather than bake a 0x0 map.
    assert.match(lens, /if \(!width \|\| !height\) \{[\s\S]{0,120}clearLens\(element\);/, 'zero-size surfaces are skipped and cleared');
    // ...and it must get a fresh map the moment it becomes visible again,
    // because its size may have changed while hidden (rotation, keyboard).
    assert.match(lens, /IntersectionObserver/, 'visibility is observed');
    assert.match(lens, /observeLensSurfaces\(/, 'surfaces are registered for observation');
    assert.match(lens, /visibilityObserver\.disconnect\(\)/, 'the observer is torn down');
    // Geometry is baked into the map, so a resize has to drop the cached filters.
    assert.match(lens, /RESIZE_DEBOUNCE_MS = 180/);
    assert.match(lens, /resetLenses\(\);/, 'resize clears the cached maps');
    // The cache is bounded: a resizing window would otherwise grow the defs.
    assert.match(lens, /FILTER_CACHE_LIMIT/);
});
