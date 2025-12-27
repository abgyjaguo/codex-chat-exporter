# 30 - 同步到 OpenNotebook（MVP）

## 1. 目标
- Bridge 将导入的 **Sources**（原始对话和规范化对话）与生成的 **Notes**（Summary、Study Pack、证据图）写入 OpenNotebook。
- 维护 `project ↔ notebook` 映射，保证多次同步 **幂等**（不重复创建）。

## 2. API 契约
`POST /bridge/v1/projects/{project_id}/sync/open-notebook`

### Request 字段
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | `sess_0001` | 会话 id |
| targets | array | 否 | `["sources","notes"]` | 同步目标，默认同时包含 sources 和 notes |
| note_kinds | array | 否 | `["summary","study_pack","milestones"]` | 仅在 targets 包含 notes 时生效 |
| include_raw_jsonl | boolean | 否 | `false` | 是否写入原始 JSONL |

### Request 示例
```json
{
  "session_id": "sess_0001",
  "targets": ["sources", "notes"],
  "note_kinds": ["summary", "study_pack", "milestones"],
  "include_raw_jsonl": false
}
```

### Response 字段（200）
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| project_id | string | 是 | `proj_0001` | 项目 id |
| session_id | string | 是 | `sess_0001` | 会话 id |
| notebook_id | string | 是 | `nb_0001` | notebook id |
| source_id | string | 是 | `src_0001` | Sources id |
| note_ids | object | 否 | - | Notes id 集合 |
| synced_at | string | 是 | `2025-12-26T00:02:00Z` | 同步完成时间 |
| warnings | array | 否 | `[]` | Warning 列表 |

### Response 示例
```json
{
  "project_id": "proj_0001",
  "session_id": "sess_0001",
  "notebook_id": "nb_0001",
  "source_id": "src_0001",
  "note_ids": {
    "summary": "note_0001",
    "study_pack": "note_0002",
    "milestones": "note_0003"
  },
  "synced_at": "2025-12-26T00:02:00Z",
  "warnings": []
}
```

### 错误响应
使用 `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md` 的 Error 响应结构，典型为 400、404、500。

## 3. 不确定项（需要尽快确认）
- OpenNotebook 的写入接口：HTTP API、SDK 或本地文件结构？
- Source 和 Note 的最小字段：标题、正文、标签、引用格式？

## 4. 适配器接口（建议先抽象）

Bridge 内部定义：
- `createOrGetNotebook(project) -> notebook_id`
- `upsertSource(notebook_id, session, content) -> source_id`
- `upsertNote(notebook_id, kind, content, links) -> note_id`

MVP 可以先做一个 `filesystem` adapter（把 sources 和 notes 写到指定目录），等 OpenNotebook API 明确后再换成 `http` adapter。

## 5. 写入内容（MVP 最小集）

- **Sources**
  - 原始 JSONL（可选）
  - 规范化 Markdown（建议每条消息一个稳定锚点 `m-000123`，支持回跳）
- **Notes**
  - Summary（复盘报告）
  - Study Pack（练习、反思、清单）
  - Milestones 与 Evidence Map（claim 到 message anchors）

## 6. 证据链写入规则
- Sources Markdown 每条消息必须包含锚点 `<a id="m-000123"></a>`，id 必须与 `message_id` 完全一致。
- 建议格式为锚点行加消息头行，例如 `#### m-000123 | role | 2025-12-26T00:00:00Z`。
- Notes 中的回跳链接使用 `source://{source_id}#m-000123` 形式，Syncer 可按目标系统要求改写，但必须保留 `#m-000123`。

## 7. 验收标准（MVP）
- [ ] 同一 project 多次 sync 不重复创建 notebook
- [ ] Notes 中的证据引用能回跳到 Sources（至少能定位到某条消息）
- [ ] 同步失败可重试，错误信息可定位（4xx、5xx、网络、鉴权）
