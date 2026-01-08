# Bridge: Import & Normalize Codex Chat

## Purpose
Ingest sanitized Codex JSONL exports, normalize them to message arrays, and persist them to SQLite for downstream export/replay/sync.

Related implementation:
- `bridge/src/server.js`
- `bridge/src/lib/codexJsonl.js`
- `bridge/src/db.js`
## Requirements
### Requirement: Health endpoint
Bridge SHALL expose a health endpoint for local readiness checks.

#### Scenario: Health check
- **WHEN** a client calls `GET /bridge/v1/health`
- **THEN** Bridge responds `200` with plain text `ok`

### Requirement: Import endpoint
Bridge SHALL accept Codex uploads via `POST /bridge/v1/import/codex-chat`.

#### Scenario: JSONL-only import
- **WHEN** the client posts JSON with `codex.jsonl_text`
- **AND** the client MAY pass `codex.include_tool_outputs` / `codex.include_environment_context` (default `false`)
- **THEN** Bridge accepts the import and persists it

#### Scenario: Markdown-only import
- **WHEN** the client posts JSON with `codex.markdown_text`
- **AND** the client MAY pass `codex.include_tool_outputs` / `codex.include_environment_context` (default `false`)
- **THEN** Bridge accepts the import and persists it

#### Scenario: Both JSONL and Markdown
- **WHEN** the client posts both `codex.jsonl_text` and `codex.markdown_text`
- **AND** the client MAY pass `codex.include_tool_outputs` / `codex.include_environment_context` (default `false`)
- **THEN** Bridge persists both (raw) and uses JSONL as the normalization source

### Requirement: Normalization
Bridge SHALL normalize imported JSONL into a JSON array of messages.

#### Scenario: Normalized message has stable message_id
- **WHEN** Bridge normalizes a session
- **THEN** each message includes a stable `message_id` in the format `m-000001`
- **AND** `message_id` ordering matches transcript order

#### Scenario: Tool outputs are normalized as tool messages (opt-in)
- **WHEN** the client sets `codex.include_tool_outputs=true`
- **AND** the upload contains tool outputs
- **THEN** Bridge includes tool outputs in normalized messages as `role:"tool"`
- **AND** the tool output content is stored in `text`
- **AND** Bridge includes `tool_call_id` when available

#### Scenario: Environment context is normalized as system message (opt-in)
- **WHEN** the client sets `codex.include_environment_context=true`
- **AND** the upload contains `<environment_context>`
- **THEN** Bridge includes it in normalized messages as `role:"system"`
- **AND** the environment context block is stored in `text`

### Requirement: Generate endpoint is stubbed (MVP)
Bridge SHALL expose a generate endpoint that returns a clear “not implemented” error in MVP.

#### Scenario: Generate call during MVP
- **WHEN** a client calls `POST /bridge/v1/projects/{project_id}/generate`
- **THEN** Bridge responds `501` with an error code indicating the feature is not implemented

### Requirement: Privacy-safe defaults
Bridge SHALL treat tool outputs and `<environment_context>` as sensitive content.

#### Scenario: Default excludes sensitive content
- **WHEN** an import contains tool outputs or `<environment_context>`
- **THEN** normalized messages and downstream artifacts exclude them by default
- **AND** stored raw sources (`sources.raw_jsonl` / `sources.raw_markdown`) exclude them by default

#### Scenario: Opt-in preserves sensitive content
- **WHEN** the client sets `codex.include_tool_outputs=true`
- **THEN** tool outputs SHALL be persisted and included in normalized messages and downstream artifacts
- **WHEN** the client sets `codex.include_environment_context=true`
- **THEN** `<environment_context>` SHALL be persisted and included in normalized messages and downstream artifacts
- **AND** stored raw sources preserve the opted-in content

