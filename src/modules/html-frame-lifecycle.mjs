
    'use strict';

    const MAX_ACTIVE_FRAMES = window.RPHRuntimePolicy?.limits?.activeIframes || 3;
    const sources = new WeakMap();
    const visible = new WeakMap();
    const activeFrames = new Set();
    let observer = null;
    let mutationObserver = null;

    const suspend = frame => {
        if (!frame || !activeFrames.has(frame)) return;
        const height = Math.max(80, Math.round(frame.getBoundingClientRect().height || 0));
        frame.style.height = `${height}px`;
        frame.classList.add('html-frame-suspended');
        frame.srcdoc = '<!doctype html><html><body></body></html>';
        activeFrames.delete(frame);
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
        if (!source) return;
        frame.classList.remove('html-frame-suspended');
        frame.srcdoc = source;
        activeFrames.add(frame);
    };

    const observeFrame = frame => {
        if (!(frame instanceof HTMLIFrameElement) || sources.has(frame)) return;
        const source = frame.srcdoc || frame.getAttribute('srcdoc') || '';
        if (!source) return;
        sources.set(frame, source);
        frame.setAttribute('loading', 'lazy');
        observer.observe(frame);
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
        }, { rootMargin: '160px 0px', threshold: 0 });

        mutationObserver = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => {
                if (node instanceof HTMLElement) scan(node);
            }));
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        scan(document.body);
    };

    const RPHFrameLifecycle = { init, scan: () => scan(document.body), getActiveCount: () => activeFrames.size, maxActiveFrames: MAX_ACTIVE_FRAMES };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();


export { RPHFrameLifecycle };
globalThis.RPHFrameLifecycle = RPHFrameLifecycle;
if (typeof window !== "undefined") window.RPHFrameLifecycle = RPHFrameLifecycle;
