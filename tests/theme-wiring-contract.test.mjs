// Phase 2 of the theme-token refactor: Tailwind utilities now resolve through
// the tokens.css variables. These tests pin the mapping and the rules that had
// to stay hand-written because a single token cannot express them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tailwind maps each utility family to its own token namespace', async () => {
  const config = await read('tailwind.main.config.cjs');

  // Background: white is the card surface, gray the page/raised steps.
  assert.match(config, /backgroundColor:\s*\{[\s\S]*?white:\s*token\('bg-surface'\)/);
  assert.match(config, /50:\s*token\('bg-gray-50'\)/);
  assert.match(config, /100:\s*token\('bg-gray-100'\)/);
  assert.match(config, /200:\s*token\('bg-gray-200'\)/);
  assert.match(config, /300:\s*token\('bg-gray-300'\)/);
  assert.match(config, /50:\s*token\('bg-primary-50'\)/);
  assert.match(config, /100:\s*token\('bg-primary-100'\)/);
  assert.match(config, /overlay:\s*\{[\s\S]*?white:\s*token\('overlay-white'\)/);
  assert.match(config, /black:\s*token\('overlay-black'\)/);

  // Border: white is a glass edge and never flips.
  assert.match(config, /borderColor:\s*\{[\s\S]*?white:\s*token\('border-white'\)/);
  assert.match(config, /100:\s*token\('border-gray-100'\)/);
  assert.match(config, /200:\s*token\('border-gray-200'\)/);
  assert.match(config, /300:\s*token\('border-gray-300'\)/);

  // Text: white stays white on accent surfaces; gray/primary flip.
  assert.match(config, /textColor:\s*\{[\s\S]*?white:\s*token\('text-white'\)/);
  for (const step of [300, 400, 500, 600, 700, 800, 900]) {
    assert.match(config, new RegExp(`${step}:\\s*token\\('text-gray-${step}'\\)`));
  }
  assert.match(config, /600:\s*token\('text-primary-600'\)/);
  assert.match(config, /700:\s*token\('text-primary-700'\)/);
});

test('every token referenced by the config exists in tokens.css', async () => {
  const config = await read('tailwind.main.config.cjs');
  const tokens = await read('assets/css/tokens.css');

  const referenced = [...config.matchAll(/token\('([a-z0-9-]+)'\)/g)].map((match) => match[1]);
  assert.ok(referenced.length >= 20, 'expected the token helper to be used throughout');
  const defined = new Set([...tokens.matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1]));
  for (const name of referenced) {
    assert.ok(defined.has(name), `tokens.css is missing --${name}`);
  }
});

test('glass highlights use the overlay token instead of bg-white', async () => {
  const index = await read('index.html');
  const panel = await read('src/components/views/CharacterPanel.vue');

  // Low-opacity white over covers/avatars must not flip to charcoal.
  assert.doesNotMatch(index, /bg-white\/(?:10|20|30)\b/);
  assert.doesNotMatch(panel, /bg-white\/(?:10|20|30|40)\b/);
  assert.match(index, /bg-overlay-white\/20/);
  assert.match(panel, /bg-overlay-white\/20/);
  assert.match(panel, /active:bg-overlay-white\/40/);
});

test('redundant dark overrides are gone but divergent ones stay', async () => {
  const css = await read('assets/css/styles.css');

  // Reproduced exactly by the tokens. (bg-gray-50 also prefixes the kept /30
  // rule, so match the opaque rule's opening brace instead of a substring.)
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.bg-white\s*\{/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.bg-gray-50\s*\{/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.bg-gray-100\s*\{/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.text-gray-700\s*\{/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.border-gray-200\s*\{/);
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.bg-primary-50\s*\{/);
  for (const selector of ['.bg-white\\/70', '.focus\\:bg-white:focus']) {
    assert.ok(!css.includes(selector), `${selector} should be token-driven now`);
  }

  // Divergences a single token cannot express:
  // - hover:bg-gray-50 and hover:bg-white land one surface step higher;
  // - the translucent gray-50 steps use the surface color, not the page canvas;
  // - gray-50/80 is 85% opaque, not 80%.
  assert.match(css, /\[data-theme='dark'\] \.hover\\:bg-gray-50:hover/);
  assert.match(css, /\[data-theme='dark'\] \.hover\\:bg-white:hover/);
  assert.match(css, /\[data-theme='dark'\] \.md\\:hover\\:bg-white:hover/);
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-50\\\/30/);
  // - gray-50/80 is 85% opaque, not 80% (and now reads the palette variable).
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-50\\\/80\s*\{\s*background-color:\s*rgb\(var\(--bg-gray-50\) \/ \.85\)/);
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-200\\\/50/);
  assert.match(css, /\[data-theme='dark'\] \.border-gray-100\\\/60/);
  assert.match(css, /\[data-theme='dark'\] \.border-gray-400\\\/80/);
});

test('semantic tints and component overrides are untouched by phase 2', async () => {
  const css = await read('assets/css/styles.css');

  // Not mapped in this phase, so their hand-written dark values must survive.
  for (const selector of [
    "[data-theme='dark'] .bg-red-50",
    "[data-theme='dark'] .border-green-200",
    "[data-theme='dark'] .text-rose-700",
    "[data-theme='dark'] .app-sidebar",
    "[data-theme='dark'] .settings-help-trigger"
  ]) {
    assert.ok(css.includes(selector), `${selector} must stay until its own phase`);
  }
});