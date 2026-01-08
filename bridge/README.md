# Bridge Service (MVP)

Local Bridge service for importing Codex chat exports and preparing downstream generation/sync.

## Requirements
- Node.js 18+
  - 推荐 Node 22+（内置 `node:sqlite`，无需编译原生依赖）
  - Node 18/20 会使用可选依赖 `better-sqlite3`（可能需要本机编译工具链/预编译包）

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
- `BRIDGE_EXPORTS_DIR` (default: `<dirname(BRIDGE_DB_PATH)>/exports`)
- `BRIDGE_PUBLIC_BASE_URL` (optional, e.g. `http://127.0.0.1:7331`)
  - Used to generate **absolute** `Open in Replay` links for exported/published Markdown.
- OpenAI (optional, for notes generation)
  - `OPENAI_API_KEY` (required when `provider: "openai"` or `notes_provider: "openai"` is used)
  - `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)
  - `OPENAI_BASE_URL` (optional, default: `https://api.openai.com/v1`)
  - `OPENAI_TIMEOUT_MS` (optional, default: `60000`)
  - `OPENAI_TEMPERATURE` (optional, default: `0.2`)
  - `BRIDGE_OPENAI_MAX_MESSAGES` (optional, default: `80`)
  - `BRIDGE_OPENAI_MAX_CHARS` (optional, default: `20000`)

### Specs (source of truth)
- OpenSpec specs:
  - `openspec/specs/bridge-import/spec.md`
  - `openspec/specs/bridge-export-center/spec.md`
  - `openspec/specs/replay-ui/spec.md`
  - `openspec/specs/bridge-open-notebook-sync/spec.md`
  - `openspec/specs/privacy-redaction/spec.md`

## Endpoints
- `GET /replay` -> Replay index
- `GET /replay/projects/{project_id}/sessions/{session_id}` -> Replay session transcript (anchors like `#m-000123`)
  - Query params: `q` (search), `role` (repeatable role filter)
- `GET /bridge/v1/health` -> `ok`
- `POST /bridge/v1/import/codex-chat`
- `POST /bridge/v1/exports`
- `GET /bridge/v1/exports`
- `GET /bridge/v1/exports/{export_id}/download`
- `POST /bridge/v1/projects/{project_id}/generate` -> `501 Not Implemented` (MVP)
- `POST /bridge/v1/projects/{project_id}/sessions/{session_id}/notes/generate` -> Generate notes (placeholder by default; OpenAI opt-in)
- `POST /bridge/v1/projects/{project_id}/sync/open-notebook` -> Sync Sources + Notes into OpenNotebook FS adapter
  - Set `notes_provider: "openai"` to publish OpenAI-generated notes (requires `OPENAI_API_KEY`).
  - If `BRIDGE_PUBLIC_BASE_URL` is set, Notes include `Open in Replay` deep links like `{BRIDGE_PUBLIC_BASE_URL}/replay/projects/{project_id}/sessions/{session_id}#m-000123`.

## Troubleshooting
- 如果在 WSL 里跑到了 Windows 的 `node/npm`（路径里出现 `D:\\...`），容易出现依赖二进制不匹配问题；建议统一在同一环境里执行 `npm install` + `npm start`（WSL 用 Linux Node，Windows 用 PowerShell/CMD）。
- 若看到 `better_sqlite3.node is not a valid Win32 application`：说明 `better-sqlite3` 被装成了 Linux 版本但用 Windows Node 在跑；可升级到 Node 22+（走 `node:sqlite`），或删除 `bridge/node_modules` 后用同一环境重新安装依赖。

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

Create export ZIP (session scope):

```bash
curl -sS -X POST http://127.0.0.1:7331/bridge/v1/exports \\
  -H 'content-type: application/json' \\
  -d '{"scope":{"project_id":"proj_...","session_id":"sess_..."},"includes":{"sessions":true},"version":"v0.3.4"}'
```

Generate notes (placeholder):

```bash
curl -sS -X POST http://127.0.0.1:7331/bridge/v1/projects/proj_.../sessions/sess_.../notes/generate \\
  -H 'content-type: application/json' \\
  -d '{"provider":"placeholder"}'
```

Generate notes (OpenAI):

```bash
export OPENAI_API_KEY="sk-..."
curl -sS -X POST http://127.0.0.1:7331/bridge/v1/projects/proj_.../sessions/sess_.../notes/generate \\
  -H 'content-type: application/json' \\
  -d '{"provider":"openai"}'
```

Sync OpenNotebook (filesystem adapter, OpenAI notes):

```bash
export OPEN_NOTEBOOK_FS_ROOT="/tmp/open-notebook-fs"
export OPENAI_API_KEY="sk-..."
curl -sS -X POST http://127.0.0.1:7331/bridge/v1/projects/proj_.../sync/open-notebook \\
  -H 'content-type: application/json' \\
  -d '{"session_id":"sess_...","targets":["sources","notes"],"notes_provider":"openai"}'
```
