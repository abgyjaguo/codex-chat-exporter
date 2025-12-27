# 10 - VS Code 扩展：Sync to Bridge（MVP）

## 1. 目标
- 在现有“导出聊天记录”的基础上，新增 **一键同步到 Bridge** 的能力（P0）。
- 同步时附带最小元信息（project/session/Done 标准等），提升后续里程碑与学习点准确性。

## 2. 非目标
- 不在扩展侧做复杂的总结/生成（统一放到 Bridge）。
- 不在扩展侧实现 OpenNotebook 写入（由 Bridge 负责）。

## 3. 新增命令（建议）
- `Codex: 同步聊天记录到 Bridge`
  - 支持：选择 1 到 N 个会话（复用现有 quick pick 逻辑）
  - 交互：输入/确认 `project_name`、`session_name`（可默认值 + 可编辑）
  - 反馈：进度条 + 成功/失败摘要

> 可选增强：`Codex: 同步最近一次聊天记录到 Bridge`

## 4. 配置项（建议，均以 `codexChatExporter.*` 命名）
- `codexChatExporter.bridgeBaseUrl`：默认 `http://127.0.0.1:7331`
- `codexChatExporter.defaultProjectName`：默认空（优先用 workspace folder 名）
- `codexChatExporter.defaultDoneDefinition`：默认空（MVP 可不填）
- `codexChatExporter.syncIncludeRawJsonl`：默认 `true`（Bridge MVP 至少吃 JSONL）
- `codexChatExporter.syncIncludeMarkdown`：默认 `false`（可后续补）

## 5. 同步 Payload（MVP 建议）

扩展向 Bridge 调用：

`POST {bridgeBaseUrl}/bridge/v1/import/codex-chat`

JSON（建议形态，具体以 Bridge spec 为准）：

```json
{
  "project": { "name": "xxx", "cwd": "/path/to/workspace" },
  "session": { "name": "yyy", "source": "codex_jsonl" },
  "exported_at": "2025-12-26T00:00:00.000Z",
  "codex": { "jsonl_text": "PASTE_JSONL_TEXT_HERE" }
}
```

## 6. 验收标准（MVP）
- [ ] 能选择会话并成功调用 Bridge import 接口，UI 反馈成功/失败
- [ ] 同步结果能拿到 `project_id` / `session_id` 并展示给用户（便于排查）
- [ ] 默认不上传 tool outputs / environment context（降低泄密风险）

## 7. 手工测试清单
- Bridge 未启动：提示“无法连接”
- Bridge 返回 4xx：提示具体错误
- 多会话同步：进度与失败不影响其它会话
