# RP-Hub UI 模板 & 变量分析功能评估与解决方案报告（v3）

> 评估日期：2026-08-04（v3 更新：在 v2 根因分析基础上，补充完整解决方案设计与实施路线图）
> 评估范围：`assets/js/app.js`、`assets/js/ui-template-frame.js`、`assets/js/card-utils.js`、`index.html`、`tests/ui-template-shadow-contract.test.mjs`、示例模板 `assets/character/人情偿还系统_ui_templates.json`
> 测试基线：`npm test` 52 项全部通过（其中 UI 模板渲染契约 8 项）

---

## 1. 功能概述

该 App 的 UI 模板（UI Templates）是一套"角色卡内嵌可交互 HTML + AI 变量分析"系统：

1. **UI 模板**：角色卡可携带"状态面板" HTML（含 CSS/JS），通过 `{{变量}}` 占位符注入动态数据，随 AI 回复渲染在消息顶部/底部，形成游戏化 HUD。
2. **变量分析**：每轮 AI 回复后（或手动触发），用大模型阅读最近对话，更新模板变量 JSON，前端重新渲染。
3. **辅助能力**：变量说明 schema、变量注入上下文、变更日志 changeLog、全局模板按角色隔离运行时、导入/导出。

两种分析模式：

| 模式 | 机制 | 实测效果 |
|---|---|---|
| 主模型分析 | 正文生成时注入隐藏指令，模型在回复末尾追加 `<ui_template_updates>{...}</ui_template_updates>` 隐藏 JSON 块 | **往往没效果**（§4.1） |
| 副模型分析 | 正文生成后，对每个启用模板各发一次独立请求（最近 4~10 轮对话） | 有效果，但**不稳定且成本高**（§4.2） |

**共同短板：分析失败/无结果后不自动重试，也无可靠兜底（§4.3）。**

---

## 2. 功能拆解与代码位置

### 2.1 数据模型与归一化（app.js）
- `normalizeUiTemplate` L2879、`inferInitialUiTemplateState` L2857、`sanitizeUiTemplateImportEntry` L2909。
- 双作用域：角色卡内嵌（character）+ 全局 `global_ui_templates`（L1278/L2515）；`currentUiTemplates` L2935 合并排序。

### 2.2 模板渲染引擎（app.js L2933~3100）
- `renderUiTemplateString` L3060（`{{path}}` 替换 + HTML 转义）、`renderUiTemplateEachBlocks` L3070（`#each`，上限 50 层）、路径解析/写入（L2945~3022）。

### 2.3 渲染链路（ui-template-frame.js + index.html）
- `renderUiTemplateHtml` L3361 → `msg.uiTemplateBlocks.{top,bottom}`（L3567）；index.html L711~780 `<ui-template-frame>` Shadow DOM 渲染；`ui-template-frame.js` 负责模板拆分/脚本执行/事件委托/旧 iframe 兼容。

### 2.4 变量分析
- 主模型：`buildMainModelUiTemplateUpdatePrompt` L3409 → `insertUserMessageAtDepth(..., 1)` L6034 → `applyMainModelUiTemplateUpdates` L3508。
- 副模型：`updateUiTemplatesFromChat` L4975（并发 `Promise.all` L5082，每模板一次请求，temperature 0.7 L5095）。
- 上下文注入：`buildUiTemplateContextSystemPrompt` L3617（仅副模型模式）。

### 2.5 变更历史与状态回放
- `applyUiTemplateUpdateListToTemplate` L3468（changeLog 上限 50）；`buildUiTemplateStateAtTurn` L3593；`runtimeByCharacter` L3712/3726。

### 2.6 管理/导入导出
- CRUD L9334~9484；导出 L11735 / `card-utils.js` L309/L382；导入 L10256~10264。

---

## 3. 优点评估（保留）

1. 双模式设计合理；2. 兼容性工程扎实（多来源导入、4+ 返回形态归一化、旧 iframe 兼容、JSON 容错解析）；3. 竞态控制完善（AbortController + seq + 状态机）；4. 数据可追溯（changeLog from/to/轮次/原因）；5. Shadow DOM 渲染改造方向正确；6. 变量替换统一 HTML 转义；7. 52 项测试通过 + 设计文档。

---

## 4. 实测反馈专项分析（v2 结论，摘要）

### 4.1 主模型分析"往往没效果"根因链
1. **面板渲染强绑定主模型输出格式**：`attachUiTemplateBlocksToLastAssistant` 仅 3 个调用点（L3530/L3554/L5171）。主模型未返回块（L3512~3516）或解析失败（L3522~3526）时直接 return，**不渲染任何模板块** → 该条消息连当前状态面板都消失。
2. **指令以 user role 注入对话中部**（L5920~5943 + L6034）：遵循度低；reasoning 模型易把块写进思考、流式截断易丢块。
3. **无兜底**：未返回块 → skipped；"立即分析"按钮只在副模型模式显示（index.html L2322）；注入 payload 大（全量变量 + schema）。

### 4.2 副模型"不稳定、不高效"根因
- 不稳定：temperature 0.7 + 无 `response_format`/`json_schema`；变量 key 无白名单校验（可写垃圾字段）；`normalizeUiTemplateUpdates` L5043 兜底分支误判（带额外字段对象被当变量映射）；单次失败即失败；无超时。
- 不高效：N 模板 = N 次并发请求、每轮都发；每请求重复携带 4~10 层对话 + 变量 + schema（示例 schema 巨大）；无合并、无并发上限；分析模型空时静默回退主模型（L5023）。

### 4.3 "失效不重试"根因
- 全代码无模板分析重试（`retry`/`重试` 仅在聊天存储/记忆补录）；副模型 catch 即失败（L5145~5152）；失败模板被 `excludeTemplateIds` 移出面板（L5171）；主模型失败无降级；下一轮触发的是新分析而非重试。

---

## 5. 其它问题与风险（保留）

### P1
1. Shadow DOM 非沙箱：模板 JS 主世界执行（可访问 localStorage/fetch），导入不可信卡 = 代码执行，无风险提示。
2. 模板定时器/观察者泄漏：`setInterval`/`MutationObserver` 在组件卸载/重建时不清理。
3. `updateMode` 死字段：持久化但从未读取。

### P2
4. 主模型模式下正文生成看不到变量状态（上下文注入仅副模型模式）。
5. 历史消息模板块是渲染快照（只刷新最新一条）。
6. 分析/注入无 token 预算控制。

### P3
7. 模板列表无拖拽排序 UI；无状态回放 UI。
8. 约 800+ 行逻辑集中在 633KB app.js setup 闭包，无运行时单测。
9. 错误处理多为 console.warn，toast 截断失败原因。

---

## 6. 测试情况

- `npm test` 52/52 通过；UI 模板契约 8 项。
- 缺口：无运行时单测；无针对"块缺失/畸形、返回形态误判、失败重试"的测试；真机验证未纳入 CI。

---

## 7. 解决方案设计（v3 新增，重点）

### 7.1 设计原则

1. **"面板渲染"与"变量更新"彻底解耦**：分析失败绝不等于 UI 消失；面板永远用"当前已知状态"渲染。
2. **单条链路高可靠 > 双链路低可靠**：主模型模式保留但加降级兜底；副模型模式作为主模型的失败兜底与手动入口。
3. **结构化输出用协议约束而不是 prompt 约定**：能上 `response_format`/`json_schema` 就上；变量写入必须过白名单。
4. **先修正确性/稳定性，再优化成本**：渲染解耦与重试先行，合并请求/降频后置。
5. **改动尽量复用现有函数**（`normalizeUiTemplateUpdateList`、`applyUiTemplateUpdateListToTemplate`、`attachUiTemplateBlocksToLastAssistant`），降低回归风险。

### 7.2 修复清单总览

| # | 修复项 | 对应问题 | 改动位置 | 优先级 |
|---|---|---|---|---|
| A1 | 主模型路径始终渲染面板（失败不消失） | §4.1-1 | app.js `applyMainModelUiTemplateUpdates` | P0 |
| A2 | 副模型路径不排除失败模板（渲染旧状态） | §4.3 | app.js L5171 | P0 |
| B1 | 更新指令改插到对话末尾（system 提示 + 最后 user 之后） | §4.1-2 | app.js `insertUserMessageAtDepth`/`buildMainModelUiTemplateUpdatePrompt` | P1 |
| B2 | 主模型失败自动降级副模型 + 手动入口 | §4.1-3 / §4.3 | app.js L6626 + index.html L2319 | P0 |
| C1 | 副模型请求加 `response_format`/低 temperature/max_tokens | §4.2 | app.js L5087~5130 | P1 |
| C2 | 变量 key 白名单 + 类型校验 | §4.2 | app.js `applyUiTemplateUpdateListToTemplate` | P0 |
| C3 | 修复 `normalizeUiTemplateUpdates` 兜底误判 | §4.2 | app.js L5043~5068 | P0 |
| D1 | 合并为单次请求返回多模板更新（可选） | §4.2 效率 | app.js `updateUiTemplatesFromChat` | P2 |
| D2 | 逐模板模式加并发上限 + 分析模型必填 | §4.2 效率 | app.js `updateUiTemplatesFromChat` | P2 |
| E1 | 失败重试 1~2 次（指数退避） | §4.3 | app.js `updateUiTemplatesFromChat` | P1 |
| E2 | fetch 加超时（AbortSignal.timeout） | §4.2 | app.js 分析请求 | P1 |
| F1 | 消息操作栏"重试变量分析"按钮 | §4.3 | index.html + app.js | P1 |
| G1 | 模板定时器/观察者清理 | §5-P1-2 | ui-template-frame.js | P1 |
| G2 | 模板脚本风险提示 | §5-P1-1 | 导入流程 + 模板列表 | P1 |
| H1 | 抽 `ui-template-engine` 模块 + 运行时单测 | §5-P3-8 | 新文件 + tests | P2 |

### 7.3 修复 A：面板渲染与变量更新解耦（P0，必须先做）

**A1 主模型路径**：重构 `applyMainModelUiTemplateUpdates`（L3508~3565），让所有提前 return 都先渲染面板。

```js
const applyMainModelUiTemplateUpdates = (targetMessage, model = settings.model) => {
    if (!settings.uiTemplateEnabled || !settings.uiTemplateMainModelAnalysis || !targetMessage) {
        return { handled: false, changed: false };
    }
    // ① 先渲染面板（用当前 variableState，失败也不消失）
    attachUiTemplateBlocksToLastAssistant({ targetMessageId: targetMessage.id });

    const match = String(targetMessage.content || '').match(UI_TEMPLATE_UPDATES_PATTERN);
    if (!match) {
        markUiTemplateStatus('skipped', '主模型未返回变量块', 0, targetMessage.id || null);
        return { handled: false, changed: false, needsFallback: true }; // ② 标记需要降级
    }
    targetMessage.content = stripUiTemplateUpdateBlock(targetMessage.content);
    let updates;
    try {
        updates = normalizeUiTemplateUpdateList(parseUiTemplateUpdateJson(match[1]));
    } catch (e) {
        markUiTemplateStatus('error', '变量分析失败', 0, targetMessage.id || null);
        console.warn('[UI模板] 主模型变量块解析失败:', e.message, match[1]);
        return { handled: true, changed: false, needsFallback: true };
    }
    // ... 原有 apply 逻辑（L3529~3564 保持不变，但去掉重复的 attach 调用）
};
```

要点：
- 把 L3530/L3554 的 `attachUiTemplateBlocksToLastAssistant` 上移合并到函数开头；
- 返回值增加 `needsFallback` 标志，调用方（L6626）据此决定是否自动降级（见 B2）。

**A2 副模型路径**：L5171 改为**不排除失败模板**（渲染旧状态），仅对"成功且 hasChanges"的模板做块刷新；失败的模板也渲染（旧 variableState）。

```js
// 旧：const inserted = attachUiTemplateBlocksToLastAssistant({ excludeTemplateIds: failedTemplateIds, targetMessageId: lockedTargetMessageId });
// 新：失败模板用当前状态渲染，仅提示"部分模板更新失败"
const inserted = attachUiTemplateBlocksToLastAssistant({ targetMessageId: lockedTargetMessageId });
```

### 7.4 修复 B：主模型遵循度与降级（P0/P1）

**B1 指令位置与措辞**：
- 新增 `appendUiTemplateInstruction(messages)`：在 `finalMessages` 末尾（最后一条 user 消息之后）追加一条 `role: 'user'` 的简短指令，替代 `insertUserMessageAtDepth(..., 1)` 的中部插入；或追加 `role: 'system'`（与 L6053~6062 `assistant_top` 的"Instructions for next message"风格一致）。
- 指令措辞加强："如无变化也必须输出 `{OPEN}{"updates":[]}{CLOSE}`；该块不是正文内容，不要写进思考过程；不要用 markdown 围栏包裹标签（解析端已兼容围栏，但避免截断）。"
- 对 reasoning 模型在系统提示里追加一行"隐藏的 `<ui_template_updates>` 块必须出现在最终正文末尾，而不是思考中"。

**B2 自动降级 + 手动入口**：
- L6626 调用处：若 `applyMainModelUiTemplateUpdates` 返回 `needsFallback` 且副模型可用（`settings.uiTemplateModel` 或回退模型存在），则 `nextTick(() => updateUiTemplatesFromChat({ manual: true, targetMessageId }))`，并把状态文案改为"主模型未返回变量块，已转副模型分析"。
- 若副模型不可用：状态显示"主模型未返回变量块"，并在设置面板给出提示。
- index.html L2319~2327：去掉 `settings.uiTemplateMainModelAnalysis ? 'invisible ...'` 隐藏逻辑，改为**任何模式都显示"立即分析"**（主模型模式下点击 = 手动触发副模型分析，与 B2 降级共用 `updateUiTemplatesFromChat({ manual: true })`）。按钮文案按模式区分："立即分析（副模型）"。

### 7.5 修复 C：副模型稳定性（P0/P1）

**C2 变量 key 白名单（P0，防垃圾字段）**：在 `applyUiTemplateUpdateListToTemplate`（L3468）应用前增加校验：

```js
const isAllowedUiTemplateKey = (template, key) => {
    if (key === '$root') return true;
    const known = new Set([
        ...Object.keys(template.variableState || {}),
        ...Object.keys(template.initialVariableState || {}),
    ]);
    // schema 可能是对象或字符串；对象时收集其顶层字段
    if (template.variableSchema && typeof template.variableSchema === 'object') {
        Object.keys(template.variableSchema).forEach(k => known.add(k));
    }
    return known.has(String(key).split('.')[0]);
};
```

- 拒绝未声明的新顶层 key（记录到 `changeLog` 的 `rejected` 字段或 console.warn，不写入）；
- 对值做类型校验：若旧值为 number/array/object，新值类型不匹配则拒绝（或提示）。

**C3 修复 `normalizeUiTemplateUpdates` 兜底误判（P0）**：L5063~5068 收紧为"严格形态"：

```js
// 仅当 parsed 恰好只含 variables/reason/id 时按 {variables, reason} 处理；
// 含其它 key 视为解析失败（抛错），而不是把整个对象当变量映射
const looksLikeLegacyVariables = Object.prototype.hasOwnProperty.call(parsed, 'variables')
    && parsedKeys.every(key => ['id', 'variables', 'reason'].includes(key));
if (!looksLikeLegacyVariables && !Array.isArray(parsed) && !Array.isArray(parsed.updates)) {
    throw new Error('不支持的返回形态: ' + parsedKeys.join(','));
}
```

**C1 请求参数（P1）**：L5087~5130 的 body 增加：

```js
body: JSON.stringify({
    model,
    temperature: 0.2,                       // 0.7 → 0.2，结构化输出更稳
    max_tokens: 4096,                       // 防超长截断（丢结束标签）
    ...(settings.uiTemplateJsonMode !== false ? { response_format: { type: 'json_object' } } : {}),
    stream: false,
    messages: [/* ... */]
})
```

- `response_format` 加一个设置开关 `uiTemplateJsonMode`（默认开），兼容不支持该参数的端点；不支持时靠现有容错解析兜底。
- 副模型 prompt（L5101~5118）末尾追加："只返回 JSON，不要输出任何解释、markdown 围栏或额外字段。"

### 7.6 修复 D：副模型效率（P2）

**D1 合并请求（推荐）**：`updateUiTemplatesFromChat` 增加合并模式（设置 `uiTemplateBatchMode`，默认开）：
- 一次请求，system prompt 列出**所有启用模板**：`[{id, name, currentVariables, variableSchema}]`；
- 要求返回 `{"updates":[{"id":"模板id","variables":{...},"reason":"..."}]}`（与主模型格式一致，直接复用 `normalizeUiTemplateUpdateList` L3460 + `applyUiTemplateUpdateListToTemplate` L3468）；
- 模板数 > 阈值（如 5）或总 payload 超限（如 200KB）时自动回退逐模板模式；
- 收益：N 次请求 → 1 次；共享一份最近对话上下文；tokens 显著下降。

**D2 逐模板模式的并发与模型**：
- 加并发上限（如 3）：用简易信号量替代 `Promise.all(templates.map(...))`；
- `settings.uiTemplateModel` 为空时不再静默回退主模型：改为 toast 提示"请配置分析模型"并 `markUiTemplateStatus('skipped', '未配置分析模型')`（或保留回退但明确在状态里标注"回退主模型"）；
- 可选：设置"分析频率"（每 N 轮一次，默认 1），高成本模板降频。

### 7.7 修复 E：重试与超时（P1）

**E1 重试**：`updateUiTemplatesFromChat` 内把单次 fetch 包成 `fetchUiTemplateUpdates(template, signal, attempt)`：
- 失败重试 1~2 次，退避 500ms / 1500ms（仅对网络/5xx/429 重试；4xx 语法错误不重试）；
- 重试前 `await yieldToUi()`，并更新 `uiTemplateUpdateStatus.message = '重试中 (n/2)'`。

**E2 超时**：分析请求 signal 用 `AbortSignal.any([updateRun.signal, AbortSignal.timeout(60000)])`（Node/现代 WebView 支持；不支持则手动 setTimeout + abort）。超时计入失败并提示"分析超时"。

### 7.8 修复 F：消息操作栏"重试变量分析"按钮（P1）

- index.html 消息操作栏（L785 附近）新增按钮，条件：`msg.role === 'assistant' && msg.uiTemplateBlocks && uiTemplateUpdateStatus.state !== 'running'`；
- 点击调用 `updateUiTemplatesFromChat({ manual: true, targetMessageId: msg.id })`（现有函数已支持指定 targetMessageId，L4994~5004）；
- 该按钮同时解决"主模型模式失败后无入口"和"历史消息手动刷新"两个问题。

### 7.9 修复 G：安全与资源（P1）

**G1 定时器清理（ui-template-frame.js）**：在 `runUiTemplateScripts` 的 `shimWindow` 上包装：

```js
const createdTimers = new Set();
const shimWindow = new Proxy(window, {
    get(target, prop) {
        if (prop === 'setInterval' || prop === 'setTimeout') {
            return (fn, ms, ...args) => {
                const id = target[prop](fn, ms, ...args);
                createdTimers.add(id);
                return id;
            };
        }
        if (prop === 'clearInterval' || prop === 'clearTimeout') {
            return (id) => { createdTimers.delete(id); return target[prop](id); };
        }
        // ... 原有逻辑
    }
});
// MutationObserver：包一层，实例记录到 shadowRoot 关联的清理列表
```

- 在 `UiTemplateFrame.beforeUnmount` / `renderShadow` 重建前统一 `clearInterval/clearTimeout` 全部 id、disconnect 所有 observer。

**G2 脚本风险提示**：导入/启用模板时检测 `htmlTemplate` 是否含 `<script` / `onclick=` 等事件属性；是则在模板列表显示"含脚本"徽标，并在导入确认弹窗提示"模板含可执行脚本，仅导入你信任的模板"。

### 7.10 修复 H：工程化与测试（P2）

- 把纯函数（`normalizeUiTemplate`、`renderUiTemplateString`、`renderUiTemplateEachBlocks`、`get/setUiTemplateValue`、`splitUiTemplatePath`、`parseUiTemplateUpdateJson`、`normalizeUiTemplateUpdateList`、`applyUiTemplateUpdateListToTemplate`、`isAllowedUiTemplateKey`）抽到 `assets/js/ui-template-engine.js`（挂 `window.RPHUiTemplateEngine`，app.js 复用），保证行为不变（现有契约测试断言仍可满足）。
- 新增运行时单测 `tests/ui-template-engine.test.mjs`，覆盖：
  1. `renderUiTemplateString`：基本替换 / HTML 转义 / `#each` + `else` / 别名 / `../` / `@index` / 缺失变量显示空；
  2. `setUiTemplateValue`：点路径 / 括号路径 / 自动建数组对象 / `$root`；
  3. `parseUiTemplateUpdateJson`：纯 JSON / 围栏 / 前后缀截取 / 非法输入抛错；
  4. `normalizeUiTemplateUpdateList`：数组 / `{updates:[...]}` / `{variables,reason}` / **带额外字段对象应抛错（修复 C3 的回归测试）**；
  5. `applyUiTemplateUpdateListToTemplate`：JSON 比对去重 / changeLog 上限 50 / **未知 key 拒绝（修复 C2）** / 类型不匹配拒绝；
  6. `isAllowedUiTemplateKey`：state / schema / 子路径前缀。
- 契约测试补充：`applyMainModelUiTemplateUpdates` 所有提前 return 前必调 `attachUiTemplateBlocksToLastAssistant`（正则断言）；副模型路径不再 `excludeTemplateIds`。

### 7.11 实施路线图

| 阶段 | 内容 | 预期效果 | 回归风险 |
|---|---|---|---|
| **Phase 1（立即可做，改动小）** | A1+A2 渲染解耦、F1 手动重试按钮、E2 超时 | 主模型失败不再"面板消失"；用户可手动补救 | 低（只改 return 顺序与一个按钮） |
| **Phase 2（稳定性）** | C2 白名单、C3 normalize 修复、C1 请求参数、E1 重试、B2 降级 | 变量不写垃圾字段、格式更稳、失败自动降级 | 中（白名单可能拒绝既有模板的合法新字段，需先做 schema 覆盖测试） |
| **Phase 3（效率）** | D1 合并请求、D2 并发上限与模型必填 | 每轮 N 次请求 → 1 次，成本大幅下降 | 中（合并后单点失败影响所有模板，需按模板粒度隔离错误） |
| **Phase 4（工程/安全）** | H1 抽模块+单测、G1 定时器清理、G2 脚本提示、updateMode 清理 | 可测试性、资源与安全 | 中（重构需保住 52 项契约测试 + 新增单测） |

### 7.12 实施记录（v3.1，本轮已完成）

本轮已按 Phase 1 + 部分 Phase 2 落地以下改动（2026-08-04，全部通过 `node --check` 与 `npm test` 52/52）：

| 计划项 | 状态 | 具体改动 |
|---|---|---|
| A1 主模型路径始终渲染面板 | ✅ | `applyMainModelUiTemplateUpdates`（app.js ~L3550）：函数开头先 `attachUiTemplateBlocksToLastAssistant({ targetMessageId })`，未返回块/解析失败也保留面板；返回 `needsFallback` 标记 |
| A2 副模型失败不隐藏面板 | ✅ | `updateUiTemplatesFromChat`（app.js ~L5260）：`attachUiTemplateBlocksToLastAssistant` 不再 `excludeTemplateIds`，失败模板以旧状态渲染 |
| B2 主模型失败自动降级 | ✅ | 生成完成处（app.js ~L6715）：`applyMainModelUiTemplateUpdates` 返回 `needsFallback` 时 `nextTick` 自动触发 `updateUiTemplatesFromChat({ manual: true, targetMessageId })` 副模型兜底 |
| C1 副模型请求参数 | ✅（部分） | temperature 0.7→0.2、新增 `max_tokens: 4096`（app.js ~L5200）；`response_format` 未启用（需端点兼容开关，留后续） |
| C2 变量 key 白名单 | ✅ | 新增 `isAllowedUiTemplateKey`（app.js ~L3483）+ `applyUiTemplateUpdateListToTemplate` 内校验；已知字段为空时不拦截（避免新模板无法初始化）；拒绝的 key console.warn 并在状态里统计"拒绝 N 项未定义变量" |
| C3 返回形态误判修复 | ✅ | `normalizeUiTemplateUpdates`（副模型，app.js ~L5106）与 `normalizeUiTemplateUpdateList`（主模型，app.js ~L3460）重写：带额外字段的对象不再被整个当作变量映射，只保留 id/name/variables/reason |
| E1 失败重试 | ✅ | `UI_TEMPLATE_ANALYSIS_MAX_ATTEMPTS=2`：网络错误/429/5xx/超时（AbortError）自动重试 1 次，退避 800ms，状态提示"重试中 (n/2)"（app.js ~L4975 起新增辅助函数 + ~L5189 循环） |
| E2 请求超时 | ✅ | `createUiTemplateRequestSignal`：`AbortSignal.any([run.signal, AbortSignal.timeout(60000)])`，不支持时静默降级无超时（app.js ~L4987） |
| F1 消息级"重试变量分析"按钮 | ✅ | index.html 消息操作栏（~L818）：assistant 消息且有模板面板、非运行中时显示，点击 `updateUiTemplatesFromChat({ manual: true, targetMessageId: msg.id })`，可手动补做/刷新任意消息的分析 |

**未做（留待后续轮次）**：D1 合并请求（多模板一次调用）、D2 并发上限/分析模型必填校验、B1 指令注入位置调整、C1 的 `response_format` 开关、G1 定时器清理、G2 模板脚本风险提示、H1 抽模块+运行时单测、`updateMode` 清理。

**验证**：`node --check assets/js/app.js` 通过；`npm test` 52/52 通过（含 8 项 UI 模板契约测试）；改动文件：`assets/js/app.js`（+190/-88）、`index.html`（+8）。

**回归风险提示**：C2 白名单在"模板无任何已知字段"时放行，不会阻塞新模板初始化；但若某模板的 AI 更新确实需要新增未在 schema/初始状态中声明的字段，会被拒绝（console.warn 可见）。如遇此情况，先在模板"变量 JSON / 变量说明"里补上该字段即可。

**关键验收标准（Phase 1 后）**：
1. 主模型模式下模型不返回块时，消息**仍显示**当前状态面板 + 状态"未返回变量块" + 可点击"重试变量分析"；
2. 副模型模式下单个模板失败，该模板面板**仍显示**旧状态，其它模板正常；
3. 手动/自动重试后变量正确更新，changeLog 正确记录。

---

## 8. 结论

功能完整度、兼容性、竞态控制、数据追溯扎实，Shadow DOM 渲染改造方向正确。**实测三大问题指向同一设计缺口：分析链路"高要求、低兜底、零重试"，且面板渲染被绑定在分析结果上**。

解决方案的核心思路：**先把"渲染"与"更新"解耦（Phase 1，改动小、见效快），再用协议约束 + 白名单 + 重试/降级提升稳定性（Phase 2），最后用合并请求优化成本（Phase 3），并同步推进工程化与安全（Phase 4）**。按此路线落地后，可预期：主模型模式失败不再表现为"没效果/面板消失"，副模型模式稳定性和性价比显著提升，失败路径都有兜底与手动补救入口。

