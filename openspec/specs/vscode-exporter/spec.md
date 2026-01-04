# VS Code Extension: Codex Chat Exporter

## Purpose
Export Codex (OpenAI) VS Code chat logs from local `~/.codex`, and optionally sync sanitized exports to the local Bridge service.

Related implementation:
- `extension.js`
- `package.json`

## Requirements

### Requirement: Export chat logs
The extension SHALL provide commands to export Codex session logs to Markdown and raw JSONL.

#### Scenario: Export latest session as Markdown
- **WHEN** the user runs `Codex: 导出最近一次聊天记录…`
- **THEN** the extension writes a UTF-8 Markdown file containing the user/assistant messages
- **AND** tool outputs and `<environment_context>` are excluded unless explicitly enabled in settings

### Requirement: Sync to Bridge
The extension SHALL provide commands to sync one or more sessions to Bridge using `POST /bridge/v1/import/codex-chat`.

#### Scenario: Sync without sensitive data by default
- **WHEN** the user runs `Codex: 同步最近一次聊天记录到 Bridge`
- **THEN** the payload excludes tool output entries and `<environment_context>` by default
- **AND** the user can opt-in via settings to include them

### Requirement: Configurable Bridge base URL
The extension SHALL allow configuring the Bridge base URL via `codexChatExporter.bridgeBaseUrl`.

#### Scenario: Invalid base URL
- **WHEN** the configured base URL is invalid
- **THEN** sync aborts with a clear error message
