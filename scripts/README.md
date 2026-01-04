# Scripts

本目录放一些“一次性/可复用”的项目管理脚本（不参与 VS Code 扩展发布）。

## create-ai-learning-os-project

用途：在 GitHub 上创建（或复用）`AI Learning OS v0.3.4` Project，并按 `docs/ai-learning-os/BACKLOG.md` 的 **P0** 清单创建 Issues、加入 Project、填写字段（`Module/Priority/Milestone/OpenSpec Change`）。

前置：
- Node.js 18+（本机已装即可）
- 一个有权限的 GitHub PAT（推荐复用 Codex/MCP 的 token）

环境变量（二选一）：
- `GITHUB_PAT_TOKEN`（推荐）
- `GITHUB_TOKEN`

示例：

```powershell
$env:GITHUB_PAT_TOKEN = "YOUR_TOKEN"
node scripts/create-ai-learning-os-project.mjs --repo abgyjaguo/codex-chat-exporter --dry-run
node scripts/create-ai-learning-os-project.mjs --repo abgyjaguo/codex-chat-exporter
```
