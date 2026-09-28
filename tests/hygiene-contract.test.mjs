// Repository hygiene contract: no machine-specific data may appear inside this
// folder (working tree + git-tracked surface).
//
// Covers two carriers; any hit fails with a fix hint:
//   1. Content: Windows user-directory absolute paths (drive letter, then a
//      "Users" segment, then the account name) — the highest-risk shape for
//      leaking the local username
//   2. Local data artifacts: local.properties, keystore, data-safety backups,
//      diagnostics output — files .gitignore designates as "this machine
//      only" must never enter the working tree surface
//
// Deliberately NO keyword blocklist for machine/username names: a blocklist
// would have to embed those very traits in this public file, leaking the
// information it is meant to guard. The path regex below catches the
// realistic leak shape without knowing any concrete names.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Machine-trait patterns: a hit means a violation
const FORBIDDEN_CONTENT = [
    /[a-z]:[\\/]+users[\\/]+[^\s"']+/i
];

// Machine-only data files: once tracked by git (i.e. pushed into the public
// repo with the next push) they count as violations.
// android/local.properties is standard local build config (sdk.dir pointing at
// the SDK) — machine-specific by design and ignored by android/.gitignore —
// so it may exist in the working tree but must never be tracked.
const FORBIDDEN_TRACKED_ARTIFACTS = [
    'android/local.properties',
    'android/keystore.properties',
    'android/keystore',
    '.rphub-diag-out'
];

const listWorkspaceFiles = async () => {
    const { stdout } = await execFileAsync('git', [
        'ls-files', '--cached', '--others', '--exclude-standard', '-z'
    ], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    return stdout.split('\0').filter(Boolean);
};

const isBinary = (buffer) => {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
    return sample.includes(0);
};

test('file content carries no machine traits (user-directory absolute paths)', async () => {
    const files = await listWorkspaceFiles();
    assert.ok(files.length > 200, 'file list must not be empty (git availability check)');
    for (const file of files) {
        let buffer;
        try {
            buffer = await readFile(path.join(root, file));
        } catch (_) {
            continue; // Race: skip files deleted/replaced during the scan
        }
        if (isBinary(buffer)) continue;
        const text = buffer.toString('utf8');
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index++) {
            for (const pattern of FORBIDDEN_CONTENT) {
                assert.ok(!pattern.test(lines[index]),
                    `"${file}" line ${index + 1} carries machine traits (hit ${pattern}). ` +
                    `Remove it or switch to relative paths / runtime resolution (process.cwd(), import.meta.url, etc.).`);
            }
        }
    }
});

test('local data artifacts are not git-tracked (gitignored local build config may exist)', async () => {
    const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '-z'], {
        cwd: root, maxBuffer: 16 * 1024 * 1024
    });
    const tracked = new Set(stdout.split('\0').filter(Boolean));
    for (const artifact of FORBIDDEN_TRACKED_ARTIFACTS) {
        assert.ok(!tracked.has(artifact),
            `"${artifact}" is tracked by git — it contains SDK paths/keys/user data and must never enter a commit. ` +
            `Run git rm --cached "${artifact}" and confirm .gitignore covers it.`);
    }
    // If android/local.properties exists it must be covered by .gitignore
    // (standard local build config, required for on-device builds; ignored
    // means it never enters a commit). Absent (no local Android builds) → skip.
    let localPropertiesExists = false;
    try {
        await stat(path.join(root, 'android', 'local.properties'));
        localPropertiesExists = true;
    } catch (_) { /* absent → nothing to check */ }
    if (localPropertiesExists) {
        const { stdout: ignored } = await execFileAsync(
            'git', ['check-ignore', 'android/local.properties'],
            { cwd: root }
        );
        assert.equal(ignored.trim(), 'android/local.properties',
            'android/local.properties exists but is not covered by .gitignore — it contains absolute SDK paths and must be ignored');
    }
});
