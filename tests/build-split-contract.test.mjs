import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Phase 4.2 build optimization: view panels only render behind
// v-if="currentView === ..." so they must be async components (separate
// chunks loaded on first navigation). WorldInfoPanel is always mounted and
// stays synchronous. Settings sub-panels are consumed by SettingsPanel.vue,
// never by app.mjs.

const ASYNC_PANELS = [
    'CharacterPanel', 'GeneratorPanel', 'SquarePanel', 'SettingsPanel',
    'PresetsPanel', 'UiTemplatePanel', 'RegexPanel', 'ToolsPanel',
    'UsageStatsPanel', 'MemoryPanel',
];

test('view panels are defineAsyncComponent dynamic imports in app.mjs', async () => {
    const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
    for (const panel of ASYNC_PANELS) {
        assert.match(
            app,
            new RegExp(`const Async${panel} = defineAsyncComponent\\(\\(\\) => import\\('../components/views/${panel}\\.vue'\\)\\)`),
            `${panel} must be loaded via defineAsyncComponent(() => import(...))`,
        );
        assert.ok(
            !app.includes(`import ${panel} from '../components/views/${panel}.vue'`),
            `${panel} must not be statically imported into the startup bundle`,
        );
    }
});

test('app.mjs registers async wrappers under the original panel names', async () => {
    const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
    for (const panel of ASYNC_PANELS) {
        assert.ok(
            app.includes(`${panel}: Async${panel}`),
            `components registration must map ${panel} to Async${panel}`,
        );
    }
});

test('WorldInfoPanel stays a synchronous import (always-mounted shared modals host)', async () => {
    const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
    assert.match(app, /import WorldInfoPanel from '\.\.\/components\/views\/WorldInfoPanel\.vue';/);
});

test('app.mjs does not import settings sub-panels directly (SettingsPanel.vue owns them)', async () => {
    const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
    assert.ok(!app.includes("from '../components/settings/"), 'app.mjs must not import components/settings/*.vue');
});
