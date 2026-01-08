# Change: Improve VS Code “Sync to Bridge” UX

## Why
Sync already works, but users still hit common friction:
- Bridge not running / wrong URL errors are not actionable enough.
- After sync, users want a one-click jump to Replay for validation and evidence review.

## What Changes
- Add a pre-sync health check with a clearer error and next-step guidance.
- Add success actions to open Replay (and optionally copy the Replay URL).

## Non-goals (this change)
- Auto-starting Bridge from the extension.
- A full “Export Center” UI in VS Code (handled elsewhere).

## Impact
- Affected code: `extension.js`
- Affected specs:
  - `vscode-exporter` (MODIFIED)

