## MODIFIED Requirements

### Requirement: Sync endpoint
Bridge SHALL expose `POST /bridge/v1/projects/{project_id}/sync/open-notebook` to publish a session.

#### Scenario: Sync sources + notes (default placeholder)
- **WHEN** the client posts `{ "session_id": "..." }`
- **THEN** Bridge upserts the session Source and placeholder Notes
- **AND** Bridge responds with notebook identifiers and created/updated note ids

#### Scenario: Sync sources + notes (OpenAI)
- **WHEN** the client posts `{ "session_id": "...", "notes_provider": "openai" }`
- **THEN** Bridge generates notes via OpenAI (after redaction) and publishes them as Notes
- **AND** Bridge responds with notebook identifiers and created/updated note ids

#### Scenario: targets filter
- **WHEN** the client passes `"targets": ["sources"]`
- **THEN** Bridge only publishes Sources and skips Notes

