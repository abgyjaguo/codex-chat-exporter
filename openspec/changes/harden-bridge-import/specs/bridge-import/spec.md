## MODIFIED Requirements

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

