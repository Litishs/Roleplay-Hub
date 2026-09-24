import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Contract tests for the "墨韵·造梦" (Moyun) novel workshop standalone page and
// its host-app integration (documents/墨韵造梦移植工程方案.md §7 checklist).
// The page is NOT processed by Vite, so these are text-assertion contracts on
// the raw sources, mirroring tests like tailwind-content-contract.

const read = (url) => readFile(url, 'utf8').then(s => s.replace(/\r\n/g, '\n'));
const NOVEL_PAGE = new URL('../novel/index.html', import.meta.url);
const NOVEL_API_UTILS = new URL('../assets/js/novel-api-utils.js', import.meta.url);
const APP = new URL('../src/modules/app.mjs', import.meta.url);

test('novel page exists and stays fully offline (no CDN or remote resources)', async () => {
    const page = await read(NOVEL_PAGE);
    for (const host of ['unpkg.com', 'cdn.tailwindcss.com', 'jsdelivr', 'fonts.googleapis.com', 'fonts.gstatic.com', 'picui']) {
        assert.ok(!page.includes(host), `novel page must not reference ${host}`);
    }
    assert.ok(!/<(script|link)[^>]+(src|href)="https?:/i.test(page), 'script/link tags must use local relative paths only');
});

test('novel page loads vendored dependencies only', async () => {
    const page = await read(NOVEL_PAGE);
    for (const ref of [
        '../assets/vendor/vue.global.prod.js',
        '../assets/vendor/marked.umd.js',
        '../assets/js/novel-api-utils.js',
        '../assets/generated/novel.css'
    ]) {
        assert.ok(page.includes(ref), `novel page must reference ${ref}`);
    }
});

test('novel page keeps the upstream attribution header (D7: sole attribution spot)', async () => {
    const page = await read(NOVEL_PAGE);
    assert.ok(page.includes('STA1N'), 'upstream attribution (STA1N) must remain');
    assert.ok(page.includes('墨韵·造梦'), 'original project title must remain');
});

test('novel page persists through the NOVEL_STORAGE bridge and whitelisted keys only', async () => {
    const page = await read(NOVEL_PAGE);
    for (const marker of ['NOVEL_STORAGE_GET', 'NOVEL_STORAGE_SET', 'NOVEL_STORAGE_RESULT']) {
        assert.ok(page.includes(marker), `page must implement the ${marker} protocol`);
    }
    assert.match(page, /const NOVEL_LIBRARY_STORAGE_KEY = 'novel_library';/, 'library key must stay novel_library');
    assert.match(page, /const NOVEL_SETTINGS_STORAGE_KEY = 'novel_settings';/, 'settings key must stay novel_settings');
    // standalone fallback: window.parent === window -> IndexedDB for library data
    assert.match(page, /const isEmbeddedInHost = \(\) => window\.parent !== window;/, 'embedded detection must stay intact');
    assert.ok(page.includes("indexedDB.open('RPHubDB')"), 'standalone fallback must use the RPHubDB IndexedDB');
    // upstream postMessage handshake and localStorage are removed (D10)
    assert.ok(!page.includes('REQUEST_RPHUB_API_SETTINGS'), 'upstream API-settings handshake must be removed');
    assert.ok(!page.includes('localStorage'), 'page must not use localStorage');
});

test('novel page never persists API keys locally (embedded: bridge, standalone: memory-only)', async () => {
    const page = await read(NOVEL_PAGE);
    // settings saver bails out when standalone (keys stay memory-only) and
    // otherwise round-trips through the bridge into the host secret channel
    assert.match(
        page,
        /const saveNovelSettings = async \(\) => \{\s*if \(!isEmbeddedInHost\(\)\) return;/,
        'settings saver must be a no-op when standalone (keys stay memory-only)'
    );
    assert.match(page, /novelStorageSet\(NOVEL_SETTINGS_STORAGE_KEY/, 'settings are saved through the storage bridge');
});

test('novel-api-utils exposes the slim upstream transport surface (D9)', async () => {
    const src = await read(NOVEL_API_UTILS);
    for (const marker of ['RPHubApiClient', 'requestChatCompletion', 'requestJson', 'buildApiEndpoint', 'extractNativeReasoning', 'isNativeReasoningPart', 'extractApiErrorMessage', 'formatApiErrorMessage', 'getApiUsagePayload']) {
        assert.ok(src.includes(marker), `transport must expose ${marker}`);
    }
    assert.ok(src.includes('STA1N'), 'upstream attribution must remain');
    assert.ok(src.includes('CC BY-NC 4.0'), 'license note must remain');
});

test('novel view is wired into the host app (panel mount, nav entry, async chunk)', async () => {
    const html = await read(new URL('../index.html', import.meta.url));
    assert.ok(html.includes("<novel-panel v-if=\"currentView === 'novel'\"></novel-panel>"), 'index.html must mount the novel panel');
    const nav = await read(new URL('../src/components/common/SideNav.vue', import.meta.url));
    assert.ok(nav.includes("currentView = 'novel'"), 'SideNav must offer the novel view');
    const app = await read(APP);
    assert.match(app, /const AsyncNovelPanel = defineAsyncComponent\(\(\) => import\('\.\.\/components\/views\/NovelPanel\.vue'\)\);/, 'novel panel must be an async chunk');
    assert.ok(app.includes('NovelPanel: AsyncNovelPanel'), 'components must register the novel panel');
    assert.ok(app.includes("const novelUrl = ref('./novel/index.html');"), 'novel iframe URL state must exist');
    assert.ok(app.includes('isNovelLoading') && app.includes('onNovelLoad'), 'novel loading state must exist');
    assert.match(app, /newView === 'novel'/, 'view watcher must refresh the novel iframe');
    assert.ok(app.includes('isNovelLoading, novelUrl, onNovelLoad, // Novel exports'), 'ctx must export the novel view state');
});

test('novel build wiring: tailwind config, build:css third pass, build-web copy', async () => {
    const config = await read(new URL('../tailwind.novel.config.cjs', import.meta.url));
    assert.ok(config.includes('./novel/index.html'), 'tailwind config must scan the novel page');
    assert.ok(config.includes('./assets/js/novel-api-utils.js'), 'tailwind config must scan the transport file');
    assert.ok(config.includes('Noto Serif SC'), 'font stacks must follow D8 (system serif, no webfont files)');
    const pkg = JSON.parse(await read(new URL('../package.json', import.meta.url)));
    const buildCss = pkg.scripts['build:css'];
    assert.ok(buildCss.includes('tailwind.novel.config.cjs') && buildCss.includes('assets/generated/novel.css'), 'build:css must emit novel.css as the third pass');
    const buildWeb = await read(new URL('../scripts/build-web.mjs', import.meta.url));
    assert.match(buildWeb, /path\.join\(root, 'novel'\)/, 'build-web must copy the novel page into dist');
});

test('host app answers the novel storage bridge with a strict whitelist', async () => {
    const app = await read(APP);
    for (const marker of ['NOVEL_STORAGE_GET', 'NOVEL_STORAGE_SET', 'NOVEL_STORAGE_RESULT']) {
        assert.ok(app.includes(marker), `host listener must implement ${marker}`);
    }
    assert.match(app, /const NOVEL_STORAGE_ALLOWED_KEYS = \['novel_library', 'novel_settings'\];/, 'host must whitelist exactly the two novel keys');
    assert.ok(app.includes("document.querySelector('iframe[src*=\"novel/index.html\"]')"), 'host must verify the sender is the novel iframe');
    assert.ok(app.includes('window.addEventListener(\'message\', handleNovelStorageRequest)'), 'bridge listener must be registered');
    assert.ok(app.includes('await RPHStorage.get(data.key)'), 'GET must round-trip through RPHStorage');
    assert.ok(app.includes('await RPHStorage.set(data.key, data.value)'), 'SET must round-trip through RPHStorage');
});

test('novel_settings rides the secret channel (storage-repository gate)', async () => {
    const repo = await read(new URL('../src/modules/storage-repository.mjs', import.meta.url));
    assert.match(repo, /isSecretBearingKey = key => [^\n]*novel_settings/, 'secret-bearing gate must include novel_settings');
});
