const { createBridgeApp } = require("./app");

const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const PORT_RAW = process.env.BRIDGE_PORT || "7331";
const PORT = Number(PORT_RAW);

if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error(`Invalid BRIDGE_PORT: ${PORT_RAW}`);
  process.exit(1);
}

let appInfo;
try {
  appInfo = createBridgeApp();
  console.log(`Bridge DB: ${appInfo.dbPath} (${appInfo.bridgeDb.driver})`);
  console.log(`Bridge exports dir: ${appInfo.exportsDir}`);
} catch (err) {
  console.error("Failed to start Bridge.");
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

const server = appInfo.app.listen(PORT, HOST, () => {
  console.log(`Bridge listening on http://${HOST}:${PORT}`);
});

process.on("SIGINT", () => {
  try {
    if (server && typeof server.close === "function") server.close();
  } catch {}
  try {
    if (appInfo && appInfo.bridgeDb && typeof appInfo.bridgeDb.close === "function") appInfo.bridgeDb.close();
  } catch {}
  process.exit(0);
});
