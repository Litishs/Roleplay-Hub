// Shared model API transport for the Moyun novel workshop standalone page.
// Adapted from the STA1N upstream RP-Hub project (CC BY-NC 4.0):
//   - assets/js/api-utils.js (verbatim transport logic: buildApiEndpoint,
//     requestJson, requestChatCompletion with SSE stream parsing)
//   - assets/js/core-utils.js (only the helpers api-utils depends on:
//     native reasoning extraction + API error/usage payload extraction)
// Slimmed for the novel page: upstream loads three large UMD files, but the
// page consumes only this surface (verified 2026-09-07, see
// documents/墨韵造梦移植工程方案.md D9).
(function () {
    // --- helpers excerpted from upstream core-utils.js (RPHubUtils / RPHubCardUtils) ---
    const normalizeNativeReasoningPart = (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(normalizeNativeReasoningPart).join('');
        if (typeof value === 'object') {
            const keys = ['text', 'content', 'summary', 'reasoning', 'reasoning_content', 'thinking', 'thought', 'value'];
            for (const key of keys) {
                const text = normalizeNativeReasoningPart(value[key]);
                if (text) return text;
            }
            return '';
        }
        return String(value);
    };

    const isNativeReasoningPart = part => part?.thought === true
        || /reason|thinking|thought/i.test(String(part?.type || ''));

    const extractNativeReasoning = (source = {}) => {
        if (!source || typeof source !== 'object') return '';
        const directKeys = ['reasoning_content', 'reasoning', 'thinking', 'thinking_content', 'thought', 'thoughts', 'reasoning_text'];
        for (const key of directKeys) {
            const text = normalizeNativeReasoningPart(source[key]);
            if (text) return text;
        }
        if (Array.isArray(source.reasoning_details)) {
            const text = normalizeNativeReasoningPart(source.reasoning_details);
            if (text) return text;
        }
        if (Array.isArray(source.content)) {
            return source.content.filter(isNativeReasoningPart).map(normalizeNativeReasoningPart).join('');
        }
        return '';
    };

    const getApiUsagePayload = (data) => {
        if (data?.usage && typeof data.usage === 'object') return data.usage;
        if (data?.usageMetadata && typeof data.usageMetadata === 'object') return data.usageMetadata;
        return null;
    };

    const stringifyErrorDetail = (detail) => {
        if (detail === null || detail === undefined) return '';
        if (typeof detail === 'string') return detail;
        try {
            return JSON.stringify(detail, null, 2);
        } catch (_) {
            return String(detail);
        }
    };

    const getApiErrorStatus = (payload, fallbackStatus) => {
        const candidates = [
            payload?.status,
            payload?.statusCode,
            payload?.code,
            payload?.error?.status,
            payload?.error?.statusCode,
            payload?.error?.code,
            fallbackStatus
        ];
        return candidates.find(value => (
            value !== undefined && value !== null && value !== '' && /^\d+$/.test(String(value))
        )) || '';
    };

    const formatApiErrorMessage = (status, detail) => {
        const lines = [];
        if (status !== undefined && status !== null && status !== '') lines.push(`API Error: ${status}`);
        lines.push(stringifyErrorDetail(detail).trim() || '请求失败');
        return lines.join('\n');
    };

    const extractApiErrorMessage = (payload, fallbackStatus = '') => {
        if (!payload || typeof payload !== 'object') return '';
        const error = payload.error;
        const status = getApiErrorStatus(payload, fallbackStatus);
        if (typeof error === 'string') return formatApiErrorMessage(status, error);
        if (error && typeof error === 'object') {
            return formatApiErrorMessage(
                status,
                error.message || error.detail || payload.message || payload.detail || error
            );
        }
        const detail = payload.message || payload.detail;
        return detail ? formatApiErrorMessage(status, detail) : '';
    };

    // --- transport excerpted from upstream api-utils.js ---
    const buildApiEndpoint = (baseUrl, path) => {
        const root = String(baseUrl || '').replace(/\/+$/, '');
        const apiRoot = /\/v1$/i.test(root) ? root : `${root}/v1`;
        return `${apiRoot}/${String(path || '').replace(/^\/+/, '')}`;
    };

    const parsePayload = (text, status) => {
        const data = JSON.parse(text);
        const error = extractApiErrorMessage(data, status);
        if (error) throw new Error(error);
        return data;
    };
    const readTextContent = value => Array.isArray(value)
        ? value.filter(part => !isNativeReasoningPart(part)).map(part => part?.text || part?.content || '').join('')
        : String(value || '');

    // 超时按“多久没有响应”计算，持续输出的长回复不会因总时长被中断。
    const withApiResponse = async (options, read) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        let timer;
        let timedOut = false;
        const touch = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 120000);
        };
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener('abort', abort, { once: true });
        touch();
        try {
            const response = await fetch(options.url, {
                method: options.body === undefined ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
                signal: controller.signal
            });
            touch();
            if (!response.ok) {
                const text = await response.text();
                let payload;
                try { payload = JSON.parse(text); } catch (_) { }
                throw new Error(extractApiErrorMessage(payload, response.status) || formatApiErrorMessage(response.status, text));
            }
            return await read(response, touch);
        } catch (error) {
            if (timedOut && !options.signal?.aborted) {
                const timeout = new Error('API 响应超时，请稍后重试');
                timeout.name = 'TimeoutError';
                throw timeout;
            }
            throw error;
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
        }
    };

    const requestJson = options => withApiResponse(options, async response => parsePayload(await response.text(), response.status));

    const requestChatCompletion = async (options) => {
        const startedAt = Date.now();
        const result = { content: '', reasoning: '', usage: null, finishReason: null, isStream: false };
        let receivedPayload = false;
        let pendingContent = '';
        let pendingReasoning = '';
        const accept = data => {
            receivedPayload = true;
            result.usage = getApiUsagePayload(data) || result.usage;
            const choice = data.choices?.[0] || {};
            const message = choice.delta || choice.message || {};
            const content = readTextContent(message.content ?? choice.text);
            const reasoning = extractNativeReasoning(message) || extractNativeReasoning(choice) || '';
            result.content += content;
            result.reasoning += reasoning;
            result.finishReason = choice.finish_reason ?? result.finishReason;
            pendingContent += content;
            pendingReasoning += reasoning;
        };
        try {
            return await withApiResponse({ ...options, body: {
                model: options.model, messages: options.messages, temperature: options.temperature,
                ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
                stream: !!options.stream,
                ...(options.stream ? { stream_options: { include_usage: true } } : {})
            } }, async (response, touch) => {
                const eventStream = response.headers.get('content-type')?.includes('text/event-stream');
                let rawText;
                if (!eventStream) {
                    rawText = await response.text();
                    if (!/^\s*(?:data:|:)/.test(rawText)) {
                        accept(parsePayload(rawText, response.status));
                        return result;
                    }
                }
                result.isStream = !!options.stream;
                let buffer = '';
                let eventLines = [];
                let done = false;
                let flushPromise = Promise.resolve();
                const flush = () => {
                    if (!result.isStream || (!pendingContent && !pendingReasoning)) return;
                    const delta = { content: pendingContent, reasoning: pendingReasoning };
                    pendingContent = pendingReasoning = '';
                    flushPromise = flushPromise.then(() => options.onDelta?.(delta));
                    // 立即挂上处理器，最终仍由 await 抛出回调错误。
                    flushPromise.catch(() => {});
                };
                const dispatch = () => {
                    if (!eventLines.length) return;
                    const payload = eventLines.join('\n');
                    eventLines = [];
                    if (payload.trim() === '[DONE]') { done = true; return; }
                    if (payload.trim()) accept(parsePayload(payload, response.status));
                };
                const readLine = line => {
                    if (done) return;
                    if (!line.trim()) dispatch();
                    else if (line.startsWith('data:')) {
                        // 部分兼容接口省略事件间空行，但多行 JSON 仍需等它完整。
                        let complete = eventLines.join('\n').trim() === '[DONE]';
                        try { JSON.parse(eventLines.join('\n')); complete = true; } catch (_) { }
                        if (complete) dispatch();
                        if (!done) eventLines.push(line.slice(5).replace(/^ /, ''));
                    }
                };
                const feed = text => {
                    buffer += text;
                    const lines = buffer.split(/\r\n|\n|\r(?!$)/);
                    buffer = lines.pop();
                    lines.forEach(readLine);
                };
                const reader = rawText === undefined ? response.body.getReader() : null;
                const decoder = new TextDecoder();
                const interval = setInterval(flush, 60);
                try {
                    if (reader) {
                        while (!done) {
                            const chunk = await reader.read();
                            touch();
                            if (chunk.done) break;
                            feed(decoder.decode(chunk.value, { stream: true }));
                        }
                        feed(decoder.decode());
                    } else feed(rawText);
                    // 兼容缺失最后换行的完整 JSON；损坏 JSON 必须报错，不能伪装成功。
                    if (!done) { readLine(buffer.replace(/\r$/, '')); dispatch(); }
                    if (!receivedPayload) throw new Error('API 未返回有效的模型响应');
                    return result;
                } finally {
                    clearInterval(interval);
                    if (reader) {
                        try { await reader.cancel(); } catch (_) { }
                        reader.releaseLock();
                    }
                    flush();
                    await flushPromise;
                }
            });
        } finally {
            // 在业务层 JSON/模板校验之前记账；部分流式响应后中止也不会漏掉已返回的用量。
            if (receivedPayload) options.onUsage?.(result.usage, {
                isStream: result.isStream, durationMs: Date.now() - startedAt,
                outputCharacters: result.content.length + result.reasoning.length
            });
        }
    };

    window.RPHubApiUtils = Object.freeze({ buildApiEndpoint });
    window.RPHubApiClient = Object.freeze({ requestChatCompletion, requestJson });
})();
