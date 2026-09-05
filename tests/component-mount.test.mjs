// Component-level mount tests (roadmap 3.4: @vue/test-utils pilot).
//
// Approach: happy-dom provides the DOM globals Vue needs; each .vue SFC is
// compiled at test time with `vue/compiler-sfc` (already a transitive
// dependency of vue) into a plain component object sharing THE SAME Vue
// module instance as @vue/test-utils. Deliberately no Vite here — Vite's dev
// module graph would resolve `vue` to its optimized deps copy, creating a
// second Vue instance and breaking inject/reactivity across the boundary.
//
// The globals MUST be registered before the first `import 'vue'`, so all
// framework imports below are dynamic.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// happy-dom's GlobalRegistrator replaces the global timers with Window-level
// ones that lack `.unref()`, which some Node tooling calls. Preserve the
// Node originals and restore them right after registration.
const nodeTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    queueMicrotask: globalThis.queueMicrotask
};
GlobalRegistrator.register();
Object.assign(globalThis, nodeTimers);

const vue = await import('vue');
const { mount } = await import('@vue/test-utils');
const { parse, compileTemplate } = await import('vue/compiler-sfc');

// Compile an options-API SFC (optionally importing helpers from "vue") into
// a component object bound to the single shared Vue instance.
function loadComponent(relPath) {
    const filename = fileURLToPath(new URL(relPath, import.meta.url));
    const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
    assert.ok(descriptor.template?.content, `${relPath} must have a template`);
    assert.ok(descriptor.script || descriptor.scriptSetup, `${relPath} must have a script`);

    let scriptCode = descriptor.script?.content || descriptor.scriptSetup?.content || '';
    const vueImport = scriptCode.match(/import\s*\{([^}]+)\}\s*from\s*["']vue["'];?/);
    let vueDestructure = '';
    if (vueImport) {
        // "a as b, c" → "a: b, c"
        vueDestructure = 'const { ' + vueImport[1].trim().replace(/\bas\b/g, ':') + ' } = _vue;';
        scriptCode = scriptCode.replace(vueImport[0], '');
    }
    scriptCode = scriptCode.replace(/export\s+default\s+/, 'const component = ');

    const template = compileTemplate({
        id: relPath,
        filename,
        source: descriptor.template.content
    });
    assert.equal(template.errors.length, 0, `template compile errors: ${template.errors.join('; ')}`);
    // The generated render module imports helpers from "vue" — convert the
    // import statement into a destructuring bound to the shared instance.
    let renderCode = template.code.replace(/export\s+(function|const)\s+render/, 'function render');
    const tplImport = renderCode.match(/import\s*\{([^}]+)\}\s*from\s*["']vue["'];?/);
    let tplDestructure = '';
    if (tplImport) {
        tplDestructure = 'const { ' + tplImport[1].trim().replace(/\bas\b/g, ':') + ' } = _vue;';
        renderCode = renderCode.replace(tplImport[0], '');
    }

    const component = new Function('_vue', `
        ${vueDestructure}
        ${tplDestructure}
        ${scriptCode}
        ${renderCode}
        component.render = render;
        return component;
    `)(vue);
    return component;
}

const spinner = loadComponent('../src/components/common/LoadingSpinner.vue');
const confirmDialog = loadComponent('../src/components/common/ConfirmDialog.vue');

// Shared mock of the app context ConfirmDialog injects ("appContext").
// Ref-valued fields must be REAL refs: the component's setup() returns the
// ctx object, so Vue's proxyRefs unwraps them exactly like in the real app.
function createMockContext() {
    return {
        globalConfirmModal: vue.reactive({
            show: false,
            title: '',
            message: '',
            confirmLabel: '',
            cancelLabel: '',
            onConfirm: () => {},
            onCancel: () => {}
        }),
        showConfirmModal: vue.ref(false),
        confirmMessage: vue.ref(''),
        handleConfirm: () => {},
        handleCancel: () => {}
    };
}

test('LoadingSpinner renders a spinning indicator sized by prop', () => {
    const wrapper = mount(spinner, { props: { size: 32 } });
    assert.ok(wrapper.find('span[role="status"]').exists(), 'renders a status element');
    assert.ok(wrapper.classes().includes('animate-spin'));
    assert.equal(wrapper.attributes('style').includes('width: 32px'), true);
    assert.equal(wrapper.attributes('style').includes('height: 32px'), true);
    wrapper.unmount();
});

test('ConfirmDialog renders nothing while hidden', () => {
    const wrapper = mount(confirmDialog, { global: { provide: { appContext: createMockContext() } } });
    assert.equal(wrapper.find('.fixed.inset-0').exists(), false);
    wrapper.unmount();
});

test('ConfirmDialog shows title, message and configurable button labels', () => {
    const ctx = createMockContext();
    ctx.globalConfirmModal.show = true;
    ctx.globalConfirmModal.title = '删除角色卡';
    ctx.globalConfirmModal.message = '确定要删除吗？';
    ctx.globalConfirmModal.confirmLabel = '立即删除';
    ctx.globalConfirmModal.cancelLabel = '再想想';
    const wrapper = mount(confirmDialog, { global: { provide: { appContext: ctx } } });
    assert.ok(wrapper.text().includes('删除角色卡'));
    assert.ok(wrapper.text().includes('确定要删除吗？'));
    const buttons = wrapper.findAll('button');
    const labels = buttons.map(button => button.text());
    assert.ok(labels.includes('立即删除'), 'confirmLabel rendered');
    assert.ok(labels.includes('再想想'), 'cancelLabel rendered');
    // The confirm action must use the primary (bg-primary-600) styling.
    const confirmButton = buttons.find(button => button.text() === '立即删除');
    assert.ok(confirmButton.classes().includes('bg-primary-600'), 'confirm button uses primary color');
    wrapper.unmount();
});

test('ConfirmDialog falls back to default labels and wires the callbacks', async () => {
    const ctx = createMockContext();
    let confirmed = false;
    let cancelled = false;
    ctx.globalConfirmModal.show = true;
    ctx.globalConfirmModal.title = '确认';
    ctx.globalConfirmModal.onConfirm = () => { confirmed = true; };
    ctx.globalConfirmModal.onCancel = () => { cancelled = true; };
    const wrapper = mount(confirmDialog, { global: { provide: { appContext: ctx } } });
    assert.ok(wrapper.text().includes('确认'), '默认确认按钮文案');
    assert.ok(wrapper.text().includes('取消'), '默认取消按钮文案');
    const buttons = wrapper.findAll('button');
    await buttons.find(button => button.text() === '确认').trigger('click');
    await buttons.find(button => button.text() === '取消').trigger('click');
    assert.equal(confirmed, true);
    assert.equal(cancelled, true);
    wrapper.unmount();
});
