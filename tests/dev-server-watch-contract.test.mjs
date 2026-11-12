// Dev-server watcher contract: keeps the Vite file watcher off the directories
// that are not part of the dev module graph.
//
// Chokidar walks the whole project root recursively, and .toolchains/ alone is
// ~35k files (JDK + Android SDK); android/, dist/, debug_apk/ and documents/
// add thousands more. On Windows that stalled Vite's event loop in multi-second
// bursts — an idle `/` request measured 1-50s with the watcher on and ~5ms with
// these paths ignored — so a later edit that drops the list silently brings the
// stall back. The defaults are spelled out too: passing an explicit `ignored`
// list replaces Vite's own defaults, and watching node_modules/.git would be
// worse than the original problem.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const MUST_IGNORE = [
    '.git',
    'node_modules',
    '.toolchains',
    'android',
    'dist',
    'debug_apk',
    'documents',
];

test('the dev server never watches the toolchain, build output or notes', async () => {
    const config = await read('../vite.config.mjs');
    assert.match(config, /server:\s*\{[\s\S]*?watch:\s*\{[\s\S]*?ignored:\s*\[/,
        'vite.config.mjs must declare server.watch.ignored');

    for (const dir of MUST_IGNORE) {
        assert.ok(config.includes(`'**/${dir}/**'`) || config.includes(`'**/${dir}*/**'`),
            `server.watch.ignored must cover ${dir}/ — watching it stalls the dev server`);
    }
});

test('the dev server still watches the directories that drive HMR', async () => {
    const config = await read('../vite.config.mjs');
    assert.ok(!config.includes("'**/src/**'"), 'src/ must stay watched or HMR stops working');
    assert.ok(!config.includes("'**/assets/**'"), 'assets/ must stay watched so CSS/vendor regen reloads');
    assert.ok(!config.includes("'**/*.html'") && !config.includes("'**/index.html'"),
        'index.html must stay watched');
});
