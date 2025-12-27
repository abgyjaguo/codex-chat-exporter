const express = require("express");

const app = express();

const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT || 7331);

app.get("/bridge/v1/health", (req, res) => {
  res.type("text/plain").send("ok");
});

app.listen(PORT, HOST, () => {
  console.log(`Bridge listening on http://${HOST}:${PORT}`);
});
