# Change: Add Bridge Export Center APIs (Markdown ZIP)

## Why
The AI Learning OS v0.3.4 P0 requires an exportable Markdown ZIP bundle as the primary output artifact.

Today Bridge can ingest and store sessions, but it cannot create export bundles.

## What Changes
- Add Export Center endpoints under `/bridge/v1/exports` to create/list/download export bundles.
- Define a stable ZIP layout and manifest so downstream UIs (and future automations) can rely on it.

## Non-goals (this change)
- Replay UI implementation (handled by a separate change proposal).
- OpenAI generation and OpenNotebook publish (P1+).

## Impact
- Affected code: `bridge/` (new endpoints, ZIP builder, DB schema changes)
- Affected specs:
  - New capability: `bridge-export-center`

