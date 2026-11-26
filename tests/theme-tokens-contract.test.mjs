import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Phase 1 of the theme-token refactor: a token file that nothing consumes yet.
// These tests pin the two properties that make it safe to link into all pages:
// it may only declare custom properties, and its dark values must reproduce the
// hand-tuned values that live in styles.css today.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function parseBlocks(css) {
  const blocks = [];
  for (const chunk of stripComments(css).split('}')) {
    const brace = chunk.indexOf('{');
    if (brace === -1) continue;
    blocks.push({
      selector: chunk.slice(0, brace).trim(),
      body: chunk.slice(brace + 1).trim(),
    });
  }
  return blocks;
}

function parseDeclarations(body) {
  const declarations = new Map();
  for (const part of body.split(';')) {
    const text = part.trim();
    if (!text) continue;
    const colon = text.indexOf(':');
    assert.notEqual(colon, -1, `declaration without a colon: ${text}`);
    declarations.set(text.slice(0, colon).trim(), text.slice(colon + 1).trim());
  }
  return declarations;
}

async function readTokenBlocks() {
  const css = await read('assets/css/tokens.css');
  const blocks = parseBlocks(css);
  const light = blocks.find(block => block.selector === ':root');
  const dark = blocks.find(block => block.selector === "[data-theme='dark']");
  assert.ok(light, 'tokens.css must declare a :root block');
  assert.ok(dark, "tokens.css must declare a [data-theme='dark'] block");
  return { css, blocks, light: parseDeclarations(light.body), dark: parseDeclarations(dark.body) };
}

test('tokens.css only declares custom properties (cannot change rendering on its own)', async () => {
  const { css, blocks } = await readTokenBlocks();

  assert.equal(blocks.length, 2, 'only the :root and dark blocks are allowed');
  assert.equal(blocks[0].selector, ':root');
  assert.equal(blocks[1].selector, "[data-theme='dark']");

  assert.doesNotMatch(css, /@tailwind|@apply/, 'tokens.css is linked, not compiled by Tailwind');
  assert.doesNotMatch(css, /!important/);

  for (const block of blocks) {
    const declarations = parseDeclarations(block.body);
    assert.ok(declarations.size > 0, `${block.selector} must declare variables`);
    for (const name of declarations.keys()) {
      assert.match(name, /^--[a-z0-9-]+$/, `unexpected declaration in ${block.selector}: ${name}`);
    }
  }
});

test('every token is an "R G B" triplet and both themes define the same names', async () => {
  const { light, dark } = await readTokenBlocks();

  for (const [theme, declarations] of [['light', light], ['dark', dark]]) {
    for (const [name, value] of declarations) {
      assert.match(value, /^\d{1,3} \d{1,3} \d{1,3}$/, `${theme} ${name} must be a "R G B" triplet, got "${value}"`);
      for (const channel of value.split(' ').map(Number)) {
        assert.ok(channel >= 0 && channel <= 255, `${theme} ${name} has an out-of-range channel: ${channel}`);
      }
    }
  }

  assert.deepEqual([...light.keys()].sort(), [...dark.keys()].sort(), 'both themes must define the same token set');
});

test('overlay and accent invariants never invert', async () => {
  const { light, dark } = await readTokenBlocks();

  for (const name of ['--border-white', '--text-white', '--overlay-white', '--overlay-black']) {
    assert.ok(light.has(name), `missing light value for ${name}`);
    assert.equal(dark.get(name), light.get(name), `${name} must not change between themes`);
  }
});

test('dark tokens reproduce the values of the existing styles.css overrides', async () => {
  const { dark } = await readTokenBlocks();

  // Each pair is [token, rgb triplet] taken from assets/css/styles.css.
  const expected = {
    '--bg-surface': '26 26 26',        // .bg-white -> var(--d-surface)
    '--bg-gray-50': '18 18 18',        // .bg-gray-50 -> var(--d-bg)
    '--bg-gray-100': '33 33 33',       // .bg-gray-100 -> var(--d-surface-2)
    '--bg-gray-200': '43 43 43',       // .bg-gray-200 -> var(--d-surface-3)
    '--bg-gray-300': '82 82 82',       // .bg-gray-300 -> #525252
    '--bg-primary-50': '37 44 73',     // .bg-primary-50 -> #252c49
    '--bg-primary-100': '48 56 93',    // .bg-primary-100 -> #30385d
    '--border-gray-100': '38 38 38',   // .border-gray-100 -> var(--d-border-soft)
    '--border-gray-200': '48 48 48',   // .border-gray-200 -> var(--d-border)
    '--border-gray-300': '82 82 82',   // .border-gray-300 -> #525252
    '--text-gray-300': '82 82 82',     // .text-gray-300 -> #525252
    '--text-gray-400': '115 115 115',  // .text-gray-400 -> var(--d-text-5)
    '--text-gray-500': '163 163 163',  // .text-gray-500 -> var(--d-text-4)
    '--text-gray-600': '212 212 212',  // .text-gray-600 -> var(--d-text-3)
    '--text-gray-700': '229 229 229',  // .text-gray-700 -> var(--d-text-2)
    '--text-gray-800': '245 245 245',  // .text-gray-800 -> #f5f5f5
    '--text-gray-900': '245 245 245',  // .text-gray-900 -> var(--d-text)
    '--text-primary-600': '147 197 253',
    '--text-primary-700': '147 197 253',
    '--app-canvas': '18 18 18',
    '--app-text': '245 245 245',
  };

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(dark.get(name), value, `${name} drifted from the styles.css dark override`);
  }
});

test('light tokens match the Tailwind palette they will replace', async () => {
  const { light } = await readTokenBlocks();

  const expected = {
    '--bg-surface': '255 255 255',
    '--bg-gray-50': '249 250 251',
    '--bg-gray-100': '243 244 246',
    '--bg-gray-200': '229 231 235',
    '--bg-gray-300': '209 213 219',
    '--bg-primary-50': '239 246 255',
    '--bg-primary-100': '219 234 254',
    '--border-gray-100': '229 231 235',
    '--border-gray-200': '229 231 235',
    '--border-gray-300': '209 213 219',
    '--text-gray-300': '209 213 219',
    '--text-gray-400': '156 163 175',
    '--text-gray-500': '107 114 128',
    '--text-gray-600': '75 85 99',
    '--text-gray-700': '55 65 81',
    '--text-gray-800': '31 41 55',
    '--text-gray-900': '17 24 39',
    '--text-primary-600': '37 99 235',
    '--text-primary-700': '29 78 216',
    '--app-canvas': '249 250 251',
    '--app-text': '17 24 39',
  };

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(light.get(name), value, `${name} no longer matches the Tailwind palette`);
  }
});

test('all three pages link tokens.css before their own theme styles', async () => {
  const main = await read('index.html');
  const character = await read('character/index.html');
  const novel = await read('novel/index.html');

  assert.match(main, /<link rel="stylesheet" href="assets\/css\/tokens\.css">/);
  assert.ok(main.indexOf('assets/css/tokens.css') < main.indexOf('assets/css/styles.css'),
    'tokens.css must load before styles.css in the main app');
  assert.ok(main.indexOf('assets/css/tokens.css') < main.indexOf('assets/generated/tailwind.css'),
    'tokens.css must load before the generated Tailwind bundle');

  assert.match(character, /<link href="\.\.\/assets\/css\/tokens\.css" rel="stylesheet">/);
  assert.ok(character.indexOf('assets/css/tokens.css') < character.indexOf('assets/generated/character.css'));

  assert.match(novel, /<link rel="stylesheet" href="\.\.\/assets\/css\/tokens\.css">/);
  assert.ok(novel.indexOf('assets/css/tokens.css') < novel.indexOf('assets/generated/novel.css'));
});

test('tokens.css ships with the web build', async () => {
  const buildWeb = await read('scripts/build-web.mjs');
  assert.match(buildWeb, /copyToDist\('assets\/css'\)/,
    'assets/css is copied wholesale, so tokens.css must keep living there');
});

test('Android cold-start dark background uses the charcoal color', async () => {
  const main = await read('android/app/src/main/java/com/roleplayhub/app/MainActivity.java');
  assert.match(main, /Color\.rgb\(18, 18, 18\)/);
  assert.doesNotMatch(main, /Color\.rgb\(17, 24, 39\)/,
    'the blue-tinted #111827 fallback must not come back');
});
test('the standalone workshop pages resolve neutral utilities through the shared tokens', async () => {
  // P3 (2026-11-26): character/novel Tailwind configs point their color
  // families at the same tokens.css triplets as the main app, so the palette
  // cannot fork again. Both pages are light-only by decision — neither may
  // activate [data-theme='dark'] (on the character page that attribute name
  // would also flip daisyui's own theme).
  const { pathToFileURL } = await import('node:url');
  const characterConfig = await read('tailwind.character.config.cjs');
  const novelConfig = await read('tailwind.novel.config.cjs');
  const tokens = await read('assets/css/tokens.css');

  for (const [name, config] of [['character', characterConfig], ['novel', novelConfig]]) {
    for (const family of ['backgroundColor', 'borderColor', 'textColor']) {
      assert.ok(config.includes(`${family}: {`), `${name} config wires ${family}`);
    }
    assert.match(config, /white: token\('bg-surface'\)/, `${name} maps bg-white to the surface token`);
    assert.match(config, /900: token\('text-gray-900'\)/, `${name} maps text-gray-900`);
    // Every token() reference must exist in tokens.css.
    const refs = [...config.matchAll(/token\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, `${name} config actually references tokens`);
    for (const ref of refs) {
      assert.ok(tokens.includes(`--${ref}:`), `${name} config references undefined token --${ref}`);
    }
  }

  assert.match(characterConfig, /require\('daisyui'\)/, 'the character page keeps daisyui');
  assert.doesNotMatch(novelConfig, /require\('daisyui'\)/, 'the novel page stays daisyui-free');
});
