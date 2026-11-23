// Tab shell for narrow screens (2026-11-23).
//
// Pure data and functions only. The reactive wiring (the watch on currentView,
// goBack, switchTab) lives in app.mjs so that every existing writer of
// currentView — templates, selectCharacter, the system back handler — keeps
// working unchanged and the Back stack cannot drift from what is on screen.
//
// Roots are the four tab pages (tab id === root view id). Everything else is a
// detail view that belongs to the tab returned by tabOfView(). Wide screens
// keep the left sidebar and do not show the hubs, but the same rules apply.

const TAB_ORDER = Object.freeze(['home', 'workshop', 'ext', 'settings']);

const VIEW_TAB = Object.freeze({
    home: 'home', chat: 'home', characters: 'home',
    workshop: 'workshop', generator: 'workshop', square: 'workshop', novel: 'workshop',
    ext: 'ext', memory: 'ext', presets: 'ext', worldinfo: 'ext',
    regex: 'ext', uitemplates: 'ext', tools: 'ext', plugins: 'ext',
    settings: 'settings', usage: 'settings'
});

// Only a safety net: real flows are two or three levels deep. On wide screens
// the sidebar jumps straight between views, which would otherwise grow the
// stack without bound; the oldest origin is dropped first.
const NAV_STACK_LIMIT = 10;

const tabOfView = (view) => VIEW_TAB[view] || 'home';
const isTabRoot = (view) => TAB_ORDER.includes(view);

// A stack entry is { view, from }: `view` is the page on screen, `from` is the
// page it was opened from and where Back returns to.
//
// - Landing on a tab root clears the stack.
// - `to` already being the top entry means goBack() popped it before changing
//   the view: nothing to record.
// - Opened from a page other than the current top entry (a lateral jump): the
//   old entries no longer describe how the user got here, so restart from the
//   real origin instead of appending to a stale history.
const recordViewChange = (stack, from, to, limit = NAV_STACK_LIMIT) => {
    if (to === from) return stack;
    if (isTabRoot(to)) return [];
    const top = stack[stack.length - 1];
    if (top && top.view === to) return stack;
    const base = top && top.view === from ? stack : [];
    const next = [...base, { view: to, from }];
    return next.length > limit ? next.slice(next.length - limit) : next;
};

export { TAB_ORDER, VIEW_TAB, NAV_STACK_LIMIT, tabOfView, isTabRoot, recordViewChange };
