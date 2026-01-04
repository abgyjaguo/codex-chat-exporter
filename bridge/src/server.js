const path = require("path");
const { openBridgeDb } = require("./db");
const { createApp } = require("./app");

const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const PORT_RAW = process.env.BRIDGE_PORT || "7331";
const PORT = Number(PORT_RAW);
const BODY_LIMIT = process.env.BRIDGE_BODY_LIMIT || "25mb";
const DB_PATH = process.env.BRIDGE_DB_PATH || path.join(__dirname, "..", ".data", "bridge.db");

if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error(`Invalid BRIDGE_PORT: ${PORT_RAW}`);
  process.exit(1);
}

let bridgeDb;
try {
  bridgeDb = openBridgeDb(DB_PATH);
  console.log(`Bridge DB: ${DB_PATH} (${bridgeDb.driver})`);
} catch (err) {
  console.error("Failed to open Bridge SQLite database.");
  if (err && typeof err === "object") {
    const code = err.code ? String(err.code) : "";
    const msg = err instanceof Error ? err.message : String(err);
    console.error(code ? `[${code}] ${msg}` : msg);
    if (err.details) {
      try {
        console.error(JSON.stringify(err.details, null, 2));
      } catch {}
    }
  } else {
    console.error(String(err));
  }
  process.exit(1);
}

const app = createApp({ bridgeDb, bodyLimit: BODY_LIMIT });

app.listen(PORT, HOST, () => {
  console.log(`Bridge listening on http://${HOST}:${PORT}`);
});
