const express = require("express");
const { stableId } = require("./lib/ids");
const { parseCodexJsonl } = require("./lib/codexJsonl");
const { sendError } = require("./lib/errors");

const app = express();

const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const PORT_RAW = process.env.BRIDGE_PORT || "7331";
const PORT = Number(PORT_RAW);
const BODY_LIMIT = process.env.BRIDGE_BODY_LIMIT || "25mb";

if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error(`Invalid BRIDGE_PORT: ${PORT_RAW}`);
  process.exit(1);
}

app.use(express.json({ limit: BODY_LIMIT }));

app.get("/bridge/v1/health", (req, res) => {
  res.type("text/plain").send("ok");
});

app.post("/bridge/v1/import/codex-chat", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return sendError(res, 400, "invalid_request", "Request body must be JSON");
  }

  const project = body.project;
  const session = body.session;
  const codex = body.codex;

  const errors = [];
  if (!project || typeof project !== "object") errors.push("project must be an object");
  if (!session || typeof session !== "object") errors.push("session must be an object");
  if (!codex || typeof codex !== "object") errors.push("codex must be an object");

  const projectName = project && typeof project.name === "string" ? project.name.trim() : "";
  const projectCwd = project && typeof project.cwd === "string" ? project.cwd.trim() : "";
  const sessionName = session && typeof session.name === "string" ? session.name.trim() : "";
  const exportedAt = typeof body.exported_at === "string" ? body.exported_at.trim() : "";
  const jsonlText = codex && typeof codex.jsonl_text === "string" ? codex.jsonl_text : "";

  if (!projectName) errors.push("project.name must be a non-empty string");
  if (!projectCwd) errors.push("project.cwd must be a non-empty string");
  if (!sessionName) errors.push("session.name must be a non-empty string");
  if (!exportedAt) errors.push("exported_at must be a non-empty string (ISO-8601 recommended)");
  if (!jsonlText) errors.push("codex.jsonl_text must be a non-empty string");

  if (errors.length > 0) {
    return sendError(res, 400, "invalid_request", "Invalid import payload", { errors });
  }

  const warnings = [];
  const parsedExportedAtMs = Date.parse(exportedAt);
  if (!Number.isFinite(parsedExportedAtMs)) {
    warnings.push({
      code: "invalid_exported_at",
      message: "exported_at is not a valid ISO-8601 timestamp; accepted but may reduce traceability",
    });
  }

  const { message_count, warnings: parseWarnings } = parseCodexJsonl(jsonlText);
  for (const w of parseWarnings) warnings.push(w);

  const project_id = stableId("proj", projectName, projectCwd);
  const session_id = stableId("sess", project_id, sessionName);

  res.json({
    project_id,
    session_id,
    message_count,
    warnings,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === "entity.too.large") {
    return sendError(res, 413, "payload_too_large", "JSON body too large");
  }
  if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
    return sendError(res, 400, "invalid_json", "Invalid JSON in request body");
  }
  return sendError(res, 500, "internal_error", "Unexpected server error");
});

app.listen(PORT, HOST, () => {
  console.log(`Bridge listening on http://${HOST}:${PORT}`);
});
