// cot-builder — dynamic COT preset content builder (Phase 3.0 / task 1, D6-A)
//
// Ported from upstream assets/js/built-in-content.js (buildCotPresetContent +
// its buildAnalysisTagInstruction dependency). The local app previously seeded a
// static COT preset; task 1 replaces it with this builder so the COT content
// adapts to the live memory / UI-template / model (thinking vs cot tag) state,
// matching upstream behavior (see app.mjs syncCotPresetContent + its watch).
//
// Global contract: exported for contract tests; assigned to globalThis/window as
// RPHCotBuilder for parity with other RPH* module bridges (AGENTS.md §2.1).

const buildAnalysisTagInstruction = (tag, { memoryEnabled = false, uiTemplateEnabled = false } = {}, suffix) => {
    const labels = [
        memoryEnabled ? '[记忆整理]' : '',
        '[情景意图分析]',
        uiTemplateEnabled ? '[变量更新分析]' : '',
        '[设定分析]',
        '[信息边界]',
        '[剧情规划]',
        '[最终检查]'
    ].filter(Boolean).join('/');
    const languageInstruction = String(tag).toLowerCase() === 'thinking' ? '使用中文' : '';
    return `在<${tag}>标签中${languageInstruction}输出包含${labels}的完整的本轮分析，${suffix}`;
};

const buildCotPresetContent = ({
    memoryEnabled = false,
    uiTemplateAnalysisEnabled = false,
    useThinkingOpening = false,
    prefillPhase = 0,
    prefillEnabled = false,
    prefillBaseContent = ''
} = {}) => {
    const analysisTag = useThinkingOpening ? 'thinking' : 'cot';
    const memoryFragmentSection = memoryEnabled ? `
[记忆整理]
只写当前提供的总结记忆、向量记忆或工具结果中已经确认的具体事实，直接落到时间、人物、关系、行动结果、物品状态和未解事件上。例如：“时间点为早晨07:30后，晴人要求新月送樱上学；樱嘴上抗拒，实际在意哥哥的安排，已经做好早饭并穿好校服。”不要复述“识别、还原、代表”等处理步骤，也不要把示例事实当成当前剧情；没有可用内容则不写本段，旧记忆不得当作当前现场。
` : '';
    const uiTemplateAnalysisSection = uiTemplateAnalysisEnabled ? `
[变量更新分析]
逐项检查系统提供的当前变量，只记录本轮确实需要变化的字段、新值和依据。最终变量块按系统格式放在正文结束后。
        ` : '';

    if (prefillPhase) {
        const prefillMemorySection = memoryEnabled
            ? '[记忆整理]\n上条消息本身没有提供可核对的剧情记忆，本轮没有新增记忆事实。'
            : '';
        const prefillVariableSection = uiTemplateAnalysisEnabled
            ? '[变量更新分析]\n这两条预注入消息只是在确认输出流程，没有发生剧情变化，因此没有变量需要更新。'
            : '';
        const prefillSections = [
            prefillMemorySection,
            prefillPhase === 1
                ? '[情景意图分析]\n用户这次没有给剧情，而是要求我先分析续写难点。也就是说，本轮要回答的是“怎样避免写偏”，不是开始编造角色和场景。'
                : '[情景意图分析]\n用户已经把任务从“分析难点”切换成“直接续写”。前面的准备到此结束，下一步应读取后续设定和历史，从最后一个真实事件接着写。',
            prefillVariableSection,
            prefillPhase === 1
                ? '[设定分析]\n当前还没有角色卡、世界书、历史或现场信息，所以没有人物动机可以判断；只能确认后续必须等这些资料出现，不能拿通用人设代替。'
                : '[设定分析]\n真正的角色动机和现场状态要从后续角色卡、世界书、历史和用户输入中确定；现在只能先把“直接续写”作为输出方向，不能提前替角色做决定。',
            prefillPhase === 1
                ? '[信息边界]\n目前唯一确定的事实是用户要求先做困难分析；人物、地点、关系和事件结果都还没有来源，不能把它们写成已经发生。'
                : '[信息边界]\n目前能确定的是用户要求开始续写，具体剧情事实仍要以随后提供的上下文为准；用户没有写出的台词、决定和内心不能被我补出来。',
            prefillPhase === 1
                ? '[剧情规划]\n本轮只需确认几个会直接影响续写的难点：从长上下文找出关键事实、保持角色连续、分清谁知道什么。'
                : '[剧情规划]\n收到后续上下文后，先找出最近一个有效事件，再用对白或行动让局面产生变化。',
            prefillPhase === 1
                ? '[最终检查]\n这次回复应当是对困难的实际判断，不是把规则再抄一遍；不生成虚构正文，保留后续续写需要的上下文。'
                : '[最终检查]\n确认后续正文有明确承接点，没有替用户行动，也没有把准备说明混进剧情；按<writing_style>完成检查后直接续写。'
        ].filter(Boolean);
        const baseContent = String(prefillBaseContent || '')
            .replace(/<(thinking|think|cot)>[\s\S]*?<\/\s*\1\s*>\s*/gi, '')
            .trimStart();
        if (!prefillEnabled) return baseContent;
        return `<${analysisTag}>\n${prefillSections.join('\n\n')}\n</${analysisTag}>\n${baseContent}`;
    }

    const openingInstruction = buildAnalysisTagInstruction(analysisTag, {
        memoryEnabled,
        uiTemplateEnabled: uiTemplateAnalysisEnabled
    }, '只完成必要判断，不在其中试写或复述正文，并严格按以下顺序进行，不得省略任何内容：');
    const closingInstruction = `\n最后输出</${analysisTag}>闭合标签后再进行正式的输出。`;

    return `<thinking_protocol>
${openingInstruction}
${memoryFragmentSection}
[情景意图分析]
整理时间线、历史片段，按正确顺序分析过往事件、关系延续、未解情绪，以及 {{user}} 最新输入里的潜台词、情绪和真实需求；同时判断本轮最有因果作用的角色或事件，不把 {{user}} 默认当成主角或叙事中心。完整承接 {{user}} 已明确给出的言行，不得擅自解释真实意图。
${uiTemplateAnalysisSection}

[设定分析]
结合角色设定、世界观和当前处境，分析角色此刻最合理的动机、边界、反应方式，以及环境会给行动带来的具体影响。

[信息边界]
分别确认各角色此刻掌握的信息及其来源，区分亲历、被告知、合理推断与未知。未在场事件、他人内心、旁白信息、隐藏设定及仅向其他角色展示的内容，未经观察或传递不得知晓；推断只能作为人物判断，不得写成已确认事实，角色之间不得自动共享认知。

[剧情规划]
设置具体有意义的剧情焦点，思考围绕什么角色、群体或事件自然展开；通过何种内容的对白、选择、行动结果或关系反应推进。

[最终检查]
确认人物没有失真或越过认知边界，剧情因果成立。先判断是否应用<nsfw_rules>：当前剧情已经进入或正在明确推进NSFW内容时应用；否则忽略。随后按<writing_style>做最终检查。
${closingInstruction}
</thinking_protocol>`.replace(/\n{3,}/g, '\n\n');
};

export { buildCotPresetContent, buildAnalysisTagInstruction };
