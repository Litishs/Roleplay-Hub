// Contract tests for the global runtime error handler (roadmap Phase 3.3).
//
// Two layers:
//   1. Text assertions on app.mjs wiring (import + install before mount).
//   2. Runtime tests loading the module via dynamic import with an injected
//      mock journal (same `begin()` shape as RPHRequestDiagnostics).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createRuntimeErrorTracker, installGlobalErrorHandlers } from '../src/modules/global-error-handler.mjs';

const readSource = async (relativePath) => (
    await readFile(new URL(relativePath, import.meta.url), 'utf8')
);

const createMockJournal = () => {
    const calls = [];
    let beginImpl = null;
    const journal = {
        calls,
        set beginBehavior(impl) { beginImpl = impl; },
        begin({ category, action } = {}) {
            const handle = {
                behaviors: [],
                failedWith: undefined,
                behavior(entry) { this.behaviors.push(entry); },
                fail(error) { this.failedWith = error; }
            };
            calls.push({ category, action, handle });
            if (beginImpl) return beginImpl({ category, action, handle });
            return handle;
        }
    };
    return journal;
};

test('app.mjs imports the global error handler and installs it before mount', async () => {
    const source = await readSource('../src/modules/app.mjs');
    const importLine = "import { installGlobalErrorHandlers } from './global-error-handler.mjs';";
    assert.ok(source.includes(importLine), 'app.mjs must import installGlobalErrorHandlers');
    const installIndex = source.indexOf('installGlobalErrorHandlers(__app);');
    const mountIndex = source.indexOf("__app.mount('#app');");
    assert.ok(installIndex > -1, 'app.mjs must call installGlobalErrorHandlers(__app)');
    assert.ok(mountIndex > -1, 'app.mjs must mount the app');
    assert.ok(installIndex < mountIndex, 'error handlers must be installed before __app.mount');
});

test('vue component errors are recorded into the journal with component attribution', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });
    const error = new TypeError('Cannot read properties of undefined');
    const recorded = tracker.recordVueError(error, { type: { __name: 'MessageList' } }, 'render function');

    assert.equal(recorded, true);
    assert.equal(journal.calls.length, 1);
    assert.equal(journal.calls[0].category, 'runtime');
    assert.equal(journal.calls[0].action, 'vue_error');
    const behavior = journal.calls[0].handle.behaviors[0];
    assert.equal(behavior.name, 'error_context');
    assert.equal(behavior.meta.component, 'MessageList');
    assert.equal(behavior.meta.info, 'render function');
    assert.equal(behavior.meta.source, 'vue');
    assert.equal(journal.calls[0].handle.failedWith.name, 'TypeError');
    assert.equal(journal.calls[0].handle.failedWith.message, error.message);
});

test('identical errors inside the dedup window are suppressed', () => {
    const journal = createMockJournal();
    let clock = 1000;
    const tracker = createRuntimeErrorTracker({ journal, nowFn: () => clock });
    const error = new Error('render loop boom');

    assert.equal(tracker.recordVueError(error, null, 'render function'), true);
    assert.equal(tracker.recordVueError(error, null, 'render function'), false);
    assert.equal(journal.calls.length, 1);
    assert.equal(tracker.stats.recordCount, 1);
    assert.equal(tracker.stats.suppressedCount, 1);

    // Same error after the dedup window must be recorded again.
    clock += 2001;
    assert.equal(tracker.recordVueError(error, null, 'render function'), true);
    assert.equal(journal.calls.length, 2);
});

test('different errors are not deduplicated against each other', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });
    tracker.recordVueError(new TypeError('a'), null, 'render function');
    tracker.recordVueError(new TypeError('b'), null, 'render function');
    assert.equal(journal.calls.length, 2);
});

test('unhandled rejections record the reason, stringifying non-Error values', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });

    tracker.recordUnhandledRejection({ reason: new Error('network down') });
    assert.equal(journal.calls[0].action, 'unhandled_rejection');
    assert.equal(journal.calls[0].handle.failedWith.name, 'Error');
    assert.equal(journal.calls[0].handle.failedWith.message, 'network down');
    assert.equal(journal.calls[0].handle.behaviors[0].meta.source, 'promise');

    tracker.recordUnhandledRejection({ reason: 'plain string rejection' });
    assert.equal(journal.calls[1].handle.failedWith.message, 'plain string rejection');
    assert.equal(journal.calls[1].handle.failedWith.name, 'NonError');

    tracker.recordUnhandledRejection({});
    assert.equal(journal.calls[2].handle.failedWith.message, 'unknown rejection');
});

test('resource load errors are classified separately from script errors', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });

    tracker.recordWindowError({ target: { tagName: 'IMG', src: 'https://example.com/avatar.png', nodeType: 1 } });
    assert.equal(journal.calls[0].action, 'resource_error');
    assert.ok(journal.calls[0].handle.failedWith.message.includes('img'));
    assert.ok(journal.calls[0].handle.failedWith.message.includes('avatar.png'));

    tracker.recordWindowError({ error: new Error('uncaught sync failure'), message: 'Uncaught Error: uncaught sync failure' });
    assert.equal(journal.calls[1].action, 'window_error');
    assert.equal(journal.calls[1].handle.failedWith.message, 'uncaught sync failure');
    assert.equal(journal.calls[1].handle.behaviors[0].meta.source, 'window');
});

test('oversized error messages are clamped before reaching the journal', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });
    const longMessage = 'x'.repeat(500);
    tracker.recordUnhandledRejection({ reason: new Error(longMessage) });
    const stored = journal.calls[0].handle.failedWith;
    assert.ok(stored.message.length <= 201, 'clamped message must stay within limit');
    assert.ok(stored.message.endsWith('…'));
    assert.equal(stored.name, 'Error');
    // The dedup key must use the clamped form, otherwise every burst of an
    // identical oversized error looks unique and floods the ring buffer.
    tracker.recordUnhandledRejection({ reason: new Error(longMessage) });
    assert.equal(journal.calls.length, 1, 'duplicate oversized error must be deduplicated');
});

test('journal failures never break the tracker', () => {
    const journal = createMockJournal();
    journal.beginBehavior = () => { throw new Error('journal exploded'); };
    const tracker = createRuntimeErrorTracker({ journal });
    assert.equal(tracker.recordVueError(new Error('app boom'), null, 'setup function'), false);
    assert.equal(tracker.stats.recordCount, 0);

    const missingJournal = createRuntimeErrorTracker({ journal: undefined });
    assert.equal(missingJournal.recordUnhandledRejection({ reason: 'x' }), false);
});

test('installGlobalErrorHandlers wires Vue errorHandler + window listeners and disposes cleanly', () => {
    const journal = createMockJournal();
    const tracker = createRuntimeErrorTracker({ journal });
    const app = { config: {} };
    const listeners = new Map();
    const eventTarget = {
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); }
    };

    const dispose = installGlobalErrorHandlers(app, { tracker, eventTarget, logToConsole: false });

    assert.equal(typeof app.config.errorHandler, 'function');
    assert.ok(listeners.has('error'));
    assert.ok(listeners.has('unhandledrejection'));

    // Route an error through the installed Vue errorHandler.
    app.config.errorHandler(new Error('via config'), { type: { __name: 'RegexPanel' } }, 'watcher callback');
    assert.equal(journal.calls[0].action, 'vue_error');
    assert.equal(journal.calls[0].handle.behaviors[0].meta.component, 'RegexPanel');

    // Window listeners route into the same journal.
    listeners.get('unhandledrejection')({ reason: 'rejected!' });
    assert.equal(journal.calls[1].action, 'unhandled_rejection');
    listeners.get('error')({ error: new Error('window boom') });
    assert.equal(journal.calls[2].action, 'window_error');

    // After dispose: no new records, errorHandler detached.
    dispose();
    assert.equal(app.config.errorHandler, null);
    listeners.get('unhandledrejection')?.({ reason: 'after dispose' });
    listeners.get('error')?.({ error: new Error('after dispose') });
    assert.equal(journal.calls.length, 3);
});

test('installGlobalErrorHandlers tolerates a bare app object without config', () => {
    const tracker = createRuntimeErrorTracker({ journal: createMockJournal() });
    const dispose = installGlobalErrorHandlers(null, { tracker, eventTarget: new EventTarget(), logToConsole: false });
    assert.equal(typeof dispose, 'function');
    dispose();
});
