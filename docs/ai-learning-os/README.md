# AI Learning OS（成人版）开发文档入口

本目录用于把 **v0.3.4** 的需求拆成可并行开发的模块，并提供可执行的 dev specs / 架构 / 工作流，方便你在同一台电脑多开 VSCode + Codex 并行开发（文档先行，再写代码）。

## 建议的开发顺序（同机并行）
1. 先把这些文档 **commit 到 `main`**（建议顺手 `push`；否则后面创建 worktree 时用本地 `main` 作为 base）。
2. 按 `docs/ai-learning-os/WORKTREES.md` 创建 3–4 个 worktree，并分别打开独立 VSCode 窗口。
3. 每个窗口只做一个模块；编码前先读对应 spec（避免两个窗口改同一处导致冲突）。

## 模块拆分（推荐 4 个并行窗口）
- **00-docs**：文档/契约/Backlog（只改 `docs/ai-learning-os/**` + PRD）
- **10-vscode-extension**：VS Code 插件升级（导出/同步/元信息/手动标记）
- **20-bridge-service**：Bridge 服务（导入/规范化/存储/导出 ZIP/Replay/生成/同步）
- **30-open-notebook-sync**：OpenNotebook 适配与同步（HTTP API + 幂等 + 可重试）
- （可选第 5 窗口）**60-replay-ui**：Replay UI（会话回放 + 深链锚点 + 搜索）

## 关键链接
- PRD（v0.3.4）：`prd/AI_Learning_OS_PRD_Adult_v0.3.4_NotebookLayer.md`
- OpenNotebook 集成（v0.3.4）：`prd/AI_Learning_OS_OpenNotebook_Integration_v0.3.4_zh.md`
- Backlog（v0.3.4）：`prd/AI_Learning_OS_Backlog_v0.3.4.md`
- 架构：`docs/ai-learning-os/ARCHITECTURE.md`
- 并行开发（worktree）：`docs/ai-learning-os/WORKTREES.md`
- Backlog：`docs/ai-learning-os/BACKLOG.md`
- 不一致点清单：`docs/ai-learning-os/INCONSISTENCIES.md`
- 风险与坑位清单：`docs/ai-learning-os/RISKS.md`
- References: `docs/ai-learning-os/REFERENCES.md`
- 不会变的契约清单：`docs/ai-learning-os/STABLE-CONTRACTS.md`
- 项目管理（GitHub Projects + MCP + OpenSpec）：`docs/ai-learning-os/PROJECT-MANAGEMENT.md`
- OpenSpec（真相源/变更提案）：`openspec/AGENTS.md`
- Specs：
  - `docs/ai-learning-os/SPECS/10-vscode-extension-sync.md`
  - `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md`
  - `docs/ai-learning-os/SPECS/21-bridge-generation.md`
  - `docs/ai-learning-os/SPECS/30-open-notebook-sync.md`
  - `docs/ai-learning-os/SPECS/40-privacy-redaction.md`
  - `docs/ai-learning-os/SPECS/50-export-center.md`
  - `docs/ai-learning-os/SPECS/60-replay-ui.md`

## 同机多开 Codex 的“协同规则”
- 单窗口单模块：避免两个窗口同时改同一个目录/文件。
- 文档先行：接口/数据格式先在 docs 定稿，再进入各模块实现。
- 小步提交：每完成一个可验证小点就提交；窗口间通过 `origin/main` 频繁同步。
