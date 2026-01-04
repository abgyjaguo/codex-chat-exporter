const path = require("path");
const express = require("express");
const { openBridgeDb } = require("./db");
const { stableId, randomId } = require("./lib/ids");
const { parseCodexJsonl } = require("./lib/codexJsonl");
const { sendError } = require("./lib/errors");
const { FilesystemAdapter, DEFAULT_ENV_VAR: OPEN_NOTEBOOK_FS_ROOT_ENV } = require("./adapters/filesystem");
const { getBridgePublicBaseUrl } = require("./lib/replayUrls");
const { renderReplayErrorHtml, renderReplayIndexHtml, renderReplaySessionHtml } = require("./lib/replayHtml");
const {
  anchorForIndex,
  renderSourceMarkdown,
  renderPlaceholderNotes,
} = require("./lib/openNotebookContent");

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

app.get("/replay", (req, res) => {
  let limit = 50;
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit.trim() : "";
  if (limitRaw) {
    const parsed = Number(limitRaw);
    if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(200, Math.floor(parsed));
  }

  let sessions = [];
  try {
    sessions = bridgeDb.listRecentSessions({ limit });
  } catch (err) {
    res.status(500).type("text/html").send(
      renderReplayErrorHtml({
        title: "Replay",
        message: err instanceof Error ? err.message : "Failed to list sessions.",
      }),
    );
    return;
  }

  res.status(200).type("text/html").send(renderReplayIndexHtml({ sessions }));
});

app.get("/replay/projects/:project_id/sessions/:session_id", (req, res) => {
  const projectId = String(req.params.project_id || "");
  const sessionId = String(req.params.session_id || "");

  const projectRow = bridgeDb.getProjectById(projectId);
  if (!projectRow) {
    res.status(404).type("text/html").send(renderReplayErrorHtml({ title: "Replay", message: "Project not found." }));
    return;
  }

  const sessionRow = bridgeDb.getSessionById(sessionId);
  if (!sessionRow || sessionRow.project_id !== projectId) {
    res.status(404).type("text/html").send(renderReplayErrorHtml({ title: "Replay", message: "Session not found." }));
    return;
  }

  const sourceRow = bridgeDb.getLatestSourceBySessionId(sessionId);
  if (!sourceRow) {
    res
      .status(404)
      .type("text/html")
      .send(renderReplayErrorHtml({ title: "Replay", message: "No imported source found for this session." }));
    return;
  }

  let messages = [];
  try {
    const parsed = JSON.parse(sourceRow.normalized_json);
    if (Array.isArray(parsed)) messages = parsed;
  } catch (err) {
    res.status(500).type("text/html").send(
      renderReplayErrorHtml({
        title: "Replay",
        message: err instanceof Error ? err.message : "Failed to parse normalized session messages.",
      }),
    );
    return;
  }

  res.status(200).type("text/html").send(renderReplaySessionHtml({ project: projectRow, session: sessionRow, messages }));
});

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

  const body = req.body;
  if (!body || typeof body !== "object") {
    return sendError(res, 400, "invalid_request", "Request body must be JSON");
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const targetsRaw = body.targets;

  if (!sessionId) {
    return sendError(res, 400, "invalid_request", "session_id must be a non-empty string");
  }

  let targets = ["sources", "notes"];
  if (Array.isArray(targetsRaw)) {
    targets = targetsRaw.map((t) => String(t || "").trim()).filter(Boolean);
  }

  const wantSources = targets.includes("sources");
  const wantNotes = targets.includes("notes");
  if (!wantSources && !wantNotes) {
    return sendError(res, 400, "invalid_request", "targets must include at least one of: sources, notes");
  }

  const rootDir = (process.env[OPEN_NOTEBOOK_FS_ROOT_ENV] || "").trim();
  if (!rootDir) {
    return sendError(
      res,
      400,
      "invalid_request",
      `OpenNotebook filesystem root is not set. Please set ${OPEN_NOTEBOOK_FS_ROOT_ENV} to a writable directory.`,
    );
  }

  const projectRow = bridgeDb.getProjectById(projectId);
  if (!projectRow) {
    return sendError(res, 404, "not_found", "Project not found", { project_id: projectId });
  }

  const sessionRow = bridgeDb.getSessionById(sessionId);
  if (!sessionRow) {
    return sendError(res, 404, "not_found", "Session not found", { session_id: sessionId });
  }
  if (sessionRow.project_id !== projectId) {
    return sendError(res, 400, "invalid_request", "session_id does not belong to project_id", {
      project_id: projectId,
      session_id: sessionId,
    });
  }

  const sourceRow = bridgeDb.getLatestSourceBySessionId(sessionId);
  if (!sourceRow) {
    return sendError(res, 404, "not_found", "No imported source found for session", { session_id: sessionId });
  }

  let messages = [];
  try {
    const parsed = JSON.parse(sourceRow.normalized_json);
    if (Array.isArray(parsed)) messages = parsed;
  } catch (err) {
    return sendError(res, 500, "invalid_state", "Failed to parse normalized_json for session source", {
      session_id: sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const adapter = FilesystemAdapter.fromEnv(OPEN_NOTEBOOK_FS_ROOT_ENV);
  const replayBaseUrl = getBridgePublicBaseUrl();

  const notebookProjectKey = projectRow.cwd;
  const notebookIdPromise = adapter.createOrGetNotebook(notebookProjectKey);

  Promise.resolve(notebookIdPromise)
    .then(async (notebookId) => {
      const project = { id: projectRow.id, name: projectRow.name, cwd: projectRow.cwd };
      const session = { id: sessionRow.id, name: sessionRow.name };

      let sourceId = null;
      if (wantSources) {
        const sourceMarkdown = renderSourceMarkdown({
          project,
          session,
          project_id: projectId,
          session_id: sessionId,
          messages,
          replayBaseUrl,
        });
        sourceId = await adapter.upsertSource(notebookId, sessionId, sourceMarkdown);
      }

      const noteIds = {};
      const noteKinds = [];
      if (wantNotes) {
        if (!sourceId) {
          return sendError(res, 500, "invalid_state", "Cannot write notes without sources in MVP sync", {
            project_id: projectId,
            session_id: sessionId,
          });
        }

        const notes = renderPlaceholderNotes({
          project,
          session,
          project_id: projectId,
          session_id: sessionId,
          sourceId,
          messages,
          replayBaseUrl,
        });

        noteKinds.push("summary", "study-pack", "milestones");

        const links = [];
        if (messages.length >= 1) links.push(anchorForIndex(0));
        if (messages.length >= 2) links.push(anchorForIndex(1));
        if (messages.length >= 3) links.push(anchorForIndex(2));

        for (const kind of noteKinds) {
          const content = notes[kind] || notes[kind.replace(/_/g, "-")] || "";
          noteIds[kind] = await adapter.upsertNote(notebookId, kind, content, links);
        }
      }

      res.json({
        notebook: {
          adapter: "filesystem",
          root_dir: rootDir,
          project_key: notebookProjectKey,
          notebook_id: notebookId,
        },
        project_id: projectId,
        session_id: sessionId,
        source_id: sourceId,
        notes: noteIds,
      });
    })
    .catch((err) => {
      return sendError(res, 500, "sync_failed", "Failed to sync to OpenNotebook filesystem adapter", {
        project_id: projectId,
        session_id: sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
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
