
    'use strict';

    const limits = Object.freeze({
        chatInitial: 20,
        chatBatch: 10,
        chatMaximum: 40,
        renderCache: 100,
        activeIframes: 3,
        streamFlushMs: 50,
        draftSaveMs: 2000,
        // 角色卡 iframe 自报高度的上限。卡片跨源之后高度由卡片自己 postMessage 上报，
        // 属于不可信输入：不封顶的话一张卡片就能把聊天流撑成几万像素。
        frameMaxHeight: 4000,
        // 卡片经 triggerSlash 注入的指令长度上限，同样是不可信输入。
        frameSlashMaxLength: 2000,
        // parseCot 已完成文本的 LRU 上限。生成中的前缀不进这里（见 utils.mjs 的
        // 单槽易失缓存），所以条目数约等于「渲染窗口内的消息数」量级，100 足够。
        parseCotCache: 100,
        // Swipe candidates per assistant message (FIFO beyond the cap): candidates are
        // persisted with chat history, so the cap bounds storage growth (design doc §D-5).
        swipeMaxCandidates: 5,
        // 聊天请求超时默认值（毫秒）。可在设置 → 高级设置 → 网络超时 中覆盖，
        // 覆盖值经 resolveRequestTimeouts 封顶在 requestTimeoutMin/MaxSeconds 之间。
        requestTimeout: {
            firstByteMs: 60000,
            firstTokenMs: 60000,
            streamIdleMs: 120000,
            totalMs: 600000
        },
        requestTimeoutMinSeconds: 10,
        requestTimeoutMaxSeconds: 1800
    });

    // 把 settings 里的秒为单位的超时配置解析为 guard 用的毫秒组。
    // 缺失/非法字段回退默认值，全部值 clamp 在 [min, max] 区间。
    const clampTimeoutSeconds = (value, fallbackSeconds) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallbackSeconds;
        return Math.min(
            limits.requestTimeoutMaxSeconds,
            Math.max(limits.requestTimeoutMinSeconds, Math.round(number))
        );
    };

    const resolveRequestTimeouts = (settings = {}) => {
        const defaults = limits.requestTimeout;
        const firstByteSeconds = clampTimeoutSeconds(settings?.requestFirstByteTimeout, defaults.firstByteMs / 1000);
        const firstTokenSeconds = clampTimeoutSeconds(settings?.requestFirstTokenTimeout, defaults.firstTokenMs / 1000);
        const streamIdleSeconds = clampTimeoutSeconds(settings?.requestStreamIdleTimeout, defaults.streamIdleMs / 1000);
        const totalSeconds = clampTimeoutSeconds(settings?.requestTotalTimeout, defaults.totalMs / 1000);
        return {
            firstByteMs: firstByteSeconds * 1000,
            firstTokenMs: firstTokenSeconds * 1000,
            streamIdleMs: streamIdleSeconds * 1000,
            totalMs: totalSeconds * 1000
        };
    };

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

    const RPHRuntimePolicy = { limits, LruCache, getChatWindow, resolveRequestTimeouts };


export { RPHRuntimePolicy, resolveRequestTimeouts };


