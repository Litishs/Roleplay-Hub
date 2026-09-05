const generateUUID = () => {
                    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                };

const parseCotCache = new Map();
const parseCot = (text) => {
    if (!text) return { cot: '', main: '', sys: '', isFinished: false };
    if (parseCotCache.has(text)) return parseCotCache.get(text);

    // 匹配 <think> 或 <cot> 标签，支持未闭合的情况
    // 优化正则：允许闭合标签中存在空格，防止因闭合标签格式不规范（如 </think >）导致正文被吞
    // 同时支持闭合标签缺失斜杠的情况（如 <cot>...<cot>），这是某些模型常见的错误输出
    const cotPattern = /<(think|cot)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
    let cotContent = '';
    let mainContent = text;
    let isFinished = false;

    // 提取 CoT 内容并从正文中移除
    mainContent = mainContent.replace(cotPattern, (match, tag, content) => {
        // 对 CoT 的内容中的 < 符号进行转义，防止 DOMPurify 吞掉类似 <动作> 或 <thinking> 的标签
        // 通过跳过 ``` 和 ` 块，保证代码块的正常显示和复制功能
        const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);
        let escapedContent = parts.map((part, i) => {
            if (i % 2 === 1) return part; // 保留代码块原样
            return part.replace(/</g, "&lt;"); // 仅转义左括号，不影响 Markdown 的 > 引用块语法
        }).join('');

        cotContent += escapedContent;
        // 如果匹配项包含闭合标签，则认为思维链已结束
        if (match.includes('</') || (match.match(new RegExp('<' + tag + '>', 'gi')) || []).length > 1) {
            isFinished = true;
        }
        return '';
    });

    let sys = '';
    const sysMatch = mainContent.match(/\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/);
    if (sysMatch) {
        sys = sysMatch[1];
        mainContent = mainContent.slice(0, sysMatch.index).trim();
    }

    const result = { cot: cotContent.trim(), main: mainContent.trim(), sys: sys, isFinished };
    parseCotCache.set(text, result);
    // Limit cache size to prevent memory leaks in extremely long sessions
    if (parseCotCache.size > 2000) {
        const firstKey = parseCotCache.keys().next().value;
        parseCotCache.delete(firstKey);
    }
    return result;
};

export { generateUUID, parseCot };
globalThis.generateUUID = generateUUID;
globalThis.parseCot = parseCot;

// ---- Extracted from app.mjs setup() (Phase 2.3 utility extraction) ----
export const formatTokenUsageTime = (timestamp) => new Date(timestamp).toLocaleString('zh-CN', { hour12: false });

export const formatTokenAggregate = (value, reports) => reports > 0 && value > 0
            ? `${Number((value / 1000000).toFixed(2))}M`
            : '0';

export const formatTokenCount = (value) => Number.isFinite(value) ? value.toLocaleString() : '0';

// Inline panel usage bar: compact "7.18k"-style token counts.
export const formatLatestTokenCount = (value) => {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return '0';
    return count >= 1000 ? `${(count / 1000).toFixed(2)}k` : String(count);
};

export const getTokenUsageCategory = (type) => {
            if (['summary', 'embedding'].includes(type)) return 'memory';
            if (type === 'ui_template') return 'variables';
            return 'chat';
        };

export const cleanupActiveToolCaptureState = (message) => {
            if (!message) return;
            delete message._activeToolCaptureActive;
            delete message._activeToolPendingText;
            delete message._activeToolPendingUiId;
        };

export const removeActiveToolCallRawsFromText = (text, toolCalls) => {
            let nextText = String(text || '');
            [...toolCalls]
                .sort((a, b) => (b.index ?? b.mainIndex ?? 0) - (a.index ?? a.mainIndex ?? 0))
                .forEach(toolCall => {
                    const index = Number.isFinite(toolCall.index) ? toolCall.index : nextText.indexOf(toolCall.raw);
                    if (index < 0) return;
                    nextText = `${nextText.slice(0, index)}${nextText.slice(index + String(toolCall.raw || '').length)}`;
                });
            return nextText;
        };

export const stripActiveToolCallsFromAssistant = (message, toolCalls) => {
            if (!message || !Array.isArray(toolCalls) || toolCalls.length === 0) return;
            const originalContent = String(message.content || '');
            const firstToolCallIndex = toolCalls
                .map(toolCall => Number.isFinite(toolCall.index) ? toolCall.index : originalContent.indexOf(toolCall.raw))
                .filter(index => index >= 0)
                .sort((a, b) => a - b)[0];
            const nextContent = (Number.isFinite(firstToolCallIndex)
                ? originalContent.slice(0, firstToolCallIndex)
                : toolCalls.reduce((content, toolCall) => content.replace(toolCall.raw, ''), originalContent))
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            message.content = nextContent;
            message.skipReveal = true;
        };

export const cleanActiveToolCallReason = (value) => String(value || '')
            .replace(/<\/\s*reason\s*>?\s*$/i, '')
            .trim();

export const escapeRegexText = (value) => String(value || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

export const stripCodeBlocksForToolDetection = (text) => String(text || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/~~~[\s\S]*?~~~/g, '');

export const normalizeTavilyExtractUrl = (value) => {
            let text = String(value || '').trim().replace(/[，。；、）)\].,;]+$/g, '');
            if (!text) return '';
            if (/^www\./i.test(text)) text = `https://${text}`;
            try {
                const url = new URL(text);
                if (!['http:', 'https:'].includes(url.protocol)) return '';
                return url.href;
            } catch (err) {
                return '';
            }
        };

export const requestTavily = async (endpoint, apiKey, body, signal) => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal
            });
            const data = await response.json().catch(() => ({}));
            return { response, data };
        };

export const buildKeywordToolSnippet = (text, matchedTerms) => {
            const source = String(text || '').trim();
            if (source.length <= 1400) return source;
            const lowerSource = source.toLowerCase();
            const firstIndex = matchedTerms
                .map(term => lowerSource.indexOf(String(term || '').toLowerCase()))
                .filter(index => index >= 0)
                .sort((a, b) => a - b)[0] ?? 0;
            const start = Math.max(0, firstIndex - 420);
            const end = Math.min(source.length, firstIndex + 900);
            return `${start > 0 ? '...' : ''}${source.slice(start, end).trim()}${end < source.length ? '...' : ''}`;
        };

export const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

export const printAIRequestLogs = (messages, modelName) => {
            console.group('%c🚀 AI 请求详情', 'color: #10b981; font-weight: bold; font-size: 14px;');
            console.log(`%c🤖 模型: %c${modelName}`, 'font-weight: bold;', 'color: #3b82f6;');

            console.log(`%c📦 发送消息列表 (${messages.length} 条):`, 'font-weight: bold;');

            // 单独展示系统提示词
            const sysMsg = messages.find(m => m.role === 'system');
            if (sysMsg) {
                console.groupCollapsed('%c🛠️ 查看系统提示词 (System Prompt)', 'color: #ef4444; font-weight: bold;');
                console.log(sysMsg.content);
                console.groupEnd();
            }

            console.groupCollapsed('%c📝 查看完整消息列表', 'color: #f59e0b; font-weight: bold;');
            console.table(messages.map(m => ({
                'Role': m.role,
                'Name': m.name || (m.role === 'system' ? 'System' : 'Unknown'),
                'Content': m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content
            })));
            // 打印完整内容以供复制
            console.log('完整消息对象:', messages);
            console.groupEnd();

            console.log('%c✅ 请求已发送，等待响应...', 'color: #10b981;');
            console.groupEnd();
        };

export const runWithConcurrency = async (items, limit, worker) => {
            const results = new Array(items.length);
            let nextIndex = 0;
            const runnerCount = Math.min(Math.max(1, Number(limit) || 1), items.length);
            const runners = Array.from({ length: runnerCount }, async () => {
                while (nextIndex < items.length) {
                    const index = nextIndex++;
                    results[index] = await worker(items[index], index);
                }
            });
            await Promise.all(runners);
            return results;
        };

export const checkConnectionStatus = async (status, latency, label, request, isConnected = response => response.ok) => {
            status.value = 'checking';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const startTime = performance.now();
            try {
                const response = await request(controller.signal);
                if (!isConnected(response)) {
                    status.value = 'error';
                    return;
                }
                status.value = 'connected';
                latency.value = Math.round(performance.now() - startTime);
            } catch (error) {
                console.warn(`${label} Status Check Failed:`, error);
                status.value = 'error';
            } finally {
                clearTimeout(timeoutId);
            }
        };

export const collapseNativeReasoning = (message) => {
            if (message && message.role === 'assistant' && typeof message.reasoning === 'string' && message.reasoning.trim()) {
                if (message.isReasoningUserToggled || message.isReasoningAutoCollapsed) return;
                message.isReasoningOpen = false;
                message.isReasoningAutoCollapsed = true;
            }
        };

export const throwApiError = (message) => {
            const error = new Error(message);
            error.isApiError = true;
            throw error;
        };

export const stringifyErrorDetail = (detail) => {
            if (detail === null || detail === undefined) return '';
            if (typeof detail === 'string') return detail;
            try {
                return JSON.stringify(detail, null, 2);
            } catch (e) {
                return String(detail);
            }
        };

export const formatAIResponseForConsole = (content = '', reasoning = '') => {
            const reasoningText = String(reasoning || '').trim();
            const contentText = String(content || '');
            if (!reasoningText) return contentText;
            return `<thinking>\n${reasoningText}\n</thinking>${contentText ? `\n\n${contentText}` : ''}`;
        };

export const yieldToUi = () => new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            } else {
                setTimeout(resolve, 0);
            }
        });

export const stripUiTemplateContextInjection = (text) => String(text || '')
            .replace(/<ui_template_state_context>[\s\S]*?<\/ui_template_state_context>/gi, '')
            .replace(/<ui_template_state_context>[\s\S]*$/gi, '');

export const stringifyUiSchema = (schema) => {
            if (!schema) return '';
            return typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
        };

export const isEditableElement = (el) => {
            if (!el || !el.tagName) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'input') {
                const t = String(el.type || 'text').toLowerCase();
                if (['hidden', 'radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'image', 'color', 'range', 'password'].includes(t)) return false;
                return true;
            }
            return tag === 'textarea';
        };

export const buildExecutableHtmlDocument = (rawHtml) => {
            const metaViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
            const hudCSS = '.sinan-hud{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:12px;background:linear-gradient(to bottom right,rgba(255,255,255,0.9),rgba(255,255,255,0.6));border-radius:12px;border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(4px)}.char-card{flex:1 1 140px;background:#fff;padding:10px;border-radius:8px;border-left:4px solid #ddd;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:4px;font-size:12px;position:relative;overflow:hidden;transition:transform 0.2s}.char-card:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(0,0,0,0.1)}.char-name{font-weight:700;font-size:14px;color:#374151;display:flex;justify-content:space-between;align-items:center}.char-mood{color:#6b7280;font-size:12px}.char-loc{color:#9ca3af;font-size:11px;margin-top:auto;padding-top:4px}.bar-bg{height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;margin-top:6px}.bar-fill{height:100%;background:#10b981;border-radius:2px}.c-tongqiu{border-left-color:#f59e0b}.c-tongqiu .bar-fill{background:#f59e0b}.c-yufan{border-left-color:#3b82f6}.c-yufan .bar-fill{background:#3b82f6}.c-linghu{border-left-color:#8b5cf6}.c-linghu .bar-fill{background:#8b5cf6}.c-chongtian{border-left-color:#ef4444}.c-chongtian .bar-fill{background:#ef4444}';
            const resetStyle = '<style>html,body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:auto!important;word-wrap:break-word!important;box-sizing:border-box!important;overflow:hidden!important;}::-webkit-scrollbar{display:none;}*,*::before,*::after{box-sizing:inherit!important;}img,video,canvas,svg{max-width:100%!important;height:auto!important;}table{display:block!important;overflow-x:auto!important;max-width:100%!important;}pre{white-space:pre-wrap!important;word-wrap:break-word!important;max-width:100%!important;}.container,.reality-panel,.app-container{max-width:100%!important;width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;border:none!important;height:auto!important;min-height:0!important;}body>div:first-child{margin:0!important;max-width:100%!important;height:auto!important;min-height:0!important;}#app{height:auto!important;min-height:auto!important;}.bottom-safe{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;}' + hudCSS + '</style>';
            const jqueryScript = '<script src="/assets/vendor/jquery.min.js" defer><\/script>';
            const scriptShim = `
                <script>
                    window.triggerSlash = function(text) {
                        if (window.parent && window.parent.triggerSlash) {
                            window.parent.triggerSlash(text);
                        }
                    };

                    let lastHeight = 0;
                    let isUpdating = false;
                    function updateHeight() {
                        if (!window.frameElement || isUpdating) return;
                        if (window.frameElement.hasAttribute('data-rph-fixed-height')) return;
                        isUpdating = true;
                        requestAnimationFrame(function() {
                            var body = document.body;
                            var html = document.documentElement;
                            if (!body || !html) {
                                isUpdating = false;
                                return;
                            }
                            var maxBottom = 0;
                            for (var i = 0; i < body.children.length; i++) {
                                var child = body.children[i];
                                if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue;
                                var style = window.getComputedStyle(child);
                                if (style.position === 'fixed') continue;
                                var rect = child.getBoundingClientRect();
                                var itemMax = Math.max(rect.bottom, child.offsetTop + child.offsetHeight);
                                if (itemMax > maxBottom) maxBottom = itemMax;
                            }
                            var bodyStyle = window.getComputedStyle(body);
                            var marginBottom = parseFloat(bodyStyle.marginBottom) || 0;
                            var newHeight = Math.max(maxBottom + marginBottom, body.scrollHeight) + 4;
                            if (Math.abs(newHeight - lastHeight) > 0) {
                                lastHeight = newHeight;
                                window.frameElement.style.height = newHeight + 'px';
                            }
                            isUpdating = false;
                        });
                    }

                    window.addEventListener('load', function() {
                        updateHeight();
                        setTimeout(updateHeight, 200);
                        setTimeout(updateHeight, 1000);
                    });
                    window.addEventListener('resize', updateHeight);
                    window.addEventListener('click', function(event) {
                        var slashTarget = event.target && event.target.closest && event.target.closest('[data-slash]');
                        if (slashTarget) {
                            event.preventDefault();
                            var command = slashTarget.getAttribute('data-slash');
                            if (command) window.triggerSlash(command);
                        }
                        var start = Date.now();
                        var tick = function() {
                            if (Date.now() - start >= 600) return;
                            updateHeight();
                            requestAnimationFrame(tick);
                        };
                        tick();
                    });
                    window.addEventListener('DOMContentLoaded', function() {
                        document.querySelectorAll('img').forEach(function(img) {
                            img.addEventListener('load', updateHeight);
                        });
                        updateHeight();
                    });
                    if (window.ResizeObserver) {
                        var ro = new ResizeObserver(updateHeight);
                        if (document.body) ro.observe(document.body);
                    } else {
                        setInterval(updateHeight, 1000);
                    }
                    if (document.readyState === 'complete') updateHeight();
                <\/script>
            `;

            let content = rawHtml || '';
            const trimmed = content.trim();
            if (/^\s*(<!doctype|<html)/i.test(trimmed)) {
                const headRegex = /<head(\s[^>]*)?>/i;
                const htmlRegex = /<html(\s[^>]*)?>/i;
                if (headRegex.test(content)) {
                    return content.replace(headRegex, (match) => match + metaViewport + resetStyle + jqueryScript + scriptShim);
                }
                if (htmlRegex.test(content)) {
                    return content.replace(htmlRegex, (match) => match + '<head>' + metaViewport + resetStyle + jqueryScript + scriptShim + '</head>');
                }
                return metaViewport + resetStyle + jqueryScript + scriptShim + content;
            }

            return `<!DOCTYPE html>
<html>
<head>
${metaViewport}
${resetStyle}
${jqueryScript}
${scriptShim}
</head>
<body>
${content}
</body>
</html>`;
        };

export const debounce = (fn, delay) => {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn(...args), delay);
            };
        };

export const isDesktopSidebarViewport = () => window.matchMedia('(min-width: 768px)').matches;

export const readUsageNumber = (...values) => {
            for (const value of values) {
                const number = Number(value);
                if (Number.isFinite(number) && number >= 0) return Math.round(number);
            }
            return null;
        };

export const isDatabaseClosingError = () => false;

export const bytesToBase64 = (bytes) => {
            const source = bytes instanceof Uint8Array
                ? bytes
                : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < source.length; i += chunkSize) {
                binary += String.fromCharCode(...source.subarray(i, i + chunkSize));
            }
            return btoa(binary);
        };

export const getConversationTurnAtIndexFromSnapshot = (snapshot, index) => {
            if (!Number.isFinite(index) || index < 0) return null;
            const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
            const matchedTurn = turns.find(turn => (turn.sourceIndexes || []).includes(index));
            if (matchedTurn) return matchedTurn.turn;
            const previousTurns = turns.filter(turn => turn.endIndex < index).length;
            return previousTurns + 1;
        };

export const indentXmlText = (text, spaces = 0) => {
            const prefix = ' '.repeat(Math.max(0, spaces));
            return String(text || '')
                .split(/\r?\n/)
                .map(line => `${prefix}${line}`)
                .join('\n');
        };

export const escapeXmlText = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

export const escapeXmlAttribute = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

export const normalizePresetRole = (role) => (
            ['system', 'user', 'assistant'].includes(role) ? role : 'system'
        );

export const estimateTokens = (text) => {
            const source = String(text || '');
            if (!source) return 0;
            const cjk = (source.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
            const asciiWords = (source
                .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
                .match(/[A-Za-z0-9_]+/g) || []).length;
            const other = source.length - cjk - (source.match(/[A-Za-z0-9_]+/g) || []).join('').length;
            return Math.max(0, Math.ceil(cjk * 0.8 + asciiWords * 1.3 + other * 0.2));
        };

export const isMobileViewport = () => (
            (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
            || window.innerWidth <= 768
        );

export const resizeChatInputElement = (element) => {
            if (!element) return;
            if (element.tagName === 'TEXTAREA') {
                const computed = getComputedStyle(element);
                const maxHeight = parseInt(computed.maxHeight, 10) || 260;
                element.style.height = 'auto';
                // 不再强制 44px 下限：单行高度交给内容 + CSS min-h 决定，
                // 让输入框只比一行文字略高，避免视觉上偏高。
                const nextHeight = Math.min(element.scrollHeight, maxHeight);
                element.style.height = `${nextHeight}px`;
                const overflow = element.scrollHeight > maxHeight;
                element.style.overflowY = overflow ? 'auto' : 'hidden';
                // 内容超出最大高度时把视图滚到底部，让光标行（在末尾）保持可见，
                // 否则 textarea 进入滚动模式但视图停顶部，新输入的字被遮挡。
                // 部分 Android WebView 在 overflow 切换当帧不可滚动，补一次 rAF 确保生效。
                if (overflow) {
                    element.scrollTop = element.scrollHeight;
                    requestAnimationFrame(() => {
                        element.scrollTop = element.scrollHeight;
                    });
                }
            } else if (element.style.height) {
                element.style.height = '';
            }
        };
