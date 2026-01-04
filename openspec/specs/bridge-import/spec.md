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
Bridge SHALL accept Codex JSONL uploads via `POST /bridge/v1/import/codex-chat`.

#### Scenario: Valid import
- **WHEN** the client posts JSON with `project`, `session`, `exported_at`, and `codex.jsonl_text`
- **THEN** Bridge persists a project, session, and source row in SQLite
- **AND** Bridge responds `200` with `project_id`, `session_id`, `message_count`, and `warnings[]`

#### Scenario: Invalid request body
- **WHEN** required fields are missing or empty
- **THEN** Bridge responds `400` with a structured error describing the validation failures

### Requirement: Normalization
Bridge SHALL normalize imported JSONL into a JSON array of messages.

#### Scenario: Normalized message shape
- **WHEN** Bridge parses the uploaded JSONL
- **THEN** each normalized message includes at least `{ role, timestamp, text }`
- **AND** `<environment_context>` messages are excluded from normalized output

### Requirement: Generate endpoint is stubbed (MVP)
Bridge SHALL expose a generate endpoint that returns a clear “not implemented” error in MVP.

#### Scenario: Generate call during MVP
- **WHEN** a client calls `POST /bridge/v1/projects/{project_id}/generate`
- **THEN** Bridge responds `501` with an error code indicating the feature is not implemented
