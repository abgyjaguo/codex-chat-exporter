const crypto = require("crypto");

function stableId(prefix, ...parts) {
  const input = parts.map((p) => String(p ?? "")).join("\n");
  const digest = crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

module.exports = { stableId };

