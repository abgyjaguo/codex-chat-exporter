const crypto = require("crypto");

function stableId(prefix, ...parts) {
  const input = parts.map((p) => String(p ?? "")).join("\n");
  const digest = crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function randomId(prefix) {
  if (typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

module.exports = { stableId, randomId };
