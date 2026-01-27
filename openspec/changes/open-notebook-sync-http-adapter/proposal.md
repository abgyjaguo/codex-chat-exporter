## Why
The frontend is now the local “source of truth” library and needs to publish/sync to Open Notebook without requiring filesystem access on the Bridge machine.

Bridge already has an HTTP adapter implementation (`bridge/src/adapters/http.js`), but the sync endpoint only supports the filesystem adapter and requires `OPEN_NOTEBOOK_FS_ROOT`.

## What Changes
- Extend `POST /bridge/v1/projects/:project_id/sync/open-notebook` to accept an `adapter` selection:
  - `filesystem` (current behavior)
  - `http` (new; uses Open Notebook API)
- Add request body support for HTTP adapter config via `body.http` (client-provided) with env var fallbacks.
- Return which adapter was used in the response `notebook` block.

## Impact / Compatibility
- Backwards compatible: default remains `filesystem` when `adapter` is omitted.
- Additive only: existing callers continue to work.

## Approval
User requested: “前后端整合…继续完成开发内容，直到完成” (2026-01-22). Treating this as approval to proceed.

