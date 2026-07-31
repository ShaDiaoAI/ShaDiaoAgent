# 沙雕智能体（ShaDiaoAgent）

沙雕智能体是一个本地优先的 AI 桌面客户端，核心理念是 **"沙雕人物"替代传统工作区**——你不是在切换项目，而是在切换陪你工作的 AI 伙伴。每个沙雕人物有独立的性格、职业、皮肤和系统提示词，使用 AI 消耗 token 还能触发随机奖励掉落。

它不是普通的 AI 聊天框，而是一个有灵魂的 Agent 工作台：简单问题用 Chat，复杂任务交给 Agent，数据和配置尽量留在本地。

> **当前阶段**：Phase 1 已完成（核心 Agent 链路跑通），Phase 2（人物系统 + 角色动画）开发中。

## 和一般 AI 客户端的区别

- **沙雕人物系统**：创建/选择属于你的 AI 伙伴，每个角色有独立的职业（学者 / 生活家 / 工程师）、等级经验、可装备皮肤和系统提示词。切换人物就是切换工作模式。
- **角色动画**：你的沙雕人物会根据 Agent 状态实时变化——待机呼吸、思考歪头、调用工具时敲键盘、说话时张嘴。不是静态头像，是活的。
- **游戏化奖励**：每消耗 100 token 触发沙雕币掉落，每 1000 token 触发皮肤盲盒。使用越多，奖励越多，人物越个性。
- **本地优先**：会话、工作区、配置、附件全部存在 `~/.shadiao-agent/`，JSON / JSONL 文件格式，不用数据库，方便备份和迁移。
- **Agent 全能力**：基于 Claude Agent SDK，支持文件操作、Shell 命令、MCP 扩展、Skills 复用、计划模式、权限管理。

## 现在能做什么

- **Agent 模式**：基于 `@anthropic-ai/claude-agent-sdk` 的通用 Agent，支持工作区隔离、权限模式、文件操作、长任务流式输出、计划确认和用户追问。
- **Chat 模式**：多模型对话、附件解析、Markdown / Mermaid / KaTeX / 代码高亮、系统提示词、上下文管理。
- **沙雕人物**：创建多个人物，每人独立配置模型和系统提示词，一键切换工作模式。
- **角色动画**：CreateJS 驱动的角色动画，随 Agent 状态（idle → thinking → tool_calling → streaming）实时切换。
- **奖励掉落**：使用 Agent 消耗 token → 自动触发奖励（沙雕币 / 皮肤盲盒）→ 弹窗动画展示。
- **皮肤 & 背包**：收集皮肤装备在人物身上，管理道具背包，打造个性化 AI 伙伴。
- **Skills & MCP**：每个工作区独立配置 Skills 和 MCP Server，沉淀可复用能力。
- **本地优先**：所有数据存储在 `~/.shadiao-agent/`，JSON 配置 + JSONL 追加日志，不用本地数据库。

## 架构概览

```
┌──────────────────────────────────────────────────────┐
│  ShaDiaoAgent (Electron + React + CreateJS)          │
│                                                      │
│  ┌─────────────────┐   ┌──────────────────────────┐  │
│  │  Renderer (React)│   │  Main Process            │  │
│  │  - Agent 视图    │   │  - Agent 编排             │  │
│  │  - Chat 视图     │   │  - 人物管理               │  │
│  │  - 人物面板      │   │  - 奖励服务               │  │
│  │  - 角色动画      │   │  - MCP / Skills           │  │
│  │  - 皮肤画廊      │   │  - Django 客户端          │  │
│  └─────────────────┘   └──────────┬───────────────┘  │
│                                   │                   │
│  本地存储: ~/.shadiao-agent/      │                   │
└───────────────────────────────────┼───────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │      Django 后端              │
                     │                              │
                     │  ① LLM 代理转发               │
                     │     Client → Django → NewAPI  │
                     │     → 第三方 LLM              │
                     │                              │
                     │  ② 业务逻辑                   │
                     │     人物 / 皮肤 / 物品 / 奖励  │
                     │     钱包 / 概率表 / 等级经验    │
                     └──────────────────────────────┘
```

Agent 请求链路：客户端设置 `ANTHROPIC_BASE_URL` 指向 Django，SDK 自动追加路径 → Django 代理转发至 NewAPI → 第三方 LLM，Django 在代理层旁路解析 token 用量、触发奖励掉落、通过 SSE `reward_drop` 事件混入流式响应。

## 预设人物

| 人物 | 职业 | 性格 |
|------|------|------|
| **甲** | 学者 | 知识渊博，擅长解释概念、辅导学习、推荐资源 |
| **乙** | 生活家 | 风趣幽默，擅长日常建议、娱乐推荐、闲聊陪伴 |
| **丙** | 工程师 | 高效专业，擅长代码、文档、项目管理和技术方案 |

所有预设人物默认使用虾仁形象（默认皮肤），后续可通过皮肤系统更换外观。

## 快速开始

### 环境要求

- **macOS** Apple Silicon / Intel，或 **Windows** x64（Linux 后续支持）
- **Bun** 1.2.x+（运行时和包管理）
- **Git** 和可用的 Shell（Agent 模式依赖）
- **Django 后端**（需要单独部署，处理 LLM 代理转发和人物系统）

### 下载安装

从 [GitHub Releases](#) 下载最新版本。提供 macOS Apple Silicon、macOS Intel 和 Windows 安装包。

### 首次配置

1. 启动沙雕智能体，完成环境检查。
2. 进入 **设置**，配置 Django 后端地址并登录/注册账号。
3. Django 后端已内置 NewAPI 渠道管理——用户无需自行配置 API Key。
4. 进入 **人物**，创建或选择一个沙雕人物（默认提供甲 / 乙 / 丙）。
5. 进入 **Agent** 视图，选择工作区，开始对话。

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Bun |
| 桌面框架 | Electron 39+ |
| 前端 | React 18 + TypeScript |
| 状态管理 | Jotai |
| 样式 | Tailwind CSS + Radix UI |
| 富文本输入 | TipTap |
| Markdown / 图表 / 公式 | React Markdown + Beautiful Mermaid + KaTeX |
| 代码高亮 | Shiki |
| 角色动画 | CreateJS / EaselJS |
| 构建 | Vite + esbuild |
| 分发 | electron-builder |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| 后端 | Django（独立项目） |

## 项目结构

```text
shadiao-agent/
├── packages/
│   ├── shared/     # @shadiao/shared — 共享类型、IPC 常量、配置
│   ├── core/       # @shadiao/core — Provider Adapter、SSE、代码高亮
│   └── ui/         # @shadiao/ui — 共享 React UI 组件（含角色动画组件）
└── apps/
    └── electron/   # @shadiao/electron — Electron 桌面应用
```

## 开发

```bash
# 安装依赖
cd workspace-files/shadiao-agent && bun install

# 开发模式（Vite + Electron + 热重载）
cd apps/electron && bun run dev

# 构建
cd apps/electron && bun run build

# 打包 macOS
cd apps/electron && bun run dist:mac

# 类型检查
bun run typecheck

# 测试
bun test
```

## 本地数据

```text
~/.shadiao-agent/
├── auth.json                 # 用户 JWT 本地存储
├── user-profile.json         # 用户信息缓存
├── characters-cache.json     # 人物列表本地缓存
├── conversations.json        # Chat 会话索引
├── conversations/
│   └── {uuid}.jsonl          # Chat 会话记录
├── agent-sessions.json       # Agent 会话索引
├── agent-sessions/
│   └── {uuid}.jsonl          # Agent 会话记录
├── agent-workspaces/
│   └── {slug}/
│       ├── workspace-files/  # 工作区持久文件
│       ├── mcp.json          # MCP Server 配置
│       └── skills/           # Skills 配置
├── anim-cache/               # 角色动画文件缓存
├── attachments/              # 附件文件
├── settings.json             # 应用设置
└── sdk-config/               # Agent SDK 配置
```

API Key 由 Django 后端统一管理，客户端不需存储。JWT 通过 Electron `safeStorage` 加密存储。

## 实施阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 骨架搭建 + 核心 Agent 链路 | ✅ 已完成 |
| Phase 2 | 人物系统 + 角色动画 | 🔧 开发中 |
| Phase 3 | 奖励系统 + 游戏化 | 📋 待开始 |
| Phase 4 | Skills/MCP + 系统完善 | 📋 待开始 |
| Phase 5 | 商店 + 社交 | 📅 远期 |

## 贡献

欢迎修 Bug、补文档、加测试、完善体验，也欢迎围绕沙雕人物提交新的皮肤设计、动画效果或 Agent 工作流。

提交 PR 前请确认：

- 使用 Bun 运行脚本，不混用 npm / pnpm lockfile。
- 状态管理使用 Jotai。
- 尽量保持本地优先，优先使用 JSON / JSONL 配置文件。
- TypeScript 不使用 `any`，对象结构优先使用 `interface`。
- 新增 IPC 时同步修改 shared 类型、main handler、preload bridge 和 renderer 调用。
- 影响包行为时递增对应 package 的 patch 版本。
- 注释和日志采用中文，保留专业术语。

## 致谢

- [Proma](https://github.com/ErlichLiu/Proma)：架构灵感与 Agent SDK 集成参考。
- [Shiki](https://shiki.style/)：代码高亮。
- [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid)：Mermaid 图表渲染。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio)：多供应商桌面 AI 产品启发。
- [Lobe Icons](https://github.com/lobehub/lobe-icons)：AI / LLM 品牌图标。
- [Craft Agents OSS](https://github.com/lukilabs/craft-agents-oss)：Agent SDK 集成模式参考。

## 许可证

沙雕智能体社区版采用 [GNU Affero General Public License v3.0（AGPL-3.0）](./LICENSE) 开源，完整条款见根目录 `LICENSE` 文件。

**个人 / 非商业使用**：自由使用、修改、分发，仅需遵守 AGPL-3.0 条款。

**商业使用**：在完全遵守 AGPL-3.0 条款的前提下允许进行商业使用，包括但不限于：以源代码或修改后的形式分发软件、通过网络对外提供服务时必须公开完整修改源码（含网络交互层）、衍生作品须以 AGPL-3.0 继续授权。

**商业授权（豁免 AGPL-3.0 义务）**：如果你希望将沙雕智能体集成到闭源产品、对外提供 SaaS 服务但不想公开衍生代码、或有其他无法满足 AGPL-3.0 条款的商业场景，请联系作者获取商业许可。

向本项目提交 Pull Request 即视为同意将贡献以 AGPL-3.0 及未来商业许可形式授权给项目维护者。
