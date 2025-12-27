# PRD 与开发文档不一致点清单（v0.2.2）

范围：`AI_Learning_OS_PRD_Adult_v0.2.2.md` 与 `docs/ai-learning-os/` 下文档。

## 命名
- Session 来源字段命名不一致：扩展 payload 使用 `session.source`，数据库表字段为 `sessions.source_type`。

## 字段
- 导入格式不一致：PRD 写 JSON 或 MD，Bridge 与扩展 spec 以 JSONL 为主，且未在 Bridge import 明确 `markdown_text` 字段。
- 导入请求字段不一致：扩展 payload 包含 `session.source`，Bridge import 请求字段未包含该字段。
- 生成结果字段缺失：生成 spec 的结构化 JSON 未包含 `summary` 字段，但 PRD 与 OpenNotebook 同步 spec 要求写入 Summary。
- 错误响应缺失：Bridge spec 的验收写明错误格式固定，但各 API 未定义统一错误响应字段。

## 路径
- Bridge base URL 与端口只在扩展配置中给出默认值 `http://127.0.0.1:7331`，PRD 与 Bridge spec 未给出一致的默认端口与 base path 说明。

## 模块边界
- PRD 在 VS Code 插件侧写明 “Sync to OpenNotebook”，而扩展 spec 明确只同步到 Bridge，由 Bridge 负责 OpenNotebook 写入。
- PRD 要求 OpenNotebook Chat 强制引用来源，但 OpenNotebook 同步 spec 未定义由谁负责落实引用格式与校验。

## 验收标准
- Bridge spec 允许 `generate` 与 `sync` 返回 501，但 PRD 与 Backlog 将生成与同步作为 MVP P0 必须完成的闭环。
