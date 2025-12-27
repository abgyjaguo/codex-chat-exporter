# 30 - 同步到 OpenNotebook（MVP）

## 1. 目标
- Bridge 将导入的 **Sources**（原始对话/规范化对话）与生成的 **Notes**（Summary/Study Pack/证据图）写入 OpenNotebook。
- 维护 `project ↔ notebook` 映射，保证多次同步 **幂等**（不重复创建）。

## 2. 不确定项（需要尽快确认）
- OpenNotebook 的写入接口：HTTP API / SDK / 本地文件结构？
- Source/Note 的最小字段：标题、正文、标签、引用格式？

## 3. 适配器接口（建议先抽象）

Bridge 内部定义：
- `createOrGetNotebook(project) -> notebook_id`
- `upsertSource(notebook_id, session, content) -> source_id`
- `upsertNote(notebook_id, kind, content, links) -> note_id`

MVP 可以先做一个 `filesystem` adapter（把 sources/notes 写到指定目录），等 OpenNotebook API 明确后再换成 `http` adapter。

## 4. 写入内容（MVP 最小集）

- **Sources**
  - 原始 JSONL（可选）
  - 规范化 Markdown（建议每条消息一个稳定锚点 `m-000123`，支持回跳）
- **Notes**
  - Summary（复盘报告）
  - Study Pack（练习/反思/清单）
  - Milestones & Evidence Map（claim → message anchors）

## 5. 验收标准（MVP）
- [ ] 同一 project 多次 sync 不重复创建 notebook
- [ ] Notes 中的证据引用能回跳到 Sources（至少能定位到某条消息）
- [ ] 同步失败可重试，错误信息可定位（4xx/5xx/网络/鉴权）

