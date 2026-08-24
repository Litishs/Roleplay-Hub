# Roleplay Hub

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

> 一款本地优先的 AI 角色扮演对话工具。应用本体与数据在本地运行，对话、角色卡与设置均保存在设备本地；调用大模型 API 时需联网。

支持角色扮演对话、角色卡管理、记忆系统、世界书与正则引擎、本地语音合成，以及多 API 服务商接入。

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

本仓库最初 fork 自 **STA1N** 的开源项目 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)，在保留原始项目全部能力的基础上，进行了 Android 应用封装、本地向量记忆、本地 TTS 引擎、UI 模板系统、API 服务商扩展与正式包构建流程等工作。原始项目的页面设计、角色卡系统与核心功能构思均出自原作者之手，原始代码与设计的全部版权归 STA1N 所有。

## 致谢

由衷感谢 **STA1N** 的无私开源，让我们能在此基础之上继续完善与本地化适配。

使用本项目请遵守原始协议 **CC BY-NC 4.0**：保留署名、禁止商业使用、演绎作品须标注修改；若需**商业授权**，请联系原始项目作者 STA1N。

## 协议与许可

沿用原始项目 **[CC BY-NC 4.0（知识共享 署名-非商业性使用 4.0 国际许可协议）](./LICENSE)** 开源：

- **您可以**：自由共享与演绎（修改、转换或以本项目为基础进行创作）。
- **您必须**：保留署名并标明修改，**不得用于任何商业目的**（售卖、付费服务、广告获利等）。
- 若需商业授权，请联系原始项目作者 STA1N。

详细许可条款请参看根目录下的 [`LICENSE`](./LICENSE) 文件。