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

### Specs (source of truth)
- OpenSpec change: `openspec/changes/add-export-center-api/specs/bridge-export-center/spec.md`

## Endpoints
- `GET /bridge/v1/health` -> `ok`
- `POST /bridge/v1/import/codex-chat`
- `POST /bridge/v1/exports`
- `GET /bridge/v1/exports`
- `GET /bridge/v1/exports/{export_id}/download`
- `POST /bridge/v1/projects/{project_id}/generate` -> `501 Not Implemented` (MVP)
- `POST /bridge/v1/projects/{project_id}/sync/open-notebook` -> `501 Not Implemented` (MVP)

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
