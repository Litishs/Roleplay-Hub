// useRegexPipeline — regex script processing (Phase 3.0, roadmap 3.0)
//
// Owns processRegex, previously inlined in app.mjs setup(): runs the
// ordered regex scripts over message text with placement/mode/depth
// filtering, /pattern/flags parsing, modifier normalization and the
// HTML/code-block protection wrapper (Auto Replace {{user}} exempt).
// The moved code is byte-identical to the app.mjs original.
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - deps are regexScripts; cardUtils is a direct module import (same object
//   app.mjs aliases). Consumed by useMessageSender and useTemplateRenderer
//   via the app.mjs wiring.
// Contract locks: tests/composables-contract.test.mjs.

import { RPHubCardUtils } from '../modules/card-utils.mjs';

export function useRegexPipeline(deps) {
    const { regexScripts } = deps;
    const cardUtils = RPHubCardUtils;

    // Catastrophic backtracking (ReDoS) heuristic interception: card regexes
    // are untrusted external input, and nested-quantifier patterns can freeze
    // the main thread with a single replace on large text, while JS offers no
    // timeout for synchronous regexes. Intercept the two classic shapes before
    // compilation (prefer false positives with a log trail over a frozen UI):
    //   R1 quantified group nested inside a quantifier: (a+)+ , (?:\w*)*
    //   R2 quantified group containing a branch where at least one branch
    //      carries its own quantifier: (a+|b)+ , (a|a*)+
    // The heuristic is incomplete (it cannot cover every backtracking shape
    // and may kill a few harmless patterns) — blocked scripts are left in the
    // log so authors can rewrite them; the thorough fix is moving into a
    // Worker, planned for Phase 2.
    const CATASTROPHIC_PATTERNS = [
        /\((?:[^()\\]|\\.)*[+*]\)\s*(?:[+*]|\{\d+,)/,
        /\((?:[^()\\]|\\.)*[+*][^()]*\|(?:(?!\)\s*[+*]).)*\)\s*(?:[+*]|\{\d+,)/,
        /\((?:[^()\\]|\\.)*\|[^()]*[+*]\)\s*(?:[+*]|\{\d+,)/
    ];

    const containsCatastrophicQuantifier = (pattern) =>
        CATASTROPHIC_PATTERNS.some(nasty => nasty.test(String(pattern || '')));

        const processRegex = (text, options = {}) => {
            if (!text) return '';
            // options: { isDisplay, isPrompt, role, depth }
            const { isDisplay = false, isPrompt = false, role = null, depth = 0 } = options;
            if (role === 'system') return text;

            let result = text;
            const orderedScripts = [...regexScripts.value].sort((a, b) => {
                const aIsImageGen = (a.name || a.scriptName) === 'NAI画图正则';
                const bIsImageGen = (b.name || b.scriptName) === 'NAI画图正则';
                return aIsImageGen === bIsImageGen ? 0 : (aIsImageGen ? 1 : -1);
            });

            orderedScripts.forEach(script => {
                // 明确检查 enabled 字段：只有显式设置为 false 才跳过
                if (script.enabled === false) return;

                // Placement Check (1=User, 2=AI)
                // 如果 placement 未定义，默认为全部生效 (兼容旧数据)
                const placement = script.placement || [1, 2];
                if (role === 'user' && !placement.includes(1)) return;
                if (role === 'assistant' && !placement.includes(2)) return;

                // Mode Check
                const userOnly = script.markdownOnly || (!script.markdownOnly && !script.promptOnly);
                if (isDisplay && script.promptOnly) return; // 显示模式下，跳过仅AI可见的正则
                if (isPrompt && userOnly) return; // 发送给AI前，跳过仅用户可见的正则；两项都没勾也按仅用户可见处理

                // Depth Check
                if (script.minDepth !== null && script.minDepth !== undefined && depth < script.minDepth) return;
                if (script.maxDepth !== null && script.maxDepth !== undefined && depth > script.maxDepth) return;

                try {
                    // 兼容外部正则字段：findRegex/regex, replaceString/replacement
                    let regexPattern = script.regex || script.findRegex;
                    let flags = script.flags || script.regexFlags || 'g';
                    const replacement = script.hasOwnProperty('replacement')
                        ? script.replacement
                        : (script.replaceString || '');

                    if (!regexPattern) return;

                    // 解析 /pattern/flags 格式
                    if (regexPattern.startsWith('/') && regexPattern.lastIndexOf('/') > 0) {
                        const lastSlash = regexPattern.lastIndexOf('/');
                        const potentialFlags = regexPattern.substring(lastSlash + 1);
                        // 简单的 flags 验证
                        if (/^[gimsuy]*$/.test(potentialFlags)) {
                            flags = potentialFlags;
                            regexPattern = regexPattern.substring(1, lastSlash);
                        }
                    }

                    ({ pattern: regexPattern, flags } = cardUtils.normalizeRegexModifiers(regexPattern, flags));

                    if (containsCatastrophicQuantifier(regexPattern)) {
                        console.error(`Regex "${script.name || 'Unnamed'}" skipped: pattern contains nested quantifiers that can cause catastrophic backtracking (ReDoS guard).`);
                        return;
                    }

                    const re = new RegExp(regexPattern, flags);

                    // --- Protection Logic Start ---
                    // 只有当正则不包含 < 或 > 且不包含 markdown 代码块标记 (```) 时，才启用 HTML/代码块保护
                    // 如果正则本身就在匹配代码块（如用户提供的 ```json ...```），则不应进行保护
                    // 增强保护：防止普通正则（通常带g）破坏 iframe 渲染内容（HTML文档、Script/Style块）
                    // 特例：'Auto Replace {{user}}' 允许全局替换，包括 iframe 内部
                    if (!/[<>]/.test(regexPattern) && !regexPattern.includes('```') && script.name !== 'Auto Replace {{user}}') {
                        // 匹配 完整的 HTML 文档, Script/Style 块, Markdown 代码块, 行内代码, HTML 标签, 或 <cot> 块
                        // Updated to support <think> and erroneous <cot>...<cot> closing
                        result = cardUtils.transformUnprotectedText(
                            result,
                            part => part.replace(re, replacement)
                        );
                    } else {
                        // 如果正则明确包含 <, > 或 ```，说明用户意图直接操作 HTML 或 Markdown 代码块，因此跳过保护直接替换
                        result = result.replace(re, replacement);
                    }
                    // --- Protection Logic End ---

                } catch (e) {
                    console.error(`Regex error in script "${script.name || 'Unnamed'}":`, e.message);
                }
            });
            return result;
        };
    return { processRegex, containsCatastrophicQuantifier };
}
