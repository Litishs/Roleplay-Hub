
    'use strict';

    // 角色卡 iframe 生命周期管理。三档状态：
    //   active   —— 视口内（含 rootMargin），内容完整运行
    //   soft     —— 远离视口时软挂起：保留 srcdoc（卡内 JS 状态、表单、游戏进度
    //               全部不丢），仅停止绘制。滚回来瞬间恢复，无需重载——修复
    //               「无法承接上文」「滚回去点不动」。
    //   blanked  —— 保留的软挂起帧超过 keptIframes 上限时，对最远的不可见帧做
    //               硬清空释放内存（老行为）。再次进入视口时从源码重载。
    const MAX_ACTIVE_FRAMES = window.RPHRuntimePolicy?.limits?.activeIframes || 3;
    const MAX_KEPT_FRAMES = window.RPHRuntimePolicy?.limits?.keptIframes || 16;
    // 软挂起触发距离：之前 160px 导致正常滚动阅读时卡片反复被清空重载。2400px
    // 意味着只有真正远离视口的卡片才会进入挂起，正常浏览全程无感。
    const ROOT_MARGIN = '2400px 0px';
    const sources = new WeakMap();
    const visible = new WeakMap();
    const activated = new WeakSet();
    const activeFrames = new Set();
    let observer = null;
    let mutationObserver = null;

    const isBlanked = frame => frame.classList.contains('html-frame-blanked');

    const freezeHeight = frame => {
        const height = Math.max(80, Math.round(frame.getBoundingClientRect().height || 0));
        frame.style.height = `${height}px`;
    };

    // 硬清空：丢弃内容与卡内状态，释放内存（数量预算超限时才使用）。
    const blank = frame => {
        if (!frame || isBlanked(frame)) return;
        freezeHeight(frame);
        frame.classList.add('html-frame-suspended', 'html-frame-blanked');
        frame.srcdoc = '<!doctype html><html><body></body></html>';
        activeFrames.delete(frame);
    };

    const eachFrame = handler => {
        document.body?.querySelectorAll?.('iframe.executable-html-frame')?.forEach(handler);
    };

    const countLive = () => {
        let n = 0;
        eachFrame(frame => { if (!isBlanked(frame)) n++; });
        return n;
    };

    // 保留预算：对最远的不可见软挂起帧做硬清空，直到保留数回到上限内。
    const enforceKeptBudget = () => {
        let live = countLive();
        if (live <= MAX_KEPT_FRAMES) return;
        const candidates = [];
        eachFrame(frame => {
            if (!isBlanked(frame) && !activeFrames.has(frame) && !visible.get(frame)) candidates.push(frame);
        });
        for (const frame of candidates) {
            if (live <= MAX_KEPT_FRAMES) break;
            blank(frame);
            live--;
        }
    };

    // 软挂起：保留内容，只停止绘制。
    const suspend = frame => {
        if (!frame || !activeFrames.has(frame)) return;
        freezeHeight(frame);
        frame.classList.add('html-frame-suspended');
        activeFrames.delete(frame);
        enforceKeptBudget();
    };

    const freeSlot = preferredFrame => {
        if (activeFrames.size < MAX_ACTIVE_FRAMES) return;
        const inactive = [...activeFrames].find(frame => frame !== preferredFrame && !visible.get(frame));
        suspend(inactive || [...activeFrames].find(frame => frame !== preferredFrame));
    };

    const activate = frame => {
        if (!frame || activeFrames.has(frame)) return;
        freeSlot(frame);
        const source = sources.get(frame);
        // 首次激活必须显式断言 srcdoc：插入时设置的 loading=lazy + srcdoc 组合在
        // Chromium 上可能出现「DOM 已渲染但脚本从未执行」的半加载态（shim 不跑、
        // 高度不上报、iframe 塌缩在默认高度）。重设 srcdoc 强制完整加载。此后
        // 软挂起恢复不再重设——保留卡内状态（无法承接上文修复的关键）。
        if (!activated.has(frame)) {
            activated.add(frame);
            if (source && !isBlanked(frame)) frame.srcdoc = source;
        }
        if (!isBlanked(frame)) {
            // 软挂起恢复：内容与状态都还在，直接显示。
            frame.classList.remove('html-frame-suspended');
            activeFrames.add(frame);
            return;
        }
        if (!source) return;
        frame.classList.remove('html-frame-suspended', 'html-frame-blanked');
        frame.srcdoc = source;
        activeFrames.add(frame);
    };

    const observeFrame = frame => {
        if (!(frame instanceof HTMLIFrameElement) || sources.has(frame)) return;
        const source = frame.srcdoc || frame.getAttribute('srcdoc') || '';
        if (!source) return;
        sources.set(frame, source);
        // 不设 loading=lazy：懒加载与 srcdoc 组合会让文档半加载（HTML 渲染但脚本
        // 不执行）。加载时机由本模块的 IntersectionObserver 全权管理。
        observer.observe(frame);
        // 注册兜底：IO 的初始回调可能不达（实测发生在聊天新消息插入时），对已
        // 在视口 ±2400px 内的帧直接激活，不等 IO 回调。
        try {
            const r = frame.getBoundingClientRect();
            const margin = 2400;
            if (r.top < window.innerHeight + margin && r.bottom > -margin) activate(frame);
        } catch (error) { /* 布局未就绪，交给 IO */ }
    };

    const scan = root => {
        if (root instanceof HTMLIFrameElement && root.classList.contains('executable-html-frame')) observeFrame(root);
        root?.querySelectorAll?.('iframe.executable-html-frame').forEach(observeFrame);
        [...activeFrames].forEach(frame => {
            if (!frame.isConnected) activeFrames.delete(frame);
        });
    };

    const init = () => {
        if (observer || !window.IntersectionObserver) return;
        observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                visible.set(entry.target, entry.isIntersecting);
                if (entry.isIntersecting) activate(entry.target);
                else suspend(entry.target);
            });
        }, { rootMargin: ROOT_MARGIN, threshold: 0 });

        mutationObserver = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => {
                if (node instanceof HTMLElement) scan(node);
            }));
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        scan(document.body);
    };

    const RPHFrameLifecycle = {
        init,
        scan: () => scan(document.body),
        getActiveCount: () => activeFrames.size,
        maxActiveFrames: MAX_ACTIVE_FRAMES,
        maxKeptFrames: MAX_KEPT_FRAMES
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();


export { RPHFrameLifecycle };
globalThis.RPHFrameLifecycle = RPHFrameLifecycle;
if (typeof window !== "undefined") window.RPHFrameLifecycle = RPHFrameLifecycle;
