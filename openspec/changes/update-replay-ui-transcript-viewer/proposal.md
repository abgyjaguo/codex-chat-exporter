# Change: Upgrade Replay UI Transcript Viewer

## Why
Evidence deep links already land on Replay, but the current UI is still positioned as a “stub”.
We want a usable transcript viewer that supports basic navigation and investigation workflows (search, filtering, copying deep links).

## What Changes
- Add client-side search + role filtering for a session transcript.
- Add per-message actions: copy deep link and copy message text.
- Improve session page navigation without introducing a full frontend framework.

## Non-goals (this change)
- A full React/Vite app (keep it server-rendered HTML).
- Auth / multi-user access control.
- Advanced markdown rendering (can be a follow-up if needed).

## Impact
- Affected code: `bridge/src/lib/replayHtml.js`, `bridge/src/app.js`
- Affected specs:
  - `replay-ui` (MODIFIED)

