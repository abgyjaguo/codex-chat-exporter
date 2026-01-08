## ADDED Requirements

### Requirement: Generate notes endpoint
Bridge SHALL expose `POST /bridge/v1/projects/{project_id}/sessions/{session_id}/notes/generate` to generate notes for a session.

#### Scenario: Placeholder notes by default
- **WHEN** the client calls the endpoint without specifying a provider
- **THEN** Bridge responds `200` with placeholder markdown notes for `summary`, `study-pack`, and `milestones`

#### Scenario: OpenAI provider is explicit opt-in
- **WHEN** the client sets `"provider": "openai"`
- **THEN** Bridge generates notes using OpenAI (after redaction) and responds `200` with markdown notes

### Requirement: Privacy-safe generation input
Bridge SHALL apply privacy redaction before sending any content to OpenAI.

#### Scenario: Prompt is redacted
- **WHEN** OpenAI generation is requested
- **THEN** Bridge redacts obvious secrets in the transcript before sending it to OpenAI

### Requirement: Configuration errors are clear
Bridge SHALL fail fast with a clear configuration error when OpenAI is requested but not configured.

#### Scenario: Missing OpenAI key
- **WHEN** `"provider": "openai"` is requested
- **AND** `OPENAI_API_KEY` is not configured
- **THEN** Bridge responds `400` with a structured error describing the missing configuration

