# AI Learning OS（成人版 v0.3.4）Backlog

> 目标：围绕 v0.3.4（OpenNotebook 双层架构）推进；先把 Export Center → Replay（证据回跳） → Privacy（默认脱敏）闭环跑通。

## P0（v0.3.4）

### 20-bridge-service（Import/Normalize）
- [ ] [P0][20-bridge-service] `POST /bridge/v1/import/codex-chat`：接收 JSONL/MD（至少支持 JSONL）
- [ ] [P0][20-bridge-service] Normalize：JSONL → `Message[]`（至少包含 role/timestamp/text + 稳定 `message_id`）
- [ ] [P0][20-bridge-service] 默认不落库/不导出 tool outputs 与 `<environment_context>`（合规默认）

### 50-export-center（Export Bundle / ZIP）
- [ ] [P0][50-export-center] `POST /bridge/v1/exports`：创建导出任务（scope/includes/version）
- [ ] [P0][50-export-center] `GET /bridge/v1/exports`：列表（历史/状态/下载链接）
- [ ] [P0][50-export-center] `GET /bridge/v1/exports/{export_id}/download`：下载 ZIP
- [ ] [P0][50-export-center] ZIP 结构固定：`00_Index.md` + `Sessions/TechCards/Playbooks/Practices/` + `manifest.json`
- [ ] [P0][50-export-center] Markdown 契约：frontmatter + backlinks（`Open in Replay` / `Source Item`）必填

### 60-replay-ui（Evidence / Deep Links）
- [ ] [P0][60-replay-ui] 提供 `/replay`（索引页）与 `/replay/projects/{project_id}/sessions/{session_id}`（会话页）
- [ ] [P0][60-replay-ui] 会话页提供稳定锚点：`#m-000123`（与 `message_id` 一致）
- [ ] [P0][60-replay-ui] evidence_links/backlinks 生成规则稳定可配置（`BRIDGE_PUBLIC_BASE_URL`）

### 40-privacy-redaction
- [ ] [P0][40-privacy-redaction] 脱敏规则库（API Key/token/private key/email/手机号 等）
- [ ] [P0][40-privacy-redaction] 默认策略：同步前 & 生成前都脱敏（防止 secrets 进入 OpenAI / OpenNotebook）

## P1（可选）

- 见 `prd/AI_Learning_OS_Backlog_v0.3.4.md`
