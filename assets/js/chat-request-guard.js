(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RPHChatRequestGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const positiveMs = (value, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    };

    const create = (options = {}) => {
        const now = typeof options.now === 'function' ? options.now : Date.now;
        const limits = {
            firstByteMs: positiveMs(options.firstByteMs, 60000),
            firstTokenMs: positiveMs(options.firstTokenMs, 60000),
            streamIdleMs: positiveMs(options.streamIdleMs, 120000),
            totalMs: positiveMs(options.totalMs, 600000)
        };
        const startedAt = now();
        let headersAt = 0;
        let lastMeaningfulAt = 0;
        let headersReceived = false;
        let meaningfulReceived = false;

        const getStageDeadline = () => {
            if (!headersReceived) return startedAt + limits.firstByteMs;
            if (!meaningfulReceived) return headersAt + limits.firstTokenMs;
            return lastMeaningfulAt + limits.streamIdleMs;
        };

        const getTimeout = (at = now()) => {
            if (at >= startedAt + limits.totalMs) {
                return { message: 'Generation total timed out', stage: 'timed_out_total' };
            }
            if (!headersReceived && at >= startedAt + limits.firstByteMs) {
                return { message: 'Generation first byte timed out', stage: 'timed_out_waiting_headers' };
            }
            if (headersReceived && !meaningfulReceived && at >= headersAt + limits.firstTokenMs) {
                return { message: 'Generation first token timed out', stage: 'timed_out_waiting_first_token' };
            }
            if (meaningfulReceived && at >= lastMeaningfulAt + limits.streamIdleMs) {
                return { message: 'Generation stream idle timed out', stage: 'timed_out_streaming' };
            }
            return null;
        };

        return Object.freeze({
            resetHeaders() {
                headersReceived = false;
                headersAt = 0;
            },
            markHeaders(at = now()) {
                headersReceived = true;
                headersAt = at;
            },
            markMeaningful(content, reasoning, at = now()) {
                if (!String(content || '').trim() && !String(reasoning || '').trim()) return false;
                meaningfulReceived = true;
                lastMeaningfulAt = at;
                return true;
            },
            hasMeaningful: () => meaningfulReceived,
            getTimeout,
            getRemainingMs(at = now()) {
                return Math.max(1, Math.min(startedAt + limits.totalMs, getStageDeadline()) - at);
            }
        });
    };

    return Object.freeze({ create });
});
