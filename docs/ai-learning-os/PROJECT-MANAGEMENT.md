# GitHub Projects + GitHub MCP + OpenSpec（v0.3.4 工作流）

目标：让你可以**多开 Codex CLI 并行开发**，同时用 GitHub Projects 做任务编排/流转，并用 OpenSpec 做“需求真相源 + 变更提案”。

## 0) 现状（本仓库已完成的初始化）

已在仓库内完成：
- OpenSpec 作为 spec 真相源的骨架：`openspec/project.md`、`openspec/specs/**`
- P0 相关的 OpenSpec change proposals：
  - `openspec/changes/add-export-center-api/`
  - `openspec/changes/add-replay-stub/`
  - `openspec/changes/harden-bridge-import/`
  - `openspec/changes/expand-privacy-redaction/`
- GitHub 协作模板：
  - `.github/pull_request_template.md`
  - `.github/ISSUE_TEMPLATE/feature.md`

需要你本机确认/完成（因为涉及你的 GitHub 权限/token）：
- [ ] 在环境变量里设置 `GITHUB_PAT_TOKEN`（推荐“用户环境变量”持久化）
- [ ] 重启 Codex CLI，确保 `github` MCP server 可启动
- [ ] 你在 Codex 里执行的 “PM 指令” 已在 GitHub 上创建 Project/Issues/字段，并能在网页上看到

## FAQ：为什么我在 `main` 看不到本文件？

如果你是在 `D:\\codex-chat-exporter-main`（`main` 分支工作区）里找 `docs/ai-learning-os/PROJECT-MANAGEMENT.md`，但发现文件“不见了”，通常原因是：

- 该文件在**另一个 worktree / 分支**里（例如 `D:\\cce-wt-pm` 的 `chore/pm-and-spec`），尚未通过 PR 合并回 `main`。

你可以这样确认：

```powershell
git worktree list
cd D:\\cce-wt-pm
git status -sb
```

解决方式：
- 直接在 `D:\\cce-wt-pm` 里继续维护本文档；或
- 在 GitHub 上为 `chore/pm-and-spec` 创建 PR 并合并到 `main`，之后 `main` 工作区就会出现该文件。

## 1) 一次性配置（只做一次）

### 1.1 配置 GitHub MCP（托管服务）
本项目使用 GitHub MCP 托管服务：`https://api.githubcopilot.com/mcp/`。

你的本机 `~/.codex/config.toml` 需要包含（示例）：

```toml
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_PAT_TOKEN"
http_headers = { "X-MCP-Toolsets" = "repos,issues,pull_requests,projects" }
```

然后在**每个终端**里设置 token（示例）：

```powershell
$env:GITHUB_PAT_TOKEN="YOUR_TOKEN"
```

> 安全提示：不要把 token 写进任何 git 跟踪的文件；不要把 token 粘贴到 issue/PR；如怀疑泄漏请立刻 revoke 并重新生成。

### 1.2 建 GitHub Project（一次性）
在 GitHub 仓库里新建一个 Project（Board）。

建议字段：
- `Status`: Todo / In progress / Blocked / Done
- `Module`: Docs / Extension / Bridge / OpenNotebook / ReplayUI
- `Priority`: P0 / P1
- `Milestone`: M1 / M2 / M3
- `OpenSpec Change`: 文本字段（例如 `add-export-center-api`）

### 1.3 快速自检（避免“我发了 PM 指令但没生效”）
1. 打开 GitHub 网页：确认 Project 已创建，字段已存在（至少 `Status/Module/Priority/Milestone/OpenSpec Change`）。
2. 在 Project 里确认：
   - P0 Issues 是否都已添加到看板
   - 每个 Issue 是否填了 `OpenSpec Change`（能把实现分支和 spec 对齐）
3. 在本机终端确认 MCP 启动：
   - `echo $env:GITHUB_PAT_TOKEN` 有值
   - 重启后 `codex mcp list` 能看到 `github` 且不是 failed

## 2) OpenSpec：两层含义（你选“唯一真相源”）

### 2.1 “OpenSpec 是唯一 spec 真相源”是什么意思
- `openspec/specs/**`：描述**当前已经实现的系统行为**（What IS）。
- `openspec/changes/**`：描述**准备要改/要加的变更**（What SHOULD change）。
- 当变更实现并合并后，通过 `openspec archive <change-id>` 把变更归档，并把 delta 合回 `openspec/specs/**`，让 specs 继续代表“现状真相”。

### 2.2 “只用 OpenSpec 做 change proposals”是什么意思（你这次不选）
- 你仍然把 `docs/**` 当作主 spec；OpenSpec 只用来写 proposal/tasks 方便 AI 执行。
- 优点：迁移成本低；缺点：真相源分散，容易漂移。

## 3) 并行开发：多开 worktree + 多开 Codex CLI
推荐每个模块 1 个 worktree + 1 个 Codex CLI 会话，并严格限制改动范围（避免冲突）。

示例：
- `chore/pm-and-spec`：只改 `openspec/**` + 文档
- `feat/export-center-api`：只改 `bridge/**`
- `feat/replay-ui`：只改 `bridge/**` 或 `frontend/**`（按方案定）

### 3.0 启动命令（Windows / PowerShell 示例）
每个终端都需要有 `GITHUB_PAT_TOKEN`：

```powershell
$env:GITHUB_PAT_TOKEN="YOUR_TOKEN"
```

然后在不同终端分别启动不同 worktree 的 Codex（示例）：

```powershell
codex -C D:\cce-wt-pm
codex -C D:\cce-wt-export
codex -C D:\cce-wt-replay
codex -C D:\cce-wt-import
codex -C D:\cce-wt-privacy
```

### 3.1 推荐的“3 会话”分工（最高效）
- **PM/Spec 会话（唯一协调口）**
  - 只改：`openspec/**`、`docs/**`、`.github/**`
  - 负责：写/评审 proposal、拆 issue、维护 Project 字段、合并顺序
- **实现会话 A（例如 Export Center）**
  - 只改：`bridge/**`
  - 负责：严格按 `openspec/changes/add-export-center-api/tasks.md` 逐条实现
- **实现会话 B（例如 Replay Stub）**
  - 只改：`bridge/**` 或 `frontend/**`（二选一，坚持到底）
  - 负责：严格按 `openspec/changes/add-replay-stub/tasks.md` 逐条实现

### 3.2 多 Codex CLI“同步协同”的关键规则（防冲突）
1. **一个会话只做一个 Issue**（同模块也不要并行两条）
2. **一个 Issue 绑定一个 OpenSpec change-id**
3. **一个 change-id 对应一个 PR**（PR 描述里写 `Closes #123`）
4. 合并策略：
   - 每个实现分支每天至少 `git fetch origin` + `git rebase origin/main` 一次
   - 避免在两个 worktree 同时改同一个目录（尤其是 `bridge/src/db.js`、契约类文件）
5. 任何发现“契约要变”：
   - 先回到 PM/Spec 会话，更新 OpenSpec change/spec，再继续写代码

## 4) 用 GitHub MCP 做项目管理（建议的最小闭环）

### 4.1 让 Codex 帮你“建 Project + 建 Issues + 填字段”
在 `codex` 里直接发一条“PM 指令”，让它调用 GitHub MCP 工具：

> 在仓库 `abgyjaguo/codex-chat-exporter` 中：创建一个名为 `AI Learning OS v0.3.4` 的 GitHub Project（Board）；创建 P0 的 Issues（以 `docs/ai-learning-os/BACKLOG.md` 为准）；把每个 Issue 加入 Project，并填写 `Module/Priority/Milestone/OpenSpec Change` 字段。

（你可以把 backlog 里每条任务粘进同一条消息，让它批量建 issues。）

### 4.1.1（本仓库）一键创建 Project + P0 Issues（推荐）
如果你当前运行环境没有 `gh`，或者你希望把创建过程“脚本化/可复用”，可以直接用本仓库脚本：

- `scripts/create-ai-learning-os-project.mjs`：创建 `AI Learning OS v0.3.4` Project（Projects v2），并按 `docs/ai-learning-os/BACKLOG.md` 的 **P0** 清单创建 Issues、加入 Project、填写字段（`Module/Priority/Milestone/OpenSpec Change`）。

PowerShell 示例（推荐复用你在 Codex/MCP 用的同一个 PAT）：

```powershell
$env:GITHUB_PAT_TOKEN = "YOUR_TOKEN"
node scripts/create-ai-learning-os-project.mjs --repo abgyjaguo/codex-chat-exporter
```

Dry run（不写 GitHub，只解析/打印）：

```powershell
node scripts/create-ai-learning-os-project.mjs --dry-run --repo abgyjaguo/codex-chat-exporter
```

### 4.2 每天的执行节奏
1. Project 里每个模块最多 1 个 `In progress`
2. 对每个 `In progress` 的 Issue：创建/更新对应 OpenSpec change（proposal + tasks）
3. 在对应 worktree 的 Codex 会话里实现，并在 PR 里写 `Closes #123`
4. 合并后：把 Project 卡片移到 Done，并 `openspec archive <change-id>`

### 4.3 v0.3.4 P0（已建 Issue）的推荐映射（Issue → change-id → 分支/worktree）
> 以仓库 `abgyjaguo/codex-chat-exporter` 当前的 P0 Issues 为例（标题中带 `[P0][..]`）。

- Export Center（#9–#13）→ `add-export-center-api` → 分支建议：`feat/export-center-api`（worktree：`D:\cce-wt-export`）
- Replay（#14–#16）→ `add-replay-stub` → 分支建议：`feat/replay-stub`（worktree：`D:\cce-wt-replay`）
- Bridge Import/Normalize（#6–#8）→ `harden-bridge-import` → 分支建议：`feat/harden-bridge-import`（worktree：`D:\cce-wt-import`）
- Privacy Redaction（#17–#18）→ `expand-privacy-redaction` → 分支建议：`feat/expand-privacy-redaction`（worktree：`D:\cce-wt-privacy`）

## 5) 贯穿全流程需要持续维护的 Markdown 文档（清单）

### 5.1 必须持续更新（OpenSpec 真相源）
- `openspec/specs/**/spec.md`：**现状真相（What IS）**；每次变更合并后都要更新/归档回这里
- `openspec/changes/**/proposal.md`：**为什么要改（Why/What）**
- `openspec/changes/**/tasks.md`：**实现清单**；开发过程中持续勾选（最后必须全 `- [x]`）
- `openspec/changes/**/specs/**/spec.md`：**需求 delta（What SHOULD change）**

### 5.2 建议持续更新（运行/协作风险）
- `docs/ai-learning-os/RISKS.md`：踩坑/风险新增就记（避免重复踩）
- `docs/ai-learning-os/INCONSISTENCIES.md`：PRD/实现/契约不一致就记录并决策
- `docs/ai-learning-os/PROJECT-MANAGEMENT.md`：工作流调整时更新（平时不频繁改）

### 5.3 相对稳定（偶尔更新）
- `README.md`：对外使用说明（命令/配置项/默认行为）
- `prd/**`：PRD/设计文档（大版本变更才更新）
