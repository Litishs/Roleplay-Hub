// Memory citations ([M12] chips) — contract tests for the marker helpers, the
// ledger ref allocation, the injection/strip wiring and the modal plumbing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

const {
    MEMORY_CITATION_COT_LINE,
    MEMORY_CITATION_INSTRUCTION,
    buildMemoryCitationItems,
    decorateMemoryCitations,
    protectCitations,
    restoreCitations,
    stripMemoryCitations
} = await import('../src/modules/memory-citation.mjs');
const {
    appendEntry,
    createEmptyLedger,
    normalizeLedger,
    nextEntryRef
} = await import('../src/modules/memory-ledger.mjs');

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('stripMemoryCitations removes every marker and nothing else', () => {
    assert.equal(stripMemoryCitations('她说。[M12]'), '她说。');
    assert.equal(stripMemoryCitations('[M3][M12] 都算。'), ' 都算。');
    assert.equal(stripMemoryCitations('没有标记'), '没有标记');
    assert.equal(stripMemoryCitations(null), '');
    assert.equal(stripMemoryCitations('M12 没有方括号'), 'M12 没有方括号');
});

test('display regexes cannot mangle protected markers', () => {
    const source = '状态[受伤] 她说。[M12]';
    const protectedText = protectCitations(source);
    assert.ok(!protectedText.includes('[M12]'), 'marker should be hidden');
    // A regex that rewrites every bracket pair must leave the marker intact.
    const rewritten = protectedText.replace(/\[([^\]]+)\]/g, '<span>$1</span>');
    assert.equal(restoreCitations(rewritten), '状态<span>受伤</span> 她说。[M12]');
});

test('decorateMemoryCitations turns markers into chips', () => {
    const document = new DOMParser().parseFromString('<p>她终于兑现了约定。[M12]</p>', 'text/html');
    assert.equal(decorateMemoryCitations(document), true);
    const chip = document.querySelector('.memory-cite');
    assert.ok(chip, 'chip must exist');
    assert.equal(chip.getAttribute('data-memory-refs'), '12');
    assert.equal(chip.textContent, '12');
    assert.match(chip.getAttribute('aria-label'), /M12/);
    assert.ok(document.body.textContent.includes('她终于兑现了约定。'));
    assert.ok(!document.body.textContent.includes('[M12]'));
});

test('decorateMemoryCitations handles multiple refs and skips code', () => {
    const document = new DOMParser().parseFromString(
        '<p>两处。[M3][M12]</p><pre><code>示例 [M99]</code></pre>',
        'text/html'
    );
    decorateMemoryCitations(document);
    const chips = [...document.querySelectorAll('.memory-cite')];
    // Adjacent markers form one chip carrying both refs (same as upstream).
    assert.equal(chips.length, 1);
    assert.equal(chips[0].getAttribute('data-memory-refs'), '3,12');
    assert.equal(chips[0].textContent, '3,12');
    assert.equal(document.querySelector('pre .memory-cite'), null, 'code samples must stay literal');
});

test('loose text carrying a marker is wrapped into a paragraph', () => {
    const document = new DOMParser().parseFromString('<div class="card"></div>\n她说。[M7]', 'text/html');
    decorateMemoryCitations(document);
    const paragraph = document.querySelector('p .memory-cite');
    assert.ok(paragraph, 'chip must end up inside a paragraph');
});

test('buildMemoryCitationItems flags entries that no longer exist', () => {
    const entries = [
        { id: 'a', ref: 3, text: '第三条' },
        { id: 'b', ref: 12, text: '第十二条' }
    ];
    const items = buildMemoryCitationItems([12, 99], entries);
    assert.deepEqual(items.map(item => item.ref), [12, 99]);
    assert.equal(items[0].missing, false);
    assert.equal(items[0].text, '第十二条');
    assert.equal(items[1].missing, true);
});

test('ledger refs are append-only and survive GC of earlier entries', () => {
    const ledger = createEmptyLedger();
    const first = appendEntry(ledger, { id: 'a', kind: 'digest', text: '一' });
    const second = appendEntry(ledger, { id: 'b', kind: 'digest', text: '二' });
    assert.equal(first.ref, 1);
    assert.equal(second.ref, 2);
    assert.equal(nextEntryRef(ledger), 3);

    // Re-appending an existing id must not rewrite the entry or its ref.
    const again = appendEntry(ledger, { id: 'a', kind: 'digest', text: '改过' });
    assert.equal(again.ref, 1);
    assert.equal(again.text, '一');

    // GC drops 'a'; 'b' keeps 2 and the next append continues at 3.
    ledger.entries = ledger.entries.filter(entry => entry.id !== 'a');
    const third = appendEntry(ledger, { id: 'c', kind: 'digest', text: '三' });
    assert.equal(second.ref, 2);
    assert.equal(third.ref, 3);
});

test('legacy ledgers are backfilled in entry order', () => {
    const ledger = createEmptyLedger();
    ledger.entries = [
        { id: 'a', kind: 'digest', text: '一', covers: [], base: [], meta: {} },
        { id: 'b', kind: 'fact', text: '二', covers: [], base: [], meta: {} }
    ];
    normalizeLedger(ledger);
    assert.deepEqual(ledger.entries.map(entry => entry.ref), [1, 2]);
    // Re-normalizing keeps the assigned refs.
    normalizeLedger(ledger);
    assert.deepEqual(ledger.entries.map(entry => entry.ref), [1, 2]);
});

test('ref never enters the identity path', async () => {
    const contentHash = await read('src/modules/content-hash.mjs');
    assert.ok(!contentHash.includes('ref'), 'canonicalMemoryText must not know about refs');
    const ledgerModule = await read('src/modules/memory-ledger.mjs');
    assert.ok(!/covers[\s\S]{0,80}ref/.test(ledgerModule), 'covers must not carry refs');
});

test('injection carries refs in TOC, recall and tool results', async () => {
    const app = await read('src/modules/app.mjs');
    assert.match(app, /const refTag = Number\(item\.ref\) > 0 \? `\[M\$\{Number\(item\.ref\)\}\] ` : '';/);
    assert.match(app, /const refAttr = Number\(item\.ref\) > 0 \? ` ref="M\$\{Number\(item\.ref\)\}"` : '';/);
    assert.match(app, /entry_id="\$\{escapeXmlAttribute\(entry\.entryId \|\| ''\)\}"\$\{refAttr\}/);
    const view = await read('src/modules/memory-view.mjs');
    assert.match(view, /ref: Number\(item\.entry\.ref\) \|\| 0/);
});

test('system prompt and CoT only ask for citations when refs exist', async () => {
    const sender = await read('src/composables/useMessageSender.mjs');
    assert.match(sender, /timelineDigestText\.includes\('\[M'\)/);
    assert.match(sender, /systemPromptParts\.push\(MEMORY_CITATION_INSTRUCTION\)/);
    assert.match(sender, /stripMemoryCitations\(stripUiTemplateUpdateBlock/);
    assert.ok(MEMORY_CITATION_INSTRUCTION.includes('[M12]'));
    assert.match(MEMORY_CITATION_INSTRUCTION, /只引用上下文中实际出现过的编号/);

    const cot = await read('src/modules/cot-builder.mjs');
    assert.match(cot, /MEMORY_CITATION_COT_LINE/);
    assert.ok(MEMORY_CITATION_COT_LINE.startsWith('- '));
});

test('rendering protects markers, restores them and decorates after sanitize', async () => {
    const renderer = await read('src/composables/useTemplateRenderer.mjs');
    assert.match(renderer, /const hasCitationMarkers = role === 'assistant' && processed\.includes\('\[M'\)/);
    assert.match(renderer, /processed = protectCitations\(processed\)/);
    assert.match(renderer, /processed = restoreCitations\(processed\)/);
    assert.match(renderer, /decorateMemoryCitationsHtml\(html\)/);
    assert.match(renderer, /'data-memory-refs'/);
});

test('every outward-facing surface strips citations', async () => {
    const tts = await read('src/modules/tts-text.mjs');
    assert.match(tts, /import \{ stripMemoryCitations \} from '\.\/memory-citation\.mjs'/);
    assert.match(tts, /let out = stripMemoryCitations\(text\)/);

    const summary = await read('src/modules/conversation-summary.mjs');
    assert.match(summary, /const main = stripMemoryCitations\(parseCot/);

    const app = await read('src/modules/app.mjs');
    assert.match(app, /navigator\.clipboard\.writeText\(stripMemoryCitations\(content\)\)/);
    assert.match(app, /msg\.editMessageContent = stripMemoryCitations\(parseCot\(msg\.content\)\.main\)/);
    assert.match(app, /stripMemoryCitations\(stripVectorMemoryCode\(parseCot/);
});

test('the 判断依据 modal is mounted and fed from the ledger', async () => {
    const dialog = await read('src/components/common/ModalDialog.vue');
    assert.match(dialog, /v-if="memoryCitationItems\.length > 0"/);
    assert.match(dialog, /判断依据/);
    assert.match(dialog, /这条记忆已不存在/);
    assert.match(dialog, /M\{\{ item\.ref \}\}/);

    const app = await read('src/modules/app.mjs');
    assert.match(app, /const handleMemoryCitationClick = \(event\) => \{/);
    assert.match(app, /document\.addEventListener\('click', handleMemoryCitationClick\)/);
    assert.match(app, /memoryCitationItems,\s*\n\s*closeMemoryCitation,/);
});
test('M2: the memory panel shows refs and opens the full entry text', async () => {
    const panel = await read('src/components/views/MemoryPanel.vue');
    assert.match(panel, /M\{\{ item\.ref \}\}/, 'the TOC row carries the ref badge');
    assert.match(panel, /@click="openMemoryEntryDetail\(item\.entryId\)"/, 'rows open the detail overlay');
    assert.match(panel, /@click.stop="toggleFoldSources/, 'the fold button must not trigger the row click');
    assert.match(panel, /memoryEntryDetail/, 'the detail overlay state exists');
    assert.match(panel, /记忆原文/, 'the overlay is labelled');

    const app = await read('src/modules/app.mjs');
    assert.match(app, /getMemoryEntryDetail: \(entryId\) => \{/, 'the ledger lookup lives in app.mjs');
    const ctx = app.slice(app.indexOf('const __ctx = {'));
    // The memory block sits deep in the context object; window covers it.
    assert.ok(ctx.slice(0, 12000).includes('getMemoryEntryDetail'), 'the lookup travels through __ctx');
});

test('M2: the context viewer highlights citation markers', async () => {
    const sender = await read('src/composables/useMessageSender.mjs');
    // The highlight runs on the ESCAPED content right after escapeHtml, so the
    // inserted <mark> cannot inherit user content.
    const escapeAt = sender.indexOf('let renderedContent = escapeHtml(m.content);');
    assert.ok(escapeAt > 0, 'the viewer escape must exist');
    const highlight = sender.slice(escapeAt).match(/renderedContent\.replace\(\s*\/\\\[M\\d\{1,6\}\\\]\/g/);
    assert.ok(highlight, 'citation highlighting runs after escaping');
});
