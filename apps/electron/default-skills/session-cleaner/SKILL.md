---
name: session-cleaner
description: 把 沙雕智能体 会话 JSONL 清洗为干净可读的 Markdown 对话，并支持对超长会话的渐进式读取（概览 / 大纲 / 搜索 / 按 turn 区间导出），避免一次性全量读撑爆上下文。当用户提到"清洗会话""解析对话文件""提取对话上下文""过滤流式冗余""导出会话 Markdown""把会话转成对话""整理 agent-sessions""看某个会话讲了什么"时使用此技能。
version: 2.0.0
license: AGPL-3.0-only
---

# Session Cleaner

把 `~/.shadiao-agent/agent-sessions/<id>.jsonl` 里被流式快照污染过的会话，清洗为干净 Markdown 对话。

本技能是 `shadiao-agent` CLI 的**薄封装**：所有解析 / 快照去重 / 渲染逻辑都在 `@shadiao/session-core`（仓库内唯一真源），由 `shadiao-agent session` 命令暴露。技能本身不解析 JSONL，只负责教你按正确的顺序调用 CLI。

> 历史：v1 曾自带一份 Python parser（独立重抄会话格式，会随内部格式漂移）。v2 起改为调用仓库内的 `shadiao-agent` CLI，格式知识只存一处。

## 为什么要渐进式读取

会话 JSONL 可能非常大（实测单个会话原始文件可达 50MB）。直接全量清洗再读进上下文会瞬间撑爆 token。正确做法是**先看结构、再定位、最后只取需要的片段**：

1. `shadiao-agent session info <id>` —— 看体量：turn 数、估算 tokens、字节数。先判断"能不能整篇读"。
2. `shadiao-agent session outline <id>` —— 看地图：每个 turn 一行（角色 + 预览 + 工具概览 + tokens）。定位感兴趣的 turn 下标。
3. `shadiao-agent session search <关键词> <id>` —— 找内容：返回命中的 turn 下标 + 片段。
4. `shadiao-agent session export <id> --turns A-B` —— 只导出需要的 turn 区间到上下文。

**只有在 `info` 显示体量很小（比如估算 tokens < 几千）时，才直接 `export <id>` 全量读。** CLI 内置护栏：未指定 turn 区间且输出超过 50KB 时会拒绝直接输出，改为落盘并提示你用 `--turns`。

## 命令速查

> 下文的 `shadiao-agent` 是命令前缀。若运行时注入了 `SHADIAO_CLI`，用 `"$SHADIAO_CLI"` 代替它——两者等价。

```bash
# 列出会话（按更新时间降序）
shadiao-agent session list [--limit N] [--workspace W]

# 体量/结构概览——决定怎么读之前先跑这个
shadiao-agent session info <id|path>

# turn 级地图：每 turn 一行
shadiao-agent session outline <id|path> [--offset K] [--limit N]

# 会话内搜索关键词，返回命中 turn 下标 + 片段
shadiao-agent session search <关键词> <id|path> [--context N] [--limit N] [--case-sensitive]

# 导出干净 Markdown（窗口化）
shadiao-agent session export <id|path> --turns 5-12       # 只导出第 5~12 个 turn
shadiao-agent session export <id|path> --head 4           # 前 4 个 turn
shadiao-agent session export <id|path> --tail 4           # 后 4 个 turn
shadiao-agent session export <id|path> --out cleaned/x.md # 落盘存档（不受护栏限制）
shadiao-agent session export <id|path> --stdout           # 强制全量输出（绕过护栏，谨慎）

# 所有命令都支持 --json 输出机器可读结果
shadiao-agent session info <id> --json
```

## 典型工作流

**场景：用户问"上一个会话我们讨论了什么 X"**

```bash
# 1. 找到会话
shadiao-agent session list --limit 5
# 2. 看体量（假设很大）
shadiao-agent session info <id>
# 3. 搜关键词定位
shadiao-agent session search "X" <id>
#    → 命中 #7 #12
# 4. 只导出命中邻域
shadiao-agent session export <id> --turns 6-13
```

**场景：用户要把某个小会话整篇转成 Markdown 存档**

```bash
shadiao-agent session info <id>          # 确认体量不大
shadiao-agent session export <id> --out cleaned/<id>.clean.md
```

## 输出形态

清洗后的 Markdown 按角色分段（`## 用户` / `## 助手`），工具调用压缩为单行 `> [工具: name args]`（连续相同调用折叠为 `×N`），thinking 与原始 tool_result 全部丢弃：

```markdown
## 用户

帮我配置机器人图标...

## 助手

我来先探索代码库。

> [工具: Read file_path=/a/b.ts]
> [工具: Bash command=ls assets ×3]
```

## CLI 定位

- **打包版（生产）**：`shadiao-agent` 二进制随桌面 App 分发，运行时由主进程注入 `SHADIAO_CLI` 环境变量指向它。优先直接用 `"$SHADIAO_CLI" session ...`；若该变量为空，说明当前构建未打包 CLI，改用下面的源码方式或直接读 history path 兜底。
- **开发/源码环境**：若 `shadiao-agent` 不在 PATH，用 `bun <repo>/apps/cli/src/index.ts session ...` 直接跑源码。
- **配置目录**：CLI 默认读 `~/.shadiao-agent`；开发模式数据在 `~/.shadiao-agent-dev`，加 `--dev` 或设 `SHADIAO_DEV=1`。

## 实现要点（供维护者）

- 解析 / 快照去重 / 渲染全部在 `@shadiao/session-core`，CLI 只是命令路由。修 bug 或改格式去改 core，不要在本技能里加解析逻辑。
- 格式细节（流式快照碎片化、message.id 合并、旧扁平格式归一）见 `references/cli-usage.md` 与 core 包源码。
