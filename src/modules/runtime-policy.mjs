
    'use strict';

    const limits = Object.freeze({
        chatInitial: 20,
        chatBatch: 10,
        chatMaximum: 40,
        renderCache: 100,
        activeIframes: 3,
        streamFlushMs: 50,
        draftSaveMs: 2000
    });

    class LruCache {
        constructor(maximumSize) {
            this.maximumSize = Math.max(1, Number(maximumSize) || 1);
            this.values = new Map();
        }

        get size() { return this.values.size; }

        has(key) { return this.values.has(key); }

        get(key) {
            if (!this.values.has(key)) return undefined;
            const value = this.values.get(key);
            this.values.delete(key);
            this.values.set(key, value);
            return value;
        }

        set(key, value) {
            if (this.values.has(key)) this.values.delete(key);
            this.values.set(key, value);
            while (this.values.size > this.maximumSize) {
                this.values.delete(this.values.keys().next().value);
            }
            return this;
        }

        clear() { this.values.clear(); }
    }

    const getChatWindow = (total, requestedStart, requestedLimit) => {
        const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
        const safeLimit = Math.min(
            safeTotal,
            limits.chatMaximum,
            Math.max(0, Math.trunc(Number(requestedLimit) || 0))
        );
        const maximumStart = Math.max(0, safeTotal - safeLimit);
        const start = Math.min(maximumStart, Math.max(0, Math.trunc(Number(requestedStart) || 0)));
        return { start, end: Math.min(safeTotal, start + safeLimit), limit: safeLimit };
    };

    const RPHRuntimePolicy = { limits, LruCache, getChatWindow };


export { RPHRuntimePolicy };


