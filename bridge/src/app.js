const fs = require("fs");
const path = require("path");
const express = require("express");

const { openBridgeDb } = require("./db");
const { stableId, randomId } = require("./lib/ids");
const { filterCodexJsonlRaw, parseCodexJsonl } = require("./lib/codexJsonl");
const { sendError } = require("./lib/errors");
const { FilesystemAdapter, DEFAULT_ENV_VAR: OPEN_NOTEBOOK_FS_ROOT_ENV } = require("./adapters/filesystem");
const { anchorForIndex, renderSourceMarkdown } = require("./lib/openNotebookContent");
const { generateNotes } = require("./lib/notesGenerator");
const { getBridgePublicBaseUrl } = require("./lib/replayUrls");
const { renderReplayErrorHtml, renderReplayIndexHtml, renderReplaySessionHtml } = require("./lib/replayHtml");
const {
  normalizeExportVersion,
  normalizeIncludes,
  makeExportManifest,
  renderExportIndexMarkdown,
  buildExportZipBuffer,
} = require("./lib/exportZip");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonParseArray(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function stripMarkdownH3Sections(markdownText, headingPrefixes) {
  const prefixes = Array.isArray(headingPrefixes) ? headingPrefixes : [];
  if (prefixes.length === 0) return String(markdownText ?? "");

  const lines = String(markdownText ?? "").split(/\r?\n/);
  const out = [];
  let skipping = false;

  const shouldStripHeading = (line) => prefixes.some((p) => String(line || "").startsWith(p));

  for (const line of lines) {
    if (!skipping) {
      if (shouldStripHeading(line)) {
        skipping = true;
        continue;
      }
      out.push(line);
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      skipping = false;
      if (shouldStripHeading(line)) {
        skipping = true;
        continue;
      }
      out.push(line);
      continue;
    }
  }

  return out.join("\n");
}

function sanitizeCodexMarkdown(markdownText, options = {}) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  let out = String(markdownText ?? "");

  if (!includeEnvironmentContext) {
    out = out.replace(/<environment_context>[\s\S]*?(?:<\/environment_context>|$)/g, "");
  }

  if (!includeToolOutputs) {
    out = stripMarkdownH3Sections(out, ["### 工具输出", "### Tool output", "### Tool outputs"]);
  }

  return out;
}

function createApp(options = {}) {
  const bodyLimit = options.bodyLimit || process.env.BRIDGE_BODY_LIMIT || "25mb";
  const exportsDir =
    options.exportsDir || process.env.BRIDGE_EXPORTS_DIR || path.join(__dirname, "..", ".data", "exports");

  const bridgeDb = options.bridgeDb;
  if (!bridgeDb) {
    throw new Error("createApp requires bridgeDb");
  }

  const app = express();
  app.use(express.json({ limit: bodyLimit }));

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
      res
        .status(500)
        .type("text/html")
        .send(
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

    const messages = safeJsonParseArray(sourceRow.normalized_json);
    if (messages == null) {
      res.status(500).type("text/html").send(
        renderReplayErrorHtml({
          title: "Replay",
          message: "Failed to parse normalized session messages.",
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
    const sessionSourceType = session && typeof session.source === "string" ? session.source.trim() : "";
    const exportedAt = typeof body.exported_at === "string" ? body.exported_at.trim() : "";

    const jsonlText = codex && typeof codex.jsonl_text === "string" ? codex.jsonl_text : "";
    const markdownText = codex && typeof codex.markdown_text === "string" ? codex.markdown_text : "";

    const hasJsonl = typeof jsonlText === "string" && jsonlText.trim() !== "";
    const hasMarkdown = typeof markdownText === "string" && markdownText.trim() !== "";

    if (!projectName) errors.push("project.name must be a non-empty string");
    if (!projectCwd) errors.push("project.cwd must be a non-empty string");
    if (!sessionName) errors.push("session.name must be a non-empty string");
    if (!exportedAt) errors.push("exported_at must be a non-empty string (ISO-8601 recommended)");
    if (!hasJsonl && !hasMarkdown) {
      errors.push("codex must include at least one non-empty string: jsonl_text or markdown_text");
    }

    if (codex && Object.prototype.hasOwnProperty.call(codex, "include_tool_outputs")) {
      if (typeof codex.include_tool_outputs !== "boolean") {
        errors.push("codex.include_tool_outputs must be a boolean");
      }
    }
    if (codex && Object.prototype.hasOwnProperty.call(codex, "include_environment_context")) {
      if (typeof codex.include_environment_context !== "boolean") {
        errors.push("codex.include_environment_context must be a boolean");
      }
    }

    if (errors.length > 0) {
      return sendError(res, 400, "invalid_request", "Invalid import payload", { errors });
    }

    const includeToolOutputs = codex.include_tool_outputs === true;
    const includeEnvironmentContext = codex.include_environment_context === true;

    const warnings = [];
    const parsedExportedAtMs = Date.parse(exportedAt);
    if (!Number.isFinite(parsedExportedAtMs)) {
      warnings.push({
        code: "invalid_exported_at",
        message: "exported_at is not a valid ISO-8601 timestamp; accepted but may reduce traceability",
      });
    }

    const raw_jsonl = hasJsonl
      ? filterCodexJsonlRaw(jsonlText, { includeToolOutputs, includeEnvironmentContext })
      : "";
    const raw_markdown = hasMarkdown
      ? sanitizeCodexMarkdown(markdownText, { includeToolOutputs, includeEnvironmentContext })
      : null;

    let message_count = 0;
    let messages = [];
    if (hasJsonl) {
      const parsed = parseCodexJsonl(raw_jsonl, {
        includeToolOutputs,
        includeEnvironmentContext,
      });
      message_count = parsed.message_count;
      messages = parsed.messages;
      for (const w of parsed.warnings) warnings.push(w);
    }

    const project_id = stableId("proj", projectCwd);
    const session_id = stableId("sess", project_id, sessionName);

    const derivedSourceType = hasJsonl ? "codex_jsonl" : "codex_markdown";
    const source_type = sessionSourceType || derivedSourceType;

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
          source_type,
        });
        bridgeDb.addSource({
          id: randomId("src"),
          session_id,
          exported_at: exportedAt,
          raw_jsonl,
          raw_markdown,
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

  app.post("/bridge/v1/exports", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "invalid_request", "Request body must be JSON");
    }

    const scope = body.scope;
    const includesRaw = body.includes;
    const includeRawJsonl = body.include_raw_jsonl === true;
    const version = normalizeExportVersion(body.version);

    const errors = [];
    if (!scope || typeof scope !== "object") errors.push("scope must be an object");
    if (includesRaw != null && typeof includesRaw !== "object") errors.push("includes must be an object");

    const projectId = scope && typeof scope.project_id === "string" ? scope.project_id.trim() : "";
    const sessionId = scope && typeof scope.session_id === "string" ? scope.session_id.trim() : "";

    if (!projectId) errors.push("scope.project_id must be a non-empty string");
    if (!sessionId) errors.push("scope.session_id must be a non-empty string");

    if (errors.length > 0) {
      return sendError(res, 400, "invalid_request", "Invalid export request", { errors });
    }

    const includes = normalizeIncludes(includesRaw);

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

    const messages = safeJsonParseArray(sourceRow.normalized_json);
    if (messages == null) {
      return sendError(res, 500, "invalid_state", "Failed to parse normalized_json for session source", {
        session_id: sessionId,
      });
    }

    const export_id = randomId("exp");
    const created_at = new Date().toISOString();

    const scopeJson = { project_id: projectId, session_id: sessionId };
    const warnings = [];

    ensureDir(exportsDir);
    const zipPath = path.join(exportsDir, `${export_id}.zip`);

    const counts = {
      sessions: includes.sessions ? 1 : 0,
      tech_cards: includes.tech_cards ? 0 : 0,
      playbooks: includes.playbooks ? 0 : 0,
      practices: includes.practices ? 0 : 0,
    };

    const replayBaseUrl = getBridgePublicBaseUrl() || `${req.protocol}://${req.get("host")}`;
    const manifest = makeExportManifest({
      version,
      export_id,
      created_at,
      scope: scopeJson,
      counts,
      replay_base_url: replayBaseUrl,
    });

    const sessionFileBase = sessionRow.id.replace(/[^A-Za-z0-9_-]/g, "_");
    const sessionMdPath = path.posix.join("Sessions", `${sessionFileBase}.md`);
    const sessionJsonlPath = path.posix.join("Sessions", `${sessionFileBase}.jsonl`);

    const sessionMarkdown = renderSourceMarkdown({
      project: { id: projectRow.id, name: projectRow.name, cwd: projectRow.cwd },
      session: { id: sessionRow.id, name: sessionRow.name },
      project_id: projectId,
      session_id: sessionId,
      messages,
      replayBaseUrl,
    });

    const index_markdown = renderExportIndexMarkdown({
      export_id,
      created_at,
      scope: scopeJson,
      session_links: includes.sessions ? [`[${sessionRow.name}](${sessionMdPath})`] : [],
    });

    const zipFiles = {};
    if (includes.sessions) zipFiles[sessionMdPath] = sessionMarkdown;
    if (includes.sessions && includeRawJsonl) zipFiles[sessionJsonlPath] = sourceRow.raw_jsonl;

    try {
      bridgeDb.createExport({
        id: export_id,
        project_id: projectId,
        session_id: sessionId,
        scope_json: JSON.stringify(scopeJson),
        includes_json: JSON.stringify(includes),
        status: "building",
        created_at,
        version,
        zip_path: null,
        counts_json: JSON.stringify({}),
        warnings_json: JSON.stringify(warnings),
        error_json: null,
      });
    } catch (err) {
      return sendError(res, 500, "db_error", "Failed to create export record", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const zipBuffer = buildExportZipBuffer({
        index_markdown,
        manifest,
        files: zipFiles,
      });

      fs.writeFileSync(zipPath, zipBuffer);

      bridgeDb.updateExport({
        id: export_id,
        status: "ready",
        zip_path: zipPath,
        counts_json: JSON.stringify(counts),
        warnings_json: JSON.stringify(warnings),
        error_json: null,
      });
    } catch (err) {
      try {
        bridgeDb.updateExport({
          id: export_id,
          status: "failed",
          zip_path: null,
          counts_json: JSON.stringify(counts),
          warnings_json: JSON.stringify(warnings),
          error_json: JSON.stringify({ message: err instanceof Error ? err.message : String(err) }),
        });
      } catch {}

      return sendError(res, 500, "export_failed", "Failed to build export ZIP", {
        export_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    res.json({
      export_id,
      status: "ready",
      created_at,
      download_url: `/bridge/v1/exports/${export_id}/download`,
      warnings,
    });
  });

  app.get("/bridge/v1/exports", (req, res) => {
    const rows = bridgeDb.listExports({ limit: 100 });
    const exportsList = rows.map((r) => {
      let scope = {};
      try {
        scope = JSON.parse(r.scope_json);
      } catch {}

      return {
        export_id: r.id,
        status: r.status,
        created_at: r.created_at,
        scope,
        download_url: r.status === "ready" ? `/bridge/v1/exports/${r.id}/download` : null,
      };
    });

    res.json({ exports: exportsList });
  });

  app.get("/bridge/v1/exports/:export_id/download", (req, res) => {
    const exportId = String(req.params.export_id || "");
    if (!exportId) {
      return sendError(res, 400, "invalid_request", "export_id must be provided");
    }

    const row = bridgeDb.getExportById(exportId);
    if (!row) {
      return sendError(res, 404, "not_found", "Export not found", { export_id: exportId });
    }

    if (row.status !== "ready") {
      return sendError(res, 409, "invalid_state", "Export is not ready for download", {
        export_id: exportId,
        status: row.status,
      });
    }

    const zipPath = row.zip_path ? String(row.zip_path) : "";
    if (!zipPath) {
      return sendError(res, 500, "invalid_state", "Export ZIP path is missing", { export_id: exportId });
    }
    if (!fs.existsSync(zipPath)) {
      return sendError(res, 500, "invalid_state", "Export ZIP file is missing on disk", {
        export_id: exportId,
      });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="export-${exportId}.zip"`);
    res.sendFile(path.resolve(zipPath));
  });

  app.post("/bridge/v1/projects/:project_id/generate", (req, res) => {
    const projectId = String(req.params.project_id || "");
    return sendError(res, 501, "not_implemented", "Generate is not implemented in Bridge MVP", {
      project_id: projectId,
      route: "POST /bridge/v1/projects/:project_id/generate",
    });
  });

  app.post("/bridge/v1/projects/:project_id/sessions/:session_id/notes/generate", async (req, res) => {
    const projectId = String(req.params.project_id || "");
    const sessionId = String(req.params.session_id || "");

    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "invalid_request", "Request body must be JSON");
    }

    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const noteKinds = Array.isArray(body.kinds) ? body.kinds : null;
    const includeToolMessages = !!body.include_tool_messages;
    const includeSystemMessages = !!body.include_system_messages;

    const projectRow = bridgeDb.getProjectById(projectId);
    if (!projectRow) {
      return sendError(res, 404, "not_found", "Project not found", { project_id: projectId });
    }

    const sessionRow = bridgeDb.getSessionById(sessionId);
    if (!sessionRow || sessionRow.project_id !== projectId) {
      return sendError(res, 404, "not_found", "Session not found", { project_id: projectId, session_id: sessionId });
    }

    const sourceRow = bridgeDb.getLatestSourceBySessionId(sessionId);
    if (!sourceRow) {
      return sendError(res, 404, "not_found", "No imported source found for session", { session_id: sessionId });
    }

    const messages = safeJsonParseArray(sourceRow.normalized_json);
    if (messages == null) {
      return sendError(res, 500, "invalid_state", "Failed to parse normalized_json for session source", {
        session_id: sessionId,
      });
    }

    const replayBaseUrl = getBridgePublicBaseUrl() || `${req.protocol}://${req.get("host")}`;
    const project = { id: projectRow.id, name: projectRow.name, cwd: projectRow.cwd };
    const session = { id: sessionRow.id, name: sessionRow.name };

    try {
      const generated = await generateNotes({
        provider,
        noteKinds: noteKinds || undefined,
        project,
        session,
        project_id: projectId,
        session_id: sessionId,
        sourceId: null,
        messages,
        replayBaseUrl,
        generationOptions: { includeToolMessages, includeSystemMessages },
      });

      return res.json({
        provider: generated.provider,
        project_id: projectId,
        session_id: sessionId,
        notes: generated.notes,
      });
    } catch (err) {
      if (err && err.code === "missing_openai_key") {
        return sendError(res, 400, "invalid_config", "OpenAI is not configured (missing OPENAI_API_KEY)", {
          missing: ["OPENAI_API_KEY"],
        });
      }
      return sendError(res, 500, "notes_generate_failed", "Failed to generate notes", {
        project_id: projectId,
        session_id: sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/bridge/v1/projects/:project_id/sync/open-notebook", (req, res) => {
    const projectId = String(req.params.project_id || "");

    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "invalid_request", "Request body must be JSON");
    }

    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
    const targetsRaw = body.targets;
    const notesProvider = typeof body.notes_provider === "string" ? body.notes_provider.trim() : "";

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

    const messages = safeJsonParseArray(sourceRow.normalized_json);
    if (messages == null) {
      return sendError(res, 500, "invalid_state", "Failed to parse normalized_json for session source", {
        session_id: sessionId,
      });
    }

    const replayBaseUrl = getBridgePublicBaseUrl() || `${req.protocol}://${req.get("host")}`;
    const adapter = FilesystemAdapter.fromEnv(OPEN_NOTEBOOK_FS_ROOT_ENV);

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

          noteKinds.push("summary", "study-pack", "milestones");

          const links = [];
          if (messages.length >= 1) links.push(anchorForIndex(0));
          if (messages.length >= 2) links.push(anchorForIndex(1));
          if (messages.length >= 3) links.push(anchorForIndex(2));

          let generated;
          try {
            generated = await generateNotes({
              provider: notesProvider,
              noteKinds,
              project,
              session,
              project_id: projectId,
              session_id: sessionId,
              sourceId,
              messages,
              replayBaseUrl,
            });
          } catch (err) {
            if (err && err.code === "missing_openai_key") {
              return sendError(res, 400, "invalid_config", "OpenAI is not configured (missing OPENAI_API_KEY)", {
                missing: ["OPENAI_API_KEY"],
              });
            }
            throw err;
          }

          for (const kind of noteKinds) {
            const content = generated.notes[kind] || generated.notes[kind.replace(/_/g, "-")] || "";
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
          notes_provider: wantNotes ? notesProvider || "placeholder" : undefined,
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

  return app;
}

function createBridgeApp(options = {}) {
  const bodyLimit = options.bodyLimit || process.env.BRIDGE_BODY_LIMIT || "25mb";
  const dbPath =
    options.dbPath || process.env.BRIDGE_DB_PATH || path.join(__dirname, "..", ".data", "bridge.db");

  const exportsDir =
    options.exportsDir ||
    process.env.BRIDGE_EXPORTS_DIR ||
    path.join(path.dirname(dbPath), "exports");

  const bridgeDb = openBridgeDb(dbPath);
  const app = createApp({ bridgeDb, bodyLimit, exportsDir });

  return { app, bridgeDb, dbPath, exportsDir };
}

module.exports = { createApp, createBridgeApp };

