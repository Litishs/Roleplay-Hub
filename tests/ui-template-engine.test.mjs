import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import engine from '../assets/js/ui-template-engine.js';

const {
  renderUiTemplateString,
  setUiTemplateValue,
  parseUiTemplateUpdateJson,
  normalizeUiTemplateUpdateList,
  applyUiTemplateUpdateListToTemplate,
  isAllowedUiTemplateKey,
  normalizeUiTemplate,
  analyzeUiTemplateScriptRisk,
  hasUiTemplateScripts
} = engine;

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('engine loads and exposes RPHUiTemplateEngine', () => {
  assert.equal(typeof engine.renderUiTemplateString, 'function');
  assert.equal(typeof engine.applyUiTemplateUpdateListToTemplate, 'function');
  assert.equal(globalThis.RPHUiTemplateEngine, engine);
});

test('renderUiTemplateString: basic replacement and HTML escaping', () => {
  assert.equal(renderUiTemplateString('你好 {{name}}', { name: '世界' }), '你好 世界');
  assert.equal(
    renderUiTemplateString('{{html}}', { html: '<script>alert(1)</script>' }),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
  assert.equal(renderUiTemplateString('{{missing}}', {}), '');
});

test('renderUiTemplateString: #each with else, alias, ../, @index', () => {
  const template = '{{#each items as item}}{{@index}}.{{item.name}}/{{../title}};{{else}}空{{/each}}';
  const result = renderUiTemplateString(template, { title: 'T', items: [{ name: 'a' }, { name: 'b' }] });
  assert.equal(result, '0.a/T;1.b/T;');
  const empty = renderUiTemplateString('{{#each items as item}}{{item}}{{else}}空{{/each}}', { items: [] });
  assert.equal(empty, '空');
});

test('setUiTemplateValue: dot path, bracket path, auto array/object, $root', () => {
  const root = setUiTemplateValue({}, 'equipment.0.name', '短剑');
  assert.deepEqual(root, { equipment: [{ name: '短剑' }] });
  const bracket = setUiTemplateValue({}, '["a b"]["c"]', 1);
  assert.deepEqual(bracket, { 'a b': { c: 1 } });
  assert.deepEqual(setUiTemplateValue({}, '$root', { x: 1 }), { x: 1 });
});

test('parseUiTemplateUpdateJson: pure JSON, fenced, prefix/suffix, invalid throws', () => {
  assert.deepEqual(parseUiTemplateUpdateJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseUiTemplateUpdateJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseUiTemplateUpdateJson('前言{"a":1}后记'), { a: 1 });
  assert.throws(() => parseUiTemplateUpdateJson('not json at all'));
});

test('normalizeUiTemplateUpdateList: array / {updates} / {variables,reason} / extra fields dropped', () => {
  assert.deepEqual(
    normalizeUiTemplateUpdateList([{ id: 'a', variables: { x: 1 }, reason: 'r' }]),
    [{ id: 'a', variables: { x: 1 }, reason: 'r' }]
  );
  assert.deepEqual(
    normalizeUiTemplateUpdateList({ updates: [{ id: 'a', variables: { x: 1 }, extra: 'drop' }] }),
    [{ id: 'a', variables: { x: 1 }, reason: '' }]
  );
  assert.deepEqual(
    normalizeUiTemplateUpdateList({ id: 'a', variables: { x: 1 }, reason: 'r', junk: 1 }),
    [{ id: 'a', variables: { x: 1 }, reason: 'r' }]
  );
  assert.deepEqual(
    normalizeUiTemplateUpdateList({ variables: { x: 1 }, reason: 'r' }),
    [{ variables: { x: 1 }, reason: 'r' }]
  );
});

test('applyUiTemplateUpdateListToTemplate: dedupe by JSON, changeLog cap 50, unknown key rejected', () => {
  const template = normalizeUiTemplate({
    name: 'T',
    initialVariableState: { hp: 100, bag: [] },
    variableState: { hp: 100, bag: [] }
  });
  const first = applyUiTemplateUpdateListToTemplate(template, [{ variables: { hp: 80 }, reason: '受伤' }], { model: 'm', turn: 1 });
  assert.equal(first.changed, true);
  assert.equal(template.variableState.hp, 80);
  const same = applyUiTemplateUpdateListToTemplate(template, [{ variables: { hp: 80 } }], { model: 'm', turn: 2 });
  assert.equal(same.changed, false);
  assert.equal(template.changeLog.length, 1);

  for (let i = 0; i < 60; i++) {
    applyUiTemplateUpdateListToTemplate(template, [{ variables: { hp: i } }], { model: 'm', turn: i });
  }
  assert.ok(template.changeLog.length <= 50, 'changeLog 上限 50');

  const rejected = applyUiTemplateUpdateListToTemplate(template, [{ variables: { unknownField: 1 } }], { model: 'm', turn: 99 });
  assert.equal(rejected.changed, false);
  assert.deepEqual(rejected.rejectedKeys, ['unknownField']);
  assert.equal('unknownField' in template.variableState, false);
});

test('isAllowedUiTemplateKey: state/schema keys and subpaths allowed, unknown rejected, empty known allow', () => {
  const template = normalizeUiTemplate({
    name: 'T',
    initialVariableState: { hp: 100, bag: [{ name: 'x' }] },
    variableSchema: { location: 'string' }
  });
  assert.equal(isAllowedUiTemplateKey(template, 'hp'), true);
  assert.equal(isAllowedUiTemplateKey(template, 'bag.0.name'), true);
  assert.equal(isAllowedUiTemplateKey(template, 'location'), true);
  assert.equal(isAllowedUiTemplateKey(template, 'notDeclared'), false);
  assert.equal(isAllowedUiTemplateKey(normalizeUiTemplate({ name: 'empty' }), 'anything'), true);
});

test('normalizeUiTemplate: defaults and updateMode dead field removed', () => {
  const template = normalizeUiTemplate({ name: 'X', htmlTemplate: '```html\n<section>{{a}}</section>\n```' });
  assert.equal(template.name, 'X');
  assert.equal(template.htmlTemplate, '<section>{{a}}</section>');
  assert.equal(template.placement, 'bottom');
  assert.equal(template.enabled, true);
  assert.equal('updateMode' in template, false, 'updateMode 死字段已清理');
});

test('analyzeUiTemplateScriptRisk / hasUiTemplateScripts', () => {
  assert.equal(hasUiTemplateScripts('<section>普通</section>'), false);
  assert.equal(hasUiTemplateScripts('<script>alert(1)</script>'), true);
  assert.equal(hasUiTemplateScripts('<button onclick="x()">点</button>'), true);
  assert.equal(hasUiTemplateScripts('<iframe src="https://x"></iframe>'), true);
  assert.equal(hasUiTemplateScripts('<a href="javascript:void(0)">x</a>'), true);
  const risk = analyzeUiTemplateScriptRisk('<script>1</script><button onclick="x()">b</button>');
  assert.deepEqual(
    { hasScript: risk.hasScript, inlineHandlers: risk.inlineHandlers, risky: risk.risky },
    { hasScript: true, inlineHandlers: true, risky: true }
  );
  assert.equal(hasUiTemplateScripts('<button data-only="1">x</button>'), false, '非事件属性不误报');
});

test('index.html loads ui-template-engine.js before app.js', async () => {
  const html = await read('index.html');
  const loadOrder = html.match(/<script src="assets\/js\/([^"]+\.js)"><\/script>/g) || [];
  const indexOfEngine = loadOrder.findIndex(line => line.includes('ui-template-engine.js'));
  const indexOfApp = loadOrder.findIndex(line => line.includes('app.js'));
  assert.ok(indexOfEngine !== -1, 'ui-template-engine.js should be referenced');
  assert.ok(indexOfEngine < indexOfApp, 'ui-template-engine.js must load before app.js');
});

test('app.js reuses engine functions instead of redefining them', async () => {
  const source = await read('assets/js/app.js');
  assert.match(source, /window\.RPHUiTemplateEngine/);
  assert.doesNotMatch(source, /const renderUiTemplateString = \(templateText/);
  assert.doesNotMatch(source, /const normalizeUiTemplateUpdateList = \(parsed\) =>/);
  assert.doesNotMatch(source, /const applyUiTemplateUpdateListToTemplate = \(template, updates/);
  assert.doesNotMatch(source, /const isAllowedUiTemplateKey = \(template, key\) =>/);
});

test('app.js: applyMainModelUiTemplateUpdates renders panel before early returns and marks needsFallback', async () => {
  const source = await read('assets/js/app.js');
  const block = source.match(/const applyMainModelUiTemplateUpdates = \(targetMessage, model = settings\.model\) => \{[\s\S]*?attachUiTemplateBlocksToLastAssistant\(\{ targetMessageId: targetMessage\.id \}\);\s*\n\s*const match = String\(targetMessage\.content[\s\S]*?needsFallback: true/);
  assert.ok(block, '主模型路径先渲染面板，未返回块时返回 needsFallback');
});

test('app.js: D1 batch mode / C1 json mode / D2 model required markers', async () => {
  const source = await read('assets/js/app.js');
  assert.match(source, /uiTemplateBatchMode: true/);
  assert.match(source, /uiTemplateJsonMode: true/);
  assert.match(source, /UI_TEMPLATE_BATCH_MAX_TEMPLATES = 5/);
  assert.match(source, /UI_TEMPLATE_BATCH_MAX_PAYLOAD_BYTES = 200 \* 1024/);
  assert.match(source, /response_format: \{ type: 'json_object' \}/);
  assert.match(source, /const analysisModel = \(settings\.uiTemplateModel \|\| ''\)\.trim\(\);[\s\S]*?未配置分析模型/);
  assert.doesNotMatch(source, /const fallbackModel = \(settings\.uiTemplateModel \|\| ''\)\.trim\(\) \|\| \(settings\.model \|\| ''\)\.trim\(\);/);
});

test('app.js: B1 appends UI template instruction at end of messages', async () => {
  const source = await read('assets/js/app.js');
  assert.match(source, /mainModelUiTemplatePrompt[\s\S]*?finalMessages\.push\(\{[\s\S]*?Instructions for next message[\s\S]*?mainModelUiTemplatePrompt/);
  assert.doesNotMatch(source, /insertUserMessageAtDepth\(mainModelUiTemplatePrompt, 1\)/);
  assert.match(source, /不要写进思考过程（reasoning\/CoT）里/);
});

test('card-utils.js and app.js no longer persist updateMode', async () => {
  const cardUtils = await read('assets/js/card-utils.js');
  const source = await read('assets/js/app.js');
  assert.doesNotMatch(cardUtils, /updateMode/);
  assert.doesNotMatch(source, /updateMode: template\.updateMode/);
});

test('app.js: UI模板变量分析请求不使用未声明的裸 apiKey', async () => {
  const app = await read('assets/js/app.js');
  const start = app.indexOf('const chatProviderForAnalysis = getChatProvider();');
  const end = app.indexOf('const filterMemoriesAsync');
  assert.ok(start > 0 && end > start, '应能找到 UI 模板分析函数边界');
  const section = app.slice(start, end);
  assert.ok(
    !section.includes('Bearer ${apiKey}'),
    '单模板分析请求引用了未声明的 apiKey，会抛 ReferenceError: apiKey is not defined'
  );
  assert.ok(
    section.includes('Bearer ${chatProviderForAnalysis.apiKey}'),
    '批量与单模板分析请求都应使用 chatProviderForAnalysis.apiKey'
  );
});
