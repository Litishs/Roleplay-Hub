// Global runtime error handling (roadmap Phase 3.3).
//
// Installs three sinks that previously did not exist anywhere in the app:
//   1. `app.config.errorHandler` — Vue component render / watcher / lifecycle
//      errors (this includes every SFC and the runtime-compiled root template).
//   2. `window` `error` events — uncaught synchronous errors plus resource
//      load failures (img / script / link). Resource errors do not bubble, so
//      this listener MUST be registered in the capture phase (third argument
//      `true`) or the resource branch is unreachable in real browsers.
//   3. `window` `unhandledrejection` events — uncaught promise rejections.
//
// Every captured error is written into the Activity Journal
// (`request-diagnostics.mjs`) under `category: 'runtime'` so it shows up in
// the same run-log export users already know, right next to chat / tool /
// update records.
//
// Privacy rule (AGENTS.md §2.4): error messages are clamped before they
// reach the journal. Only `name`, `message` (truncated), the Vue component
// name and the lifecycle hook info string are recorded — never message
// payloads, arguments or stack traces containing prompt text.
//
// Failure contract: the handlers themselves must never throw and must never
// break the app. All journal writes are best-effort with console.warn on
// internal failure.

const ERROR_MESSAGE_MAX_LENGTH = 200;
const URL_MAX_LENGTH = 120;
// Identical errors can fire in bursts (e.g. a render loop throwing on every
// tick). Collapse repeats of the same kind+name+message inside this window.
const DEDUP_WINDOW_MS = 2000;
const MAX_TRACKED_KEYS = 64;
// A same-source error that keeps recurring beyond the dedup window (e.g. a
// render loop throwing every >2s) must not flood the 30-slot ring buffer and
// evict chat/tool evidence. After this many hits for one key in a session,
// further hits only bump the suppressed counter.
const MAX_RECORDS_PER_KEY = 5;

const clampText = (value, maxLength) => {
    const str = String(value ?? '');
    return str.length > maxLength ? str.slice(0, maxLength) + '…' : str;
};

// Normalize any thrown value (Error, string, object, undefined) into a
// plain descriptor without executing arbitrary code from the value.
const describeError = (error) => {
    if (error === null || error === undefined) {
        return { name: 'Unknown', message: '' };
    }
    if (error instanceof Error) {
        return { name: String(error.name || 'Error'), message: clampText(error.message, ERROR_MESSAGE_MAX_LENGTH) };
    }
    return { name: error?.name ? String(error.name) : 'NonError', message: clampText(error?.message ?? error, ERROR_MESSAGE_MAX_LENGTH) };
};

// Best-effort component attribution for a Vue error: the component's
// `__name` (SFC compiler output) or explicit `name` option.
const describeVueInstance = (instance) => {
    try {
        const type = instance?.type;
        const name = type?.__name || type?.name;
        return name ? clampText(String(name), 64) : '';
    } catch (_) {
        return '';
    }
};

const describeEventTarget = (target) => {
    try {
        if (!target || typeof target !== 'object') return '';
        const tag = target.tagName ? String(target.tagName).toLowerCase() : 'unknown';
        const source = target.src || target.href || '';
        return source ? `${tag} ${clampText(source, URL_MAX_LENGTH)}` : tag;
    } catch (_) {
        return '';
    }
};

// Creates the recording core. `journal` defaults to the global
// RPHRequestDiagnostics; tests inject a mock with the same `begin()` shape.
export const createRuntimeErrorTracker = (options = {}) => {
    const journal = options?.journal
        ?? (typeof globalThis !== 'undefined' ? globalThis.RPHRequestDiagnostics : undefined);
    const nowFn = options?.nowFn ?? (() => Date.now());
    const dedupWindowMs = Number.isFinite(options?.dedupWindowMs) ? options.dedupWindowMs : DEDUP_WINDOW_MS;
    const maxRecordsPerKey = Number.isFinite(options?.maxRecordsPerKey) ? options.maxRecordsPerKey : MAX_RECORDS_PER_KEY;

    const recentKeys = new Map();
    // Per-key hit counter for the session-wide storm cap. Counts every hit
    // (including dedup-suppressed ones) so a mixed burst+periodic storm still
    // trips the cap.
    const keyHits = new Map();
    let recordCount = 0;
    let suppressedCount = 0;

    // Returns true when this exact error was already recorded inside the
    // dedup window. The key map is bounded so a pathological error source
    // cannot grow memory.
    const isDuplicate = (key) => {
        const timestamp = nowFn();
        const lastSeen = recentKeys.get(key);
        recentKeys.set(key, timestamp);
        if (recentKeys.size > MAX_TRACKED_KEYS) {
            const oldestKey = recentKeys.keys().next().value;
            recentKeys.delete(oldestKey);
        }
        return Number.isFinite(lastSeen) && (timestamp - lastSeen) < dedupWindowMs;
    };

    const countHit = (key) => {
        const hits = (keyHits.get(key) || 0) + 1;
        keyHits.set(key, hits);
        if (keyHits.size > MAX_TRACKED_KEYS * 4) {
            const oldestKey = keyHits.keys().next().value;
            keyHits.delete(oldestKey);
        }
        return hits;
    };

    // One-shot journal record: begin → optional context behavior → fail.
    // `fail()` classifies AbortError as 'cancelled' naturally; everything
    // else lands as 'failed' / 'timed_out' by message content.
    const record = ({ action, error, context }) => {
        try {
            if (!journal || typeof journal.begin !== 'function') return false;
            const described = describeError(error);
            const key = `${action}:${described.name}:${described.message}`;
            const hits = countHit(key);
            if (isDuplicate(key)) {
                suppressedCount += 1;
                return false;
            }
            if (hits > maxRecordsPerKey) {
                suppressedCount += 1;
                return false;
            }
            const handle = journal.begin({ category: 'runtime', action });
            if (!handle || typeof handle.fail !== 'function') return false;
            if (context && typeof handle.behavior === 'function') {
                handle.behavior({ name: 'error_context', result: 'ok', meta: context });
            }
            // Pass the clamped descriptor (not the raw value) so oversized or
            // exotic throwables never reach the journal verbatim. Classification
            // still works: the journal reads `name` / `message` only.
            handle.fail(described);
            recordCount += 1;
            return true;
        } catch (e) {
            console.warn('[GlobalErrorHandler] record failed:', e?.message || e);
            return false;
        }
    };

    return {
        recordVueError(error, instance, info) {
            return record({
                action: 'vue_error',
                error,
                context: {
                    source: 'vue',
                    component: describeVueInstance(instance),
                    info: clampText(info, 64)
                }
            });
        },
        recordWindowError(event) {
            // Resource load errors arrive as plain 'error' events on the
            // element itself with no `error` value attached.
            const target = event?.target;
            const isResourceError = !event?.error
                && target
                && typeof target === 'object'
                && target !== globalThis
                && (target.nodeType === 1 || !!target.tagName);
            if (isResourceError) {
                return record({
                    action: 'resource_error',
                    error: new Error(`resource failed: ${describeEventTarget(target)}`),
                    context: { source: 'resource', target: describeEventTarget(target) }
                });
            }
            return record({
                action: 'window_error',
                error: event?.error ?? event?.message ?? 'unknown window error',
                context: { source: 'window' }
            });
        },
        recordUnhandledRejection(event) {
            const reason = event?.reason ?? 'unknown rejection';
            return record({
                action: 'unhandled_rejection',
                error: reason,
                context: { source: 'promise' }
            });
        },
        stats: {
            get recordCount() { return recordCount; },
            get suppressedCount() { return suppressedCount; },
            // Total hits per dedup key (recorded + suppressed) so the export
            // envelope can show which error sources dominate. Bounded by the
            // same eviction as keyHits.
            get hitsByKey() {
                const out = {};
                for (const [key, hits] of keyHits) out[key] = hits;
                return out;
            }
        }
    };
};

// Installs all three sinks on the given Vue app + global event target.
// Returns a disposer that removes the listeners and the errorHandler
// (useful for tests; the app itself keeps them for its whole lifetime).
export const installGlobalErrorHandlers = (app, options = {}) => {
    const tracker = options?.tracker ?? createRuntimeErrorTracker(options);
    const logToConsole = options?.logToConsole !== false;

    // Publish the tracker stats so the diagnostics export envelope can read
    // them without holding a reference to the tracker instance.
    try {
        if (typeof globalThis !== 'undefined') globalThis.RPHRuntimeErrorStats = tracker.stats;
    } catch (_) { /* no-op */ }

    try {
        if (app?.config && typeof app === 'object') {
            app.config.errorHandler = (error, instance, info) => {
                tracker.recordVueError(error, instance, info);
                if (logToConsole) {
                    console.error('[GlobalErrorHandler] Vue error:', error, 'at', info);
                }
            };
        }
    } catch (e) {
        console.warn('[GlobalErrorHandler] errorHandler install failed:', e?.message || e);
    }

    const eventTarget = options?.eventTarget
        ?? (typeof window !== 'undefined' ? window : globalThis);
    const onWindowError = (event) => {
        tracker.recordWindowError(event);
        if (logToConsole && event?.error) {
            console.error('[GlobalErrorHandler] uncaught error:', event.error);
        }
    };
    const onUnhandledRejection = (event) => {
        tracker.recordUnhandledRejection(event);
        if (logToConsole) {
            console.error('[GlobalErrorHandler] unhandled rejection:', event?.reason);
        }
    };
    try {
        // Capture phase (third arg `true`) is what makes resource load errors
        // (img/script/link, non-bubbling) reachable from the window at all.
        eventTarget?.addEventListener?.('error', onWindowError, true);
        eventTarget?.addEventListener?.('unhandledrejection', onUnhandledRejection);
    } catch (e) {
        console.warn('[GlobalErrorHandler] window listener install failed:', e?.message || e);
    }

    return () => {
        try {
            eventTarget?.removeEventListener?.('error', onWindowError, true);
            eventTarget?.removeEventListener?.('unhandledrejection', onUnhandledRejection);
        } catch (_) { /* no-op */ }
        try {
            if (app?.config) app.config.errorHandler = null;
        } catch (_) { /* no-op */ }
    };
};
