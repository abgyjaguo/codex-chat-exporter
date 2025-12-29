const path = require("path");
const express = require("express");
const { openBridgeDb } = require("./db");
const { stableId, randomId } = require("./lib/ids");
const { parseCodexJsonl } = require("./lib/codexJsonl");
const { sendError } = require("./lib/errors");

const app = express();

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

  const { message_count, messages, warnings: parseWarnings } = parseCodexJsonl(jsonlText);
  for (const w of parseWarnings) warnings.push(w);

  const project_id = stableId("proj", projectCwd);
  const session_id = stableId("sess", project_id, sessionName);

  const now = new Date().toISOString();
  try {
    bridgeDb.transaction(() => {
      bridgeDb.ensureProject({
        id: project_id,
        name: projectName,
        cwd: projectCwd,
        created_at: now,
      });
      bridgeDb.ensureSession({
        id: session_id,
        project_id,
        name: sessionName,
        imported_at: now,
        source_type: "codex_jsonl",
      });
      bridgeDb.addSource({
        id: randomId("src"),
        session_id,
        exported_at: exportedAt,
        raw_jsonl: jsonlText,
        normalized_json: JSON.stringify(messages),
        warnings_json: JSON.stringify(warnings),
        message_count,
        created_at: now,
      });
    });
  } catch (err) {
    return sendError(res, 500, "db_error", "Failed to persist import into SQLite", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  res.json({
    project_id,
    session_id,
    message_count,
    warnings,
  });
});

app.post("/bridge/v1/projects/:project_id/generate", (req, res) => {
  const projectId = String(req.params.project_id || "");
  return sendError(res, 501, "not_implemented", "Generate is not implemented in Bridge MVP", {
    project_id: projectId,
    route: "POST /bridge/v1/projects/:project_id/generate",
  });
});

app.post("/bridge/v1/projects/:project_id/sync/open-notebook", (req, res) => {
  const projectId = String(req.params.project_id || "");
  return sendError(res, 501, "not_implemented", "Sync to OpenNotebook is not implemented in Bridge MVP", {
    project_id: projectId,
    route: "POST /bridge/v1/projects/:project_id/sync/open-notebook",
  });
});

app.use((req, res) => {
  return sendError(res, 404, "not_found", "Route not found", {
    method: req.method,
    path: req.originalUrl,
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
