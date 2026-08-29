// useTemplateRenderer — markdown / message-template rendering (Phase 2, roadmap 2.2)
//
// Owns the rendering pipeline previously inlined in app.mjs setup(): the
// render/frame-detection LRU caches, HTML-block detection (htmlBlockStartPattern /
// matchesHtmlBlockStart / contentUsesHtmlFrame), the message layout predicates
// (messageUsesHtmlFrame / messageHasUiTemplateBlocks / messageHasPendingUiTemplate /
// messageUsesWideLayout) and renderMarkdown itself (regex display pass, controlled
// srcdoc frame rebuilding, DOMPurify sanitization, marked parsing).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - deps-injecting logic factory: app.mjs passes the collaborators (processRegex,
//   createExecutableHtmlIframe, isMessageThinkingOrRunning, settings, regexScripts,
//   uiTemplateUpdateStatus, activeUiTemplates) and destructures
//   { renderMarkdown, messageUsesWideLayout, clearRenderCaches }.
// - The cache-clearing watcher stays in app.mjs (watchers belong to app.mjs for now)
//   and calls the returned clearRenderCaches().
// - `marked` and `DOMPurify` are index.html vendor globals (assets/vendor/*.js),
//   not module imports — same as the app.mjs original.
// - The moved code is byte-identical to the app.mjs original except for the deps
//   destructuring and the extracted clearRenderCaches helper.

import { RPHRuntimePolicy } from '../modules/runtime-policy.mjs';
import { parseCot } from '../modules/utils.mjs';

        // Markdown Rendering

export function useTemplateRenderer(deps) {
    const {
        processRegex,
        createExecutableHtmlIframe,
        isMessageThinkingOrRunning,
        settings,
        regexScripts,
        uiTemplateUpdateStatus,
        activeUiTemplates
    } = deps;

        const renderMarkdownCache = new RPHRuntimePolicy.LruCache(
            RPHRuntimePolicy.limits.renderCache
        );
        const cacheRenderedMarkdown = (key, value, cacheable = true) => {
            if (!cacheable) return value;
            renderMarkdownCache.set(key, value);
            return value;
        };
        const htmlFrameDetectionCache = new RPHRuntimePolicy.LruCache(
            RPHRuntimePolicy.limits.renderCache
        );

        const clearRenderCaches = () => {
            renderMarkdownCache.clear();
            htmlFrameDetectionCache.clear();
        };

        const htmlBlockStartPattern = /^\s*<(!doctype|html|head|body|div|span|section|article|aside|header|footer|nav|main|form|fieldset|ul|ol|li|table|style|script|template|button|input|select|textarea|canvas|video|audio|figure|dialog|details|summary|img|svg|p|h[1-6]|hr|blockquote|pre|a)\b/i;
        const matchesHtmlBlockStart = (text) => htmlBlockStartPattern.test(String(text || ''));

        const contentUsesHtmlFrame = (text, role = 'assistant', skipRegex = false, cacheable = true) => {
            if (!text) return false;
            const cacheKey = `${role}_${skipRegex}_${text}`;
            if (cacheable && htmlFrameDetectionCache.has(cacheKey)) return htmlFrameDetectionCache.get(cacheKey);

            let processed = text;
            processed = skipRegex ? processed : processRegex(processed, { isDisplay: true, role: role });
            const trimmed = processed.trim();
            let usesFrame = false;

            const codeFencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
            let codeMatch;
            while ((codeMatch = codeFencePattern.exec(trimmed)) !== null) {
                const lang = codeMatch[1] || '';
                const blockContent = codeMatch[2] || '';
                if (/\b(html|xml)\b/i.test(lang) || matchesHtmlBlockStart(blockContent)) {
                    usesFrame = true;
                    break;
                }
            }

            if (!usesFrame && !trimmed.includes('```')) {
                usesFrame = /(<!doctype html>|<html\b[^>]*>)/i.test(trimmed);
            }

            if (cacheable) htmlFrameDetectionCache.set(cacheKey, usesFrame);
            return usesFrame;
        };

        const messageUsesHtmlFrame = (msg) => {
            if (!msg || !msg.content) return false;
            const cacheable = !isMessageThinkingOrRunning(msg);
            if (msg.isTriggered) return msg.showRaw && contentUsesHtmlFrame(msg.content, msg.role, false, cacheable);
            const parsed = parseCot(msg.content);
            return contentUsesHtmlFrame(parsed.main || msg.content, msg.role, false, cacheable);
        };

        const messageHasUiTemplateBlocks = (msg) => {
            const blocks = msg?.uiTemplateBlocks;
            if (!blocks) return false;
            return (Array.isArray(blocks.top) && blocks.top.length > 0)
                || (Array.isArray(blocks.bottom) && blocks.bottom.length > 0);
        };

        const messageHasPendingUiTemplate = (msg) => (
            !!msg
            && uiTemplateUpdateStatus.state === 'running'
            && uiTemplateUpdateStatus.targetMessageId === msg.id
            && activeUiTemplates.value.length > 0
        );

        const messageUsesWideLayout = (msg) => {
            if (!msg) return false;
            return !!(
                msg.reasoning
                || parseCot(msg.content || '').cot
                || (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0)
                || msg.isEditing_Message
                || messageUsesHtmlFrame(msg)
                || messageHasUiTemplateBlocks(msg)
                || messageHasPendingUiTemplate(msg)
            );
        };

        const renderMarkdown = (text, role = 'assistant', skipRegex = false, cacheable = true) => {
            if (!text) return '';
            const cacheKey = `${role}_${skipRegex}_${text}`;
            if (cacheable && renderMarkdownCache.has(cacheKey)) return renderMarkdownCache.get(cacheKey);

            let processed = text;

            // Apply regex for display (real-time)
            processed = skipRegex ? processed : processRegex(processed, { isDisplay: true, role: role });
            const createIframe = (rawHtml, options = {}) => createExecutableHtmlIframe(
                rawHtml,
                'border-t border-gray-200 shadow-sm',
                options
            );

            // Configure DOMPurify
            const cleanConfig = {
                ADD_TAGS: ['details', 'summary', 'iframe', 'svg', 'path', 'g', 'circle', 'rect', 'defs', 'linearGradient', 'stop', 'style', 'div', 'span', 'script', 'button', 'input'],
                ADD_ATTR: ['style', 'open', 'srcdoc', 'sandbox', 'frameborder', 'allow', 'allowfullscreen', 'class', 'id', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'stroke-linecap', 'stroke-linejoin', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity', 'width', 'height', 'onclick', 'type', 'value', 'checked', 'data-slash'],
                FORBID_ATTR: ['onmouseover', 'onload'], // Removed onclick to allow interactive UI
                FORCE_BODY: true
            };

            const sanitizeWithControlledSrcdocFrames = (rawMarkup) => {
                const parser = new DOMParser();
                const sourceDoc = parser.parseFromString(String(rawMarkup || ''), 'text/html');
                const frameSources = [];

                sourceDoc.querySelectorAll('iframe[srcdoc]').forEach(sourceFrame => {
                    const declaredHeight = Number.parseFloat(sourceFrame.getAttribute('height') || '');
                    const frameIndex = frameSources.push({
                        html: sourceFrame.getAttribute('srcdoc') || '',
                        fixedHeight: Number.isFinite(declaredHeight) ? declaredHeight : null
                    }) - 1;
                    const placeholder = sourceDoc.createElement('div');
                    placeholder.setAttribute('data-rph-srcdoc-frame', String(frameIndex));
                    sourceFrame.replaceWith(placeholder);
                });

                const sanitized = DOMPurify.sanitize(sourceDoc.body.innerHTML, {
                    ...cleanConfig,
                    FORBID_TAGS: [...(cleanConfig.FORBID_TAGS || []), 'iframe']
                });
                if (!frameSources.length) return sanitized;

                const sanitizedDoc = parser.parseFromString(sanitized, 'text/html');
                sanitizedDoc.querySelectorAll('[data-rph-srcdoc-frame]').forEach(placeholder => {
                    const frameIndex = Number.parseInt(placeholder.getAttribute('data-rph-srcdoc-frame'), 10);
                    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameSources.length) {
                        placeholder.remove();
                        return;
                    }
                    const frameSource = frameSources[frameIndex];
                    placeholder.replaceWith(createIframe(frameSource.html, {
                        fixedHeight: frameSource.fixedHeight
                    }));
                });
                return sanitizedDoc.body.innerHTML;
            };

            const trimmed = processed.trim();

            // Improved HTML Document Detection
            // Look for standard HTML document markers anywhere in the text, not just at the start
            // This handles cases where there might be some text before the HTML code
            const htmlDocPattern = /(<!doctype html>|<html\b[^>]*>)/i;
            const htmlMatch = trimmed.match(htmlDocPattern);
            const containsHtmlDoc = !!htmlMatch;

            // If it looks like a full HTML document, extract and render it in an iframe
            // We check !trimmed.includes('```') to avoid rendering code blocks that the user intended to display as code
            if (containsHtmlDoc && !trimmed.includes('```')) {
                const startIndex = htmlMatch.index;

                // Find end index to preserve text AFTER the HTML
                const closeTag = '</html>';
                const closeIndex = trimmed.toLowerCase().lastIndexOf(closeTag);

                let htmlContent, preText, postText;

                if (closeIndex !== -1 && closeIndex > startIndex) {
                    const endIndex = closeIndex + closeTag.length;
                    htmlContent = trimmed.substring(startIndex, endIndex);
                    preText = trimmed.substring(0, startIndex);
                    postText = trimmed.substring(endIndex);
                } else {
                    // Fallback: Take everything from start match to end
                    htmlContent = trimmed.substring(startIndex);
                    preText = trimmed.substring(0, startIndex);
                    postText = '';
                }

                let resultHtml = '';

                // 1. Render Pre-text (Markdown)
                if (preText.trim()) {
                    resultHtml += sanitizeWithControlledSrcdocFrames(marked.parse(preText));
                }

                // 2. Render Iframe (HTML Card)
                const container = document.createElement('div');
                container.className = 'html-card-container';
                // Remove bottom margin to align with bubble bottom
                container.style.margin = '0';
                container.style.paddingBottom = '0';
                // Adjust negative margin to pull it down slightly if needed, or just 0
                container.style.marginBottom = '-1px'; // Slight pull to cover border if any
                container.appendChild(createIframe(htmlContent));
                resultHtml += container.outerHTML;

                // 3. Render Post-text (Markdown)
                if (postText.trim()) {
                    resultHtml += sanitizeWithControlledSrcdocFrames(marked.parse(postText));
                }

                return cacheRenderedMarkdown(cacheKey, resultHtml, cacheable);
            }

            const lowerTrimmed = trimmed.toLowerCase();

            // Smart detection: If content starts with block-level HTML and contains no Markdown Code Blocks,
            // assume it is raw HTML and skip marked parsing to prevent breaking layout/styles.
            const startsWithBlockHtml = matchesHtmlBlockStart(trimmed);
            if (startsWithBlockHtml && !trimmed.includes('```')) {
                // Directly sanitize and return, skipping Markdown parsing
                const result = sanitizeWithControlledSrcdocFrames(processed);
                return cacheRenderedMarkdown(cacheKey, result, cacheable);
            }

            // For mixed content (Text + HTML widgets like HUDs/Status Bars),
            // we strip structural tags to prevent browser parsing issues and allow inline rendering
            if (lowerTrimmed.includes('<html') || lowerTrimmed.includes('<!doctype')) {
                processed = processed.replace(/<!DOCTYPE html>/gi, '')
                    .replace(/<\/?html[^>]*>/gi, '')
                    .replace(/<\/?head[^>]*>/gi, '')
                    .replace(/<\/?body[^>]*>/gi, '');
            }

            let html = sanitizeWithControlledSrcdocFrames(marked.parse(processed));

            // Auto-render HTML code blocks AND escaped HTML texts
            try {
                // Execute Scripts manually because setting innerHTML doesn't run scripts
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Handle scripts
                const scripts = doc.querySelectorAll('script');
                if (scripts.length > 0) {
                    setTimeout(() => {
                        scripts.forEach(oldScript => {
                            // Find the script in the actual DOM after render
                            // Note: This is tricky because we're returning HTML string, not mounting DOM yet.
                            // Vue v-html will mount it. But v-html doesn't run scripts.
                            // Strategy: We rely on the fact that inline rendering with <script> is dangerous/complex in Vue.
                            // But since the user wants inline script execution for UI, we might need a workaround.
                            // The createIframe approach already handles scripts because srcdoc runs them.
                            // But for inline content (like the user's div), scripts won't run via v-html.
                            // We will try to convert complex UI blocks containing scripts into IFRAMES automatically.
                        });
                    }, 0);
                }

                let modified = false;

                // 1. Convert code blocks that look like HTML to iframes
                const codeBlocks = doc.querySelectorAll('pre code');
                if (codeBlocks.length > 0) {
                    codeBlocks.forEach(block => {
                        const rawHtml = block.textContent;
                        // Check if it's HTML: has language class OR looks like HTML
                        const isHtmlClass = block.classList.contains('language-html') || block.classList.contains('language-xml');
                        const looksLikeHtml = matchesHtmlBlockStart(rawHtml);

                        if (isHtmlClass || looksLikeHtml) {
                            const iframe = createIframe(rawHtml);
                            const preTag = block.parentElement;
                            if (preTag && preTag.parentNode) {
                                preTag.parentNode.replaceChild(iframe, preTag);
                                modified = true;
                            }
                        }
                    });
                }

                // 2. Recover escaped HTML that was rendered as text (e.g. due to missing newlines in Markdown)
                const paragraphs = doc.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    paragraphs.forEach(p => {
                        const rawHtml = p.textContent || '';
                        if (matchesHtmlBlockStart(rawHtml)) {
                            const iframe = createIframe(rawHtml);
                            if (p.parentNode) {
                                p.parentNode.replaceChild(iframe, p);
                                modified = true;
                            }
                        }
                    });
                }

                // 3. Detect inline scripts in divs and wrap them in iframes if they are complex UI components
                // This fixes the issue where scripts inside replaced regex content (inline HTML) don't execute
                const complexDivs = doc.querySelectorAll('div[style*="position"], div[style*="background"], div[class*="panel"]');
                complexDivs.forEach(div => {
                    if (div.querySelector('script')) {
                        // This div contains a script, wrap the whole thing in an iframe to ensure execution
                        const rawHtml = div.outerHTML;
                        const iframe = createIframe(rawHtml);
                        if (div.parentNode) {
                            div.parentNode.replaceChild(iframe, div);
                            modified = true;
                        }
                    }
                });

                if (modified) {
                    const result = doc.body.innerHTML;
                    return cacheRenderedMarkdown(cacheKey, result, cacheable);
                }
            } catch (e) {
                console.error('Error rendering HTML preview:', e);
            }

            return cacheRenderedMarkdown(cacheKey, html, cacheable);
        };

    return { renderMarkdown, messageUsesWideLayout, clearRenderCaches };
}
