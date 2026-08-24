
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
     * 执行后收集脚本顶层绑定（函数/var/const/let）到实例作用域，
     * 供 shadowRoot 上的内联事件委托（onclick 等）调用。
     */
    const instanceScopes = new WeakMap();

    /* G1：模板定时器/观察者清理。
     * 记录模板脚本创建的 setInterval/setTimeout 与 MutationObserver/ResizeObserver 实例，
     * 组件卸载或 shadowRoot 重建前统一清理，避免泄漏导致面板反复刷新、后台空转。
     */
    const shadowCleanup = new WeakMap();

    const getShadowCleanup = (shadowRoot) => {
        let cleanup = shadowCleanup.get(shadowRoot);
        if (!cleanup) {
            cleanup = { timers: new Set(), observers: [] };
            shadowCleanup.set(shadowRoot, cleanup);
        }
        return cleanup;
    };

    const cleanupShadowRoot = (shadowRoot) => {
        if (!shadowRoot) return;
        const cleanup = shadowCleanup.get(shadowRoot);
        if (!cleanup) return;
        cleanup.timers.forEach(id => {
            try { clearInterval(id); } catch (_) { }
            try { clearTimeout(id); } catch (_) { }
        });
        cleanup.timers.clear();
        cleanup.observers.forEach(observer => {
            try { observer.disconnect(); } catch (_) { }
        });
        cleanup.observers = [];
    };

    const extractTopLevelNames = (code) => {
        const names = new Set();
        const patterns = [
            /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
            /^\s*(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*(?:=|;)/gm
        ];
        for (const re of patterns) {
            let match;
            while ((match = re.exec(code))) names.add(match[1]);
        }
        return [...names];
    };

    const runUiTemplateScripts = (docShim, scripts, shadowRoot) => {
        const executable = (scripts || []).map(code => {
            const text = String(code || '');
            return text.trim() ? 'try{\n' + text + '\n}catch(e){console.warn(\'[UI模板] 模板脚本执行失败\', e)}' : '';
        }).filter(Boolean).join('\n');
        if (!executable.trim()) return null;

        const names = extractTopLevelNames(executable);
        const collect = names.length
            ? '\n;return [' + names.map(n => 'typeof ' + n + '!=="undefined"?' + n + ':undefined').join(',') + '];'
            : '';

        /* 模板脚本里的 window 是 new Function 的形参（这里注入的 shimWindow）。
         * 关键：屏蔽 window.parent / window.top ——
         *   1) 模板的 startAutoRefresh() 会 observeDocForRefresh(window.parent.document)，
         *      用 MutationObserver 观察主文档整个 body，任何消息渲染/滚动都会触发
         *      180ms 防抖重建，面板按钮被反复替换 → 「点了没反应」；
         *   2) collectContext() 每次 interval tick 都会读主文档 querySelectorAll + 文本，
         *      长对话时阻塞主线程 → 「卡片显示了但要等一会才能点」。
         * 屏蔽后模板只读自身 shadowRoot（快），行为其余保持不变（triggerSlash 桥接宿主）。
         */
        const shimWindow = new Proxy(window, {
            get(target, prop) {
                if (prop === 'parent' || prop === 'top') return null;
                if (prop === 'triggerSlash') {
                    return typeof target.triggerSlash === 'function' ? target.triggerSlash.bind(target) : null;
                }
                if (prop === 'document') return docShim;
                if (prop === 'setInterval' || prop === 'setTimeout') {
                    return (fn, ms, ...args) => {
                        const id = target[prop](fn, ms, ...args);
                        if (shadowRoot) getShadowCleanup(shadowRoot).timers.add(id);
                        return id;
                    };
                }
                if (prop === 'clearInterval' || prop === 'clearTimeout') {
                    return (id) => {
                        if (shadowRoot) getShadowCleanup(shadowRoot).timers.delete(id);
                        return target[prop](id);
                    };
                }
                if (prop === 'MutationObserver' || prop === 'ResizeObserver') {
                    const BaseObserver = target[prop];
                    if (typeof BaseObserver !== 'function') return undefined;
                    return class TrackedUiTemplateObserver extends BaseObserver {
                        constructor(callback) {
                            super(callback);
                            if (shadowRoot) getShadowCleanup(shadowRoot).observers.push(this);
                        }
                    };
                }
                /* Native accessor properties (document/location/...) run their
                 * getter with `this` = receiver; passing the Proxy as receiver
                 * throws "Illegal invocation" (DOM getters demand a real Window),
                 * which aborts the whole template script. Resolve against the
                 * real window instead. `document` is special-cased above to the
                 * template's own docShim. */
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });

        try {
            /* 定时器/观察者 API 同时作为形参注入：模板脚本里裸写 setInterval(...)
             * / new MutationObserver(...)（不走 window.xxx）时也能命中上面的追踪包装。
             */
            const fn = new Function(
                'document', 'window',
                'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout',
                'MutationObserver', 'ResizeObserver',
                executable + collect
            );
            const values = fn.call(
                window,
                docShim, shimWindow,
                shimWindow.setInterval, shimWindow.setTimeout,
                shimWindow.clearInterval, shimWindow.clearTimeout,
                shimWindow.MutationObserver, shimWindow.ResizeObserver
            );
            const scope = {};
            names.forEach((name, index) => {
                const value = values && values[index];
                if (value !== undefined) scope[name] = value;
            });
            // 模板内联事件（onclick 等）里的 document 需指向模板的 document shim，
            // 否则 document.getElementById 会在主文档中查找，找不到 shadowRoot 内元素。
            scope.document = docShim;
            if (shadowRoot) instanceScopes.set(shadowRoot, scope);
            return scope;
        } catch (e) {
            console.warn('[UI模板] 模板脚本执行失败', e);
            return null;
        }
    };

    /* 在实例作用域中执行内联事件代码（如 onclick="suggestAction(...)"）。
     * 模板脚本运行在 new Function 局部作用域，内联 handler 无法直接访问，
     * 需经 with + Proxy 把标识符解析到实例作用域，缺失时回退全局。
     */
    const runInlineHandler = (scope, element, code) => {
        const scopeProxy = new Proxy(scope, {
            get(target, key) {
                if (key in target) return target[key];
                const global = window[key];
                return typeof global === 'function' ? global.bind(window) : global;
            },
            has() { return true; }
        });
        const fn = new Function('with(arguments[0]){ return (' + code + '); }');
        fn.call(element, scopeProxy);
    };

    /* shadowRoot 捕获阶段事件委托：带内联事件属性（onclick/onchange/oninput）
     * 的元素在实例作用域执行，模拟 iframe 模式下内联 handler 的全局可访问性。
     */
    const INLINE_EVENTS = ['click', 'change', 'input'];

    const createInlineDelegate = (shadowRoot) => (event) => {
        // 真实触摸的 event.target 通常是按钮的子元素（如 <span>/<small>），
        // 需沿 composedPath 向上找到真正带内联 handler 的元素。
        const path = event.composedPath ? event.composedPath() : [event.target];
        const target = path.find(node => node && typeof node.getAttribute === 'function' && node.getAttribute('on' + event.type));
        if (!target) return;
        const code = target.getAttribute('on' + event.type);
        const scope = instanceScopes.get(shadowRoot);
        if (!scope) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            runInlineHandler(scope, target, code);
        } catch (e) {
            console.warn('[UI模板] 内联事件执行失败', e);
        }
    };

    /* Vue 组件：历史 iframe 数据走 innerHTML 旧路径，否则 Shadow DOM 渲染 */
    const UiTemplateFrame = {
        name: 'UiTemplateFrame',
        props: { html: { type: String, default: '' } },
        template: '<div class="ui-template-frame-host" style="width:100%;max-width:100%"></div>',
        mounted() { this.renderShadow(); },
        updated() {
            // 只在 html 真正变化时重建 shadowRoot，避免无关更新导致
            // 面板反复重建（每次重建都会重跑模板脚本、新增 setInterval）。
            if (this._lastRenderedHtml === this.html) return;
            this.renderShadow();
        },
        beforeUnmount() {
            cleanupShadowRoot(this.$el?.shadowRoot);
            this._shadowRendered = false;
        },
        methods: {
            renderShadow() {
                const el = this.$el;
                if (!el) return;
                const html = this.html || '';
                this._lastRenderedHtml = html;

                if (/<iframe[\s>]/i.test(html)) {
                    cleanupShadowRoot(el.shadowRoot);
                    el.innerHTML = html;
                    this._shadowRendered = false;
                    return;
                }

                let root = el.shadowRoot;
                if (!root) root = el.attachShadow({ mode: 'open' });
                // G1：重建前先清理旧 shadowRoot 的定时器/观察者
                cleanupShadowRoot(root);
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

                runUiTemplateScripts(createUiTemplateDocShim(root, wrap), split.scripts, root);

                if (!this._inlineDelegate) {
                    this._inlineDelegate = createInlineDelegate(root);
                    for (const eventType of INLINE_EVENTS) {
                        root.addEventListener(eventType, this._inlineDelegate, true);
                    }
                }

            }
        }
    };

    const UiTemplateFrameUtil = {
        splitUiTemplateHtml,
        createUiTemplateDocShim,
        runUiTemplateScripts,
        rewriteRootSelectors,
        runInlineHandler,
        extractTopLevelNames,
        instanceScopes,
        cleanupShadowRoot,
    };


export { UiTemplateFrame, UiTemplateFrameUtil };


globalThis.RPHUiTemplateFrame = UiTemplateFrame;
globalThis.RPHUiTemplateFrameUtil = UiTemplateFrameUtil;
