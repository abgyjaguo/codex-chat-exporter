# 20 - Bridge 服务（MVP）

## 1. 目标
- 提供本地优先运行的 Bridge 服务：导入 Codex 会话 → 结构化 → 触发生成 → 同步 OpenNotebook。
- MVP 先保证 **JSONL 导入** 可用；Markdown 导入可后续补。

## 2. 建议技术栈（可调整）
- Node.js（与 VS Code 扩展生态一致）
- HTTP Server：Express 或 Fastify
- SQLite：存 project、session、source 映射和生成结果缓存

## 3. API（MVP 契约）

### 3.0 通用约定
- `Content-Type: application/json`
- 时间字段使用 ISO-8601（UTC）
- Warning 结构：
  - `code`：string
  - `message`：string
  - `details`：object，可选
- Error 响应结构（所有 4xx 和 5xx 通用）：
  - `error.code`：string
  - `error.message`：string
  - `error.details`：object，可选
  - `error.request_id`：string，可选

### 3.1 导入
`POST /bridge/v1/import/codex-chat`

#### Request 字段
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| project.name | string | 是 | `cce-wt-docs` | 项目名 |
| project.cwd | string | 否 | `/mnt/d/cce-wt-docs` | 工作区路径 |
| session.name | string | 是 | `2025-12-26-codex` | 会话名 |
| session.source | string | 否 | `codex_jsonl` | 来源类型，默认 `codex_jsonl` |
| exported_at | string | 是 | `2025-12-26T00:00:00Z` | 导出时间 |
| codex.jsonl_text | string | 是 | `{"type":"message","role":"user"}` | JSONL 原文，MVP 必填 |
| codex.markdown_text | string | 否 | `# Codex Chat` | Markdown 原文，后续可用 |

#### Request 示例
```json
{
  "project": { "name": "cce-wt-docs", "cwd": "/mnt/d/cce-wt-docs" },
  "session": { "name": "2025-12-26-codex", "source": "codex_jsonl" },
  "exported_at": "2025-12-26T00:00:00Z",
  "codex": { "jsonl_text": "{\"type\":\"message\",\"role\":\"user\",\"content\":\"hello\"}" }
}
```

#### Response 字段（200）
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| project_id | string | 是 | `proj_0001` | 项目 id |
| session_id | string | 是 | `sess_0001` | 会话 id |
| source_id | string | 是 | `src_0001` | Sources id |
| message_count | number | 是 | `123` | 规范化消息数量 |
| imported_at | string | 是 | `2025-12-26T00:00:01Z` | 导入完成时间 |
| warnings | array | 否 | `[]` | Warning 列表 |

#### Response 示例
```json
{
  "project_id": "proj_0001",
  "session_id": "sess_0001",
  "source_id": "src_0001",
  "message_count": 123,
  "imported_at": "2025-12-26T00:00:01Z",
  "warnings": []
}
```

#### 错误响应
使用 3.0 的 Error 响应结构，典型为 400 或 413。

### 3.2 生成
`POST /bridge/v1/projects/{project_id}/generate`

- API 契约见 `docs/ai-learning-os/SPECS/21-bridge-generation.md`

### 3.3 同步到 OpenNotebook
`POST /bridge/v1/projects/{project_id}/sync/open-notebook`

- API 契约见 `docs/ai-learning-os/SPECS/30-open-notebook-sync.md`

## 4. Message 规范化与 message_id 规则
- 每条规范化消息生成 `message_id`，格式为 `m-` 加 6 位数字（从 `m-000001` 开始）。
- 顺序规则：按时间戳升序；时间戳相同或缺失时按原始导入顺序。
- 同一条原始记录若拆成多条消息，按输出顺序分配连续 id。
- `message_id` 在同一 session 内唯一，并在重复导入相同数据时保持稳定。

## 5. 数据落库（建议最小表）

- `projects(id, name, cwd, created_at)`
- `sessions(id, project_id, name, imported_at, source_type)`
- `sources(id, session_id, raw_jsonl, normalized_json, redacted_json, created_at)`
- `generations(id, session_id, mode, output_json, output_md, created_at)`
- `notebook_map(project_id, notebook_id, provider, updated_at)`

## 6. 验收标准（MVP）
- [ ] Import：能导入 JSONL 并落库，返回稳定 id
- [ ] Normalize：能产出规范化 `Message[]`（role、timestamp、text 至少齐全）
- [ ] Generate/Sync 接口可先返回 `501 Not Implemented`（但路由与错误格式固定）
