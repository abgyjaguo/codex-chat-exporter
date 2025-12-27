# Bridge Service (MVP)

Local Bridge service for importing Codex chat exports and preparing downstream generation/sync.

## Requirements
- Node.js 18+

## Run

```bash
npm install
npm start
```

Service listens on `127.0.0.1:7331` by default.

### Environment
- `BRIDGE_HOST` (default: `127.0.0.1`)
- `BRIDGE_PORT` (default: `7331`)
- `BRIDGE_DB_PATH` (default: `bridge/.data/bridge.db`)

## Endpoints
- `GET /bridge/v1/health` -> `ok`
- `POST /bridge/v1/import/codex-chat`
- `POST /bridge/v1/projects/{project_id}/generate` -> `501 Not Implemented` (MVP)
- `POST /bridge/v1/projects/{project_id}/sync/open-notebook` -> `501 Not Implemented` (MVP)

## curl examples

Health:

```bash
curl -sS http://127.0.0.1:7331/bridge/v1/health
```

Import Codex JSONL:

```bash
curl -sS http://127.0.0.1:7331/bridge/v1/import/codex-chat \\
  -H 'content-type: application/json' \\
  -d '{
    \"project\": {\"name\": \"demo\", \"cwd\": \"/path/to/workspace\"},
    \"session\": {\"name\": \"session-1\"},
    \"exported_at\": \"2025-12-26T00:00:00.000Z\",
    \"codex\": {\"jsonl_text\": \"{\\\\\"type\\\\\":\\\\\"event_msg\\\\\",\\\\\"timestamp\\\\\":\\\\\"2025-12-26T00:00:00.000Z\\\\\",\\\\\"payload\\\\\":{\\\\\"type\\\\\":\\\\\"user_message\\\\\",\\\\\"message\\\\\":\\\\\"hi\\\\\"}}\\n{\\\\\"type\\\\\":\\\\\"event_msg\\\\\",\\\\\"timestamp\\\\\":\\\\\"2025-12-26T00:00:01.000Z\\\\\",\\\\\"payload\\\\\":{\\\\\"type\\\\\":\\\\\"agent_message\\\\\",\\\\\"message\\\\\":\\\\\"hello\\\\\"}}\"}
  }'
```
