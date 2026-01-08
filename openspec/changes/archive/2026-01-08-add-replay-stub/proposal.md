# Change: Add Replay Deep Links + Stub UI Routes

## Why
v0.3.4 requires evidence “jump back” links (e.g., `Open in Replay`) to land on a stable Replay URL and anchor.

Today there is no Replay route surface; evidence links cannot point anywhere stable.

## What Changes
- Add stable Replay URL scheme for projects/sessions/messages.
- Add stub routes (backend and/or frontend) that render a minimal transcript viewer with stable anchors.

## Non-goals (this change)
- Full-feature Replay UI polish (search, filters, etc.)
- Export Center implementation (handled separately).

## Impact
- Affected code: `bridge/` and/or `frontend/` (depending on chosen delivery)
- Affected specs:
  - New capability: `replay-ui`

