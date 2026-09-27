// 卡片侧 postMessage shim 的行为测试。
//
// 与 rich-text-iframe-contract 的静态断言互补：那里只确认「源码里写了这些调用」，
// 这里把 buildExecutableHtmlDocument 生成的 <script> 真正跑在 happy-dom 里，
// 验证宿主 handleExecutableFrameMessage 依赖的三种消息（slash / focus / height）
// 在运行时确实按协议发出。shim 只用标准 DOM API + postMessage，happy-dom 的
// 语义足够真实。
import assert from 'node:assert/strict';
import test from 'node:test';
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
// shim 会把 vendored jQuery 地址绝对化（new URL(path, location.href)），
// about:blank 不是合法 base；给一个应用同源的地址。
window.happyDOM?.setURL?.('https://localhost/');

const { EXECUTABLE_FRAME_CHANNEL, buildExecutableHtmlDocument } = await import('../src/modules/utils.mjs');

// --- 测试环境改造：rAF 走微任务（确定性且不撑栈），ResizeObserver 静默 ---
window.requestAnimationFrame = (callback) => { Promise.resolve().then(callback); return 0; };
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const captured = [];
const parentStub = { postMessage: (payload, targetOrigin) => captured.push({ ...payload, targetOrigin }) };
Object.defineProperty(window, 'parent', { value: parentStub, configurable: true });
assert.strictEqual(window.parent.postMessage, parentStub.postMessage, 'window.parent 桩必须挂上');

// 让事件循环转一圈，把 rAF 微任务排干
const flush = () => new Promise((resolve) => setImmediate(resolve));

// --- 提取注入的真实 shim 脚本（带属性的 <script src> 不会命中该正则） ---
const document_ = buildExecutableHtmlDocument('<div id="card">卡片内容</div>');
const scriptText = document_.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(scriptText, 'shim <script> 应能从生成文档中提取');

// --- 准备卡片 DOM：一个普通块（后续桩高 500px）+ 一个输入框 ---
document.body.innerHTML = '<div id="block">内容</div><input id="editor" type="text">';
const block = document.getElementById('block');
const editor = document.getElementById('editor');

// 全局作用域执行 shim（等价于浏览器解析 <script>）
(0, eval)(scriptText);
await flush();
captured.length = 0; // 丢弃 readyState/DOMContentLoaded 触发的前置消息，受控重测

test('triggerSlash 经 postMessage 上报，空指令不发消息', () => {
    window.triggerSlash('查看状态');
    assert.deepEqual(captured.at(-1), { source: EXECUTABLE_FRAME_CHANNEL, type: 'slash', command: '查看状态', targetOrigin: '*' });

    const before = captured.length;
    window.triggerSlash('');
    window.triggerSlash(null);
    assert.equal(captured.length, before, '空指令不应发消息');
});

test('卡片内 [data-slash] 点击走委托，同样上报 slash', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-slash', '行动：逃跑');
    document.body.appendChild(button);
    button.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.deepEqual(
        captured.filter(m => m.type === 'slash').at(-1),
        { source: EXECUTABLE_FRAME_CHANNEL, type: 'slash', command: '行动：逃跑', targetOrigin: '*' }
    );
    // 点击后 shim 会跑一段 600ms 的高度轮询（rAF 已桩成微任务），等它自然结束。
    await new Promise(resolve => nodeTimers.setTimeout(resolve, 650));
});

test('可编辑元素聚焦上报 focus:true，离开且落点非可编辑上报 focus:false', () => {
    editor.dispatchEvent(new window.Event('focusin', { bubbles: true }));
    assert.deepEqual(captured.at(-1), { source: EXECUTABLE_FRAME_CHANNEL, type: 'focus', editable: true, targetOrigin: '*' });

    // focusout 落点仍是输入框（可编辑）→ 不上报
    const before = captured.length;
    editor.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: editor }));
    assert.equal(captured.length, before, '焦点在可编辑元素间转移不应上报 false');

    // focusout 落点是普通 div → 上报 false
    editor.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: block }));
    assert.deepEqual(captured.at(-1), { source: EXECUTABLE_FRAME_CHANNEL, type: 'focus', editable: false, targetOrigin: '*' });
});

test('高度上报：内容变化才发消息，且值随内容增长', async () => {
    // 此前（eval/点击轮询阶段）基线已上报过，这里只验证「变化才发、值跟随内容」：
    // happy-dom 布局为 0，桩 offsetHeight=500 → 高度应为 500+4。
    Object.defineProperty(block, 'offsetHeight', { value: 500, configurable: true });
    window.updateHeight();
    await flush();
    assert.deepEqual(captured.at(-1), { source: EXECUTABLE_FRAME_CHANNEL, type: 'height', value: 504, targetOrigin: '*' });

    // 布局未变 → 去重，不发
    const before = captured.length;
    window.updateHeight();
    await flush();
    assert.equal(captured.length, before, '高度未变化不应重复上报');

    // 内容继续长高 → 上报新值
    Object.defineProperty(block, 'offsetHeight', { value: 900, configurable: true });
    window.updateHeight();
    await flush();
    assert.deepEqual(captured.at(-1), { source: EXECUTABLE_FRAME_CHANNEL, type: 'height', value: 904, targetOrigin: '*' });
});

test('所有消息都以通道常量标识来源，宿主凭此过滤', () => {
    assert.ok(captured.length > 0);
    for (const message of captured) {
        assert.equal(message.source, 'rph-executable-frame', '消息必须带宿主认识的通道标识');
    }
});
