## MODIFIED Requirements

### Requirement: Redact obvious secrets from rendered content
The system SHALL redact common secret patterns from downstream content.

#### Scenario: Authorization bearer token
- **WHEN** text contains `Authorization: Bearer <token>`
- **THEN** the token is replaced with `[REDACTED_TOKEN]`
- Pattern example: `(Authorization:\\s*Bearer\\s+)[^\\s]+`
- Example: `Authorization: Bearer abc.def` → `Authorization: Bearer [REDACTED_TOKEN]`

#### Scenario: OpenAI-style API keys
- **WHEN** text contains an `sk-...` style API key
- **THEN** the key is replaced with `[REDACTED_API_KEY]`
- Pattern example: `\\bsk-[A-Za-z0-9_-]{12,}\\b`
- Example: `sk-<token>` → `[REDACTED_API_KEY]`

#### Scenario: Private key blocks
- **WHEN** text contains a PEM private key block
- **THEN** it is replaced with `[REDACTED_PRIVATE_KEY]`
- Pattern example: `-----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY-----`
- Example: `-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----` → `[REDACTED_PRIVATE_KEY]`

#### Scenario: GitHub tokens
- **WHEN** text contains a GitHub token (e.g. `ghp_...` or `github_pat_...`)
- **THEN** it is replaced with `[REDACTED_GITHUB_TOKEN]`
- Pattern example: `\\bgh[pousr]_[A-Za-z0-9]{36,255}\\b` OR `\\bgithub_pat_[A-Za-z0-9_]{22,255}\\b`
- Example: `ghp_<token>` → `[REDACTED_GITHUB_TOKEN]`

#### Scenario: Slack tokens
- **WHEN** text contains a Slack token (e.g. `xoxb-...`)
- **THEN** it is replaced with `[REDACTED_SLACK_TOKEN]`
- Pattern example: `\\bxox[baprs]-[0-9A-Za-z-]{10,}\\b`
- Example: `xoxb-<token>` → `[REDACTED_SLACK_TOKEN]`

#### Scenario: Email addresses
- **WHEN** text contains an email address
- **THEN** it is replaced with `[REDACTED_EMAIL]`
- Pattern example: `\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b` (case-insensitive)
- Example: `test.user+tag@example.co.uk` → `[REDACTED_EMAIL]`

#### Scenario: Phone numbers
- **WHEN** text contains a phone number (best-effort)
- **THEN** it is replaced with `[REDACTED_PHONE]`
- Pattern example: best-effort matcher that replaces digit-heavy phone-like strings, while avoiding ISO dates like `YYYY-MM-DD`
- Example: `+1 (415) 555-2671` → `[REDACTED_PHONE]`

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

