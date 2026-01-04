# Bridge: OpenNotebook Sync (MVP filesystem adapter)

## Purpose
Publish session sources/notes into an OpenNotebook-compatible storage using the filesystem adapter (MVP).

Related implementation:
- `bridge/src/server.js`
- `bridge/src/adapters/filesystem.js`
- `bridge/src/lib/openNotebookContent.js`

## Requirements

### Requirement: Sync endpoint
Bridge SHALL expose `POST /bridge/v1/projects/{project_id}/sync/open-notebook` to publish a session.

#### Scenario: Sync sources + notes (default)
- **WHEN** the client posts `{ "session_id": "..." }`
- **THEN** Bridge upserts the session Source and placeholder Notes
- **AND** Bridge responds with notebook identifiers and created/updated note ids

#### Scenario: targets filter
- **WHEN** the client passes `"targets": ["sources"]`
- **THEN** Bridge only publishes Sources and skips Notes

### Requirement: Requires filesystem root
Bridge SHALL require a configured filesystem root for the OpenNotebook adapter in MVP.

#### Scenario: Missing filesystem root
- **WHEN** the environment variable `OPEN_NOTEBOOK_FS_ROOT` is not set
- **THEN** Bridge responds `400` with a clear configuration error

### Requirement: Idempotent publishing
Sync SHALL be idempotent per `(project, session)` so retries do not create duplicate notebooks/sources/notes.

#### Scenario: Retry same sync
- **WHEN** the same sync request is repeated
- **THEN** Bridge returns the same notebook identifiers and upserts content instead of duplicating items
