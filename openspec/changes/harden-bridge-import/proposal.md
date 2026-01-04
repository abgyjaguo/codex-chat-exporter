# Change: Harden Bridge import (JSONL/Markdown, stable message_id, privacy defaults)

## Why
P0 requires stable evidence deep-links (`#m-000123`) and privacy-safe defaults across storage and downstream outputs.

Today Bridge import works for JSONL, but it does not:
- accept Markdown sync payloads, and
- persist stable `message_id` in normalized messages.

## What Changes
- Accept `codex.markdown_text` (optional) in the import payload.
- Add stable `message_id` for each normalized message (format: `m-000001` etc.).
- Define privacy-safe defaults for what is stored/exported when imports contain sensitive sections.

## Non-goals (this change)
- Export Center APIs and ZIP builder (separate change).
- Replay UI rendering (separate change).

## Impact
- Affected code: `bridge/` (import validation + normalization storage)
- Affected specs:
  - `bridge-import` (modified)

