# Roleplay Hub App — API 连接与服务功能审阅报告

- 审阅对象: `D:\AI\RP-Hub` (Roleplay Hub, Capacitor + Vue3 打包的 Android App, 包名 `com.roleplayhub.app`)
- 审阅日期: 2026-08-04 (v2: 按用户反馈更新——生图可用性暂不处理, 新增"记忆系统与多供应商并存"专题)
- 审阅范围: API 配置/连接检测、聊天服务、**记忆系统与多供应商并存(本期重点)**、生图服务(仅记录, 不评估可用性)、社区服务、安全与平台约束
- 主要代码: `assets/js/app.js`(638KB)、`assets/js/request-diagnostics.js`、`assets/js/storage-repository.js`、`android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java`、`capacitor.config.json`、`android/app/src/main/AndroidManifest.xml`

> 说明:
> 1. 已核对 `assets/` 与 `dist/`(打包产物)中的 `app.js` 与 `index.html` SHA-256 完全一致, 本报告基于实际装机运行的代码。
> 2. **本期范围**: 用户明确"生图功能暂时不处理", 因此第 6 节生图服务仅作结构记录, 不评估其可用性、不纳入优先级清单。

---

## 1. 服务架构总览

本 App 是"本地前端 + 远端 AI 服务"模型: 所有业务逻辑在本地 WebView 运行, 通过 HTTPS 直连多家第三方服务。

| # | 服务 | 端点 | 用途 | 认证方式 | 本期状态 |
|---|------|------|------|----------|----------|
| 1 | 聊天服务 | `POST {apiUrl}/v1/chat/completions` | 角色扮演对话(流式 SSE) | `Authorization: Bearer <apiKey>` | 审阅 |
| 2 | 模型列表 | `GET {apiUrl}/v1/models` | 拉取可选模型 | Bearer | 审阅 |
| 3 | 向量嵌入 | `POST {apiUrl}/v1/embeddings` | 记忆系统向量化 | Bearer | **专题: 多供应商** |
| 4 | 经典记忆总结 | `POST {apiUrl}/v1/chat/completions` (stream=false) | 逐轮记忆压缩 | Bearer | **专题: 多供应商** |
| 5 | UI 模板变量分析 | `POST {apiUrl}/v1/chat/completions` (每模板并发) | 模板变量自动填充 | Bearer | 审阅 |
| 6 | 生图服务 | `https://nai.sta1n.cn/generate?tag=...&token=...` | NAI 风格图片生成 | token 拼在 URL | **本期不处理** |
| 7 | 生图配额 | `POST https://nai.sta1n.cn/api/api/getUser` | 查询剩余次数 | `toUserId=imageGenKey` | **本期不处理** |
| 8 | 生图连通性 | `HEAD https://nai.sta1n.cn` | 状态灯检测 | 无 | **本期不处理** |
| 9 | 万相广场 | `https://rphforum.zeabur.app/` (iframe) | 在线社区 | 无(匿名) | 审阅 |

内置 4 个 API 供应商: STA1N(`cdn.sta1n.cn`)、DeepSeek、OpenRouter、SiliconFlow, 另支持自定义 URL(最多 2 个自定义项)。

---

## 2. API 配置与连接检测

### 2.1 现状(做得好的)
- **状态灯 + 延迟**: 设置页显示"API 接口"和"生图服务"两个状态点, `checkApiStatus()` 通过 `GET /models` 携带 Bearer 校验, 10 秒超时(`AbortController`), 显示连接延迟(ms)。`app.js:4700-4736`
- **Key 输入同步**: `syncApiKeyInput()` 保证从输入框实时读取 Key, 避免 v-model 延迟导致拿到旧值; 有对应契约测试(`tests/api-key-input-contract.test.mjs`)。
- **自动拉取模型**: 启动时 `autoFetchModels=true` 自动调用 `GET /models` 填充模型选择器。
- **供应商切换**: 内置供应商/自定义 URL 切换时有 Key 记忆(`apiProviderKeys`)、URL 回填逻辑。

### 2.2 发现的问题

**[P1] 生图服务状态检测是"假阳性"** — `app.js:4738-4746`(因本期不处理生图, 仅记录)
```js
const checkImageGenStatus = async () => {
    await checkConnectionStatus(imageGenStatus, imageGenLatency, 'Image API', signal => (
        fetch(IMAGE_GEN_BASE_URL, { method: 'HEAD', mode: 'no-cors', signal })
    ), () => true);   // ← isConnected 恒为 true
};
```
- `no-cors` 的 opaque 响应读不到状态, `isConnected` 又写死为 `() => true`, 只要 fetch 不抛网络层异常就显示"已连接"——红灯几乎不可能出现。
- **本期不处理**, 待生图功能重新纳入范围时再修。

**[P2] API URL 归一化逻辑不一致(尾斜杠 Bug)** — `app.js:4640-4642` vs `app.js:6843-6846`
```js
// getApiEndpoint (聊天/模型/UI模板 用)
const getApiEndpoint = (path) => settings.apiUrl.endsWith('/v1')
    ? `${settings.apiUrl}/${path}`
    : `${settings.apiUrl}/v1/${path}`;

// getOpenAICompatUrl (记忆 Embedding/总结 用)
const getOpenAICompatUrl = (endpoint) => {
    const baseUrl = (settings.apiUrl || '').replace(/\/+$/, '');   // ← 先去掉尾斜杠
    ...
};
```
- 若设置里填了带尾斜杠的地址(如 `https://api.deepseek.com/v1/`), `getApiEndpoint` 会拼出 `.../v1//v1/chat/completions`(双重 `/v1/`), 聊天直接失败; 而 Embedding/记忆总结走 `getOpenAICompatUrl` 却能正常。
- **做多供应商改造时应统一为一个 URL 归一化函数**, 否则不同服务族行为不一致。

**[P2] 明文 HTTP 地址无提示** — AndroidManifest 未开启 cleartext, `allowMixedContent: false`。用户填 `http://` 地址时 Android 9+ 直接拦截, 报错模糊, 难以定位。

**[P3] 依赖远端 CORS, 无代理兜底** — WebView origin 是 `https://localhost`, fetch 受 CORS 约束, 目标 API 未开放 CORS 则必然失败, App 无代理/降级方案。

---

### 2.3 API Key 输入框无法粘贴(根因与方案)
- **现象**: API Key 输入框无法粘贴, 也调不出输入法(Gboard)的剪贴板。
- **根因**:
  1. 输入框是 `type="password"`(index.html:1862)——Android Gboard 出于安全策略, 在密码类输入框**默认隐藏剪贴板图标与剪贴板建议**, "调不出输入法剪贴板"其实是系统行为; 长按粘贴在 WebView 密码框也不可靠。
  2. `captureInput: false`(capacitor.config.json)**不是**粘贴问题的原因: 它让 `onCreateInputConnection` 走系统默认(`CapacitorWebView.java:38-45`), 是修复中文输入法的正确配置, 与粘贴无关。
- **方案(已实施, 2026-08-04)**:
  1. 输入框增加"显示/隐藏"切换(eye 按钮): 切到 `type="text"` 后 Gboard 剪贴板/长按粘贴即可用;
  2. 增加"粘贴"按钮: 读系统剪贴板写入输入框——在 `NativeStoragePlugin` 新增 `clipboardRead()`(ClipboardManager, 读剪贴板无需权限、无需新依赖), WebView 侧调用后写入 `settings.apiKey`;
  3. 输入框补 `autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"`, 避免英文纠错/自动大写干扰。
- 实施明细: `NativeStoragePlugin` 新增 `clipboardRead()`(ClipboardManager, 免权限); API Key 输入框加「显示/隐藏」eye 切换 + 「粘贴」按钮 + `autocomplete/autocapitalize/autocorrect/spellcheck` 关闭; 已真机验证 `window.Capacitor.Plugins.NativeStorage.clipboardRead` 可调用、App 正常启动无错误。修复一个竞态: 粘贴后立即同步写入 DOM 输入框值, 避免随后 blur 把空值读回覆盖; 真机实测点击「粘贴」后输入框确实填入剪贴板内容。
- 生图 Key(`imageGenKey`)输入框同问题, 待生图功能重新纳入范围时一并处理。
## 3. 聊天服务(核心链路)

### 3.1 现状(做得好的)
- **请求构建**: 组装 system(角色卡/预设/世界书/记忆/CoT) + 历史消息, 支持 `temperature`、`stream`、`stream_options.include_usage`。
- **流式解析**: `fetch + ReadableStream + TextDecoder` 逐行解析 SSE, 支持 `data: [DONE]`, 正确拆分 `content` 与原生 `reasoning`(thinking), 50ms 节流刷新 UI。
- **双路径兼容**: `stream=false` 时若服务端仍返回 SSE 文本, 会自动降级手动解析。
- **用户中断**: `AbortController.abort()`, 已生成内容保留并追加"*-- 生成已中断 --*", 无内容则回退为系统提示。
- **错误呈现**: 非 2xx 时递归提取 `error.message`/`error.detail`, 以系统消息写进聊天, 不抛出原始堆栈。
- **可观测性**: `RPHRequestDiagnostics` 记录最近 10 次请求(端点、模型、状态、首包/首 token 时延、字节数、payload 哈希), 存 sessionStorage; `recordApiUsage` 供"用量统计"页使用。
- **工具续写**: 支持工具调用(active tool)续写、多轮工具链。

### 3.2 发现的问题
- **[P1] 主聊天请求无超时** — 只有状态检测 10s、UI 模板分析 60s 超时, 主聊天 fetch 无超时; API 挂起则无限"生成中", 只能手动停止。
- **[P1] 主聊天无自动重试** — 存储(3 次)和 UI 模板分析(2 次)有重试, 主聊天没有; 瞬时抖动/5xx/429 直接失败且失败消息会进聊天历史污染上下文。
- **[P2] 错误信息原样写入聊天历史** — `error.message` 作为 system 消息持久化, 之后会作为上下文再发给模型。
- **[P3] 429/限流无特殊处理**, 无退避/提示。
- **[P3] UI 模板分析并发无节流** — 每模板一个请求, 模板多时可能打爆限流。

---

## 4. 记忆系统服务 + 多供应商并存(本期专题)

### 4.1 用户场景与诉求
聊天用 **DeepSeek**(无 embedding 端点/模型), 记忆系统就只能选**经典模式**(用 chat/completions 做逐轮总结), 无法用**向量模式**(需要 embedding 模型)。
原因是整个 App 同一时刻只有一个"激活供应商", 向量/经典记忆都写死使用这个激活供应商。用户希望: **同时保存更多提供商的 API**, 让聊天与记忆(尤其向量 embedding)可以各用各的供应商。 另外, 还有一个更彻底的思路: **向量化改在手机本地完成(方案 C)**, 连第二个 API Key 都不用。

### 4.2 现状(代码事实)

**全局单一激活供应商**
- `settings.apiUrl` + `settings.apiKey` 是唯一的"当前激活"配置; 切换供应商(`selectApiProvider`, `app.js:868-880`)直接替换这两个字段。
- 但凭证本身已经按供应商**分开持久化**: `settings.apiProviderKeys` 是 `{providerId: key}` 映射(`app.js:728`), 覆盖 sta1n/deepseek/openrouter/siliconflow + custom/custom2; 自定义 URL 存在 `settings.customApiUrl` / `customApiUrl2`。`normalizeApiProviderSettings()`(`app.js:830-865`)会补齐每个供应商的 key 字段。
- 也就是说: **"保存多套 API 凭证"的能力其实已经存在**, 缺的是"把某个服务绑定到非激活供应商"的运行时机制。

**记忆服务写死用激活供应商**
- 向量: `requestMemoryEmbeddings()`(`app.js:7306-7311`)用 `settings.apiUrl` + `settings.apiKey` + `memorySettings.embeddingModel`, 调 `POST {当前供应商}/v1/embeddings`。
- 经典: `requestClassicMemorySummary()`(`app.js:7033-7035`)用 `settings.apiUrl` + `settings.apiKey` + `memorySettings.classicModel`, 调 `POST {当前供应商}/v1/chat/completions`(stream=false)。
- 结论: 聊天切到 DeepSeek 后, 向量 embedding 请求会打到 DeepSeek 且必然失败; 用户只能退回经典模式(DeepSeek 能做总结)。

**模型列表是"当前供应商"单源**
- `availableModels` 只来自当前激活供应商的 `GET /models`(`fetchModels`, `app.js:4645-4665`)。
- 向量嵌入模型选择器(`openModelSelector('memoryEmbeddingModel')`, `app.js:4666-4673`)在当前列表里按 `embedding` 关键词过滤(`filteredModels`, `app.js:4063-4083`), 输入框锁定"已锁定：embedding"(index.html:3674-3677)。
- 后果: DeepSeek 的模型列表里没有 embedding 模型 → 选择器为空 → 向量模式根本无法配置。这与 4.2 第一条共同构成"聊天 DeepSeek + 向量记忆"不可用的根因。

**已有"服务级独立凭证"先例**
- 生图: `settings.imageGenKey` 独立于 API Key, 固定走 STA1N(`nai.sta1n.cn`), 配额也是独立 token。
- 联网搜索工具: `activeTools` 中 `tool_web` 自带 `tavilyApiKey`, 独立于 API Key。
- 即"服务各自带凭证"在本 App 已有成熟先例, 记忆走独立供应商并不突兀。

### 4.3 差距与影响
| 维度 | 现状 | 期望 |
|------|------|------|
| 凭证存储 | `apiProviderKeys` 已按供应商保存多套 | 无需改存储层 |
| 服务↔供应商绑定 | 只有全局激活供应商 | 记忆可绑定独立供应商 |
| 模型列表 | 只有激活供应商一份 | 记忆供应商需能单独拉取 `/models` |
| 向量模式可用性 | 依赖聊天供应商是否有 embedding | 与聊天供应商解耦 |
| 向量化执行位置 | 必须走远端 API | 可选手机本地(方案 C), 彻底解耦、可离线 |
| 密钥存储/备份 | `apiProviderKeys` 属密钥字段, 加密存、不进备份 | 保持现状即可 |

### 4.4 建议方案(设计)

**方案 A(推荐): 记忆设置里增加"记忆供应商"**
- 在 `memorySettings` 增加字段, 如 `memoryProviderId`(取值同 `settings.apiProviderId`: 内置 4 家 + custom/custom2)。
- 记忆调用改为: 取记忆供应商的 URL(内置表或 `customApiUrl`/`customApiUrl2`) + `settings.apiProviderKeys[memoryProviderId]`, 与聊天供应商完全解耦。
- 模型选择器: 打开"向量嵌入模型/经典总结模型"时, 若记忆供应商 ≠ 聊天供应商, 单独 `fetchModelsForProvider(memoryProviderId)` 拉该供应商的 `/models` 再过滤。
- 未配置记忆供应商时回退当前激活供应商(保持现有行为), 并在 UI 给出"当前使用聊天供应商"的提示。
- 迁移: `normalizeMemorySettings()` 里做默认值/校验, 老用户无感。

**方案 B(更细粒度): 向量与经典分开指定供应商**
- `embeddingProviderId`(向量嵌入)与 `summaryProviderId`(经典总结)独立。
- 适合"聊天 DeepSeek + embedding 用 SiliconFlow + 总结也想用更便宜的模型"的场景。
- 成本: 设置项翻倍、模型选择器逻辑更复杂; 可作为方案 A 之后的增强。

**方案 C(推荐探索): 本地端侧向量模型(离线 embedding)**
- **实施状态(2026-08-04, 原型已真机验证)**: `assets/js/local-embedding.js` + vendored `transformers.js v3.8.1` + onnxruntime jsep wasm + `bge-small-zh-v1.5`(512 维, ~24MB, 已打包进 APK); `memorySettings.embeddingBackend = 'api' | 'local'` 已接入 `requestMemoryEmbeddings`; 设置页新增「嵌入后端」切换、本地模型选择、预加载按钮、「总结记忆→向量」迁移按钮。真机验证: 本地 embedding 输出 512 维向量、余弦相似度正常、完全离线(已禁远程回退)。 另修复「本地模型选项为空」bug: `localEmbeddingModelOptions`/`localEmbeddingStatusLabel` 漏导出到模板, 已补。 本地模型下拉现仅显示**已内置**模型(当前只有 `bge-small-zh-v1.5`; `gte-small`/`multilingual-e5-small` 为注册表占位, 需下载文件放入 `assets/vendor/transformers/models/` 并标记 `bundled:true` 后才会出现)。
- 可行性: **有**, 且能彻底绕开"记忆绑定聊天供应商"的问题——向量化完全在手机本地完成, 不需要第二个 API Key, 内容不出设备、可离线。
- **C1(最省事, 无原生改动)**: Transformers.js(`@huggingface/transformers`)在 WebView 的 Web Worker 里以 WASM 单线程跑 embedding(单线程模式无需 SharedArrayBuffer/COOP/COEP, Capacitor WebView 可直接用)。
  - 首选模型: `Xenova/bge-small-zh-v1.5`(中文优化, 512 维, int8 量化 ONNX 约 **24MB**)—中文角色扮演文本最合适, 体积小;
  - 高质量多语言: `onnx-community/embeddinggemma-300m-ONNX`(100+ 语言, 768 维, 可裁 512/256/128, q4 约 **197MB** / int8 约 309MB);
  - 多语言轻量备选: `distiluse-base-multilingual-v2`(512 维, 约 135MB)。
  - 模型分发: 打包进 `assets/`(APK +24~310MB)或首次使用时经**自有 CDN** 下载并缓存到 Cache API/IndexedDB(HF CDN 在国内不稳定, 不建议直连); 用 Web Worker 避免阻塞 UI; 模型加载冷启动约 1-3 秒, 建议空闲时预加载。
- **C2(原生, 性能好)**: Google AI Edge / MediaPipe Text Embedder, Gradle 依赖干净、全端侧; 但官方内置模型(USE/BERT)偏英文, 中文需自备 task model; 需要写 Capacitor 原生插件。
- **C3(原生, 中文最佳)**: ONNX Runtime Mobile(或 LiteRT/TFLite) + `bge-small-zh-v1.5` ONNX(int8 约 24MB / fp32 约 90MB), 可走 NPU delegate, 性能最优; 同样需要原生插件, 工作量最大。
- **推荐**: 先做 C1(纯 JS, 改动最小、可快速验证效果), 速度/质量不达标再上 C3。
- **与本 App 结合点**: `memorySettings.embeddingBackend = 'api' | 'local'`(默认保持 api, 兼容老数据); local 模式复用现有量化存储/余弦相似度链路, 只替换 `requestMemoryEmbeddings` 的推断来源; 本地模型与 API 模型维度不同(如 512 vs 1536), 切换后端/模型时需**重建向量记忆或按维度打版本标记**, 避免新旧向量混算。
- **模型选型(参考同类项目)**:
  | 模型 | 维度 | 体积(量化) | 语言 | 同类项目在用 | 适配本 App |
  |------|------|-----------|------|--------------|-----------|
  | `bge-small-zh-v1.5` | 512 | ~24MB int8 | 中文为主 | 中文 RAG 常用; SillyTavern/KoboldCpp 社区中文本地向量 | ★首选(中文角色扮演) |
  | `multilingual-e5-small` | 384 | ~140MB int8 | 100+ 语言 | SillyTavern 本地向量、Joplin 本地搜索(MIT) | 多语言, 需 query/passage 前缀 |
  | `gte-small` | 384 | ~23MB int8 | 多语言(含中) | HuggingFace Chat UI 默认本地 embedding | 轻量通用 |
  | `embeddinggemma-300m` | 768(MRL 512/256/128) | q4 ~197MB / int8 ~309MB | 100+ 语言 | 移动端/浏览器 RAG 新标杆(MTEB <500M 第一) | 质量优先 |
  | `nomic-embed-text-v1.5` | 768 | F16 ~87MB | 英文为主 | Ollama 本地 RAG 最热(137M) | 中文弱 |
  | `bge-m3` | 1024 | q8 ~800MB | 多语言 | SillyTavern+KoboldCpp 桌面端推荐 | 手机太大 |
  | `gte-multilingual-base` | 768 | int8 ~324MB | 多语言(含中) | 多语言 RAG | 偏大 |
  | `all-MiniLM-L6-v2` | 384 | ~23MB fp32 | 英文 | SillyTavern Transformers.js 默认基线 | 中文弱, 仅作基线 |
**实现注意点**
1. 统一 URL 归一化函数(见 2.2 尾斜杠 Bug), 记忆与聊天不要再各写一套。
2. 记忆请求(embedding/经典总结)都需加超时(当前无超时), 挂起时至少能自动中断。
3. 向量 embedding 返回时校验**维度一致性**(当前只校验非空, 历史向量与新向量维度不同会导致相似度计算错误)。
4. 记忆供应商的 Key 仍走 `apiProviderKeys`(已是密钥字段, 加密存储、不进备份), 无需动 `storage-repository.js` 与 `NativeStoragePlugin`。
5. `memorySettings` 持久化在 `rp_hub_memory_settings`(非密钥键), 新增 provider 字段直接序列化即可。

### 4.5 产品方向决策: 逐步淘汰"总结模式", 保留"总结→向量"
- **决策**: 记忆系统逐步淘汰"总结模式"作为独立的存储/检索形态; **保留并强化"已总结记忆转换为向量"** 这条链路。
- **实施进度(2026-08-04)**: 已落地「经典记忆→向量」一键迁移(`migrateClassicMemoriesToVectors`, 逐条 embedding 后写入向量库, `vectorChunkId=classic:<turn>`), 设置页经典模式已加「即将弃用」提示与迁移按钮; 「总结生成后自动向量化入库」的自动管线尚未接入, 待下一步。
- **目标形态(单一管线)**: 逐轮总结(聊天供应商, DeepSeek 可胜任) → 总结文本向量化(本地模型 C1 或 API embedding) → 向量存储与语义召回。总结不再是"终态", 而是向量化的前置步骤。
- **好处**:
  - DeepSeek 只负责它擅长的 chat 总结, 向量化完全本地/独立供应商, 彻底绕开"DeepSeek 无 embedding"的痛点;
  - 总结是高质量语义单元, 比直接切原文分块检索更准、更省 token;
  - 与方案 C(本地 embedding)天然契合: 全链路可离线、内容不出设备。
- **实施要点**:
  1. 保留 `requestClassicMemorySummary` 作为总结器; 新增"总结→向量"入库: 总结文本经 `requestMemoryEmbeddings`(或本地模型)embedding 后写入向量库;
  2. 过渡期: 老"经典记忆"提供一键迁移(重新 embedding 转成向量); 设置页"总结模式"入口标记弃用并逐步下掉, 向量模式成为唯一模式;
  3. 维度管理: 本地模型(512/384)与 API 模型(768/1536)维度不同, 切换模型需重建向量或按维度打版本(见 4.4 方案 C 结合点);
  4. 经典总结的并发/楼层等参数按需保留, 但不再作为独立记忆形态暴露。
### 4.6 附带发现(记忆服务本身)
- **[P2] 无超时**: embedding/经典总结请求除用户取消/切角色外无法自行结束。
- **[P2] 向量维度不校验**: 只校验"条数=输入数、非空", 不校验维度一致。

---

## 5. 社区服务(万相广场)

- `squareUrl = https://rphforum.zeabur.app/`, 以 iframe 内嵌, 支持系统浏览器外开与刷新(加时间戳防缓存)。
- `capacitor.config.json` 的 `server.allowNavigation` 仅放行 `rphforum.zeabur.app`(最小权限, 合理)。
- 该域名若下线, 该页仅白屏/加载失败, 无离线降级(可接受, 属第三方内容)。

---

## 6. 生图服务(本期不处理, 仅记录)

- 机制: 模型按世界书规则输出 `image###提示词###`, 前端正则(`NAI画图正则`, `app.js:9669-9682`)在渲染时替换为 `<img src="https://nai.sta1n.cn/generate?tag=...&token=<imageGenKey>&model=nai-diffusion-4-5-full&...">`, 再经 DOMPurify 消毒后渲染。
- 配额: `POST /api/api/getUser { toUserId: imageGenKey }`。
- 状态检测假阳性问题见 2.2。
- **按用户要求, 本期不评估生图可用性, 相关项不纳入优先级清单。**

---

## 7. 安全与隐私

### 7.1 优点
- **API Key 加密存储**: `NativeStoragePlugin` 用 AndroidKeyStore + AES/GCM 加密, 存于独立 SharedPreferences(`roleplay_hub_secrets`); 业务数据(settings)存 SQLite 时经 `storage-repository.js` 的 `extractSecrets` 把 `apiKey / imageGenKey / apiProviderKeys / tavilyApiKey` 剥离为明文空值, 密钥与业务数据分离存储。
- **备份不含密钥**: 备份只导出数据库 + media, 恢复后主动 `clearSecretsAfterRestore()` 清空密钥并删除 Keystore 条目——密钥永不落盘到备份文件(代价: 恢复后需重新填 Key)。
- **全 HTTPS + 禁明文**: `allowMixedContent: false`, manifest 未放行 cleartext, 系统默认拦截明文。
- **隐私友好诊断**: 请求诊断只存 payload/消息的 SHA-256 哈希与元数据, 不存明文内容。
- **备份文件防篡改**: manifest + SHA-256 校验、`PRAGMA quick_check` 完整性检查、zip 路径穿越防护。

### 7.2 风险
- **[P2] `webContentsDebuggingEnabled: true`**(capacitor.config.json) — 调试端口始终开放, 任意本机进程可连 WebView 读取页面内容。**发布包应设为 false。**
- **[P3] 本地数据未加密** — 聊天记录明文存 SQLite, 依赖系统沙箱; `allowBackup=false` 已关闭系统备份, 属可接受取舍。
- 请求诊断存于 sessionStorage, App 进程被杀即丢失。

---

## 8. 平台/网络约束小结

| 项 | 现状 | 评价 |
|----|------|------|
| Android 权限 | 仅 `INTERNET` | 最小化, 好 |
| 网络策略 | HTTPS only, 禁明文 | 好, 但 http 地址无提示 |
| WebView | min 83, `webContentsDebuggingEnabled: true` | 调试开关应在发布包关闭 |
| CORS | 依赖服务端开放 | 无代理兜底, 部分自建 API 会连不上 |
| 离线能力 | 除本地数据外, 无 API 离线缓存 | 符合产品定位 |

---

## 9. 测试覆盖

已有契约/单测(`tests/`): API Key 输入同步、请求诊断、存储仓库、运行时策略、备份/导入导出、主题、IME 等。**API 调用链路本身(URL 归一化、SSE 解析、错误提取)没有自动化测试**。

做多供应商改造时建议同步补充:
1. `getApiEndpoint` / `getOpenAICompatUrl` 各种 URL(带/不带 `/v1`、尾斜杠、空值)——改造后应合并为一个函数并覆盖。
2. 记忆供应商回退逻辑(未配置→回退激活供应商; 配置→用独立供应商 URL+Key)。
3. SSE 流式解析器、`extractApiErrorMessage` 各错误结构。

---

## 10. 结论与优先级

### 高优先级(P1)
1. **【新功能】记忆系统改为"总结→向量"单管线**: 逐步淘汰"总结模式"作为独立形态, 保留**已总结记忆转向量**; 总结仍走聊天供应商(DeepSeek 可胜任), 向量化首选**本地端侧模型(方案 C1: Transformers.js + bge-small-zh)**, 其次**方案 A(记忆独立供应商)**。统一 URL 归一化; 切换模型时按维度重建/版本化向量。 **[进行中] 本地 embedding 原型已真机验证; 经典→向量迁移已落地; 自动总结→向量管线待接。**
2. 主聊天请求加超时(首字节超时 + 流空闲超时), 避免无限等待。 **[已实施] 首字节 60s + 流空闲 120s watchdog, 超时区分"生成超时"提示。**
3. 主聊天链路增加有限重试(瞬时网络错误/5xx)。 **[已实施] 最多 3 次尝试, 指数退避(800ms×n), 覆盖网络 TypeError/超时/429/5xx; 已出内容或用户取消不重试。**
4. 发布包关闭 `webContentsDebuggingEnabled`。 **[已实施] capacitor.config.json 已置 false(注意: 同时关闭了 CDP 调试口, 后续真机自动化调试需临时打开)。**

### 中优先级(P2)
5. 统一 API URL 归一化(修复尾斜杠导致的 `/v1//v1/` 双重路径)。 **[已实施] `getOpenAICompatUrl` 改为委托 `getApiEndpoint`; 统一去尾斜杠、去路径前导斜杠、补 /v1。**
6. 记忆请求(embedding/经典总结)加超时; 向量维度一致性校验。 **[已实施] 统一 60s 超时(`withTimeoutSignal`); 新增 `validateEmbeddingVectors`(条数/非空/维度一致/与存量维度比对, 不一致给出重建提示)。**
7. 对明文 HTTP、CORS 失败、DNS 失败给出明确区分提示。 **[已实施] `friendlyNetworkErrorMessage` 区分明文 HTTP / CORS·网络不可用 / 超时, 聊天失败信息友好化。**
8. 429/限流给出"稍后重试"提示与退避。 **[已实施] 429 进入重试退避, 重试耗尽后给出明确提示。**

### 中优先级(P2·新增)
12. **修复 API Key 粘贴**: 输入框加"显示/隐藏"切换 + "粘贴"按钮(NativeStoragePlugin.clipboardRead), 见 2.3。 **[已实施]**
### 低优先级(P3)
9. 错误消息进聊天历史前做截断/脱敏。 **[已实施] 聊天错误消息统一 `truncateErrorMessage`(600 字截断)。**
10. UI 模板分析并发请求节流。 **[已实施] `runWithConcurrency` 限制并发为 3。**
11. 请求诊断提供导出入口(避免进程被杀丢失)。 **[已实施] 用量统计页新增「复制诊断信息」按钮; 新增原生 `clipboardWrite` 写入剪贴板。**

### 本期不处理(用户指定)
- 生图功能可用性(含生图状态检测假阳性、prompt URL 编码、token 暴露等生图相关项), 待后续重新纳入范围。

**总评**: API 接入整体工程化程度不错——流式/SSE 兼容、错误提取、中断处理、密钥加密、诊断与测试都有用心。本期核心增量是**记忆系统与聊天解耦(方案 A / C)**: 凭证层已就绪(`apiProviderKeys`), 只差"服务↔供应商绑定"这一层运行时机制, 改造面可控; 其余主要短板集中在"异常状态下的体验"(状态灯误报、主链路无超时/无重试、URL 归一化不一致)与发布安全配置。
