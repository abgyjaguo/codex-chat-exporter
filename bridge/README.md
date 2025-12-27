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

## Endpoints
- `GET /bridge/v1/health` -> `ok`
