# Roleplay Hub

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

> 一款本地优先的 AI 角色扮演对话工具。应用本体与数据在本地运行，对话、角色卡与设置均保存在设备本地；调用大模型 API 时需联网。

支持角色扮演对话、角色卡管理、记忆系统、世界书与正则引擎、本地语音合成，以及多 API 服务商接入。

## 功能特性

**对话与演出**

- 流式输出、思维链（CoT）折叠展示、消息编辑 / 重新生成
- 剧情分支：从任意楼层创建分支树，独立推进多线剧情
- 富文本回复：Markdown 渲染 + 受控沙箱 iframe HTML 卡片（动作按钮可交互），配合渲染缓存与活动 iframe 上限保障长对话流畅
- UI 模板系统：可自定义对话界面模板（纯函数引擎 + shadow DOM 渲染）

**角色与世界观**

- 角色卡管理：PNG / JSON / JSONL 导入导出，字段保真往返；内置角色卡工坊（独立页面，从零创建角色）
- 世界书（情境注入）与正则脚本引擎
- 记忆系统：滚动总结 + 向量记忆召回（本地 embedding 模型，离线可用）+ 固定信息卡（角色状态 / 有向关系 / 未决伏笔）

**语音与接入**

- 双 TTS 引擎：系统 TTS 与本地神经 TTS（sherpa-onnx 离线运行，模型按需下载）
- 多 API 服务商：DeepSeek / OpenRouter / SiliconFlow / 阿里百炼 / 智谱，以及自定义 OpenAI 兼容端点；分供应商保存 API Key，密钥经 AndroidKeyStore 加密存储

**数据与运维**

- 全本地存储：SQLite（WAL 模式）+ 聊天增量持久化；原生备份 / 恢复（完整性校验 + 原子替换，密钥不入备份）
- 应用内更新检查：GitHub Release 版本比对 + APK 下载安装
- 万相广场：内嵌社区页面

## 架构概览

Android WebView 壳（Capacitor 7，4 个自定义原生插件：NativeStorage / ThemeBridge / TTSSpeech / LocalTTS）承载 Vue 3 + Vite 构建的 Web 应用本体，所有数据经存储仓库门面落入设备本地 SQLite，不经过任何第三方服务。

```
┌─ Android 原生壳（Capacitor 7 + 自定义插件）
├─ Web 应用层
│   ├─ src/modules/app.mjs    编排入口：跨域 watch 同步、API 编排、数据加载守卫
│   ├─ src/composables/       状态域 ×7（useChatState / useCharacterState / useSettingsState …）
│   │                         业务管线 ×5（useMessageSender / useTemplateRenderer / useCardOperations
│   │                         / useDataIO / useBackupRestore，deps 注入逻辑工厂模式）
│   ├─ src/modules/           25+ 纯函数业务模块（记忆引擎 / 故事分支 / TTS / 请求看门狗 / utils …）
│   └─ src/components/        26 个 Vue SFC（views / chat / settings / common）
└─ 存储层：SQLite（WAL）+ 媒体文件 + AndroidKeyStore 加密密钥
```

工程约定：

- **契约测试**：242 项（文本断言 + 纯逻辑运行时测试，`npm test`），任何行为变更强制同步
- **性能红线**：活动 iframe ≤ 3、聊天窗口挂载 ≤ 40 条、渲染缓存 LRU 100（统一定义于 `runtime-policy.mjs`）
- **隐私红线**：密钥仅存 AndroidKeyStore 加密存储，不进数据库与备份；诊断日志不含 prompt 明文

## 快速开始

### 普通用户

直接安装仓库根目录的 `Roleplay-Hub-<版本>-release.apk`（正式包）即可使用。首次使用进入「设置」，选择 API 提供商并填入 API Key，选择模型后即可开始对话。

### 开发者构建

环境要求：Node.js 18+，Android 构建优先使用项目内 `.toolchains` 提供的 JDK 21 与 Android SDK（也可配置全局 `JAVA_HOME`）。

```bash
npm install                 # 安装依赖
npm test                    # 运行契约测试
npm run build:web           # 构建 Web 资源到 dist/
npm run android:sync        # 构建并同步到 Android 工程
npm run android:debug       # 构建 debug 包 -> debug_apk/
npm run android:release     # 构建正式包 -> 仓库根目录
```

版本规则：debug 包每次构建自动 +1（如 1.30 → 1.31 → 1.32），产物输出到 `debug_apk/`；正式包版本在当前版本基础上向上取整到下一个整十（如 1.24 → 1.30），产物输出到仓库根目录。正式包签名需首次构建前自行生成 `android/keystore/roleplay-hub-release.keystore` 并配置 `android/keystore.properties`（两者均已加入 .gitignore，请自行备份）。

## 项目渊源

本仓库最初 fork 自 **STA1N** 的开源项目 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)，在保留原始项目全部能力的基础上，进行了 Android 应用封装、本地向量记忆、本地 TTS 引擎、UI 模板系统、API 服务商扩展、正式包构建流程与大规模模块化架构重构等工作。原始项目的页面设计、角色卡系统与核心功能构思均出自原作者之手，原始代码与设计的全部版权归 STA1N 所有。

## 致谢

由衷感谢 **STA1N** 的无私开源，让我们能在此基础之上继续完善与本地化适配。

使用本项目请遵守原始协议 **CC BY-NC 4.0**：保留署名、禁止商业使用、演绎作品须标注修改；若需**商业授权**，请联系原始项目作者 STA1N。

## 协议与许可

沿用原始项目 **[CC BY-NC 4.0（知识共享 署名-非商业性使用 4.0 国际许可协议）](./LICENSE)** 开源：

- **您可以**：自由共享与演绎（修改、转换或以本项目为基础进行创作）。
- **您必须**：保留署名并标明修改，**不得用于任何商业目的**（售卖、付费服务、广告获利等）。
- 若需商业授权，请联系原始项目作者 STA1N。

详细许可条款请参看根目录下的 [`LICENSE`](./LICENSE) 文件。
