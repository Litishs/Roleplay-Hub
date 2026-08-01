/*  UI 模板 Shadow DOM 渲染组件（方案 B）
 *  - 将角色卡内嵌的可交互 HTML（{{变量}} 已替换后的纯模板 HTML）
 *    直接渲染进主文档的 Shadow DOM，替代 iframe srcdoc 沙箱。
 *  - 硬性约束：模板 HTML+JS 内容不可修改，所有适配都在宿主侧完成。
 *  - 历史 iframe 数据（含 <iframe 的旧容器字符串）走兼容路径，行为与旧版一致。
 */
(function () {
    'use strict';

    const realDocument = window.document;

    const escapeCssId = (id) => {
        try {
            return window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(id)
                : String(id).replace(/["\\]/g, '\\$&');
        } catch (_) {
            return String(id).replace(/["\\]/g, '\\$&');
        }
    };

    /* 拆分模板 HTML → { styles, scripts, body }
     *  - 剥离 <!doctype>/<html>/<head>/<body> 外壳（若是完整文档）
     *  - 提取内联 <script>（type 非 module），外部 src 脚本忽略并警告
     *  - 提取内联 <style>；外部 stylesheet link 忽略并警告
     *  - 剩余为 body
     */
    const splitUiTemplateHtml = (html) => {
        let source = String(html || '');

        source = source.replace(/^\s*<!doctype[^>]*>/i, '');
        const htmlWrap = source.match(/<html\b[^>]*>([\s\S]*)<\/html>/i);
        if (htmlWrap) source = htmlWrap[1];
        const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
        const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
        if (headMatch || bodyMatch) {
            source = (headMatch ? headMatch[1] : '') + (bodyMatch ? bodyMatch[1] : '');
        }

        const scripts = [];
        source = source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, code) => {
            if (/\btype\s*=\s*["']?module/i.test(attrs)) return '';
            if (/\bsrc\s*=/i.test(attrs)) {
                console.warn('[UI模板] 忽略外部脚本: ' + (attrs.match(/src\s*=\s*["']([^"']+)/i)?.[1] || ''));
                return '';
            }
            scripts.push(code);
            return '';
        });

        const styles = [];
        source = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
            styles.push(css);
            return '';
        });
        source = source.replace(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, (match) => {
            console.warn('[UI模板] 忽略外部样式表 <link rel="stylesheet">');
            return '';
        });

        return { styles, scripts, body: source.trim() };
    };

    /* 模板 CSS 里针对根元素（html/body）的选择器改写为 .template-root */
    const rewriteRootSelectors = (css) => {
        return String(css || '').replace(/(^|[,}\s])(html|body)(?=[\s,{.:[])/g, '$1.template-root');
    };

    /* document shim：把模板脚本对 document 的访问重定向到 shadowRoot。
     * 覆盖实测模板用到的 API，其余属性/方法透传主文档（最小化兼容风险）。
     */
    const createUiTemplateDocShim = (shadowRoot, bodyWrap) => {
        const shim = {
            getElementById: (id) => {
                if (id == null || id === '') return null;
                return shadowRoot.querySelector('#' + escapeCssId(String(id)));
            },
            getElementsByTagName: (tag) => bodyWrap.getElementsByTagName(tag),
            getElementsByClassName: (cls) => bodyWrap.getElementsByClassName(cls),
            querySelector: (selector) => shadowRoot.querySelector(selector),
            querySelectorAll: (selector) => shadowRoot.querySelectorAll(selector),
            createElement: (tag, options) => realDocument.createElement(tag, options),
            createTextNode: (text) => realDocument.createTextNode(text),
            createDocumentFragment: () => realDocument.createDocumentFragment(),
            addEventListener: (type, listener, options) => {
                if (type === 'DOMContentLoaded') {
                    queueMicrotask(() => { try { listener.call(shim, { type }); } catch (e) { console.warn('[UI模板] DOMContentLoaded 回调执行失败', e); } });
                    return;
                }
                shadowRoot.addEventListener(type, listener, options);
            },
            removeEventListener: (type, listener, options) => shadowRoot.removeEventListener(type, listener, options),
            execCommand: (...args) => realDocument.execCommand(...args),
            get body() { return bodyWrap; },
            get documentElement() { return bodyWrap; },
            get defaultView() { return window; }
        };
        return new Proxy(shim, {
            get(target, prop) {
                if (prop in target) return target[prop];
                const value = realDocument[prop];
                return typeof value === 'function' ? value.bind(realDocument) : value;
            }
        });
    };

    /* 逐个执行模板脚本。多个脚本合并进同一函数体，var/函数声明跨块共享；
     * 每段独立 try/catch，模板异常不打断主应用。
     */
    const runUiTemplateScripts = (docShim, scripts) => {
        const executable = (scripts || []).map(code => {
            const text = String(code || '');
            return text.trim() ? 'try{\n' + text + '\n}catch(e){console.warn(\'[UI模板] 模板脚本执行失败\', e)}' : '';
        }).filter(Boolean).join('\n');
        if (!executable.trim()) return;
        try {
            const fn = new Function('document', 'window', executable);
            fn.call(window, docShim, window);
        } catch (e) {
            console.warn('[UI模板] 模板脚本执行失败', e);
        }
    };

    /* Vue 组件：历史 iframe 数据走 innerHTML 旧路径，否则 Shadow DOM 渲染 */
    const UiTemplateFrame = {
        name: 'UiTemplateFrame',
        props: { html: { type: String, default: '' } },
        template: '<div class="ui-template-frame-host" style="width:100%;max-width:100%"></div>',
        mounted() { this.renderShadow(); },
        updated() { this.renderShadow(); },
        beforeUnmount() { this._shadowRendered = false; },
        methods: {
            renderShadow() {
                const el = this.$el;
                if (!el) return;
                const html = this.html || '';

                if (/<iframe[\s>]/i.test(html)) {
                    el.innerHTML = html;
                    this._shadowRendered = false;
                    return;
                }

                let root = el.shadowRoot;
                if (!root) root = el.attachShadow({ mode: 'open' });
                this._shadowRendered = true;
                root.textContent = '';

                let split;
                try {
                    split = splitUiTemplateHtml(html);
                } catch (e) {
                    console.warn('[UI模板] 模板解析失败', e);
                    return;
                }

                const styleEl = realDocument.createElement('style');
                styleEl.textContent = split.styles.map(rewriteRootSelectors).join('\n');
                root.appendChild(styleEl);

                const wrap = realDocument.createElement('div');
                wrap.className = 'template-root';
                try {
                    wrap.innerHTML = split.body;
                } catch (e) {
                    console.warn('[UI模板] 模板 body 注入失败', e);
                }
                root.appendChild(wrap);

                runUiTemplateScripts(createUiTemplateDocShim(root, wrap), split.scripts);
            }
        }
    };

    window.RPHUiTemplateFrame = UiTemplateFrame;
    window.RPHUiTemplateFrameUtil = {
        splitUiTemplateHtml,
        createUiTemplateDocShim,
        runUiTemplateScripts,
        rewriteRootSelectors
    };
})();
