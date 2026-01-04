# Privacy: Redaction Defaults

## Purpose
Avoid leaking secrets to downstream systems and exports by applying privacy-safe defaults and redaction.

Related implementation:
- `bridge/src/lib/redact.js`
- `bridge/src/lib/openNotebookContent.js`
- `extension.js` (sync filters)

## Requirements

### Requirement: Redact obvious secrets from rendered content
The system SHALL redact common secret patterns from markdown content written to downstream notebooks.

#### Scenario: Authorization bearer token
- **WHEN** text contains `Authorization: Bearer <token>`
- **THEN** the token is replaced with `[REDACTED_TOKEN]`

#### Scenario: OpenAI-style API keys
- **WHEN** text contains an `sk-...` style API key
- **THEN** the key is replaced with `[REDACTED_API_KEY]`

#### Scenario: Private key blocks
- **WHEN** text contains a PEM private key block
- **THEN** it is replaced with `[REDACTED_PRIVATE_KEY]`
