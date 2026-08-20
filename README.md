# Roleplay Hub

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

> 一款本地角色扮演（Roleplay）对话与角色卡工具，衍生自 **STA1N** 的开源项目 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)，由维护者 **Litishs** 封装为 **Android App**（Capacitor 7 + Vue 3）。应用本体与数据在本地运行，调用大模型 API 时需联网。

## 核心功能

- **本地运行、数据隐私**：应用本体与对话、角色卡、设置数据均保存在本地，无自建服务器；仅调用大模型 API 时需要联网。
- **角色扮演对话**：流式输出、温度与上下文控制、多角色卡与预设切换。
- **角色卡管理**：支持导入/导出（JSON / PNG）与批量管理，兼容 SillyTavern / TavernAI 角色卡字段。
- **角色卡工坊**：AI 辅助生成角色卡（头像生图功能当前暂不可用）。
- **记忆系统**：总结模式（经典）、向量模式（本地嵌入模型，计算在设备本地完成，数据不出设备）与时间线模式（故事时钟、事实时间锚定、时间线摘要与图谱），支持总结记忆一键迁移为向量，并提供事实层抽取与记忆召回。
- **上下文 Token 预算**：预算滑块 + 本地估算、历史楼层瘦身、时间线摘要与世界书预算治理（优先级裁剪 + 卡片去重）、输出限制。
- **世界书与正则**：内置世界书（Lorebook）、正则脚本与 UI 模板系统。
- **用量统计**：Token 用量统计、筛选与查看。
- **API 服务商**：内置 DeepSeek、OpenRouter、SiliconFlow、阿里百炼、智谱，并支持自定义 OpenAI 兼容接口；聊天与记忆供应商可独立绑定。
- **生图服务**：当前显示"暂不可用"，代码已预留可扩展的生图服务商结构，后续版本接入。
- **万相广场**：内嵌社区广场（rphforum.zeabur.app）。

## 与原始仓库的主要差异

本仓库在保留原始项目全部能力的基础上，主要完成以下工作：

- **Android 应用封装**：使用 Capacitor 将网页版封装为可安装的 Android App，全量资源随包分发；接入系统文件选择器、分享、系统剪贴板等原生能力。
- **本地向量记忆**：集成 Transformers.js + ONNX Runtime（WASM），引入 bge-small-zh-v1.5 本地嵌入模型，支持混合检索（向量 + 关键词 + 最近轮次），数据不出设备。
- **本地 TTS 引擎**：集成 sherpa-onnx 流式语音合成，支持在线下载与离线使用语音包。
- **记忆系统增强**：时间线模式（故事时钟、事实时间锚定、时间线摘要与图谱）及 UI。
- **上下文 Token 治理**：上下文预算滑块 + 本地估算器、历史楼层瘦身（16/12）、时间线摘要与世界书预算治理（优先级裁剪 + 与角色卡去重）、输出限制。
- **UI 模板系统**：独立模板引擎（Shadow DOM 渲染），支持变量分析、批量 JSON 模式、失败自动回退与手动重试。
- **API 服务商扩展**：内置 DeepSeek、OpenRouter、SiliconFlow、阿里百炼、智谱，支持自定义 OpenAI 兼容接口与多服务商 API Key，聊天/记忆供应商可独立绑定；原 STA1N 服务已移除，生图服务当前暂不可用（预留扩展结构）。
- **稳定性与体验**：请求诊断日志、API 韧性（超时/重试）、错误以角色回复呈现、聊天草稿持久化、暗色模式、中文输入法适配、导入导出无损往返与分块导出。
- **正式构建发布流程**：debug/release 双轨构建脚本、自动版本递增、正式包签名与版本规则。

## 使用方式

### 普通用户

直接安装仓库根目录的 `Roleplay-Hub-<版本>-release.apk`（正式包）即可使用。首次使用进入「设置」，选择 API 提供商并填入 API Key，选择模型后即可开始对话（调用 API 需要联网）。

### 开发者构建

环境要求：Node.js 18+，Android 构建优先使用项目内 `.toolchains` 提供的 JDK 21 与 Android SDK（也可配置全局 `JAVA_HOME`）。

```bash
npm install                 # 安装依赖
npm test                    # 运行契约测试（node --test tests/*.test.mjs）
npm run build:web           # 构建 Web 资源到 dist/
npm run android:sync        # 构建并同步到 Android 工程
npm run android:debug       # 构建 debug 包 -> debug_apk/Roleplay-Hub-<版本>-debug.apk
npm run android:release     # 构建正式包 -> Roleplay-Hub-<版本>-release.apk
```

版本规则：
- debug 包每次构建自动 +1（如 1.30 → 1.31 → 1.32 ...），产物输出到 `debug_apk/`。
- 正式包版本在当前版本基础上向上取整到下一个整十（如 1.24 → 1.30），产物输出到仓库根目录。
- 正式包签名：首次构建前需生成 `android/keystore/roleplay-hub-release.keystore` 并配置 `android/keystore.properties`（两者均已加入 .gitignore，请自行备份，丢失后将无法升级已安装的正式包）。

## 致谢与来源

本项目最初由 **STA1N** 创建并开源（[STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)，许可证 CC BY-NC 4.0）。原始项目的页面设计、角色卡系统与核心功能构思均出自原作者之手，**原始代码与设计的全部版权归 STA1N 所有**。

本仓库（[Litishs/Roleplay-Hub](https://github.com/Litishs/Roleplay-Hub)）是原始项目的二次开发（Fork），在保留原始项目全部能力的基础上，进行了 Android 应用封装、本地向量记忆、UI 模板系统、API 服务商扩展与正式包构建流程等适配工作。二次开发仅代表维护者 **Litishs** 的个人工作，不代表原作者立场。
由衷感谢 STA1N 的无私开源，让我们能在此基础之上继续完善与本地化适配。

使用本项目请遵守原始协议 **CC BY-NC 4.0**：保留署名、禁止商业使用、演绎作品须标注修改；若需**商业授权**，请联系原始项目作者 STA1N。

## 协议与许可

沿用原始项目 **[CC BY-NC 4.0（知识共享 署名-非商业性使用 4.0 国际许可协议）](./LICENSE)** 开源：

- **您可以**：自由共享与演绎（修改、转换或以本项目为基础进行创作）。
- **您必须**：保留署名并标明修改，**不得用于任何商业目的**（售卖、付费服务、广告获利等）。
- 若需商业授权，请联系原始项目作者 STA1N。

详细许可条款请参看根目录下的 [`LICENSE`](./LICENSE) 文件。
