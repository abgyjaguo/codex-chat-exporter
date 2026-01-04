# OpenNotebook 集成方案（双层架构）v0.3.4
日期：2025-12-30

## 1. 推荐结论
- OpenNotebook **不是 P0 必须**，但能大幅提升“长期沉淀/阅读/编辑/检索/追问”体验。
- 推荐：AI Learning OS（System of Record） + Notebook（Knowledge Surface）
- 推荐：**单向发布（One-way publish）**，避免双向同步冲突。
  - 备注：本版本增加 **Sync OpenNotebook**，用于补齐“导出 → 归档 → 可检索追问”的闭环（仍保持单向发布）。

## 2. P0：Export Markdown ZIP（零集成）
- 一键导出 ZIP → 导入 OpenNotebook 或放到 Obsidian vault
- frontmatter + backlinks 必填（用于追溯与证据回跳）

## 3. P1：Sync OpenNotebook（闭环：Publish Connector）
目标：在不做“双向同步”的前提下，把 AI Learning OS 的结构化资产以 Markdown 形式发布到 OpenNotebook，支持长期检索与基于来源的追问，同时所有证据链接统一回跳到 Replay UI。

### 3.1 对接对象：开源 OpenNotebook（lfnovo/open-notebook）
- GitHub：<https://github.com/lfnovo/open-notebook>
- 形态：OpenNotebook 提供 UI + REST API（用于创建 notebook、写入 sources、写入 notes）。
- 运行建议：本地 docker compose（默认 UI 端口 8502、API 端口 5055）。

### 3.2 发布内容（最小集）
- **Sources（会话原文）**：每个 Session 生成 1 个 Source（Markdown），每条 message 具有稳定锚点（如 `#m-000123`），用于证据定位。
- **Notes（结构化产物）**：Summary / Study Pack / Milestones（含 Evidence Map）。
- **Assets（可选）**：TechCard / Playbook / Practice（按 item_type 输出 Markdown）。

### 3.3 幂等与可重试（必须）
- 同一 project 多次 sync 不重复创建 notebook。
- 同一 session 多次 sync 不重复创建 source；更新内容时覆盖/更新（upsert）。
- 同一 note_kind 多次 sync 不重复创建 note；更新内容时覆盖/更新（upsert）。
- 失败能定位到：网络/鉴权/参数/服务端错误，便于重试。

### 3.4 鉴权（可选）
- 若 OpenNotebook 启用了 APP_PASSWORD（或等价鉴权），通过 `Authorization: Bearer <token>` 访问其 API。

### 3.5 重要约束：证据回跳指向 Replay UI
- OpenNotebook 内部可用的引用/链接格式不作为最终标准。
- AI Learning OS 发布到 OpenNotebook 的 Notes/Assets 中，`evidence_links` 与 `Open in Replay` 必须可点击回到 Replay UI（最终证据查看入口）。

## 4. Markdown 契约（必填）
frontmatter：
- source: ai-learning-os
- version: v0.3.4
- item_type: tech_card | playbook | practice | session | portfolio
- learn_status, verification, interaction_mode, impl_source
- project_id, session_id, source_item_id
- evidence_links: [Replay deep links]   # 最终证据回跳入口
- tags: []

backlinks：
- Open in Replay（deep link）           # Replay UI 的可点击链接
- Source Item（deep link）              # 指向当前 item 的“权威数据源”入口（可为 Replay 或 AI Learning OS 内部页）

## 5. Replay deep link（契约草案）
为确保“证据可追溯”，Replay UI 需要提供稳定链接（示例，仅为契约草案）：
- Session 页面：`{BRIDGE_PUBLIC_BASE_URL}/replay/projects/{project_id}/sessions/{session_id}`（默认 `http://127.0.0.1:7331`）
- Message 锚点：以上 URL + `#m-000123`

> 注：
> - 发布到 OpenNotebook/ZIP 的链接必须是绝对 URL，因此需要可配置的 `BRIDGE_PUBLIC_BASE_URL`。
> - 如果未来 Replay UI 与 Bridge 分离部署，只要保持 URL 生成规则稳定即可。

## 6. 未成年人安全
- 默认不导出/不发布全量对话
- Publish 需教师审批（P1）
