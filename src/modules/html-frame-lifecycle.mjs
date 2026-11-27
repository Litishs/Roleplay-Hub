
    'use strict';

    // 角色卡 iframe 生命周期管理（双半径双观察器设计）：
    //   active   —— 激活带（视口 ±160px，小半径）内、激活预算（≤3）内的帧，
    //               内容完整运行。预算兜底 freeSlot 只可能在这个小半径内触发，
    //               屏幕上的在屏卡不会被误伤。
    //   soft     —— 软挂起带（视口 ±2400px，大半径）内但未激活的帧：保留
    //               srcdoc（卡内 JS 状态、表单、游戏进度全部不丢），仅停止
    //               绘制。滚回激活带瞬间恢复，无需重载。
    //   blanked  —— 保留的软挂起帧超过 keptIframes 上限时，对最远的帧硬清空
    //               释放内存。再次进入软挂起带时从源码重载。
    // 两个半径分开的原因：若激活预算与软挂起共用一个大半径，freeSlot 的
    // 「任意驱逐」兜底会把正在屏幕上的卡也挂起（hidden = 空白块），且 IO
    // 不会为持续相交的帧再发回调，用户必须滚出大半径再滚回才能恢复。
    const MAX_ACTIVE_FRAMES = window.RPHRuntimePolicy?.limits?.activeIframes || 3;
    const MAX_KEPT_FRAMES = window.RPHRuntimePolicy?.limits?.keptIframes || 16;
    const ACTIVE_MARGIN = '160px 0px';
    const PRESENCE_MARGIN = '2400px 0px';
    const sources = new WeakMap();
    const visible = new WeakMap();
    const activated = new WeakSet();
    const activeFrames = new Set();
    let activationObserver = null;
    let presenceObserver = null;
    let mutationObserver = null;

    const isBlanked = frame => frame.classList.contains('html-frame-blanked');
    const isSuspended = frame => frame.classList.contains('html-frame-suspended');

    const freezeHeight = frame => {
        const height = Math.max(80, Math.round(frame.getBoundingClientRect().height || 0));
        frame.style.height = `${height}px`;
    };

    // 硬清空：丢弃内容与卡内状态，释放内存（仅保留预算超限时使用）。
    const blank = frame => {
        if (!frame || isBlanked(frame)) return;
        freezeHeight(frame);
        frame.classList.add('html-frame-suspended', 'html-frame-blanked');
        frame.srcdoc = '<!doctype html><html><body></body></html>';
        activeFrames.delete(frame);
    };

    const countLive = () => {
        let n = 0;
        document.body?.querySelectorAll?.('iframe.executable-html-frame').forEach(frame => {
            if (!isBlanked(frame)) n++;
        });
        return n;
    };

    // 保留预算：对最远的不可见软挂起帧做硬清空，直到保留数回到上限内。
    const enforceKeptBudget = () => {
        let live = countLive();
        if (live <= MAX_KEPT_FRAMES) return;
        const candidates = [];
        document.body?.querySelectorAll?.('iframe.executable-html-frame').forEach(frame => {
            if (!isBlanked(frame) && !activeFrames.has(frame) && !visible.get(frame)) candidates.push(frame);
        });
        for (const frame of candidates) {
            if (live <= MAX_KEPT_FRAMES) break;
            blank(frame);
            live--;
        }
    };

    // 软挂起：保留内容与状态，仅停止绘制（visibility:hidden）。激活预算的
    // 兜底驱逐与大半径退出都走这里。
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
        // 首次激活显式断言 srcdoc：loading=lazy + srcdoc 组合可能出现「DOM 已
        // 渲染但脚本从未执行」的半加载态（shim 不跑、高度不上报、iframe 塌缩
        // 在默认高度）。activated 集合守卫只重设一次；此后软挂起恢复不再重设
        // ——保留卡内状态（承接上文修复的关键）。
        if (!activated.has(frame)) {
            activated.add(frame);
            visible.set(frame, true);
            if (source && !isBlanked(frame)) frame.srcdoc = source;
        }
        if (!isBlanked(frame)) {
            frame.classList.remove('html-frame-suspended');
            visible.set(frame, true);
            activeFrames.add(frame);
            return;
        }
        if (!source) return;
        frame.classList.remove('html-frame-suspended', 'html-frame-blanked');
        frame.srcdoc = source;
        activeFrames.add(frame);
    };

    // 软挂起带观察器：离开 ±2400px 带时对激活帧软挂起；进入带时把已硬清空
    // 的帧恢复内容但保持软挂起（hidden），等进入激活带再由激活观察器正式
    // 激活——不占激活预算、不触发 freeSlot 驱逐。
    const onPresenceChange = frame => {
        if (!frame || !frame.isConnected) return;
        if (visible.get(frame)) {
            if (isBlanked(frame)) {
                const source = sources.get(frame);
                if (source) {
                    frame.srcdoc = source;
                    frame.classList.remove('html-frame-blanked');
                }
            }
            return;
        }
        if (activeFrames.has(frame)) suspend(frame);
        enforceKeptBudget();
    };

    const observeFrame = frame => {
        if (!(frame instanceof HTMLIFrameElement) || sources.has(frame)) return;
        const source = frame.srcdoc || frame.getAttribute('srcdoc') || '';
        if (!source) return;
        sources.set(frame, source);
        frame.setAttribute('loading', 'lazy');
        activationObserver.observe(frame);
        presenceObserver.observe(frame);
        // 注册兜底：IO 的初始回调在部分挂载帧上可能不触发。已进入激活带的帧
        // 直接走同步激活（内含首次 srcdoc 断言与 visible 标记），不等回调。
        try {
            const r = frame.getBoundingClientRect();
            if (r.top < window.innerHeight + 160 && r.bottom > -160) {
                visible.set(frame, true);
                activate(frame);
            }
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
        if (activationObserver || !window.IntersectionObserver) return;
        activationObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                visible.set(entry.target, entry.isIntersecting);
                if (entry.isIntersecting) activate(entry.target);
                else suspend(entry.target);
            });
        }, { rootMargin: ACTIVE_MARGIN, threshold: 0 });
        presenceObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                visible.set(entry.target, entry.isIntersecting);
                onPresenceChange(entry.target);
            });
        }, { rootMargin: PRESENCE_MARGIN, threshold: 0 });
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
