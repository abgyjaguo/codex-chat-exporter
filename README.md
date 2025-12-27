# Codex Chat Exporter（VS Code 扩展）

用于从本机 `~/.codex` 中读取 Codex（OpenAI VS Code 扩展）产生的会话日志（`.jsonl`），并导出为：

- Markdown（对话稿，提取 user/agent 消息）
- 原始 JSONL（完整日志，直接复制）

## AI Learning OS（成人版）文档

你可以基于本扩展继续做“AI 协作复盘 + 学习资产化”（见 PRD）：

- PRD：`AI_Learning_OS_PRD_Adult_v0.2.2.md`
- 开发文档入口：`docs/ai-learning-os/README.md`

## 使用方式

1. 在 VS Code 打开本项目目录。
2. 按 `F5` 启动 Extension Development Host。
3. 在命令面板运行：
   - `Codex: 导出聊天记录…`
   - `Codex: 导出最近一次聊天记录…`

## Windows 使用

1. 安装：在 VS Code 命令面板运行 `Extensions: Install from VSIX...`，选择 `codex-chat-exporter-*.vsix`。
2. 默认数据目录：`%USERPROFILE%\\.codex`（一般无需改）。
3. 使用：命令面板运行 `Codex: 导出聊天记录…`。

## 配置项

在 VS Code 设置中搜索 `Codex Chat Exporter`：

- `codexChatExporter.codexDir`：Codex 数据目录（默认 `~/.codex`）
- `codexChatExporter.onlyVsCodeSessions`：仅显示/导出 VS Code 会话
- `codexChatExporter.includeAgentReasoning`：Markdown 中包含 reasoning
- `codexChatExporter.includeToolCalls`：Markdown 中包含工具调用
- `codexChatExporter.includeToolOutputs`：Markdown 中包含工具输出（可能包含敏感信息）
- `codexChatExporter.includeEnvironmentContext`：Markdown 中包含 `<environment_context>`（默认不导出）
