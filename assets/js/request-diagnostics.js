(() => {
    const STORAGE_KEY = 'rph_request_diagnostics_v1';
    const MAX_RECORDS = 10;
    const records = [];
    const clocks = new WeakMap();
    const fingerprintVersions = new WeakMap();

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const now = () => (globalThis.performance?.now?.() ?? Date.now());
    const elapsed = (record) => Math.max(0, Math.round(now() - (clocks.get(record) || now())));
    const endpointLabel = (rawUrl) => {
        try {
            const url = new URL(rawUrl, globalThis.location?.href || 'https://localhost/');
            return `${url.origin}${url.pathname}`;
        } catch (_) {
            return 'invalid-url';
        }
    };
    const persist = () => {
        try {
            globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (_) { }
    };
    const sha256 = async (value) => {
        if (!globalThis.crypto?.subtle) return null;
        const bytes = new TextEncoder().encode(String(value || ''));
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    };
    const setFirstTiming = (record, key) => {
        if (record.timings[key] === null) {
            record.timings[key] = elapsed(record);
            return true;
        }
        return false;
    };
    const createRequestSnapshot = (payload, promptBuildMs = null) => {
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        return {
            model: String(payload?.model || ''),
            temperature: Number.isFinite(Number(payload?.temperature)) ? Number(payload.temperature) : null,
            stream: payload?.stream === true,
            messageCount: messages.length,
            totalCharacters: messages.reduce((total, message) => total + String(message?.content || '').length, 0),
            payloadSha256: null,
            fingerprintReady: false,
            promptBuildMs: promptBuildMs !== null && promptBuildMs !== undefined && Number.isFinite(Number(promptBuildMs))
                ? Math.max(0, Math.round(promptBuildMs))
                : null,
            messages: messages.map(message => ({
                role: String(message?.role || ''),
                hasName: !!message?.name,
                characters: String(message?.content || '').length,
                sha256: null
            }))
        };
    };
    const updateRequest = (record, payload, promptBuildMs = null) => {
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const version = (fingerprintVersions.get(record) || 0) + 1;
        fingerprintVersions.set(record, version);
        record.request = createRequestSnapshot(payload, promptBuildMs);
        if (record.timings.promptBuildMs === null && record.request.promptBuildMs !== null) {
            record.timings.promptBuildMs = record.request.promptBuildMs;
        }
        persist();

        Promise.all([
            sha256(JSON.stringify(payload || {})),
            ...messages.map(message => sha256(String(message?.content || '')))
        ]).then(([payloadHash, ...messageHashes]) => {
            if (fingerprintVersions.get(record) !== version) return;
            record.request.payloadSha256 = payloadHash;
            record.request.messages.forEach((message, index) => {
                message.sha256 = messageHashes[index] || null;
            });
            record.request.fingerprintReady = true;
            persist();
        }).catch(() => {
            if (fingerprintVersions.get(record) !== version) return;
            record.request.fingerprintReady = true;
            persist();
        });
    };

    try {
        const saved = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(saved)) records.push(...saved.slice(-MAX_RECORDS));
    } catch (_) { }

    const start = ({ url, payload, promptBuildMs = null, requestType = 'chat' }) => {
        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            startedAt: new Date().toISOString(),
            status: 'pending',
            stage: 'preparing',
            stageHistory: [{ stage: 'preparing', elapsedMs: 0 }],
            requestType,
            endpoint: endpointLabel(url),
            request: createRequestSnapshot(payload, promptBuildMs),
            response: {
                httpStatus: null,
                contentType: '',
                networkBytes: 0,
                reasoningCharacters: 0,
                contentCharacters: 0,
                usage: null,
                errorName: ''
            },
            timings: {
                promptBuildMs: promptBuildMs !== null && promptBuildMs !== undefined && Number.isFinite(Number(promptBuildMs))
                    ? Math.max(0, Math.round(promptBuildMs))
                    : null,
                responseHeadersMs: null,
                firstNetworkChunkMs: null,
                firstReasoningMs: null,
                firstContentMs: null,
                completedMs: null
            }
        };

        clocks.set(record, now());
        records.push(record);
        if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
        updateRequest(record, payload, promptBuildMs);

        let finished = false;
        return {
            request(nextPayload, nextPromptBuildMs = null) {
                updateRequest(record, nextPayload, nextPromptBuildMs);
            },
            stage(name) {
                const stage = String(name || '').trim();
                if (!stage || record.stage === stage) return;
                record.stage = stage;
                record.stageHistory.push({ stage, elapsedMs: elapsed(record) });
                if (record.stageHistory.length > 20) record.stageHistory.shift();
                persist();
            },
            responseHeaders(status, contentType = '') {
                record.response.httpStatus = Number(status) || null;
                record.response.contentType = String(contentType || '').split(';')[0];
                setFirstTiming(record, 'responseHeadersMs');
                persist();
            },
            networkChunk(byteLength = 0) {
                record.response.networkBytes += Math.max(0, Number(byteLength) || 0);
                if (setFirstTiming(record, 'firstNetworkChunkMs')) persist();
            },
            reasoning(text) {
                const length = String(text || '').length;
                if (!length) return;
                record.response.reasoningCharacters += length;
                if (setFirstTiming(record, 'firstReasoningMs')) persist();
            },
            content(text) {
                const length = String(text || '').length;
                if (!length) return;
                record.response.contentCharacters += length;
                if (setFirstTiming(record, 'firstContentMs')) persist();
            },
            complete(usage = null) {
                if (finished) return;
                finished = true;
                record.status = 'completed';
                record.stage = 'completed';
                record.stageHistory.push({ stage: 'completed', elapsedMs: elapsed(record) });
                record.response.usage = usage ? clone(usage) : null;
                record.timings.completedMs = elapsed(record);
                persist();
            },
            fail(error) {
                if (finished) return;
                finished = true;
                const timedOut = /timed out/i.test(String(error?.message || ''));
                record.status = timedOut ? 'timed_out' : (error?.name === 'AbortError' ? 'cancelled' : 'failed');
                record.stage = record.status;
                record.stageHistory.push({ stage: record.status, elapsedMs: elapsed(record) });
                record.response.errorName = String(error?.name || 'Error');
                record.timings.completedMs = elapsed(record);
                persist();
            }
        };
    };

    globalThis.RPHRequestDiagnostics = Object.freeze({
        start,
        getLatest: () => records.length ? clone(records[records.length - 1]) : null,
        getAll: () => clone(records),
        clear: () => {
            records.splice(0, records.length);
            persist();
        },
        maxRecords: MAX_RECORDS
    });
})();
