# Spec: Open Notebook Sync Adapter Selection

## Endpoint

`POST /bridge/v1/projects/:project_id/sync/open-notebook`

## Request (JSON)

Existing fields (unchanged):
- `session_id` (string, required)
- `targets` (array of `"sources" | "notes"`, required, at least 1)
- `notes_provider` (string, optional)

New fields:
- `adapter` (string, optional): `"filesystem"` | `"http"`
  - default: `"filesystem"`
- `http` (object, optional): HTTP adapter configuration (only used when `adapter="http"`)
  - `apiBaseUrl` (string, optional)
  - `api_base_url` (string, optional; alias)
  - `token` (string, optional; treated as Bearer token / app password)
  - `app_password` (string, optional; alias)

Fallbacks:
- If `adapter="http"` and `http.apiBaseUrl` is missing, Bridge falls back to env `OPEN_NOTEBOOK_API_URL`.
- If `adapter="http"` and `http.token` is missing, Bridge falls back to env `OPEN_NOTEBOOK_APP_PASSWORD`.

## Response (JSON)

Response keeps the existing shape, with `notebook.adapter` reflecting the chosen adapter:

- `notebook.adapter`: `"filesystem"` | `"http"`
- `notebook.root_dir`: present for filesystem adapter
- `notebook.api_base_url`: present for HTTP adapter

