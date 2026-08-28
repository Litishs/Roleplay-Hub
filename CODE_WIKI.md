# Roleplay Hub — Code Wiki

> 本文档为 Roleplay Hub 仓库的结构化代码导览，覆盖整体架构、模块职责、关键类与函数、依赖关系与运行方式。
> 与 [AGENTS.md](./AGENTS.md) 互补：AGENTS.md 规定工作流与红线，本文档描述「代码长什么样、怎么跑」。
> 文中行号/版本号仅为概况，以仓库实际状态为准。

---

## 1. 项目概览

| 项 | 值 |
| --- | --- |
| 应用名 | Roleplay Hub |
| 包名 | `com.roleplayhub.app` |
| 类型 | 本地优先的 AI 角色扮演对话工具（Android WebView 壳 + Web 本体） |
| 技术栈 | Vue 3 + Vite + Tailwind CSS + DaisyUI（Web）／ Capacitor 7 + Android Java（原生壳） |
| 存储 | 设备本地 SQLite（WAL 模式）+ 文件媒体目录 + AndroidKeyStore 加密密钥 |
| 协议 | CC BY-NC 4.0（fork 自 STA1N156/RP-Hub） |
| 仓库 | `Litishs/Roleplay-Hub`（GitHub Release 由 tag 触发 Actions 自动构建） |

**核心能力**：角色扮演对话、角色卡管理、向量记忆系统（本地 embedding）、世界书与正则引擎、故事分支、本地神经 TTS、UI 模板系统、多 API 服务商接入、本地备份/恢复、应用内更新检查与 APK 安装。

**数据流主线**：JS 层（Vue 单体 `app.mjs`）编排业务 → 通过 `storage-repository.mjs` 调用 `NativeStorage` Capacitor 插件 → 原生 `NativeStoragePlugin` 操作 `RoleplayDatabase`（SQLite）／媒体文件／加密密钥库。

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Android Application                        │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  MainActivity (BridgeActivity)                            │   │
│  │   ├─ registerPlugin: NativeStorage / ThemeBridge /        │   │
│  │  │                    TTSSpeech / LocalTTS                 │   │
│  │   ├─ 系统栏/DecorView/WebView 背景联动 (防闪)              │   │
│  │   └─ WindowInsets 监听 (横屏隐藏状态栏 / IME padding)      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │ Capacitor Bridge                  │
│  ┌─────────────────────┐  ┌────────────────────┐  ┌───────────┐  │
│  │  NativeStoragePlugin│  │  ThemeBridgePlugin │  │ TTSSpeech │  │
│  │  (KV/Chat/Memory/   │  │  (setDark)         │  │ LocalTTS  │  │
│  │   Media/Secret/     │  │                    │  │ (sherpa-  │  │
│  │   Backup/Apk)       │  │                    │  │  onnx)    │  │
│  └─────────┬───────────┘  └────────────────────┘  └───────────┘  │
│            │                                                     │
│  ┌─────────▼───────────────────────────────────────────────┐     │
│  │  RoleplayDatabase (SQLiteOpenHelper, WAL)               │     │
│  │   tables: kv_store / chat_messages / media /            │     │
│  │           app_meta / memory_fragments                   │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │ JS Bridge (window.Capacitor.Plugins)
┌─────────────────────────────▼───────────────────────────────────┐
│                    Web Layer (Vite + Vue 3)                      │
│  index.html ── src/main.js ── src/modules/app.mjs (万行单体)     │
│                                   │                              │
│   ┌───────────────────────────────┼──────────────────────────┐   │
│   │  业务模块 (src/modules/*.mjs) │  Vue 组件 (src/components)│   │
│   │  storage-repository           │  views/*Panel.vue        │   │
│   │  chat-persistence             │  UiTemplateFrame.vue    │   │
│   │  card-utils                   │  GenerationTimer.vue     │   │
│   │  memory-* / story-branch      │  EmbeddedViewContent.vue│   │
│   │  tts-* / local-embedding      │                          │   │
│   │  ui-template-* / runtime-policy│                          │   │
│   │  update-checker / utils        │                          │   │
│   └───────────────────────────────┴──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**分层职责**：

- **原生壳层**：Capacitor `BridgeActivity` 承载 WebView，注册 4 个自定义插件；`MainActivity` 负责系统栏主题、刘海适配、IME/横屏 inset 处理。
- **存储后端**：`RoleplayDatabase` 单一 SQLite（WAL + 外键 + `synchronous=NORMAL`），5 张表，所有结构化数据落库；媒体落 `filesDir/media/`，密钥落 AndroidKeyStore 加密的 SharedPreferences。
- **JS 编排层**：`src/modules/app.mjs` 是单一 `createApp({ setup() })`，集中所有响应式状态、设置同步、API 调用编排、模块装配；通过 `storage-repository.mjs` 间接访问原生。
- **JS 业务模块层**：每个职责抽成独立 ESM 模块，导出纯函数/工厂，被 `app.mjs` import 装配；均通过 `globalThis.RPHXxx` 暴露给非 Vite 页面（如 `character/index.html`）。
- **视图层**：`src/components/views/*Panel.vue` 是各设置页/面板组件，由 `app.mjs` 注册到全局 `components`。

---

## 3. 目录结构

```
RP-Hub/
├── android/                      # Android 原生工程（Capacitor）
│   ├── app/src/main/java/com/roleplayhub/app/
│   │   ├── MainActivity.java     # BridgeActivity，注册插件 + 主题/inset 处理
│   │   ├── NativeStoragePlugin.java   # 存储/媒体/密钥/备份/APK 安装插件
│   │   ├── RoleplayDatabase.java  # SQLite 数据库（WAL，5 表）
│   │   ├── ThemeBridgePlugin.java # JS→原生主题联动
│   │   ├── TTSSpeechPlugin.java   # 系统 TextToSpeech 插件
│   │   └── LocalTTSPlugin.java    # sherpa-onnx 神经 TTS 插件
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/src/main/res/xml/file_paths.xml  # FileProvider 共享路径
│   ├── app/build.gradle           # 读取 version.properties，NDK ABI=arm64-v8a
│   ├── variables.gradle           # minSdk/compileSdk/targetSdk 与 AndroidX 版本
│   ├── version.properties         # versionCode / versionName（版本唯一来源）
│   └── capacitor.build.gradle / capacitor.settings.gradle
├── assets/                        # 非 Vite 打包的静态资源（部分入库）
│   ├── css/                       # fonts.css / styles.css / tailwind.input.css
│   ├── js/                        # 旧 UMD 文件（card-utils.js、ui-select.js 仍被
│   │                              #   character/index.html 使用，其余已废弃）
│   └── (vendor/ generated/ character/ 不入库)
├── character/
│   └── index.html                 # 独立角色卡工坊页面（不走 Vite，<script> 直引）
├── scripts/                       # 构建/调试脚本
│   ├── build-android-debug.ps1    # debug 构建 + 版本号自增
│   ├── build-android-release.ps1   # release 构建签名
│   ├── build-web.mjs              # Vite 构建后处理（拷 vendor/character/LICENSE）
│   ├── prepare-vendor.mjs         # 拷 Vue/marked/DOMPurify/Sortable/字体 到 assets/vendor
│   ├── prepare-local-embedding.mjs# 拷 Transformers.js + bge-small-zh 模型
│   ├── prepare-local-tts.mjs      # 下载 sherpa-onnx.aar 到 android/app/libs
│   ├── cdp-eval.mjs / cdp-reload-check.mjs / debug-webview.mjs  # CDP 真机调试
├── src/
│   ├── main.js                    # Vite 入口（仅 import './modules/app.mjs'）
│   ├── components/
│   │   ├── views/                 # 各设置面板 Vue 组件
│   │   ├── chat/                  # 聊天区域组件
│   │   ├── settings/              # 设置子组件（1.4 拆分后填充）
│   │   ├── common/                # 通用/共享辅助组件
│   │   │   ├── EmbeddedViewContent.vue
│   │   │   ├── GenerationTimer.vue
│   │   │   ├── SettingsPageHeader.vue
│   │   │   └── UiTemplatePending.vue
│   │   └── index.js
│   └── modules/                   # 业务 ESM 模块（见 §4）
├── tests/                         # 契约测试（node --test，见 §8）
├── .github/workflows/release.yml  # tag v* 触发自动构建发布
├── index.html                     # Vite 模板入口（首屏防闪 + vendor script）
├── capacitor.config.json          # Capacitor 配置（captureInput=false 等红线）
├── vite.config.js                 # Vite 构建配置
├── tailwind.main.config.cjs       # 主界面 Tailwind 配置
├── tailwind.character.config.cjs  # 角色卡工坊 Tailwind 配置
├── package.json
└── AGENTS.md                      # 工作流与工程约束（本地，不入库）
```

---

## 4. Web 模块层（`src/modules/`）

所有业务模块采用 ESM 导出，被 `app.mjs` 顶部集中 import 装配。每个模块职责单一、可独立测试，多数通过 `globalThis.RPHXxx` 暴露给非 Vite 页面。

### 4.1 模块职责一览

| 模块 | 导出 | 职责 |
| --- | --- | --- |
| [app.mjs](file:///d:/AI/RP-Hub/src/modules/app.mjs) | （Vue createApp） | 万行单体，所有响应式状态、设置同步、API 编排、模块装配入口 |
| [storage-repository.mjs](file:///d:/AI/RP-Hub/src/modules/storage-repository.mjs) | `RPHStorage` | 存储仓库门面：包装 NativeStorage 插件，区分公开值/密钥，提供 KV/Chat/Memory/Secret 读写；非原生环境降级到内存 Map |
| [chat-persistence.mjs](file:///d:/AI/RP-Hub/src/modules/chat-persistence.mjs) | `RPHChatPersistence` | 聊天增量持久化：基于消息签名（id+position+content）计算 baseline/changes（upserts/deletes），恢复中断草稿 |
| [card-utils.mjs](file:///d:/AI/RP-Hub/src/modules/card-utils.mjs) | `RPHubCardUtils` | 角色卡工具：NAI 画图艺术家风格库、角色卡导入导出字段处理、卡片渲染辅助 |
| [chat-request-guard.mjs](file:///d:/AI/RP-Hub/src/modules/chat-request-guard.mjs) | `create` | 聊天请求看门狗工厂：分阶段超时（首字节/首 token/流空闲/总时长）与有效内容判定 |
| [default-presets.mjs](file:///d:/AI/RP-Hub/src/modules/default-presets.mjs) | `DEFAULT_PRESET_DEFINITIONS` | 内置预设定义（破限、人称、COT 等），仅在缺失时播种一次，已存在不覆盖 |
| [html-frame-lifecycle.mjs](file:///d:/AI/RP-Hub/src/modules/html-frame-lifecycle.mjs) | `RPHFrameLifecycle` | 富文本 iframe 生命周期：LRU 挂起/激活，硬限活动 iframe ≤3（性能红线） |
| [local-embedding.mjs](file:///d:/AI/RP-Hub/src/modules/local-embedding.mjs) | `RPHLocalEmbedding` | 本地向量 embedding 原型：Transformers.js + onnxruntime-web，bge-small-zh-v1.5 等模型；主线程分批，预留 Worker 化 |
| [memory-profile.mjs](file:///d:/AI/RP-Hub/src/modules/memory-profile.mjs) | `createEmptyProfile` / `normalizeProfile` / `relationKey` / `mergeRelations` / `mergeCharacters` / `mergeOpenPlots` / `buildProfileContext` / `buildRelationViewData` | 固定信息卡：角色状态/关系边/伏笔合并去重（对称关系归一）与注入文本构建 |
| [memory-recall-fallback.mjs](file:///d:/AI/RP-Hub/src/modules/memory-recall-fallback.mjs) | `select` | 向量召回降级：当向量召回不可用时，按词法命中 + recency 排序去重选 topK |
| [memory-summary.mjs](file:///d:/AI/RP-Hub/src/modules/memory-summary.mjs) | `DEFAULTS` / `normalizeState` / `estimateTokens` / `computePendingBatch` / `pruneCoveredFailedBatches` / `buildRewriteMessages` / `parseSummaryJson` / `formatProgress` | 滚动摘要批次调度：窗口=最近 keepFloors 轮原文，失败空洞优先补，支持重写消息与 JSON 降级 |
| [request-diagnostics.mjs](file:///d:/AI/RP-Hub/src/modules/request-diagnostics.mjs) | `RPHRequestDiagnostics` | 请求诊断：最近 10 次请求的 timing/fingerprint/快照（不含 prompt 明文），落 sessionStorage |
| [runtime-policy.mjs](file:///d:/AI/RP-Hub/src/modules/runtime-policy.mjs) | `RPHRuntimePolicy` | 运行时策略与红线常量：聊天窗口（初始 20/批 10/最大 40）、渲染缓存 LRU 100、活动 iframe 3、流刷新 50ms、草稿保存 2s；`LruCache` 实现；`getChatWindow` 窗口计算 |
| [story-branch.mjs](file:///d:/AI/RP-Hub/src/modules/story-branch.mjs) | `MAIN_ID` / `SCOPE_SEPARATOR` / `createId` / `getScopeId` / `getOwnerId` / `isBranchScopeId` / `defaultBranchName` / `createMainBranch` / `normalizeBranches` / `collectSubtreeIds` / `buildBranchTree` / `formatWordCount` | 故事分支：作用域 id 编码（`charId__branch__branchId`）、分支树构建与字数统计 |
| [tts-engine.mjs](file:///d:/AI/RP-Hub/src/modules/tts-engine.mjs) | `default` (`RPHTts`) | 系统 TTS 引擎门面：包装 TTSSpeech 插件，状态机 + 事件订阅 |
| [tts-local-engine.mjs](file:///d:/AI/RP-Hub/src/modules/tts-local-engine.mjs) | `default` (`RPHLocalTts`) | 本地神经 TTS 引擎门面：包装 LocalTTS 插件，模型下载/缓存/朗读 |
| [tts-text.mjs](file:///d:/AI/RP-Hub/src/modules/tts-text.mjs) | `default` (`RPHTtsText`) | TTS 文本预处理：剥离 CoT/系统指令/HTML 卡片/代码块，提取可朗读文本 |
| [ui-select.mjs](file:///d:/AI/RP-Hub/src/modules/ui-select.mjs) | `RPHubCustomSelect` | `CustomSelect` Vue 组件：带分组/描述/禁用项的下拉选择 |
| [ui-template-engine.mjs](file:///d:/AI/RP-Hub/src/modules/ui-template-engine.mjs) | `default` (`engine`) | UI 模板纯函数引擎（v3.2）：模板 HTML 解析、变量状态推断、变更日志、渲染 |
| [ui-template-frame.mjs](file:///d:/AI/RP-Hub/src/modules/ui-template-frame.mjs) | `UiTemplateFrame` / `UiTemplateFrameUtil` | UI 模板 iframe 框架：拆分模板为 styles/scripts/body，shadow DOM 渲染与事件委托 |
| [update-checker.mjs](file:///d:/AI/RP-Hub/src/modules/update-checker.mjs) | `compareVersions` / `checkForUpdate` / `fetchLatestRelease` / `downloadApk` / `saveAndInstallApk` / `GITHUB_REPO` / `RELEASES_PAGE_URL` | 应用更新检查：GitHub API 拉最新 release、版本对比、APK 下载与安装（配合 NativeStorage.installApk） |
| [utils.mjs](file:///d:/AI/RP-Hub/src/modules/utils.mjs) | `generateUUID` / `parseCot` | 通用工具：UUID 生成；CoT（`<think>`/`<cot>` 标签）解析与缓存（≤2000 条） |

### 4.2 app.mjs 单体结构

[src/modules/app.mjs](file:///d:/AI/RP-Hub/src/modules/app.mjs) 是万行级 Vue 3 单体，由单一 `createApp({ components, setup() })` 构成：

- **顶部 import 区**（L16-L53）：集中接入所有业务模块与 Vue 组件，是模块依赖清单的权威位置。
- **组件注册**（L55-L61）：将 `views/*Panel.vue`、`UiTemplateFrame`、`CustomSelect` 等注册为全局组件。
- **setup()**（L62 起）：所有响应式状态、watch、computed、onMounted 的集中地，末尾一次性 return 暴露给模板。
  - 常量与默认配置区：默认头像、API 提供商列表（`apiProviderOptions`）、默认 API 配置、生图配置（当前空数组，扩展点预留）。
  - 状态守卫区（约 L1540）：`_initComplete` / `_dataLoadFailed` 等加载守卫，防止加载失败时 `saveData` 用默认空值覆盖存储真实数据。
  - 交互处理区（约 L815）：API Key 粘贴、字体设置同步等。
  - watch 同步区（约 L1063-L1125）：API key/url、模型选择、图片生成、UI 模板模型、字体等设置项的响应式同步。
  - 消息渲染区（约 L400）：`watch(messageElements, ...)` 触发滚动揭示与 iframe 生命周期。

> **注意**：新功能应优先抽独立模块（见 AGENTS.md §2.1），避免 `app.mjs` 继续膨胀。查找功能用 `rg` 定位。

---

## 5. Vue 组件层（`src/components/`）

### 5.1 视图面板（`src/components/views/`）

| 组件 | 职责 |
| --- | --- |
| [CharacterPanel.vue](file:///d:/AI/RP-Hub/src/components/views/CharacterPanel.vue) | 角色卡管理与展示 |
| [GeneratorPanel.vue](file:///d:/AI/RP-Hub/src/components/views/GeneratorPanel.vue) | 生图/生成器面板 |
| [MemoryPanel.vue](file:///d:/AI/RP-Hub/src/components/views/MemoryPanel.vue) | 记忆系统设置与查看 |
| [WorldInfoPanel.vue](file:///d:/AI/RP-Hub/src/components/views/WorldInfoPanel.vue) | 世界书条目管理（**常驻挂载**：承载预设/正则/工具编辑器、导入/导出对话框等跨视图共享 Modal，[index.html](file:///d:/AI/RP-Hub/index.html#L432) 不加 `v-if`，面板内容用内部 `v-if="currentView === 'worldinfo'"` 控制不渲染） |
| [PresetsPanel.vue](file:///d:/AI/RP-Hub/src/components/views/PresetsPanel.vue) | 预设管理 |
| [RegexPanel.vue](file:///d:/AI/RP-Hub/src/components/views/RegexPanel.vue) | 正则引擎规则管理 |
| [UiTemplatePanel.vue](file:///d:/AI/RP-Hub/src/components/views/UiTemplatePanel.vue) | UI 模板编辑 |
| [SettingsPanel.vue](file:///d:/AI/RP-Hub/src/components/views/SettingsPanel.vue) | 全局设置（API/主题/字体/TTS/更新等） |
| [ToolsPanel.vue](file:///d:/AI/RP-Hub/src/components/views/ToolsPanel.vue) | 工具集 |
| [UsageStatsPanel.vue](file:///d:/AI/RP-Hub/src/components/views/UsageStatsPanel.vue) | 用量统计 |
| [SquarePanel.vue](file:///d:/AI/RP-Hub/src/components/views/SquarePanel.vue) | 万相广场（内嵌社区 iframe） |

### 5.2 辅助组件

- [EmbeddedViewContent.vue](file:///d:/AI/RP-Hub/src/components/common/EmbeddedViewContent.vue)：嵌入视图内容容器。
- [GenerationTimer.vue](file:///d:/AI/RP-Hub/src/components/common/GenerationTimer.vue)：生成计时器。
- [SettingsPageHeader.vue](file:///d:/AI/RP-Hub/src/components/common/SettingsPageHeader.vue)：设置页头。
- [UiTemplatePending.vue](file:///d:/AI/RP-Hub/src/components/common/UiTemplatePending.vue)：UI 模板渲染等待态。

组件均由 `app.mjs` 顶部 import 后注册到 `createApp({ components })`，模板内直接使用。

---

## 6. Android 原生层

### 6.1 MainActivity

[MainActivity.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/MainActivity.java) 继承 `BridgeActivity`，是应用入口：

- `onCreate` 中依次 `registerPlugin` 注册 4 个自定义插件（必须在 `super.onCreate` 前 `supportRequestWindowFeature(Window.FEATURE_NO_TITLE)` 防 OEM 标题栏）。
- `WindowCompat.setDecorFitsSystemWindows(getWindow(), false)`：edge-to-edge 布局。
- 隐藏 support ActionBar（防 HarmonyOS 等 OEM 渲染标题栏）。
- 首屏主题预染：按系统夜间模式决定 DecorView/状态栏/导航栏颜色，避免 JS 启动前白闪。
- 刘海适配：`LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS`。
- `WindowInsetsControllerCompat` 设置状态栏/导航栏图标明暗。
- `setOnApplyWindowInsetsListener`：横屏隐藏状态栏（瞬态滑出），竖屏显示；按 IME 可见性动态设置底部 padding。

### 6.2 NativeStoragePlugin

[NativeStoragePlugin.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java) 是最核心的插件（`@CapacitorPlugin(name = "NativeStorage")`），`load()` 时构造 `RoleplayDatabase`。暴露方法分组：

| 方法 | 作用 |
| --- | --- |
| `init` | 打开数据库、`integrityCheck`，返回 schemaVersion |
| `kvSet` / `kvGet` / `kvRemove` | KV 读写删除（kv_store 表） |
| `chatGet` / `chatApply` / `chatReplace` / `chatDelete` | 聊天记录按角色读取/增量应用/整体替换/删除 |
| `memoryList` / `memoryApply` / `memoryDelete` | 记忆碎片按角色读取/应用/删除 |
| `mediaWriteDataUrl` | data URL 写入媒体目录并登记 media 表（含 sha256） |
| `clipboardRead` / `clipboardWrite` | 系统剪贴板读写 |
| `secretSet` / `secretGet` / `secretRemove` | 加密密钥读写删除（AndroidKeyStore AES-GCM） |
| `exportFile` / `exportFileStart` / `exportFileWrite` / `exportFileEnd` | 文件导出（单次/分块流式） |
| `exportBackup` / `restoreBackup` | 备份导出/恢复（zip 含 manifest+sha256 校验） |
| `installApk` | 通过 FileProvider 触发 APK 安装 |

**关键实现要点**：

- **大值读取**（重要教训）：`RoleplayDatabase.getValue` 用 `SQLiteStatement.simpleQueryForString()` 而非 `Cursor`，绕过 CursorWindow 单行限制（角色等 JSON 可达 1MB+），缺失行捕获 `SQLiteDoneException` 返回 null。
- **密钥加密**：`AndroidKeyStore` 生成 AES/GCM 密钥（`KEY_ALIAS = "roleplay_hub_secure_config"`），密文格式 `base64(iv):base64(ciphertext)`，存于独立 SharedPreferences（`roleplay_hub_secrets`）。
- **备份流程**：`createBackup` 先 `database.checkpoint()`（WAL 合并主文件）→ 打包 DB + media + manifest（含每文件 SHA256）→ 写 zip。
- **恢复流程**：`restoreFromBackup` 解压到 cache 临时目录 → 校验 manifest + hashes + DB `PRAGMA quick_check` → `installRestoredData` 原子替换（staged → 移动覆盖 → rollback 失败回滚）→ 重建 `RoleplayDatabase` → `integrityCheck` → 清空 secrets（避免恢复后密钥残留）。
- **分块导出**：`exportFileStart/Write/End` 通过 sessionId 跨多次 bridge 调用保持 create-document picker 打开，流式写入大文件避免 base64 全量内存峰值。

### 6.3 RoleplayDatabase

[RoleplayDatabase.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/RoleplayDatabase.java) 继承 `SQLiteOpenHelper`：

- `DATABASE_NAME = "roleplay_hub.db"`，`DATABASE_VERSION = 2`，`setWriteAheadLoggingEnabled(true)`。
- `onConfigure`：开启外键约束 + `PRAGMA synchronous=NORMAL`。
- **5 张表**（`onCreate`）：
  - `kv_store(key PRIMARY KEY, json, updated_at)`：KV 配置/角色/世界书等大 JSON。
  - `chat_messages(character_id, message_id, position, status DEFAULT 'final', message_json, updated_at, PRIMARY KEY(character_id,message_id))` + 索引 `idx_chat_character_position(character_id, position)`。
  - `media(id PRIMARY KEY, relative_path UNIQUE, mime_type, byte_size, sha256, created_at)`。
  - `app_meta(key PRIMARY KEY, value)`：schema_version 等。
  - `memory_fragments(character_id, kind, fragment_id, fragment_json, updated_at, PRIMARY KEY(character_id,kind,fragment_id))` + 索引 `idx_memory_fragments_character`（v2 新增，`onUpgrade` 处理迁移）。
- 关键方法：`putValue/getValue/removeValue`、`getChat/applyChatChanges/replaceChat/deleteChat`、`getMemoryFragments/applyMemoryFragments/deleteMemoryFragments`、`putMedia`、`checkpoint`（`PRAGMA wal_checkpoint(FULL)`）、`integrityCheck`（`PRAGMA quick_check`）。

### 6.4 ThemeBridgePlugin

[ThemeBridgePlugin.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/ThemeBridgePlugin.java)（`@CapacitorPlugin(name = "ThemeBridge")`）：

- 仅暴露 `setDark(dark: boolean)`，在 UI 线程同步状态栏/导航栏/DecorView/WebView/contentView 背景色与图标明暗。
- 因 `AndroidManifest` `configChanges` 含 `uiMode`，系统深浅切换不重建 Activity，必须经此插件由 JS→原生联动修正。

### 6.5 TTSSpeechPlugin

[TTSSpeechPlugin.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/TTSSpeechPlugin.java)（`@CapacitorPlugin(name = "TTSSpeech")`）：包装 Android 系统 `TextToSpeech`，P0 级本地发音，无需联网。暴露 `ttsIsAvailable` / `ttsGetVoices` / `ttsSpeak`，通过 `tts-state` 事件回调状态。JS 对应 `RPHTts`。

### 6.6 LocalTTSPlugin

[LocalTTSPlugin.java](file:///d:/AI/RP-Hub/android/app/src/main/java/com/roleplayhub/app/LocalTTSPlugin.java)（`@CapacitorPlugin(name = "LocalTTS")`）：基于 sherpa-onnx（onnxruntime）的神经 TTS，P2 级。VITS 模型以 tar.bz2 形式运行时下载到 `filesDir/tts-models/<voiceId>/`，不打包进 APK。`OfflineTts` 会话跨 utterance 复用。事件复用 `tts-state` 与 `tts-model`，使两引擎对 JS 透明。依赖 `android/app/libs/sherpa-onnx.aar`（由 `prepare-local-tts.mjs` 下载）。

### 6.7 AndroidManifest 与配置

- [AndroidManifest.xml](file:///d:/AI/RP-Hub/android/app/src/main/AndroidManifest.xml)：声明 `INTERNET` 权限；`MainActivity` 配置 `configChanges`（含 `uiMode` 等，避免重建）、`launchMode`、`exported`；注册 `FileProvider` 与 `@xml/file_paths`。
- [file_paths.xml](file:///d:/AI/RP-Hub/android/app/src/main/res/xml/file_paths.xml)：`FileProvider` 共享 `external-path` 与 `cache-path`。
- [variables.gradle](file:///d:/AI/RP-Hub/android/variables.gradle)：`minSdkVersion` / `compileSdkVersion` / `targetSdkVersion` 与 AndroidX 依赖版本集中配置。
- [version.properties](file:///d:/AI/RP-Hub/android/version.properties)：`versionCode` / `versionName`，版本号唯一来源（被 `app/build.gradle` 读取）。
- [app/build.gradle](file:///d:/AI/RP-Hub/android/app/build.gradle)：读取 `version.properties`；`defaultConfig` 限定 NDK ABI 为 `arm64-v8a`（sherpa-onnx 原生库平台）。

---

## 7. 构建系统

### 7.1 npm scripts（[package.json](file:///d:/AI/RP-Hub/package.json)）

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | Vite 开发服务器（热更新本地预览） |
| `npm run build:js` | `vite build` → dist/ |
| `npm run build:css` | Tailwind 编译到 `assets/generated/`（main + character 两份） |
| `npm run prepare:vendor` | 拷 vendor 依赖 + 本地 embedding 模型 + 本地 TTS 模型（首次构建必需） |
| `npm run prepare:local-tts` | 单独准备本地 TTS 模型 |
| `npm run build:web` | `prepare:vendor` + `build:css` + `build:js` + `build-web.mjs` 后处理 |
| `npm test` | `node --test tests/*.test.mjs`（契约测试，改代码后必跑） |
| `npm run android:sync` | `build:web` + `cap sync android` |
| `npm run android:open` | `cap open android`（Android Studio 打开） |
| `npm run android:debug` | `android:sync` + PowerShell 脚本构建 debug APK → `debug_apk/`（版本自动 +1） |
| `npm run android:release` | `android:sync` + PowerShell 脚本构建签名正式包 → 仓库根目录 |

### 7.2 Vite 配置（[vite.config.js](file:///d:/AI/RP-Hub/vite.config.js)）

- `base: ''`（相对路径，适配 WebView `file://`）。
- `@vitejs/plugin-vue` 插件。
- 输出到 `dist/`，`assets/` 子目录，固定 `entryFileNames: 'assets/main-[hash].js'`、`chunkFileNames: 'assets/chunk-[hash].js'`。

### 7.3 构建脚本（`scripts/`）

| 脚本 | 作用 |
| --- | --- |
| [build-android-debug.ps1](file:///d:/AI/RP-Hub/scripts/build-android-debug.ps1) | 优先用项目本地 JDK 21（`.toolchains/jdk`）防 JAVA_HOME 版本不匹配；自增 `version.properties` 的 versionCode（+1）并据此生成 versionName（如 1.30→1.31）；执行 `assembleDebug`；复制 APK 到 `debug_apk/Roleplay-Hub-<版本>-debug.apk`。构建后会留下已修改的跟踪文件 `version.properties`，确认后再提交或还原。 |
| [build-android-release.ps1](file:///d:/AI/RP-Hub/scripts/build-android-release.ps1) | 设置 release 版本号（向上取整到下一个整十，如 1.24→1.30）与 keystore 签名，执行 `assembleRelease`，复制到仓库根目录 `Roleplay-Hub-<版本>-release.apk`。 |
| [build-web.mjs](file:///d:/AI/RP-Hub/scripts/build-web.mjs) | Vite 构建后处理：拷贝 vendor、JS/CSS、character 工坊页面与 LICENSE，清理 APK 不需要的 assets。 |
| [prepare-vendor.mjs](file:///d:/AI/RP-Hub/scripts/prepare-vendor.mjs) | 从 `node_modules` 复制 Vue、marked、DOMPurify、Sortable、jQuery、字体等到 `assets/vendor/`。 |
| [prepare-local-embedding.mjs](file:///d:/AI/RP-Hub/scripts/prepare-local-embedding.mjs) | 复制 Transformers.js、ONNX Runtime WASM 与 `bge-small-zh-v1.5` 模型到 `assets/vendor/transformers/`。 |
| [prepare-local-tts.mjs](file:///d:/AI/RP-Hub/scripts/prepare-local-tts.mjs) | 下载/校验 `sherpa-onnx.aar` 到 `android/app/libs/`。 |
| [cdp-eval.mjs](file:///d:/AI/RP-Hub/scripts/cdp-eval.mjs) | 通过 Chrome DevTools Protocol 连接 WebView 执行 JS 表达式（真机调试）。 |
| [cdp-reload-check.mjs](file:///d:/AI/RP-Hub/scripts/cdp-reload-check.mjs) | CDP 重载 WebView 并收集异常/console/log，检查启动期 JS 错误。 |
| [debug-webview.mjs](file:///d:/AI/RP-Hub/scripts/debug-webview.mjs) | WebView 调试辅助，提供 setup/IME/API key/rich message 等 CDP 表达式。 |

> **终端约定**：直接用默认 shell（PowerShell/cmd），不要用 Git Bash 包装；复杂引号写成临时文件再执行。

### 7.4 GitHub Actions（[.github/workflows/release.yml](file:///d:/AI/RP-Hub/.github/workflows/release.yml)）

触发条件：推送 `v*` tag。流程：checkout → setup Node 20 → install → cache `sherpa-onnx.aar` → `build:web` → `cap sync android` → setup Java 21 + Android SDK + Gradle cache → 从 tag 推导版本号写入 `android/version.properties` → 从 secrets（`KEYSTORE_BASE64` / `KEYSTORE_STORE_PASSWORD` / `KEYSTORE_KEY_ALIAS` / `KEYSTORE_KEY_PASSWORD`）创建 keystore → `gradlew assembleRelease` → 复制 APK 到根目录 → `softprops/action-gh-release` 创建 Release。

> 不要改 workflow 的触发条件；修改后需验证 tag 触发是否正常。

---

## 8. 测试体系（`tests/`）

测试命令：`npm test`（`node --test tests/*.test.mjs`）。契约测试以「读取源文件文本并断言契约」为主，部分通过 import/vm 加载 ESM 跑纯逻辑。**改行为必须同步更新测试**；重构/重命名会让文本断言「故意」失败，是设计意图。跑单文件：`node --test tests/<名称>.test.mjs`。

| 测试文件 | 验证契约 |
| --- | --- |
| [android-insets-contract.test.mjs](file:///d:/AI/RP-Hub/tests/android-insets-contract.test.mjs) | Android 窗口 inset（横屏/IME）处理 |
| [api-key-input-contract.test.mjs](file:///d:/AI/RP-Hub/tests/api-key-input-contract.test.mjs) | API Key 输入与保存 |
| [api-resilience-contract.test.mjs](file:///d:/AI/RP-Hub/tests/api-resilience-contract.test.mjs) | API URL 规范化、超时看门狗、记忆召回 fallback、SSE 心跳、错误回复 |
| [character-card-press-contract.test.mjs](file:///d:/AI/RP-Hub/tests/character-card-press-contract.test.mjs) | 角色卡片 press 动画事件、状态与 CSS transform |
| [chat-input-ime-contract.test.mjs](file:///d:/AI/RP-Hub/tests/chat-input-ime-contract.test.mjs) | 聊天输入用 textarea、IME 安全 handler、粘贴、auto resize、Enter/Ctrl+Enter |
| [chat-persistence.test.mjs](file:///d:/AI/RP-Hub/tests/chat-persistence.test.mjs) | 聊天增量持久化 baseline/changes/草稿恢复 |
| [chat-request-guard.test.mjs](file:///d:/AI/RP-Hub/tests/chat-request-guard.test.mjs) | 请求看门狗分阶段超时 |
| [export-location-contract.test.mjs](file:///d:/AI/RP-Hub/tests/export-location-contract.test.mjs) | 导出文件位置 |
| [iframe-lifecycle.test.mjs](file:///d:/AI/RP-Hub/tests/iframe-lifecycle.test.mjs) | iframe LRU 挂起/激活 |
| [import-export-fidelity-contract.test.mjs](file:///d:/AI/RP-Hub/tests/import-export-fidelity-contract.test.mjs) | 角色卡导入导出字段保留、JSON/JSONL 校验、去重预览 |
| [local-embedding-contract.test.mjs](file:///d:/AI/RP-Hub/tests/local-embedding-contract.test.mjs) | 本地 embedding API、app 路由迁移、设置页 UI、vendor 模型存在 |
| [memory-profile-contract.test.mjs](file:///d:/AI/RP-Hub/tests/memory-profile-contract.test.mjs) | 固定信息卡关系去重/对称、角色状态/伏笔合并、注入文本、过期标注 |
| [memory-recall-fallback.test.mjs](file:///d:/AI/RP-Hub/tests/memory-recall-fallback.test.mjs) | 向量召回降级选 topK |
| [memory-summary-contract.test.mjs](file:///d:/AI/RP-Hub/tests/memory-summary-contract.test.mjs) | 滚动摘要批次推进、失败重试、空洞优先补、重写消息、JSON 降级 |
| [native-backup-contract.test.mjs](file:///d:/AI/RP-Hub/tests/native-backup-contract.test.mjs) | 原生备份/恢复契约 |
| [request-diagnostics.test.mjs](file:///d:/AI/RP-Hub/tests/request-diagnostics.test.mjs) | 请求诊断 timing/fingerprint/快照 |
| [rich-text-iframe-contract.test.mjs](file:///d:/AI/RP-Hub/tests/rich-text-iframe-contract.test.mjs) | 富文本 iframe 契约 |
| [runtime-policy.test.mjs](file:///d:/AI/RP-Hub/tests/runtime-policy.test.mjs) | 运行时策略常量、LruCache、getChatWindow |
| [settings-ui-contract.test.mjs](file:///d:/AI/RP-Hub/tests/settings-ui-contract.test.mjs) | 设置页五大区块折叠卡片、默认折叠、深色/窄屏样式 |
| [storage-repository.test.mjs](file:///d:/AI/RP-Hub/tests/storage-repository.test.mjs) | 存储仓库门面契约 |
| [story-branch-contract.test.mjs](file:///d:/AI/RP-Hub/tests/story-branch-contract.test.mjs) | 故事分支 API、归一化、子树 ID、tree 布局、persistence scope |
| [theme-contract.test.mjs](file:///d:/AI/RP-Hub/tests/theme-contract.test.mjs) | 主题状态机、防闪脚本、设置页主题下拉、dark override CSS、ThemeBridge |
| [tts-contract.test.mjs](file:///d:/AI/RP-Hub/tests/tts-contract.test.mjs) | TTS 文本提取、引擎 API、设置页语音区块、app 接线 |
| [tts-local-contract.test.mjs](file:///d:/AI/RP-Hub/tests/tts-local-contract.test.mjs) | 本地 TTS 引擎 API、voice catalog、无 Capacitor 降级、Android plugin 契约 |
| [ui-template-engine.test.mjs](file:///d:/AI/RP-Hub/tests/ui-template-engine.test.mjs) | UI 模板引擎纯函数 |
| [ui-template-shadow-contract.test.mjs](file:///d:/AI/RP-Hub/tests/ui-template-shadow-contract.test.mjs) | `<ui-template-frame>` 渲染、纯模板 HTML、shadow DOM 事件委托与清理 |
| [update-checker-contract.test.mjs](file:///d:/AI/RP-Hub/tests/update-checker-contract.test.mjs) | 更新检查器导出、启动静默检查、设置页按钮、原生安装契约 |
| [user-setup-contract.test.mjs](file:///d:/AI/RP-Hub/tests/user-setup-contract.test.mjs) | Android IME 不永久禁用 setup、setup 保存用户名/描述 |

---

## 9. 依赖关系

### 9.1 npm 依赖（[package.json](file:///d:/AI/RP-Hub/package.json)）

**运行时**：

- `@capacitor/*` 7.x（android / app / browser / core / filesystem / share）：Capacitor 原生桥与官方插件。
- `vue` ^3.5.18：响应式框架（全局 `Vue` 由 vendor 脚本预置，ESM 仅用于 SFC 编译）。
- `marked` ^15：Markdown 渲染（`app.mjs` 顶部配置 `breaks: true` 并禁用缩进代码块 tokenizer）。
- `dompurify` ^3.2.6：HTML 净化。
- `sortablejs` ^1.15.6：拖拽排序。
- `jquery` ^3.7.1：遗留依赖。
- `@huggingface/transformers` ^3.8.1：本地 embedding（Transformers.js）。
- `@fontsource-variable/lora` ^5.2.8：字体。

**开发时**：

- `vite` ^8.2.2 + `@vitejs/plugin-vue` ^6.0.8：构建。
- `tailwindcss` ^3.4.17 + `daisyui` ^4.12.24：样式。

### 9.2 模块依赖图（核心）

```
app.mjs
├── chat-request-guard.mjs       (create)
├── memory-recall-fallback.mjs   (select)
├── ui-template-engine.mjs        (engine, default)
├── ui-template-frame.mjs         (UiTemplateFrame)
├── card-utils.mjs                (RPHubCardUtils)
├── ui-select.mjs                 (RPHubCustomSelect)
├── request-diagnostics.mjs       (RPHRequestDiagnostics)
├── update-checker.mjs            (compareVersions, checkForUpdate, ...)
├── chat-persistence.mjs          (RPHChatPersistence)
├── default-presets.mjs           (DEFAULT_PRESET_DEFINITIONS)
├── storage-repository.mjs         (RPHStorage) ──┐
├── runtime-policy.mjs             (RPHRuntimePolicy)
├── local-embedding.mjs           (RPHLocalEmbedding)
├── tts-engine.mjs                 (RPHTts, default) ──┐
├── tts-local-engine.mjs           (RPHLocalTts, default) ──┐
├── tts-text.mjs                   (RPHTtsText, default)
├── story-branch.mjs               (MAIN_ID, createId, ...)
├── memory-summary.mjs             (RPHMemorySummary, namespace)
├── memory-profile.mjs             (RPHMemoryProfile, namespace)
├── utils.mjs                      (generateUUID, parseCot)
└── components/*.vue               (面板与辅助组件)

storage-repository.mjs ──> window.Capacitor.Plugins.NativeStorage (原生桥)
tts-engine.mjs         ──> window.Capacitor.Plugins.TTSSpeech
tts-local-engine.mjs   ──> window.Capacitor.Plugins.LocalTTS
html-frame-lifecycle.mjs ──> window.RPHRuntimePolicy.limits.activeIframes
```

### 9.3 原生依赖

- `sherpa-onnx.aar`（k2fsa）：本地神经 TTS，由 `prepare-local-tts.mjs` 下载到 `android/app/libs/`，CI 缓存 key `sherpa-onnx-aar-1.13.5`。
- `commons-compress`（Apache）：LocalTTSPlugin 解压 tar.bz2 模型包。
- AndroidX（core/appcompat）：edge-to-edge inset 与 AppCompat 主题。
- AndroidKeyStore：密钥加密。
- 项目本地工具链（`.toolchains/`，不入库）：JDK 21、Android SDK、Gradle、platform-tools（含 adb）。

---

## 10. 项目运行方式

### 10.1 普通用户

直接安装仓库根目录的 `Roleplay-Hub-<版本>-release.apk`（正式包）即可。首次使用进入「设置」，选择 API 提供商并填入 API Key，选择模型后开始对话。

### 10.2 开发者本地运行

**环境要求**：Node.js 18+；Android 构建优先用项目内 `.toolchains` 提供的 JDK 21 与 Android SDK（也可配置全局 `JAVA_HOME`）。仅限 Windows 构建（脚本为 PowerShell）。

```bash
# 1. 安装依赖
npm install

# 2. 运行契约测试（改代码后必跑）
npm test

# 3. Web 开发预览（热更新）
npm run dev

# 4. 构建 Web 资源到 dist/
npm run build:web

# 5. 同步到 Android 工程
npm run android:sync

# 6. 构建 debug APK -> debug_apk/（版本自动 +1）
npm run android:debug

# 7. 构建签名正式包 -> 仓库根目录
npm run android:release
```

### 10.3 发布流程

1. 确保 `npm test` 全绿。
2. `git tag v<主>.<次>`（如 `v2.20`）推送到 GitHub。
3. Actions 自动构建并发布 Release；版本号取自 tag（`versionCode = (MAJOR-1)*100 + MINOR`）。
4. 依赖 4 个 Repository Secrets（`KEYSTORE_BASE64` / `KEYSTORE_STORE_PASSWORD` / `KEYSTORE_KEY_ALIAS` / `KEYSTORE_KEY_PASSWORD`），与本地 `android/keystore.properties` + `android/keystore/` 保持同步；丢失任一方将无法发布新版本。

### 10.4 真机调试

- ADB 路径：`d:\AI\RP-Hub\.toolchains\android-sdk\platform-tools\adb.exe`
- WebView 调试：`scripts/cdp-eval.mjs`、`cdp-reload-check.mjs`、`debug-webview.mjs` 通过 CDP 连接 WebView。
- 含字符串字面量的 SQL 用 `.sql` 文件 + `cat file | run-as sqlite3 db` 管道方式，避免嵌套引号问题。

---

## 11. 关键工程约定（速查）

> 详见 [AGENTS.md](./AGENTS.md)。此处仅列与代码理解强相关的要点。

- **新增 JS 模块**：放 `src/modules/`，ESM 导出；在 `app.mjs` 顶部 import；如需非 Vite 页面访问加 `globalThis.RPHXxx = Xxx`；在 `tests/` 加契约测试。
- **契约测试按文本断言**：重命名/移动/调默认值会触发「预期失败」，同步更新测试而非绕过。
- **密钥红线**：新密钥字段走 `secretSet`/`secretGet`，禁止进 SQLite/JSON/备份。
- **性能红线**：活动 iframe ≤3、聊天窗口挂载 ≤40、渲染缓存 LRU 100、流刷新 50ms、草稿保存 2s——别放宽（[runtime-policy.mjs](file:///d:/AI/RP-Hub/src/modules/runtime-policy.mjs)）。
- **`captureInput=false`** 是中文输入问题定案（IME 代理桥已下线）；新增输入面用 textarea + IME 安全事件。
- **`loadData` 失败必须禁止 `saveData`**：`_dataLoadFailed` 守卫防止用默认空值覆盖存储真实数据。
- **SQLite 大值读取**：必须用 `simpleQueryForString`，不能用 Cursor（CursorWindow 单行限制）。
- **`cap sync` 会覆盖** `android/app/src/main/assets/public/`，不要手改。
- **生图服务当前不可用**（`imageGenProviderOptions` 为空数组，扩展点已预留）。
- **万相广场**是内嵌社区（`server.allowNavigation` 白名单 `rphforum.zeabur.app`），只消费不改造服务端。
- **角色卡资产 `assets/character/` 与 `documents/` 不入库**：clone 后为空属正常；根目录 `character/index.html` 是已入库的角色卡工坊页面，与不入库的 `assets/character/` 资产目录是两回事。
- **语言约定**：新增代码（标识符/注释/测试名/提交信息）一律英文；面向用户 UI 文案保持中文；AI 思考推理用英文。