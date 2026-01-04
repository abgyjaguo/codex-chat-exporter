## MODIFIED Requirements

### Requirement: Import endpoint
Bridge SHALL accept Codex uploads via `POST /bridge/v1/import/codex-chat`.

#### Scenario: JSONL-only import
- **WHEN** the client posts JSON with `codex.jsonl_text`
- **THEN** Bridge accepts the import and persists it

#### Scenario: Markdown-only import
- **WHEN** the client posts JSON with `codex.markdown_text`
- **THEN** Bridge accepts the import and persists it

#### Scenario: Both JSONL and Markdown
- **WHEN** the client posts both `codex.jsonl_text` and `codex.markdown_text`
- **THEN** Bridge persists both (raw) and uses JSONL as the normalization source

### Requirement: Normalization
Bridge SHALL normalize imported JSONL into a JSON array of messages.

#### Scenario: Normalized message has stable message_id
- **WHEN** Bridge normalizes a session
- **THEN** each message includes a stable `message_id` in the format `m-000001`
- **AND** `message_id` ordering matches transcript order

### Requirement: Privacy-safe defaults
Bridge SHALL treat tool outputs and `<environment_context>` as sensitive content.

#### Scenario: Default excludes sensitive content
- **WHEN** an import contains tool outputs or `<environment_context>`
- **THEN** normalized messages and downstream artifacts exclude them by default

