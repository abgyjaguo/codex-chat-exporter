## MODIFIED Requirements

### Requirement: Redact obvious secrets from rendered content
The system SHALL redact common secret patterns from downstream content.

#### Scenario: Authorization bearer token
- **WHEN** text contains `Authorization: Bearer <token>`
- **THEN** the token is replaced with `[REDACTED_TOKEN]`

#### Scenario: OpenAI-style API keys
- **WHEN** text contains an `sk-...` style API key
- **THEN** the key is replaced with `[REDACTED_API_KEY]`

#### Scenario: Private key blocks
- **WHEN** text contains a PEM private key block
- **THEN** it is replaced with `[REDACTED_PRIVATE_KEY]`

#### Scenario: Email addresses
- **WHEN** text contains an email address
- **THEN** it is replaced with `[REDACTED_EMAIL]`

#### Scenario: Phone numbers
- **WHEN** text contains a phone number (best-effort)
- **THEN** it is replaced with `[REDACTED_PHONE]`

### Requirement: Redaction is applied before leaving the local trust boundary
The system SHALL apply redaction before sending content to external systems.

#### Scenario: OpenNotebook publish
- **WHEN** publishing content to OpenNotebook
- **THEN** the published markdown is redacted

#### Scenario: OpenAI generation
- **WHEN** calling OpenAI for generation
- **THEN** the prompt/input content is redacted

#### Scenario: Export bundles
- **WHEN** building export ZIP bundles
- **THEN** exported markdown is redacted

