## Why
The frontend `codex-learner_-human-ai-synthesis` needs a stable, machine-readable way to browse Bridge projects/sessions and fetch normalized messages.

Today Bridge exposes Replay as HTML at `/replay`, which is great for humans but awkward for a UI that needs to:
- list recent sessions
- import a Bridge session into the frontend without re-uploading files
- show warnings/message counts

## What Changes
- Add a minimal JSON read API under `/bridge/v1/...` for:
  - listing projects
  - listing sessions (recent and per-project)
  - fetching normalized messages for a session
- Add CORS headers for `/bridge/v1/*` so the frontend can call it from `vite` dev server.

## Impact / Compatibility
- Additive only (new endpoints); existing endpoints remain unchanged.
- CORS is limited to `/bridge/v1/*` and safe for local tooling.

## Approval
User requested: “规划好之后开始执行，不完成不要停” (2026-01-22). Treating this as approval to proceed.

