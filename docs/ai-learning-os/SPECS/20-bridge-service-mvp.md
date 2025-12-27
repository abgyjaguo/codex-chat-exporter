# 20 - Bridge 服务（MVP）

## 1. 目标
- 提供本地优先运行的 Bridge 服务：导入 Codex 会话 → 结构化 → 触发生成 → 同步 OpenNotebook。
- MVP 先保证 **JSONL 导入** 可用；Markdown 导入可后续补。

## 2. 建议技术栈（可调整）
- Node.js（与 VS Code 扩展生态一致）
- HTTP Server：Express/Fastify 均可
- SQLite：存 project/session/source 映射、生成结果缓存

## 3. API（按 PRD 建议）

### 3.1 导入
`POST /bridge/v1/import/codex-chat`

Request（MVP）：
```json
{
  "project": { "name": "string", "cwd": "string" },
  "session": { "name": "string" },
  "exported_at": "ISO-8601",
  "codex": { "jsonl_text": "string" }
}
```

Response（示例）：
```json
{
  "project_id": "proj_0001",
  "session_id": "sess_0001",
  "message_count": 123,
  "warnings": []
}
```

### 3.2 生成
`POST /bridge/v1/projects/{project_id}/generate`

Request（示例）：
```json
{
  "session_id": "sess_0001",
  "mode": "adult_mvp"
}
```

Response：见 `docs/ai-learning-os/SPECS/21-bridge-generation.md`

### 3.3 同步到 OpenNotebook
`POST /bridge/v1/projects/{project_id}/sync/open-notebook`

Request（示例）：
```json
{
  "session_id": "sess_0001",
  "targets": ["sources", "notes"]
}
```

## 4. 数据落库（建议最小表）

- `projects(id, name, cwd, created_at)`
- `sessions(id, project_id, name, imported_at, source_type)`
- `sources(id, session_id, raw_jsonl, normalized_json, redacted_json, created_at)`
- `generations(id, session_id, mode, output_json, output_md, created_at)`
- `notebook_map(project_id, notebook_id, provider, updated_at)`

## 5. 验收标准（MVP）
- [ ] Import：能导入 JSONL 并落库，返回稳定 id
- [ ] Normalize：能产出规范化 `Message[]`（role/timestamp/text 至少齐全）
- [ ] Generate/Sync 接口可先返回 `501 Not Implemented`（但路由与错误格式固定）
