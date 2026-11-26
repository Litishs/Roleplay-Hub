// W1-W4 contract: the character workshop's "smart edit" switched from the
// FIND/REPLACE text-patch protocol to the numbered whole-unit rewrite protocol
// (<edit_plan> JSON), with a folded-diff confirm modal, a thinking panel, and
// the professional (non-jailbreak) preamble. Design record: documents/上游2.0
// 功能采纳工程方案 §3 (D-G=W-B text protocol, D-E=Chinese preamble, D-F=<think>).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('W1: the numbered edit protocol replaces the FIND/REPLACE patches', async () => {
    const page = await read('character/index.html');
    // New protocol pieces.
    assert.match(page, /const editTextFields = \['name', 'description', 'personality', 'first_mes', 'creator_notes', 'system_prompt', 'post_history_instructions'\]/);
    assert.match(page, /<edit_plan>/, 'the plan block format is documented in the prompt');
    assert.match(page, /const extractEditPlanText = /);
    assert.match(page, /parseJsonLoose\(cleaned\)/, 'the loose JSON stack stays as the fallback parser');
    assert.match(page, /出现重复编号/, 'duplicate ids (claimId) are rejected');
    assert.match(page, /const buildEditSnapshot = /);
    assert.match(page, /buildEditSnapshot\(\) !== editSnapshotSource/, 'a drifted card invalidates the plan');
    assert.match(page, /(?:\.\.\.){0,1}\(baseExport \|\| \{\}\), \.\.\.item/, 'merge semantics: unsubmitted props keep snapshot values');

    // Old protocol symbols must be gone.
    assert.doesNotMatch(page, /<<<<<<<FIND/);
    assert.doesNotMatch(page, /const processDiffs/);
    assert.doesNotMatch(page, /applyStructuredJsonDiff|applyJsonValuePatch|applyJsonArraySlicePatch/);
    assert.doesNotMatch(page, /const targetFields/);
    assert.doesNotMatch(page, /generateDiff[\s\S]{0,200}<{3,}\\s\*FIND/, 'the streaming FIND probe is gone');
});

test('W1: the plan prompt lists the local schema additions', async () => {
    const page = await read('character/index.html');
    // D-H: upstream's lean property set plus the local extras the model needs.
    assert.match(page, /world_info 可提交的属性：keys、content、comment、constant、enabled、useRegex、position（只允许 "before_char" \/ "after_char" \/ "at_depth"）、depth、scanDepth/);
    assert.match(page, /regex_scripts 可提交的属性：scriptName、findRegex、replacement、placement、enabled、markdownOnly、promptOnly、minDepth、maxDepth/);
    assert.match(page, /text 必须是该字段\*\*重写后的完整全文\*\*/);
});

test('W2: the confirm modal renders folded LCS segments', async () => {
    const page = await read('character/index.html');
    assert.match(page, /const diffLinesLcs = /);
    assert.match(page, /const foldEqualRuns = /);
    assert.match(page, /const buildEditDiffParts = /);
    assert.match(page, /为省略的未改动内容/, 'long unchanged runs fold into a hint line');
    assert.match(page, /'modal-open': showEditConfirmation/, 'the modal binds the new state');
    assert.match(page, /@click="applyConfirmedEdits"/);
    assert.match(page, /edit\.beforeParts/, 'the original pane renders segments');
    assert.match(page, /edit\.afterParts/, 'the modified pane renders segments');
    assert.match(page, /const pendingEdits = ref\(\[\]\)/);
});

test('W3: the thinking panel merges native reasoning with inline <think>', async () => {
    const page = await read('character/index.html');
    assert.match(page, /const readWorkshopStream = async \(response, onContent, onThinking\) => \{/);
    assert.match(page, /const emitThinking = /);
    assert.match(page, /cardUtils\.parseCot\(rawContent, false\)/, 'streaming uses the volatile slot');
    assert.match(page, /const workshopThinking = reactive\(/);
    assert.match(page, /workshopThinkingHtml/, 'think text renders through marked+DOMPurify');
    assert.match(page, /window\.DOMPurify\.sanitize\(window\.marked\.parse\(text\)\)/);
    assert.match(page, /class="workshop-thinking/, 'the collapsible panel exists in the markup');
    assert.ok(page.includes('assets/vendor/marked.umd.js'), 'marked is vendored into the page head');
    assert.ok(page.includes('assets/vendor/purify.min.js'), 'DOMPurify is vendored into the page head');

    // D-F: the generation prompt no longer bans thinking, it channels it.
    assert.doesNotMatch(page, /不要输出任何思考过程/);
    assert.match(page, /如有推理思考，请放在 <think> 标签内/);
});

test('W3: card-utils carries a self-contained parseCot for the workshop', async () => {
    const esm = await read('src/modules/card-utils.mjs');
    assert.match(esm, /const parseCot = \(text, cacheable = true\) => \{/);
    assert.match(esm, /parseCot,$/m, 'parseCot joins the RPHubCardUtils export object');
    assert.doesNotMatch(esm, /^import /m, 'card-utils stays import-free (UMD shim requirement)');

    const umd = await read('assets/js/card-utils.js');
    assert.match(umd, /window\.RPHubCardUtils = /);
    assert.match(umd, /parseCot/, 'the generated UMD copy exposes parseCot');
});

test('W4: the jailbreak preamble and default gender are gone', async () => {
    const page = await read('character/index.html');
    assert.doesNotMatch(page, /绝对虚构空间/);
    assert.doesNotMatch(page, /全封闭虚拟位面架构师/);
    assert.doesNotMatch(page, /默认为女/);
    assert.match(page, /const WORKSHOP_PREAMBLE = /, 'both prompts share the professional preamble');
    assert.match(page, /角色卡是纯虚构创作/, 'the preamble states the fiction scope without disclaimers');
});

test('W1: the workshop regex apply path tests before replacing (P-d)', async () => {
    const page = await read('character/index.html');
    assert.match(page, /if \(!regex\.test\(processed\)\) continue;\s*\n\s*regex\.lastIndex = 0;/);
});
