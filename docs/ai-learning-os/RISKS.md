# Risks and gotchas (v0.3.4 + Sync OpenNotebook)

Purpose: write down high-probability pitfalls before coding, so we can lock contracts first and avoid expensive rework.

---

## 风险与坑位清单（v0.3.4 + Sync OpenNotebook）

> 目的：在写代码前，把“高概率踩坑/高成本返工点”集中列出来，作为开发前 checklist。

## 1. 版本与契约
- **v0.2.2 vs v0.3.4 主线冲突**：P0 以 v0.3.4 为准（Export ZIP + Replay），v0.2.2 specs 仅作参考。
- **API 路径统一**：PRD/Backlog 中的 `/exports` 已统一为 `/bridge/v1/exports`（见 `docs/ai-learning-os/STABLE-CONTRACTS.md`）。
- **文档与实现不同步的风险**：每次改契约先改 docs，再改代码；否则多 worktree 并行会相互打架。

## 2. 证据链（最高风险点）
- **message_id 稳定性**：导入/过滤策略一变（是否包含 tool outputs / environment context）就可能导致编号漂移，从而让历史 evidence_links 全部失效。
  - 需要在 Normalizer 中固化：过滤规则 + 排序规则 + message_id 分配规则（并写最少测试样例）。
- **Replay deep link base URL**：发布到 OpenNotebook/ZIP 的链接必须是绝对 URL，否则会指向 OpenNotebook 自己。
  - 需要 `BRIDGE_PUBLIC_BASE_URL`（默认 `http://127.0.0.1:7331`）。

## 3. OpenNotebook 集成（外部依赖）
- **API 版本/路径变动**：OpenNotebook 是外部开源项目，API 可能调整；必须把 base URL、鉴权、超时、重试做成可配置。
- **幂等策略**：OpenNotebook 侧如果出现重复 notebook/source/note，需要可控地清理/覆盖；避免误删用户手工内容。
  - 当前 adapter 通过 title 内嵌 stable key + 本地 state 文件实现幂等（state 丢失会触发“按标题清理”）。
- **不可用降级**：OpenNotebook 不可用时，P0 仍必须能导出 ZIP；Sync 失败必须给出可定位的错误提示。

## 4. 隐私与合规
- **默认最小化**：不导出/不同步 tool outputs 与 environment context（扩展侧与 Bridge 侧都必须双保险）。
- **脱敏覆盖路径**：调用 OpenAI 前、写入 OpenNotebook 前、导出 ZIP 前（至少三处）都要脱敏。
- **日志泄漏**：错误堆栈/调试日志禁止输出包含 secrets 的原文（尤其是 HTTP 请求体与 OpenAI prompt）。

## 5. OpenAI（成本与可靠性）
- **成本不可控**：大对话直接喂模型会很贵；需要限制输入规模/做摘要分段/做缓存。
- **速率限制**：必须有重试/退避与可观测性（错误码、request_id、耗时、token 统计）。
- **结构化输出跑偏**：必须走“结构化 JSON → 本地渲染 Markdown”的两段式，并在本地校验证据链。

## 6. 性能与工程实现
- **导出 ZIP 内存爆炸**：必须流式生成 ZIP，避免一次性把全部 Markdown/ZIP buffer 放内存。
- **Replay UI 大会话卡顿**：必须分页/懒加载；渲染时必须 HTML 转义防 XSS。
- **Windows/WSL 混用**：Node 原生依赖（better-sqlite3）在混用环境极易出错；建议统一在同一环境里 `npm install` + `npm run dev`（详见 `bridge/README.md` 与 `docs/ai-learning-os/WORKTREES.md`）。

## 7. 版本控制与协作
- `prd/` 与 `frontend/` 当前未被 git 跟踪：需要决定是否纳入版本控制，否则多人/多 worktree 协作会丢文档。
- Worktree 并行开发的基本规则：单窗口单模块、文档先行、小步提交（见 `docs/ai-learning-os/WORKTREES.md`）。
