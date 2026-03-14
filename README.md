# Roleplay Hub

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-5A0EF8?logo=daisyui&logoColor=white)](https://daisyui.com/)

> **一款纯前端运行的本地角色扮演（Roleplay）对话和角色卡管理工具。**

**【免责与授权声明】**  
本项目基于 **[CC BY-NC 4.0（知识共享-署名-非商业性使用 4.0 国际许可协议）](./LICENSE)** 开源。**明确禁止任何形式的商业化使用（包括但不限于：作为收费服务提供、打包在付费产品中售卖、在产品内植入广告盈利等）。** 任何使用者必须遵守该协议，尊重原作者的署名权。对于违反协议的商业行为，保留追究法律责任的权利。

---

## 🌟 核心特性 (Features)

Roleplay Hub 致力于提供流畅、私密且功能强大的本地化 Roleplay 体验：

* **🔒 纯前端运行，数据全本地化**
  * 无需繁琐的后端部署配置。下载后直接双击 `index.html` 即可在浏览器中运行。
  * 所有的聊天记录、角色卡数据、全局设置均安全地保存在本地浏览器的 `IndexedDB` 和 `LocalStorage` 中，确保您的隐私绝对安全，数据不上传到任何未授权的第三方服务器。

* **🎭 强大的角色卡管理 (Character Management)**
  * **角色导入/导出**：支持导入主流的角色卡格式（支持批量导入），并一键导出备份。
  * **多角色切换**：流畅地在多个角色之间进行切换，并且可以独立保存不同角色的聊天历史。
  * **自定义角色设定**：支持编辑角色的基本信息（Name, Description, Personality, Scenario, First Message），随心所欲定制专属于您的 AI 伴侣。

* **💬 智能与高度定制的对话体验**
  * **API 自由配置**：支持自定义 OpenAI 格式的 API 接口（`apiUrl`, `apiKey`, 自定义 `Model`），允许您连接到任何兼容的大模型（LLM）服务。
  * **上下文与正则管理 (Regex & Presets)**：内置系统预设（如第二人称视角预设、思维链 COT 预设等）和强大的正则脚本（Regex Scripts）支持，允许深度干预 AI 的输入与输出格式，精准控制对话质量。
  * **世界书库 (World Info/Lorebook)**：支持导入和编辑世界书，实现精准的背景设定触发，让 AI 更好地理解复杂的世界观。
  * **思维链解析**：自动解析 `<think>` / `<cot>` 等模型的内置思维链，保证前端展示整洁的剧情输出。

* **🎨 优质的 UI 渲染与图像生成**
  * **现代前端技术栈**：基于 Vue 3 + Tailwind CSS 构建，界面流畅美观。采用 DaisyUI (部分) 进行组件搭建，通过 Marked.js 与 DOMPurify 渲染和过滤 Markdown，保障渲染安全。
  * 采用响应式设计，适配桌面端与移动端。
  * 消息支持 Markdown 语法，完美呈现粗体、斜体、引用和结构化数据。
  * 具备 **自动生图提示词** 的预设及辅助功能，在对话中搭配图片生成 API 带来更沉浸的视觉体验。

---

## 📸 项目截图 (Screenshots)

*(此处可放置您的项目截图或演示 GIF 链接)*
> 示例：
>
> `![主界面截图](docs/screenshot1.png)`
>
> `![角色管理截图](docs/screenshot2.png)`

---

## 🚀 快速开始 (Quick Start)

本项目无需复杂的 Node.js 环境或依赖安装，即开即用！

### 1. 下载与运行
1. 点击项目主页绿色的 `Code` 按钮，选择 `Download ZIP`。
2. 将下载的 ZIP 压缩包解压到您的本地任意文件夹中。
3. 双击打开 `index.html` 文件，即可在浏览器（推荐 Chrome / Edge / Firefox）中启动 Roleplay Hub。

*(注：如果您遇到跨域或本地文件读取权限问题，可以尝试使用 VS Code 的 `Live Server` 插件，或简单的本地服务器工具来运行该目录。但在绝大多数现代浏览器中，双击 index.html 即可正常使用所有核心功能。)*

### 2. 初始化设置
1. 打开应用后，点击侧边栏（或顶部菜单）的**设置 (Settings)** 选项。
2. 填入您自己的或第三方提供的 API 节点 (`API URL`)。
3. 填入对应的 `API Key`，并输入或选择您想使用的 `模型名称 (Model)`。
4. 在**角色管理**界面，导入您的角色卡文件（或点击新建角色并手动填写设定）。
5. 回到对话界面，开始属于您的 Roleplay 旅程吧！

---

## 📁 目录结构 (Directory Structure)

```text
Roleplay-Hub/
├── index.html            # 主程序的入口文件，直接浏览器打开即可运行
├── character/            # 辅助页面或附加工具目录（如角色卡工坊）
│   └── index.html
├── assets/
│   ├── css/
│   │   └── styles.css    # 核心样式文件
│   └── js/
│       ├── app.js        # 核心业务逻辑（Vue3、数据状态管理、API交互、数据解析等）
│       └── utils.js      # 工具函数库（UUID生成、时间格式化、正则处理等）
└── README.md             # 本说明文件
```

---

## ⚖️ 协议与许可 (License)

本项目严格遵守以下开源协议：

**[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans)**

* **您可以**：自由地共享（在任何媒介以任何形式复制、发行本作品）与演绎（修改、转换或以本作品为基础进行创作）。
* **您必须**：
  * **署名 (Attribution)**：给出适当的署名，提供指向本许可协议的链接，同时标明是否对原始作品作了修改。
  * **非商业性使用 (NonCommercial)**：**您不得将本作品或演绎作品用于任何商业目的。** 禁止任何形式的售卖、付费订阅集成或利用本项目进行广告牟利。
* 若要获取本项目的商业授权，请直接联系项目原作者。

详细许可条款请参见根目录下的 [`LICENSE`](./LICENSE) 文件。
