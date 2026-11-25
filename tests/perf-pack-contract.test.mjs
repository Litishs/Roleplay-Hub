// Performance pack contract tests (2026-11-25):
// world-info scan caches, deferred context-viewer snapshot, yield before the
// synchronous send path, test-before-replace regex scripts, and the oversized
// avatar -> blob URL resolver.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createWorldInfoScanCache, compileWorldInfoRegex } from '../src/modules/world-info-cache.mjs';
import { replaceMatched } from '../src/modules/regex-utils.mjs';
import { createAvatarUrlResolver } from '../src/modules/avatar-url.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('world-info cache: scan text matches the manual slice/join for every depth', () => {
    const cache = createWorldInfoScanCache();
    const contents = ['one', 'two', 'three', 'four'];
    assert.equal(cache.scanText(2, contents), 'three\nfour');
    assert.equal(cache.scanText(4, contents), 'one\ntwo\nthree\nfour');
    // slice(-0) yields the whole history; callers guard depth 0 before calling.
    assert.equal(cache.scanText(0, contents), 'one\ntwo\nthree\nfour');
    // Same depth, same snapshot -> same string.
    assert.equal(cache.scanText(2, contents), 'three\nfour');
});

test('world-info cache: regex objects are compiled once per pattern', () => {
    const cache = createWorldInfoScanCache();
    const first = cache.regex('hero');
    const second = cache.regex('hero');
    assert.equal(first, second, 'same compiled RegExp instance expected');

    // /pattern/flags form is supported, and global is stripped so test() is stateless.
    const flagged = cache.regex('/boss/gi');
    assert.equal(flagged.flags.includes('g'), false);
    assert.equal(flagged.test('BOSS'), true);

    // Invalid patterns resolve to null once instead of throwing on every check.
    assert.equal(cache.regex('('), null);
    assert.equal(cache.regex('('), null);
});

test('world-info cache: lower() is consistent with String#toLowerCase', () => {
    const cache = createWorldInfoScanCache();
    assert.equal(cache.lower('AbC'), 'abc');
    assert.equal(cache.lower('AbC'), 'abc');
    assert.equal(cache.lower(undefined), '');
});

test('compileWorldInfoRegex keeps the historical flag normalization', () => {
    const regex = compileWorldInfoRegex('/Hello/g');
    assert.equal(regex.source, 'Hello');
    assert.equal(regex.flags.includes('g'), false);
    assert.equal(regex.flags.includes('i'), true);

    // \p{...} needs the u flag, otherwise the pattern would throw at test time.
    const unicode = compileWorldInfoRegex('\\p{Script=Han}');
    assert.equal(unicode.flags.includes('u'), true);
});

test('replaceMatched skips the replacement when nothing matches', () => {
    const re = /needle/g;
    let calls = 0;
    const replacement = () => {
        calls += 1;
        return 'hit';
    };
    assert.equal(replaceMatched('haystack', re, replacement), 'haystack');
    assert.equal(calls, 0, 'replacement function must not be invoked without a match');

    assert.equal(replaceMatched('needle and needle', re, replacement), 'hit and hit');
    assert.equal(calls, 2);
});

test('replaceMatched resets lastIndex before testing a global regex', () => {
    const re = /a/g;
    re.lastIndex = 3;
    assert.equal(replaceMatched('aa', re, 'b'), 'bb');
});

test('replaceMatched leaves sticky regexes to replace()', () => {
    const re = /a/y;
    assert.equal(replaceMatched('ab', re, 'c'), 'cb');
});

test('avatar resolver: small and non-data sources pass through', () => {
    const resolver = createAvatarUrlResolver({ threshold: 64 });
    assert.equal(resolver.resolve('http://localhost/_capacitor_file_/a.png'), 'http://localhost/_capacitor_file_/a.png');
    assert.equal(resolver.resolve('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(resolver.resolve(''), '');
    assert.equal(resolver.resolve(null), '');
});

test('avatar resolver: oversized data URLs become blob URLs and are revoked on change', () => {
    const created = [];
    const revoked = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
        created.push(blob);
        return `blob:test-${created.length}`;
    };
    URL.revokeObjectURL = (url) => revoked.push(url);

    try {
        const resolver = createAvatarUrlResolver({ threshold: 16 });
        const big = 'data:image/png;base64,' + 'A'.repeat(32);
        const first = resolver.resolve(big);
        assert.equal(first, 'blob:test-1');
        assert.equal(created[0].type, 'image/png');

        // Same source -> cached URL, no second blob.
        assert.equal(resolver.resolve(big), 'blob:test-1');
        assert.equal(created.length, 1);

        // New source -> previous URL revoked.
        const next = resolver.resolve('data:image/png;base64,' + 'B'.repeat(32));
        assert.equal(next, 'blob:test-2');
        assert.deepEqual(revoked, ['blob:test-1']);

        resolver.dispose();
        assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
    } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    }
});

test('avatar resolver: malformed payload falls back to the original string', () => {
    const resolver = createAvatarUrlResolver({ threshold: 8 });
    const malformed = 'data:image/png;base64,!!!!';
    assert.equal(resolver.resolve(malformed), malformed);
});

test('send path yields to the UI and defers the context-viewer snapshot', async () => {
    const sender = await read('src/composables/useMessageSender.mjs');
    assert.match(sender, /import \{[^}]*yieldToUi[^}]*\} from '\.\.\/modules\/utils\.mjs'/);
    assert.match(sender, /await yieldToUi\(\);\s*\n[\s\S]{0,600}createWorldInfoScanCache\(\)/,
        'yieldToUi must run before the world-info scan');
    assert.match(sender, /const buildContextViewerSnapshot = \(\) => \{/);
    assert.match(sender, /setTimeout\(buildContextViewerSnapshot, 0\)/);
    assert.match(sender, /const buildContextViewerSnapshot = \(\) => \{[\s\S]{0,400}lastContextMessages\.value = messages\.map/,
        'the snapshot must live inside the deferred builder');
});

test('world-info scan uses the shared caches', async () => {
    const sender = await read('src/composables/useMessageSender.mjs');
    assert.match(sender, /worldInfoScanCache\.scanText\(entryScanDepth, postprocessedChatContents\)/);
    assert.match(sender, /worldInfoScanCache\.lower\(rawText\)\.includes\(worldInfoScanCache\.lower\(rawKey\)\)/);
    assert.match(sender, /worldInfoScanCache\.regex\(rawKey\)/);
    assert.doesNotMatch(sender, /const createWorldInfoRegex = \(pattern\)/,
        'the regex compiler now lives in the cache module');
});

test('regex scripts use test-before-replace on both branches', async () => {
    const pipeline = await read('src/composables/useRegexPipeline.mjs');
    assert.match(pipeline, /import \{ replaceMatched \} from '\.\.\/modules\/regex-utils\.mjs'/);
    assert.match(pipeline, /part => replaceMatched\(part, re, replacement\)/);
    assert.match(pipeline, /result = replaceMatched\(result, re, replacement\)/);
    assert.doesNotMatch(pipeline, /part\.replace\(re, replacement\)/);
});

test('chat avatars render through the resolver-backed computed', async () => {
    const app = await read('src/modules/app.mjs');
    const info = await read('src/components/chat/CharacterInfo.vue');
    const list = await read('src/components/chat/MessageList.vue');

    assert.match(app, /import \{ createAvatarUrlResolver \} from '\.\/avatar-url\.mjs'/);
    assert.match(app, /const currentCharacterAvatar = computed\(\(\) => avatarUrlResolver\.resolve\(currentCharacter\.value\?\.avatar \|\| ''\)\)/);
    assert.match(app, /currentCharacter, currentCharacterAvatar, currentCharacterIndex/);

    for (const [name, source] of [['CharacterInfo', info], ['MessageList', list]]) {
        assert.match(source, /currentCharacterAvatar/, `${name} must bind the resolved avatar`);
        assert.doesNotMatch(source, /:src="currentCharacter\?\.avatar"/, `${name} still binds the raw data URL`);
    }
    // Background visibility still keys off the raw avatar being present.
    assert.match(info, /settings\.useCharacterBackground && currentCharacter && currentCharacter\?\.avatar/);
});