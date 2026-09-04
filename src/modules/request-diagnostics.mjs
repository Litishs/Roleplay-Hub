
// Activity Journal — universal behaviour/activity diagnostics.
//
// Previously `RPHRequestDiagnostics` only captured a single HTTP request
// snapshot.  It now stores a flat ring buffer of generic *activity records*
// where every behaviour (chat generation, memory recall, tool call, UI
// template analysis, TTS, update check, …) is written through the same
// unified interface.  The old request-oriented API is preserved as a thin
// compatibility layer so existing call sites keep working.
//
// Hard privacy rule (AGENTS.md §2.4): NO plaintext prompt / response /
// reasoning is ever persisted.  Only character counts, SHA-256 hashes and
// short caller-supplied summaries (≤ SUMMARY_MAX_LENGTH characters) are
// allowed.

const NEW_STORAGE_KEY = 'rph_activity_journal_v1';
const LEGACY_STORAGE_KEY = 'rph_request_diagnostics_v1';
const MAX_RECORDS = 30;
const SUMMARY_MAX_LENGTH = 80;
const RECORD_JSON_SIZE_HARD_LIMIT = 8 * 1024; // 8 KiB per record safety net
const SCHEMA_VERSION = 1;

const records = [];
const clocks = new WeakMap();
const fingerprintVersions = new WeakMap();
// Guard a freshly created activity record against the async fingerprint
// Promise chain writing back after the record has been dropped (ring-buffer
// rollover).  Without this, a recycled WeakMap key could receive stale
// writes hours later if the record reference was kept alive elsewhere.
const liveRecordTokens = new WeakSet();

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
const truncateSummary = (text) => {
    const str = String(text || '');
    return str.length > SUMMARY_MAX_LENGTH ? str.slice(0, SUMMARY_MAX_LENGTH) + '…' : str;
};
const storageGet = (key) => {
    try { return globalThis.localStorage?.getItem?.(key) ?? null; }
    catch (_) { return null; }
};
const storageRemove = (key) => {
    try { globalThis.localStorage?.removeItem?.(key); }
    catch (_) { /* no-op */ }
};
const storageRemoveSession = (key) => {
    try { globalThis.sessionStorage?.removeItem?.(key); }
    catch (_) { /* no-op */ }
};

// Persistence with QuotaExceededError defence: if the full buffer won't fit,
// drop the oldest half and retry until either it fits or only one record
// remains.  The silent-failure contract of the journal means we never throw
// back into caller code.
let persistCooldownTimer = null;
let persistScheduled = false;
const persistImmediate = () => {
    let attemptRecords = records.slice();
    while (attemptRecords.length > 0) {
        try {
            globalThis.localStorage?.setItem(NEW_STORAGE_KEY, JSON.stringify(attemptRecords));
            return true;
        } catch (error) {
            const isQuota = error && (
                /quota|exceed|space|full|storage/i.test(String(error?.name || ''))
                || /quota|exceed|space|full|storage/i.test(String(error?.message || ''))
            );
            if (!isQuota) {
                console.warn('[ActivityJournal] persist failed:', error?.name || error);
                return false;
            }
            if (attemptRecords.length <= 1) {
                console.warn('[ActivityJournal] persist quota exhausted even with 1 record');
                return false;
            }
            // Drop oldest half (at least 1) and try again.
            const dropCount = Math.max(1, Math.floor(attemptRecords.length / 2));
            attemptRecords = attemptRecords.slice(dropCount);
        }
    }
    return false;
};
const persist = () => {
    // Debounced persist: callers invoke persist() many times during a
    // streaming chat; we only need the final state on disk.  A 40 ms window
    // coalesces the burst while keeping the saved state near real-time.
    if (persistScheduled) return;
    persistScheduled = true;
    const flush = () => {
        persistScheduled = false;
        persistCooldownTimer = null;
        persistImmediate();
    };
    if (typeof globalThis.setTimeout === 'function') {
        persistCooldownTimer = setTimeout(flush, 40);
    } else {
        flush();
    }
};

const sha256 = async (value) => {
    if (!globalThis.crypto?.subtle) return null;
    try {
        const bytes = new TextEncoder().encode(String(value || ''));
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return null;
    }
};

// ---- Helpers reused by old `start()` compat layer ------------------------------------

const setFirstTiming = (record, key) => {
    if (record?.compat?.timings && record.compat.timings[key] === null) {
        record.compat.timings[key] = elapsed(record);
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

const classifyResultByError = (error) => {
    const msg = String(error?.message || '');
    if (/timed out/i.test(msg)) return 'timed_out';
    if (error?.name === 'AbortError') return 'cancelled';
    return 'failed';
};

// Privacy hardening (P0-#1): scope is the ONLY bucket where a caller could
// accidentally dump UI strings (character display names, user nicknames,
// arbitrary free text) into the journal.  We therefore:
//   1. Allow only a short, well-understood whitelist of identifier-style
//      keys (UUIDs, opaque ids, positive integers).
//   2. For any permitted value we still clamp string length to 64 chars
//      (UUID is 36, chat scope ids are ~36, message ids ~36) and strip
//      non-identifier characters conservatively for string ids.
//   3. Reject (drop silently) any other key.
//
// This whitelist is intentionally tiny.  If a new caller legitimately
// needs another identifier added, update this list + the contract tests.
const SCOPE_ALLOWED_KEYS = Object.freeze(new Set([
    'characterId',
    'chatScopeId',
    'assistantMessageId',
    'activeToolDepth'
]));
const clampScopeId = (value, key) => {
    if (key === 'activeToolDepth') {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && n <= 1024 ? Math.floor(n) : 0;
    }
    if (value === null || value === undefined) return '';
    // Preserve UUID-like dashes and message id dashes/hex chars only.
    const str = String(value);
    const maxLen = 64;
    const clipped = str.length > maxLen ? str.slice(0, maxLen) : str;
    // Allow [A-Za-z0-9_-] and a single non-contiguous hyphen/underscore dot
    // pattern.  This is intentionally strict: any CJK char / emoji / space
    // simply gets removed.  Character names therefore become "", which is the
    // desired outcome.  For legitimate uuids/ids like
    // "8df1dfa5-2445-48d8-a945-c3234eb21451" nothing is stripped.
    const safe = clipped.replace(/[^A-Za-z0-9_\-]/g, '');
    return safe;
};
const sanitizeScope = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const key of Object.keys(raw)) {
        if (!SCOPE_ALLOWED_KEYS.has(key)) continue;
        const v = clampScopeId(raw[key], key);
        // activeToolDepth: 0 is a real value (no tool call yet) so keep it;
        // strings: keep "" explicitly (consistent with old contract).
        out[key] = v;
    }
    return out;
};

// ---- Activity record factory --------------------------------------------------------

// Local wall-clock timestamp (no timezone offset, no "T"), e.g.
// "2026-09-04 20:58:48".  This keeps export timestamps in the same (local)
// convention as the export filename, so a reader is never confused into
// reading a UTC "12:58" as midday.
const formatLocalTimestamp = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const createActivityRecord = ({ category, action, scope }) => {
    const record = {
        schemaVersion: SCHEMA_VERSION,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: String(category || 'general'),
        action: String(action || 'unknown'),
        startedAt: formatLocalTimestamp(),
        durationMs: null,
        result: 'pending',
        scope: sanitizeScope(scope),
        inputs: [],
        behaviors: [],
        outputs: {
            // Generic totals (all categories):
            contentChars: 0,
            reasoningChars: 0,
            totalChars: 0,
            hash: null,
            // Chat-specific streaming-vs-final comparison:
            streamContentChars: 0,
            streamReasoningChars: 0,
            finalContentChars: null,
            finalReasoningChars: null,
            postprocessSteps: []
        },
        error: null,
        stages: [{ stage: 'started', elapsedMs: 0 }],
        // Compatibility section: only populated when the caller goes through
        // the legacy `start()` handle.  Existing tests read fields like
        // `request`, `response`, `timings`, `provider`, `stageHistory` etc.
        compat: null
    };
    clocks.set(record, now());
    liveRecordTokens.add(record);
    return record;
};

const pushRecord = (record) => {
    records.push(record);
    if (records.length > MAX_RECORDS) {
        const dropped = records.splice(0, records.length - MAX_RECORDS);
        dropped.forEach(r => liveRecordTokens.delete(r));
    }
};

// ---- Unified handle (returned by `begin()`) -----------------------------------------

const makeHandle = (record) => {
    let finished = false;

    const markLive = () => liveRecordTokens.has(record);

    const handle = {
        input({ kind, chars, hash, summary } = {}) {
            try {
                if (!markLive() || finished) return;
                const entry = {
                    kind: String(kind || 'unknown'),
                    chars: Math.max(0, Number(chars) || 0),
                    hash: typeof hash === 'string' ? hash : null
                };
                if (summary !== undefined && summary !== null && summary !== '') {
                    entry.summary = truncateSummary(summary);
                }
                record.inputs.push(entry);
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] input() failed:', e?.message || e);
            }
        },

        behavior({ name, meta, result, chars, hash, summary } = {}) {
            try {
                // NOTE: behaviors may legitimately arrive *after* complete()
                // (e.g. tool-continuation / TTS / memory extraction that the
                // chat pipeline queues post-stream).  Only check liveness; the
                // finished flag must not drop post-hoc behaviour spans.
                if (!markLive()) return;
                const entry = {
                    name: String(name || 'unnamed'),
                    result: ['ok', 'failed', 'cancelled', 'timed_out', 'skipped'].includes(result) ? result : 'ok'
                };
                if (meta && typeof meta === 'object' && !Array.isArray(meta)) entry.meta = clone(meta);
                if (chars !== undefined && chars !== null) entry.chars = Math.max(0, Number(chars) || 0);
                if (typeof hash === 'string') entry.hash = hash;
                if (summary !== undefined && summary !== null && summary !== '') {
                    entry.summary = truncateSummary(summary);
                }
                entry.atMs = elapsed(record);
                record.behaviors.push(entry);
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] behavior() failed:', e?.message || e);
            }
        },

        output({ contentChars, reasoningChars, totalChars, hash, streamContentChars, streamReasoningChars, finalContentChars, finalReasoningChars, postprocessStep } = {}) {
            try {
                // Like behavior(), output updates can arrive after complete()
                // when the pipeline reports final counts after a tool- or
                // post-process step.
                if (!markLive()) return;
                const out = record.outputs;
                if (contentChars !== undefined && contentChars !== null) {
                    out.contentChars = Math.max(0, Number(contentChars) || 0);
                }
                if (reasoningChars !== undefined && reasoningChars !== null) {
                    out.reasoningChars = Math.max(0, Number(reasoningChars) || 0);
                }
                if (totalChars !== undefined && totalChars !== null) {
                    out.totalChars = Math.max(0, Number(totalChars) || 0);
                } else {
                    out.totalChars = out.contentChars + out.reasoningChars;
                }
                if (typeof hash === 'string') out.hash = hash;
                if (streamContentChars !== undefined && streamContentChars !== null) {
                    out.streamContentChars = Math.max(0, Number(streamContentChars) || 0);
                }
                if (streamReasoningChars !== undefined && streamReasoningChars !== null) {
                    out.streamReasoningChars = Math.max(0, Number(streamReasoningChars) || 0);
                }
                if (finalContentChars !== undefined && finalContentChars !== null) {
                    out.finalContentChars = Math.max(0, Number(finalContentChars) || 0);
                }
                if (finalReasoningChars !== undefined && finalReasoningChars !== null) {
                    out.finalReasoningChars = Math.max(0, Number(finalReasoningChars) || 0);
                }
                if (postprocessStep && typeof postprocessStep === 'object') {
                    const step = {
                        name: String(postprocessStep.name || 'unnamed'),
                        beforeChars: Math.max(0, Number(postprocessStep.beforeChars) || 0),
                        afterChars: Math.max(0, Number(postprocessStep.afterChars) || 0),
                        atMs: elapsed(record)
                    };
                    if (typeof postprocessStep.hash === 'string') step.hash = postprocessStep.hash;
                    out.postprocessSteps.push(step);
                }
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] output() failed:', e?.message || e);
            }
        },

        stage(name) {
            try {
                if (!markLive()) return;
                const stage = String(name || '').trim();
                if (!stage) return;
                // Compat: mirror stages into `compat.stageHistory` so legacy
                // consumers that read `record.stageHistory` still see updates
                // even when the caller uses the new stage() API.
                record.stages.push({ stage, elapsedMs: elapsed(record) });
                if (record.stages.length > 40) record.stages.splice(1, record.stages.length - 40);
                if (record.compat) {
                    record.compat.stage = stage;
                    record.compat.stageHistory.push({ stage, elapsedMs: elapsed(record) });
                    if (record.compat.stageHistory.length > 40) record.compat.stageHistory.splice(1, record.compat.stageHistory.length - 40);
                }
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] stage() failed:', e?.message || e);
            }
        },

        complete() {
            try {
                if (!markLive() || finished) return;
                finished = true;
                record.result = 'ok';
                record.durationMs = elapsed(record);
                record.stages.push({ stage: 'completed', elapsedMs: record.durationMs });
                if (record.compat) {
                    record.compat.status = 'completed';
                    record.compat.stage = 'completed';
                    record.compat.stageHistory.push({ stage: 'completed', elapsedMs: record.durationMs });
                    record.compat.timings.completedMs = record.durationMs;
                }
                // If finalContentChars/finalReasoningChars were never set but
                // contentChars/reasoningChars are, default them so the
                // stream-vs-final comparison has both sides present.
                if (record.outputs.finalContentChars === null && record.outputs.contentChars > 0) {
                    record.outputs.finalContentChars = record.outputs.contentChars;
                }
                if (record.outputs.finalReasoningChars === null && record.outputs.reasoningChars > 0) {
                    record.outputs.finalReasoningChars = record.outputs.reasoningChars;
                }
                if (record.outputs.totalChars === 0) {
                    record.outputs.totalChars = record.outputs.contentChars + record.outputs.reasoningChars;
                }
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] complete() failed:', e?.message || e);
            }
        },

        fail(error) {
            try {
                if (!markLive() || finished) return;
                finished = true;
                record.result = classifyResultByError(error);
                record.durationMs = elapsed(record);
                record.stages.push({ stage: record.result, elapsedMs: record.durationMs });
                record.error = {
                    stage: record.compat?.stage || record.stages[record.stages.length - 2]?.stage || 'unknown',
                    message: truncateSummary(error?.message || error?.name || 'Error')
                };
                if (record.compat) {
                    record.compat.status = record.result;
                    record.compat.stage = record.result;
                    record.compat.stageHistory.push({ stage: record.result, elapsedMs: record.durationMs });
                    record.compat.response.errorName = String(error?.name || 'Error');
                    record.compat.timings.completedMs = record.durationMs;
                }
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] fail() failed:', e?.message || e);
            }
        },

        // Compatibility passthroughs — kept so legacy composables that call
        // `tracker.request(...)`, `tracker.responseHeaders(...)` etc. keep
        // working without modification.
        request(nextPayload, nextPromptBuildMs = null) {
            try {
                if (!markLive() || !record.compat) return;
                updateCompatRequest(record, nextPayload, nextPromptBuildMs);
            } catch (e) {
                console.warn('[ActivityJournal] compat request() failed:', e?.message || e);
            }
        },
        responseHeaders(status, contentType = '') {
            try {
                if (!markLive() || !record.compat) return;
                record.compat.response.httpStatus = Number(status) || null;
                record.compat.response.contentType = String(contentType || '').split(';')[0];
                setFirstTiming(record, 'responseHeadersMs');
                persist();
            } catch (e) {
                console.warn('[ActivityJournal] compat responseHeaders() failed:', e?.message || e);
            }
        },
        networkChunk(byteLength = 0) {
            try {
                if (!markLive() || !record.compat) return;
                record.compat.response.networkBytes += Math.max(0, Number(byteLength) || 0);
                if (setFirstTiming(record, 'firstNetworkChunkMs')) persist();
                else persist();
            } catch (e) {
                console.warn('[ActivityJournal] compat networkChunk() failed:', e?.message || e);
            }
        },
        reasoning(text) {
            try {
                const length = String(text || '').length;
                if (!markLive()) return;
                if (length > 0) {
                    if (record.compat) {
                        record.compat.response.reasoningCharacters += length;
                        setFirstTiming(record, 'firstReasoningMs');
                    }
                    // Mirror into unified outputs as streaming totals.
                    record.outputs.streamReasoningChars += length;
                    record.outputs.reasoningChars = record.outputs.streamReasoningChars;
                    record.outputs.totalChars = record.outputs.contentChars + record.outputs.reasoningChars;
                    persist();
                }
            } catch (e) {
                console.warn('[ActivityJournal] compat reasoning() failed:', e?.message || e);
            }
        },
        content(text) {
            try {
                const length = String(text || '').length;
                if (!markLive()) return;
                if (length > 0) {
                    if (record.compat) {
                        record.compat.response.contentCharacters += length;
                        setFirstTiming(record, 'firstContentMs');
                    }
                    record.outputs.streamContentChars += length;
                    record.outputs.contentChars = record.outputs.streamContentChars;
                    record.outputs.totalChars = record.outputs.contentChars + record.outputs.reasoningChars;
                    persist();
                }
            } catch (e) {
                console.warn('[ActivityJournal] compat content() failed:', e?.message || e);
            }
        }
    };

    return handle;
};

// ---- Compat: legacy `start()` handle -------------------------------------------------

const updateCompatRequest = (record, payload, promptBuildMs = null) => {
    if (!record.compat) return;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const version = (fingerprintVersions.get(record) || 0) + 1;
    fingerprintVersions.set(record, version);
    record.compat.request = createRequestSnapshot(payload, promptBuildMs);
    if (record.compat.timings.promptBuildMs === null && record.compat.request.promptBuildMs !== null) {
        record.compat.timings.promptBuildMs = record.compat.request.promptBuildMs;
    }
    persist();

    Promise.all([
        sha256(JSON.stringify(payload || {})),
        ...messages.map(message => sha256(String(message?.content || '')))
    ]).then(([payloadHash, ...messageHashes]) => {
        if (fingerprintVersions.get(record) !== version) return;
        if (!liveRecordTokens.has(record)) return;
        if (!record.compat) return;
        record.compat.request.payloadSha256 = payloadHash;
        record.compat.request.messages.forEach((message, index) => {
            message.sha256 = messageHashes[index] || null;
        });
        record.compat.request.fingerprintReady = true;
        persist();
    }).catch(() => {
        if (fingerprintVersions.get(record) !== version) return;
        if (!liveRecordTokens.has(record) || !record.compat) return;
        record.compat.request.fingerprintReady = true;
        persist();
    });
};

const buildCompatShell = (options) => {
    const opts = options || {};
    const payload = opts?.payload && typeof opts.payload === 'object' ? opts.payload : {};
    const url = opts.url;
    const promptBuildMs = opts.promptBuildMs ?? null;
    const requestType = opts.requestType || 'chat';
    // Privacy note: providerId / apiUrl are short enum strings and endpoint
    // URLs, never secrets.  hasApiKey is a tri-state bool/trilean (null when
    // the caller could not determine key presence).  These three fields are
    // passed either at the top-level `options` object (the documented
    // interface) OR, for historical reasons, nested inside the `payload`
    // object.  Real-device export from 2026-09-04 showed payload-nested
    // values were silently dropped because buildCompatShell only read the
    // top level — resulting in provider: { id: "", apiUrl: "", hasApiKey:
    // null } which made provider-level debugging impossible.  Accept both.
    const providerId = opts.providerId || payload.providerId || '';
    const providerApiUrl = opts.providerApiUrl || payload.providerApiUrl || '';
    const hasApiKeyRaw = opts.hasApiKey !== undefined && opts.hasApiKey !== null
        ? opts.hasApiKey
        : (payload.hasApiKey !== undefined && payload.hasApiKey !== null
            ? payload.hasApiKey
            : null);
    const hasApiKey = hasApiKeyRaw === null ? null : !!hasApiKeyRaw;

    return {
        status: 'pending',
        stage: 'preparing',
        stageHistory: [{ stage: 'preparing', elapsedMs: 0 }],
        requestType,
        endpoint: endpointLabel(url),
        provider: {
            id: String(providerId || ''),
            apiUrl: String(providerApiUrl || ''),
            hasApiKey
        },
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
};

// ---- Public API ---------------------------------------------------------------------

// Begin a generic activity record and return a handle with the unified
// `input / behavior / output / stage / complete / fail` interface.
const begin = (options = {}) => {
    try {
        const record = createActivityRecord({
            category: options?.category,
            action: options?.action,
            scope: options?.scope
        });
        pushRecord(record);
        persist();
        return makeHandle(record);
    } catch (e) {
        console.warn('[ActivityJournal] begin() failed:', e?.message || e);
        // Never return undefined/null to callers that chain `handle?.xxx()`.
        return {
            input() { /* no-op */ },
            behavior() { /* no-op */ },
            output() { /* no-op */ },
            stage() { /* no-op */ },
            complete() { /* no-op */ },
            fail() { /* no-op */ },
            request() { /* no-op */ },
            responseHeaders() { /* no-op */ },
            networkChunk() { /* no-op */ },
            reasoning() { /* no-op */ },
            content() { /* no-op */ }
        };
    }
};

// Legacy entry point: internally builds a `chat/<requestType>` activity and
// decorates it with the request-oriented compat shell.  Returned handle
// exposes every old method (request/stage/responseHeaders/networkChunk/
// reasoning/content/complete/fail) mapped onto the unified record.
const start = (options = {}) => {
    try {
        const requestType = String(options?.requestType || 'chat');
        const scope = options?.scope && typeof options.scope === 'object'
            ? options.scope
            : (options?.characterId || options?.chatScopeId
                ? { characterId: options.characterId, chatScopeId: options.chatScopeId }
                : {});
        const record = createActivityRecord({
            category: 'chat',
            action: requestType === 'tool_continuation' ? 'tool_continuation' : 'generate',
            scope
        });
        record.compat = buildCompatShell(options);
        pushRecord(record);
        updateCompatRequest(record, options?.payload, options?.promptBuildMs ?? null);
        persist();
        const handle = makeHandle(record);

        // Legacy compat extras not present on the new-style handle:
        //  - handle.complete() accepts an optional `usage` payload.
        const originalComplete = handle.complete.bind(handle);
        handle.complete = function wrappedComplete(usage = null) {
            if (record.compat) {
                record.compat.response.usage = usage ? clone(usage) : null;
            }
            originalComplete();
        };
        return handle;
    } catch (e) {
        console.warn('[ActivityJournal] start() failed:', e?.message || e);
        return {
            request() { /* no-op */ },
            stage() { /* no-op */ },
            responseHeaders() { /* no-op */ },
            networkChunk() { /* no-op */ },
            reasoning() { /* no-op */ },
            content() { /* no-op */ },
            complete() { /* no-op */ },
            fail() { /* no-op */ },
            input() { /* no-op */ },
            behavior() { /* no-op */ },
            output() { /* no-op */ }
        };
    }
};

// Public shape returned by `getAll / getLatest`: we project legacy flat
// fields (request / response / timings / provider / endpoint / stageHistory /
// requestType / status / stage) onto the top level so callers that read
// e.g. `record.response.contentCharacters` continue to work, while the new
// activity structure (category / action / scope / inputs / behaviors /
// outputs / stages / result / error) lives alongside them.
const projectForExport = (record) => {
    if (!record) return null;
    const base = clone(record);
    const compat = base.compat;
    delete base.compat;
    if (!compat) return base;
    return Object.assign(base, {
        requestType: compat.requestType,
        endpoint: compat.endpoint,
        provider: compat.provider,
        request: compat.request,
        response: compat.response,
        timings: compat.timings,
        status: compat.status,
        stage: compat.stage,
        stageHistory: compat.stageHistory
    });
};

// Build an export envelope suitable for the settings-page "export diagnostics
// log" button.  Caller supplies appVersion/buildType; we add ISO timestamp
// and the projected records array.
const buildExportPayload = ({ appVersion = '', buildType = 'web' } = {}) => ({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: formatLocalTimestamp(),
    appVersion: String(appVersion || ''),
    buildType: String(buildType || 'web'),
    recordCount: records.length,
    records: records.map(projectForExport)
});

// ---- Bootstrap: load persisted ring buffer + migrate legacy data --------------------

const migrateLegacySnapshot = (legacy) => {
    try {
        if (!legacy || typeof legacy !== 'object') return null;
        const record = createActivityRecord({
            category: 'chat',
            action: legacy.requestType === 'tool_continuation' ? 'tool_continuation' : 'generate',
            scope: {}
        });
        record.id = legacy.id || record.id;
        record.startedAt = legacy.startedAt || record.startedAt;
        record.durationMs = Number.isFinite(Number(legacy.timings?.completedMs)) ? Math.max(0, Number(legacy.timings.completedMs)) : null;
        const statusMap = { completed: 'ok', failed: 'failed', cancelled: 'cancelled', timed_out: 'timed_out', pending: 'pending' };
        record.result = statusMap[String(legacy.status || 'pending')] || 'pending';
        record.outputs.streamContentChars = Math.max(0, Number(legacy.response?.contentCharacters) || 0);
        record.outputs.streamReasoningChars = Math.max(0, Number(legacy.response?.reasoningCharacters) || 0);
        record.outputs.contentChars = record.outputs.streamContentChars;
        record.outputs.reasoningChars = record.outputs.streamReasoningChars;
        record.outputs.totalChars = record.outputs.contentChars + record.outputs.reasoningChars;
        if (legacy.request?.messageCount > 0) {
            record.inputs.push({
                kind: 'chat_messages',
                chars: Math.max(0, Number(legacy.request.totalCharacters) || 0),
                hash: typeof legacy.request.payloadSha256 === 'string' ? legacy.request.payloadSha256 : null
            });
        }
        record.stages = Array.isArray(legacy.stageHistory) ? clone(legacy.stageHistory) : record.stages;
        if (legacy.response?.errorName || record.result === 'failed' || record.result === 'timed_out' || record.result === 'cancelled') {
            record.error = {
                stage: legacy.stage || 'unknown',
                message: truncateSummary(legacy.response?.errorName || record.result)
            };
        }
        record.compat = {
            requestType: legacy.requestType || 'chat',
            endpoint: legacy.endpoint || '',
            provider: legacy.provider || { id: '', apiUrl: '', hasApiKey: null },
            request: legacy.request || createRequestSnapshot({}, null),
            response: legacy.response || {
                httpStatus: null, contentType: '', networkBytes: 0,
                reasoningCharacters: 0, contentCharacters: 0, usage: null, errorName: ''
            },
            timings: legacy.timings || {
                promptBuildMs: null, responseHeadersMs: null, firstNetworkChunkMs: null,
                firstReasoningMs: null, firstContentMs: null, completedMs: null
            },
            status: legacy.status || 'pending',
            stage: legacy.stage || 'preparing',
            stageHistory: Array.isArray(legacy.stageHistory) ? clone(legacy.stageHistory) : record.stages
        };
        return record;
    } catch (_) {
        return null;
    }
};

const loadPersistedRecords = () => {
    // 1) Try new localStorage key first.
    try {
        const raw = storageGet(NEW_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const hydrated = [];
                for (const item of parsed) {
                    if (!item || typeof item !== 'object') continue;
                    const rec = {
                        schemaVersion: Number.isFinite(Number(item.schemaVersion)) ? item.schemaVersion : SCHEMA_VERSION,
                        id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                        category: String(item.category || 'general'),
                        action: String(item.action || 'unknown'),
                        startedAt: String(item.startedAt || formatLocalTimestamp(new Date(0))),
                        durationMs: Number.isFinite(Number(item.durationMs)) ? item.durationMs : null,
                        result: ['ok', 'failed', 'cancelled', 'timed_out', 'skipped', 'pending'].includes(item.result) ? item.result : 'pending',
                        scope: item.scope && typeof item.scope === 'object' ? item.scope : {},
                        inputs: Array.isArray(item.inputs) ? item.inputs : [],
                        behaviors: Array.isArray(item.behaviors) ? item.behaviors : [],
                        outputs: Object.assign({
                            contentChars: 0, reasoningChars: 0, totalChars: 0, hash: null,
                            streamContentChars: 0, streamReasoningChars: 0,
                            finalContentChars: null, finalReasoningChars: null, postprocessSteps: []
                        }, item.outputs || {}),
                        error: item.error && typeof item.error === 'object' ? item.error : null,
                        stages: Array.isArray(item.stages) ? item.stages : [{ stage: 'started', elapsedMs: 0 }],
                        compat: item.compat && typeof item.compat === 'object' ? item.compat : null
                    };
                    liveRecordTokens.add(rec);
                    clocks.set(rec, now()); // elapsed() won't be meaningful for loaded
                                            // records but avoids undefined guard noise.
                    hydrated.push(rec);
                }
                return hydrated.slice(-MAX_RECORDS);
            }
        }
    } catch (_) { /* fall through */ }

    // 2) Migrate legacy sessionStorage snapshots to the new format.
    try {
        const legacyRaw = globalThis.sessionStorage?.getItem?.(LEGACY_STORAGE_KEY) || null;
        if (legacyRaw) {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed)) {
                const migrated = [];
                for (const item of parsed) {
                    const r = migrateLegacySnapshot(item);
                    if (r) migrated.push(r);
                }
                // One-shot: drop the legacy bucket now that we have it converted.
                storageRemoveSession(LEGACY_STORAGE_KEY);
                return migrated.slice(-MAX_RECORDS);
            }
        }
    } catch (_) { /* fall through */ }

    return [];
};

const bootstrappedRecords = loadPersistedRecords();
records.splice(0, records.length, ...bootstrappedRecords);
// Migrated legacy records or newly rehydrated records from localStorage are
// already in the correct state; the migration path however produced records
// in-memory without going through `persist()`.  Fire one synchronous persist
// now so that (a) migrated data ends up in the new localStorage bucket and
// (b) subsequent debounced calls see an already-populated key.
if (bootstrappedRecords.length > 0) {
    try { persistImmediate(); } catch (_) { /* no-op */ }
}

const RPHRequestDiagnostics = Object.freeze({
    // New unified API
    begin,
    // Legacy request-oriented API (preserved on contract)
    start,
    getLatest: () => records.length ? projectForExport(records[records.length - 1]) : null,
    getAll: () => records.map(projectForExport),
    clear: () => {
        records.forEach(r => liveRecordTokens.delete(r));
        records.splice(0, records.length);
        persist();
    },
    maxRecords: MAX_RECORDS,
    storageKey: NEW_STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    buildExportPayload
});

if (typeof window !== 'undefined') window.RPHRequestDiagnostics = RPHRequestDiagnostics;
if (typeof globalThis !== 'undefined') globalThis.RPHRequestDiagnostics = RPHRequestDiagnostics;

export { RPHRequestDiagnostics };
