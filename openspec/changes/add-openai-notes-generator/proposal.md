# Change: Add OpenAI Notes Generator (Summary / Study Pack / Milestones)

## Why
OpenNotebook sync currently publishes placeholder notes. To close the v0.3.4 loop, we need an optional (explicit) OpenAI-backed generator that:
- Produces useful notes for a session.
- Preserves “evidence jump” links back to Replay.
- Applies privacy redaction before any external call.

## What Changes
- Add a notes generation API in Bridge for a given `(project_id, session_id)`.
- Support a `provider` switch: `placeholder` (default) vs `openai` (explicit opt-in).
- Update OpenNotebook sync to optionally publish generated notes.

## Non-goals (this change)
- Rich prompt tuning and eval framework.
- OpenNotebook HTTP API adapter (filesystem adapter only).

## Impact
- Affected code: `bridge/src/app.js`, `bridge/src/lib/openNotebookContent.js` (+ new generator module)
- Affected specs:
  - New capability: `bridge-notes-generator`
  - `bridge-open-notebook-sync` (MODIFIED)

## Open questions
- Note kinds: keep fixed `summary|study-pack|milestones`, or allow requesting a subset?
- For generation input: default to only `user/assistant` messages (safer), and require explicit include for `tool/system`?

