// Dependency-audit contract: pins the three decisions that made the weekly
// "Dependency audit" workflow actionable again (it ran red on 2026-10-05).
//
//   1. @capacitor/android >= 7.6.9 — CVE-2026-103922 lets remote content load
//      at the app origin through the internal HTTP proxy path, and it is a
//      native-layer hole that ships inside the APK, so a floor (or lockfile)
//      dropped back below the fix silently reopens it.
//   2. @huggingface/transformers is a build-time dependency — the app runs the
//      vendored assets/vendor/transformers copy at runtime, so the npm package
//      only serves as a source of files.  In `dependencies` it put its Node-only
//      sharp/onnxruntime-node tree into the audit's production scope.
//   3. The audit step passes --omit=dev — Tailwind 3's dev-only
//      braces/chokidar/micromatch chain is patchable only by a Tailwind 4
//      migration, so auditing it keeps the scan red until nobody reads it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const MIN_CAPACITOR_ANDROID = [7, 6, 9];

const parseVersion = (value, label) => {
    const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
    assert.ok(match, `cannot read a version out of ${label} "${value}"`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const atLeast = (actual, floor) => {
    for (let index = 0; index < floor.length; index++) {
        if (actual[index] !== floor[index]) return actual[index] > floor[index];
    }
    return true;
};

test('the declared Capacitor Android range never drops below the advisory fix', async () => {
    const pkg = JSON.parse(await read('../package.json'));
    const range = pkg.dependencies['@capacitor/android'];
    assert.ok(range, '@capacitor/android must stay a runtime dependency — it is the native shell');
    assert.ok(atLeast(parseVersion(range, '@capacitor/android range'), MIN_CAPACITOR_ANDROID),
        `@capacitor/android range "${range}" resolves below 7.6.9, the fix for the critical ` +
        'WebView proxy-path advisory (CVE-2026-103922)');
});

test('the installed Capacitor Android is at or above the advisory fix', async () => {
    const lock = JSON.parse(await read('../package-lock.json'));
    const installed = lock.packages['node_modules/@capacitor/android']?.version;
    assert.ok(installed, 'package-lock.json must pin @capacitor/android — npm ci installs from it');
    assert.ok(atLeast(parseVersion(installed, 'locked @capacitor/android'), MIN_CAPACITOR_ANDROID),
        `the lockfile pins @capacitor/android ${installed}, below the 7.6.9 fix for CVE-2026-103922`);
});

test('the removed embedding runtime leaves no build-time dependency behind', async () => {
    const pkg = JSON.parse(await read('../package.json'));
    // v6 L3 removed the on-device embedding stack: no runtime, dev or
    // lockfile trace of @huggingface/transformers may remain.
    assert.ok(!pkg.dependencies['@huggingface/transformers']);
    assert.ok(!pkg.devDependencies['@huggingface/transformers']);
    const lock = JSON.parse(await read('../package-lock.json'));
    assert.ok(!Object.keys(lock.packages || {}).some(key => key.includes('@huggingface/transformers')));
});

test('the dependency audit workflow scans production dependencies only', async () => {
    const workflow = await read('../.github/workflows/npm-audit.yml');
    assert.match(workflow, /run:\s*npm audit --omit=dev --audit-level=high/,
        'the audit step must run `npm audit --omit=dev --audit-level=high`; dropping --omit=dev pulls the ' +
        'dev-only Tailwind toolchain back into the scan, which can only be cleared by a Tailwind 4 migration');
});
