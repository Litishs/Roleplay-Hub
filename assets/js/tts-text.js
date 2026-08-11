(() => {
    'use strict';

    /**
     * RPHTtsText —— TTS 朗读文本抽取（纯逻辑，无 DOM 依赖，Node 可直接单测）
     *
     * 抽取规则与渲染层对齐：
     * - 只取 parseCot 的 main：丢弃 <think>/<cot> 与尾部 [系统指令: ...]
     * - 富文本卡片不朗读：
     *   - 完整 HTML 文档（<!doctype html>/<html>…</html>）整体剔除，保留前后普通文本
     *   - 以块级 HTML 开头的整段内容（渲染层按 raw HTML 卡片处理）视为无可读文本
     *   - uiTemplateBlocks 是消息独立字段，调用方不传入即可天然排除
     * - 代码围栏（``` / ~~~）整体剔除；行内代码保留内容
     * - 可跳过 *动作/旁白* 独立行；台词模式只保留「」『』“” 与 "..." 引号内容
     * - Markdown 语法剥壳、空白合并、按 maxChars 截断
     */

    const factory = () => {
        const cotPattern = /<(think|cot)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
        const sysTailPattern = /\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/;
        const htmlDocPattern = /(<!doctype html>|<html\b[^>]*>)/i;
        const htmlBlockStartPattern = /^\s*<(!doctype|html|head|body|div|span|section|article|aside|header|footer|nav|main|form|fieldset|ul|ol|li|table|style|script|template|button|input|select|textarea|canvas|video|audio|figure|dialog|details|summary|img|svg|p|h[1-6]|hr|blockquote|pre|a)\b/i;
        const codeFencePattern = /```[^\n`]*\n?[\s\S]*?```/g;
        const codeFenceTildePattern = /~~~[^\n~]*\n?[\s\S]*?~~~/g;
        const inlineCodePattern = /`([^`]+)`/g;
        const actionLinePattern = /^\s*\*[^*\n]+\*\s*$/gm;
        const quotePattern = /「([^」\n]*)」|『([^』\n]*)』|“([^”\n]*)”|"([^"\n]*)"/g;

        const splitMain = (text) => {
            let main = String(text || '').replace(cotPattern, '');
            return main.replace(sysTailPattern, '');
        };

        const stripHtmlCards = (text) => {
            let result = String(text || '');
            const docMatch = result.match(htmlDocPattern);
            if (docMatch) {
                const start = docMatch.index;
                const closeTag = '</html>';
                const closeIndex = result.toLowerCase().lastIndexOf(closeTag);
                const end = closeIndex !== -1 && closeIndex > start ? closeIndex + closeTag.length : result.length;
                result = result.slice(0, start) + '\n' + result.slice(end);
            }
            const trimmed = result.trim();
            if (!trimmed) return '';
            if (htmlBlockStartPattern.test(trimmed)) return '';
            return result;
        };

        const stripMarkdown = (text) => {
            let out = String(text || '');
            out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ');
            out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
            out = out.replace(/^#{1,6}\s+/gm, '');
            out = out.replace(/^>\s?/gm, '');
            out = out.replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, '$1');
            out = out.replace(/^\s*[-*_]{3,}\s*$/gm, ' ');
            out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
            out = out.replace(/__([^_]+)__/g, '$1');
            out = out.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2');
            out = out.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');
            out = out.replace(/~~([^~]+)~~/g, '$1');
            out = out.replace(/<[^>]*>/g, ' ');
            out = out.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ');
            out = out.replace(/\|/g, ' ');
            out = out.replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ');
            return out;
        };

        const extractQuotes = (text) => {
            const parts = [];
            let match;
            quotePattern.lastIndex = 0;
            while ((match = quotePattern.exec(text)) !== null) {
                const quote = match[1] || match[2] || match[3] || match[4];
                if (quote && quote.trim()) parts.push(quote.trim());
            }
            return parts.join(' ');
        };

        const truncate = (text, maxChars) => {
            const max = Math.max(1, Number(maxChars) || 2000);
            if (text.length <= max) return text;
            const slice = text.slice(0, max);
            const boundary = Math.max(
                slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'),
                slice.lastIndexOf('!'), slice.lastIndexOf('?'), slice.lastIndexOf('.'),
                slice.lastIndexOf('\n')
            );
            return boundary > max * 0.5 ? slice.slice(0, boundary + 1) : slice;
        };

        const extractSpeakText = (content, options = {}) => {
            const maxChars = Number(options.maxChars) || 2000;
            const skipActions = !!options.skipActions;
            const dialogueOnly = !!options.dialogueOnly;

            let text = splitMain(content);
            text = text.replace(codeFencePattern, ' ').replace(codeFenceTildePattern, ' ');
            text = stripHtmlCards(text);
            if (!text.trim()) return '';

            text = text.replace(inlineCodePattern, '$1');
            if (skipActions) text = text.replace(actionLinePattern, ' ');
            if (dialogueOnly) text = extractQuotes(text);
            text = stripMarkdown(text);
            text = text.replace(/\s+/g, ' ').trim();
            if (!text) return '';
            return truncate(text, maxChars);
        };

        return Object.freeze({ extractSpeakText });
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        globalThis.RPHTtsText = factory();
    }
})();
