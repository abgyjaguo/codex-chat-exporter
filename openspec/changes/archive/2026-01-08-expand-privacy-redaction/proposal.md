# Change: Expand privacy redaction rules and apply consistently

## Why
v0.3.4 requires “privacy strategy compliant is enough”, and the system will eventually publish/export content beyond the local machine (OpenNotebook, OpenAI, ZIP).

We need broader redaction coverage and clear rules on when redaction is applied.

## What Changes
- Expand redaction rules (email, phone, additional token patterns).
- Require redaction to be applied consistently before:
  - syncing to OpenNotebook,
  - calling OpenAI generation, and
  - building export ZIP bundles.

## Non-goals (this change)
- Building the Export Center or Replay UI themselves.

## Impact
- Affected code: `bridge/src/lib/redact.js`, export builder (future), OpenNotebook sync rendering
- Affected specs:
  - `privacy-redaction` (modified)

