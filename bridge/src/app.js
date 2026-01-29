const fs = require("fs");
const path = require("path");
const express = require("express");

const { openBridgeDb } = require("./db");
const { stableId, randomId } = require("./lib/ids");
const { filterCodexJsonlRaw, parseCodexJsonl } = require("./lib/codexJsonl");
const { sendError } = require("./lib/errors");
const { FilesystemAdapter, DEFAULT_ENV_VAR: OPEN_NOTEBOOK_FS_ROOT_ENV } = require("./adapters/filesystem");
const { OpenNotebookHttpAdapter } = require("./adapters/http");
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

let autosearchModulePromise = null;
async function getAutosearchModule() {
  if (autosearchModulePromise) return autosearchModulePromise;
  autosearchModulePromise = import("ai-coding-autosearch");
  return autosearchModulePromise;
}

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

function messageIdForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function isPathWithin(rootDir, targetPath) {
  try {
    const root = path.resolve(String(rootDir || ""));
    const target = path.resolve(String(targetPath || ""));
    if (!root || !target) return false;
    const rootNorm = process.platform === "win32" ? root.toLowerCase() : root;
    const targetNorm = process.platform === "win32" ? target.toLowerCase() : target;
    return targetNorm === rootNorm || targetNorm.startsWith(rootNorm + path.sep);
  } catch {
    return false;
  }
}

function tryParseCodexSessionMeta(jsonlText) {
  const lines = String(jsonlText || "").split(/\r?\n/).slice(0, 50);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (obj && obj.type === "session_meta" && obj.payload && typeof obj.payload === "object") {
      const cwdRaw = typeof obj.payload.cwd === "string" ? obj.payload.cwd : "";
      const cwd = cwdRaw.startsWith("\\\\?\\UNC\\")
        ? `\\\\${cwdRaw.slice("\\\\?\\UNC\\".length)}`
        : cwdRaw.startsWith("\\\\?\\")
          ? cwdRaw.slice("\\\\?\\".length)
          : cwdRaw;
      const id = typeof obj.payload.id === "string" ? obj.payload.id : "";
      const originator = typeof obj.payload.originator === "string" ? obj.payload.originator : "";
      const source = typeof obj.payload.source === "string" ? obj.payload.source : "";
      return { cwd, id, originator, source };
    }
  }
  return null;
}

function inferCodexPortFromSessionMeta(meta) {
  const originator = typeof meta?.originator === "string" ? meta.originator.trim().toLowerCase() : "";
  const source = typeof meta?.source === "string" ? meta.source.trim().toLowerCase() : "";

  if (originator.includes("vscode") || source === "vscode") return "ide";
  if (originator.includes("ide") || source === "ide") return "ide";
  if (originator.includes("cli") || source === "cli") return "cli";
  return null;
}

function parseClaudeCodeJsonl(jsonlText) {
  const lines = String(jsonlText || "").split(/\r?\n/);
  const messages = [];

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!obj || typeof obj !== "object") continue;
    if (obj.type !== "user" && obj.type !== "assistant") continue;
    if (!obj.message || typeof obj.message !== "object") continue;

    const roleRaw = typeof obj.message.role === "string" ? obj.message.role.toLowerCase() : obj.type;
    const role = roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
    if (!role) continue;

    const content = obj.message.content;
    const text = Array.isArray(content)
      ? content
          .map((c) => {
            if (typeof c === "string") return c;
            if (c && typeof c === "object" && typeof c.text === "string") return c.text;
            return "";
          })
          .filter(Boolean)
          .join("\n")
      : typeof content === "string"
        ? content
        : "";

    const trimmedText = String(text || "").trim();
    if (!trimmedText) continue;

    messages.push({
      role,
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp : null,
      text: trimmedText,
      message_id: messageIdForIndex(messages.length),
    });
  }

  return { messages, message_count: messages.length, warnings: [] };
}

function parseKiroChatJson(text) {
  let obj;
  try {
    obj = JSON.parse(String(text || ""));
  } catch {
    return { messages: [], message_count: 0, warnings: [{ code: "invalid_json", message: "Invalid Kiro .chat JSON" }] };
  }

  const chat = Array.isArray(obj.chat) ? obj.chat : [];
  const messages = [];

  for (const item of chat) {
    if (!item || typeof item !== "object") continue;
    const roleRaw = typeof item.role === "string" ? item.role.toLowerCase() : "";
    const role =
      roleRaw === "human" || roleRaw === "user"
        ? "user"
        : roleRaw === "bot" || roleRaw === "assistant"
          ? "assistant"
          : roleRaw === "tool"
            ? "tool"
            : null;
    if (!role) continue;
    const content = typeof item.content === "string" ? item.content : "";
    const trimmed = content.trim();
    if (!trimmed) continue;
    messages.push({ role, timestamp: null, text: trimmed, message_id: messageIdForIndex(messages.length) });
  }

  return { messages, message_count: messages.length, warnings: [] };
}

function normalizeRole(raw) {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return null;
  if (r === "user" || r === "human" || r === "prompt") return "user";
  if (r === "assistant" || r === "ai" || r === "model" || r === "bot") return "assistant";
  if (r === "tool" || r === "function") return "tool";
  if (r === "system") return "system";
  return null;
}

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && typeof c.text === "string") return c.text;
        if (c && typeof c === "object" && typeof c.content === "string") return c.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
  }
  return "";
}

function extractMessageFromUnknownJson(obj) {
  if (!obj || typeof obj !== "object") return null;

  // Claude Code JSONL shape: { type, timestamp, message: { role, content } }
  if (typeof obj.type === "string" && obj.message && typeof obj.message === "object") {
    const role = normalizeRole(obj.message.role || obj.type);
    const text = extractTextFromContent(obj.message.content);
    const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : null;
    return role && text.trim() ? { role, text: text.trim(), timestamp } : null;
  }

  // Simple chat shape: { role, content/text/message }
  const role = normalizeRole(obj.role || obj.type);
  const text = extractTextFromContent(obj.content ?? obj.text ?? obj.message);
  const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : typeof obj.created_at === "string" ? obj.created_at : null;
  return role && text.trim() ? { role, text: text.trim(), timestamp } : null;
}

function parseGenericJsonl(text) {
  const lines = String(text || "").split(/\r?\n/);
  const messages = [];
  const warnings = [];

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      warnings.push({ code: "invalid_jsonl_line", message: "Failed to parse one JSONL line" });
      continue;
    }

    const m = extractMessageFromUnknownJson(obj);
    if (!m) continue;
    messages.push({ ...m, message_id: messageIdForIndex(messages.length) });
  }

  return { messages, message_count: messages.length, warnings };
}

function parseGenericJson(text) {
  let obj;
  try {
    obj = JSON.parse(String(text || ""));
  } catch {
    return { messages: [], message_count: 0, warnings: [{ code: "invalid_json", message: "Invalid JSON" }] };
  }

  const messages = [];
  const warnings = [];

  const arr = Array.isArray(obj) ? obj : Array.isArray(obj.messages) ? obj.messages : null;
  if (arr) {
    for (const item of arr) {
      const m = extractMessageFromUnknownJson(item);
      if (!m) continue;
      messages.push({ ...m, message_id: messageIdForIndex(messages.length) });
    }
    return { messages, message_count: messages.length, warnings };
  }

  // Kiro-like: { chat: [{ role, content }] }
  if (obj && typeof obj === "object" && Array.isArray(obj.chat)) {
    return parseKiroChatJson(JSON.stringify(obj));
  }

  // Fallback: store a single system message with the raw JSON for visibility.
  messages.push({
    role: "system",
    timestamp: null,
    text: JSON.stringify(obj, null, 2).slice(0, 50_000),
    message_id: messageIdForIndex(0),
  });
  warnings.push({ code: "unsupported_json_shape", message: "Unsupported JSON shape; stored as a single system message" });
  return { messages, message_count: messages.length, warnings };
}

function msToIso(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function parseCursorComposerDataJson(text, opts = {}) {
  let obj;
  try {
    obj = JSON.parse(String(text || ""));
  } catch {
    return { messages: [], message_count: 0, warnings: [{ code: "invalid_json", message: "Invalid Cursor composerData JSON" }] };
  }

  const warnings = [];
  const messages = [];

  const bubbleReader = opts && typeof opts === "object" ? opts.bubbleReader : null;
  const composerId = typeof obj.composerId === "string" ? obj.composerId.trim() : "";
  const headers = Array.isArray(obj.fullConversationHeadersOnly) ? obj.fullConversationHeadersOnly : null;

  if (bubbleReader && composerId && headers && headers.length > 0) {
    const maxBubblesRaw = typeof opts.maxBubbles === "number" ? opts.maxBubbles : 800;
    const maxBubbles = Math.max(1, Math.min(2000, Math.floor(maxBubblesRaw)));

    for (const h of headers) {
      if (messages.length >= maxBubbles) {
        warnings.push({ code: "truncated", message: `Cursor conversation truncated at ${maxBubbles} messages.` });
        break;
      }
      if (!h || typeof h !== "object") continue;
      const bubbleId = typeof h.bubbleId === "string" ? h.bubbleId : "";
      const bubbleType = typeof h.type === "number" ? h.type : null;
      if (!bubbleId) continue;

      const bubbleKey = `bubbleId:${composerId}:${bubbleId}`;
      const bubbleRaw = typeof bubbleReader.get === "function" ? bubbleReader.get(bubbleKey) : null;
      if (!bubbleRaw) continue;

      let bubble;
      try {
        bubble = JSON.parse(String(bubbleRaw));
      } catch {
        continue;
      }

      const bubbleText = typeof bubble?.text === "string" ? bubble.text.trim() : "";
      if (!bubbleText) continue;

      const role = bubbleType === 1 ? "user" : bubbleType === 2 ? "assistant" : "system";
      messages.push({
        role,
        timestamp: null,
        text: bubbleText.slice(0, 50_000),
        message_id: messageIdForIndex(messages.length),
      });
    }

    if (messages.length > 0) return { messages, message_count: messages.length, warnings };
    warnings.push({
      code: "empty_conversation",
      message: "Cursor fullConversationHeadersOnly present, but no bubble texts were found.",
    });
  }

  const prompt =
    typeof obj.text === "string" && obj.text.trim()
      ? obj.text.trim()
      : typeof obj.richText === "string" && obj.richText.trim()
        ? obj.richText.trim()
        : "";
  const timestamp = msToIso(obj.lastUpdatedAt) || msToIso(obj.createdAt);

  if (!prompt) warnings.push({ code: "empty_prompt", message: "Cursor composerData.text is empty; imported with no user message" });

  if (prompt) {
    messages.push({ role: "user", timestamp, text: prompt.slice(0, 50_000), message_id: messageIdForIndex(0) });
  }

  return { messages, message_count: messages.length, warnings };
}

function allowedRootsForCandidate(candidate) {
  const tool = typeof candidate?.tool === "string" ? candidate.tool.trim() : "";
  const hostApp = typeof candidate?.hostApp === "string" ? candidate.hostApp.trim() : "";
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const appData = process.env.APPDATA || "";

  const roots = [];

  if (home) {
    if (tool === "codex") roots.push(path.join(home, ".codex", "sessions"));
    if (tool === "claude-code") roots.push(path.join(home, ".claude", "projects"));
    if (tool === "antigravity") roots.push(path.join(home, ".gemini", "antigravity"));
    if (tool === "opencode") {
      const xdgDataHome = (process.env.XDG_DATA_HOME || "").trim();
      if (xdgDataHome) roots.push(path.join(xdgDataHome, "opencode"));
      roots.push(path.join(home, ".local", "share", "opencode"));
      roots.push(path.join(home, ".opencode"));
      roots.push(path.join(home, ".open-code"));
      roots.push(path.join(home, ".openCode"));
      roots.push(path.join(home, ".config", "opencode"));
      roots.push(path.join(home, ".config", "open-code"));
    }
  }

  if (appData) {
    if (tool === "kiro" || hostApp === "kiro") roots.push(path.join(appData, "Kiro", "User", "globalStorage", "kiro.kiroagent"));
    if (tool === "cursor" || hostApp === "cursor") roots.push(path.join(appData, "Cursor"));
    if (tool === "antigravity" || hostApp === "antigravity") roots.push(path.join(appData, "Antigravity"));

    if (tool === "vscode-extension" || tool === "vscode") {
      // Allow extension transcript files under common VSCode-family host roots.
      roots.push(path.join(appData, "Code"));
      roots.push(path.join(appData, "Cursor"));
      roots.push(path.join(appData, "Kiro"));
      roots.push(path.join(appData, "Antigravity"));
    }

    if (tool === "opencode") roots.push(path.join(appData, "opencode"));
  }

  return roots.filter(Boolean);
}

function readSqliteKvValue(dbPath, table, key) {
  if (!dbPath || !table || !key) return null;
  if (table !== "ItemTable" && table !== "cursorDiskKV") return null;

  try {
    const sqlite = require("node:sqlite");
    if (sqlite && typeof sqlite.DatabaseSync === "function") {
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        try {
          db.exec("PRAGMA query_only = ON;");
        } catch {
          // ignore
        }
        const row = db.prepare(`SELECT value FROM ${table} WHERE key = ? LIMIT 1`).get(key);
        if (!row) return null;
        const v = row.value;
        if (Buffer.isBuffer(v)) return v.toString("utf-8");
        return String(v ?? "");
      } finally {
        db.close();
      }
    }
  } catch {
    // fall through
  }

  try {
    // Optional fallback for environments without node:sqlite
    const BetterSqlite3 = require("better-sqlite3");
    if (typeof BetterSqlite3 === "function") {
      const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
      try {
        const row = db.prepare(`SELECT value FROM ${table} WHERE key = ? LIMIT 1`).get(key);
        if (!row) return null;
        const v = row.value;
        if (Buffer.isBuffer(v)) return v.toString("utf-8");
        return String(v ?? "");
      } finally {
        db.close();
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function createSqliteKvReader(dbPath, table) {
  if (!dbPath || !table) return null;
  if (table !== "ItemTable" && table !== "cursorDiskKV") return null;

  try {
    const sqlite = require("node:sqlite");
    if (sqlite && typeof sqlite.DatabaseSync === "function") {
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        try {
          db.exec("PRAGMA query_only = ON;");
        } catch {
          // ignore
        }
        const stmt = db.prepare(`SELECT value FROM ${table} WHERE key = ? LIMIT 1`);
        return {
          get: (key) => {
            if (!key) return null;
            const row = stmt.get(key);
            if (!row) return null;
            const v = row.value;
            if (Buffer.isBuffer(v)) return v.toString("utf-8");
            return String(v ?? "");
          },
          close: () => {
            try {
              db.close();
            } catch {
              // ignore
            }
          },
        };
      } catch (e) {
        try {
          db.close();
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // fall through
  }

  try {
    const BetterSqlite3 = require("better-sqlite3");
    if (typeof BetterSqlite3 === "function") {
      const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
      const stmt = db.prepare(`SELECT value FROM ${table} WHERE key = ? LIMIT 1`);
      return {
        get: (key) => {
          if (!key) return null;
          const row = stmt.get(key);
          if (!row) return null;
          const v = row.value;
          if (Buffer.isBuffer(v)) return v.toString("utf-8");
          return String(v ?? "");
        },
        close: () => {
          try {
            db.close();
          } catch {
            // ignore
          }
        },
      };
    }
  } catch {
    // ignore
  }

  return null;
}

function findClaudeSessionMeta(jsonlText) {
  const lines = String(jsonlText || "").split(/\r?\n/).slice(0, 80);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;
    const cwd = typeof obj.cwd === "string" ? obj.cwd : "";
    const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : "";
    if (cwd || sessionId) return { cwd, sessionId };
  }
  return { cwd: "", sessionId: "" };
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

  // Allow browser clients (e.g. Vite dev server) to call Bridge JSON APIs.
  app.use("/bridge/v1", (req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "content-type,authorization");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    return next();
  });

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

  app.get("/bridge/v1/local-transcripts/discover", async (req, res) => {
    const scan = typeof req.query.scan === "string" ? req.query.scan.trim().toLowerCase() : "fast";
    const scanMode = scan === "deep" ? "deep" : "fast";

    const toolsRaw = typeof req.query.tools === "string" ? req.query.tools.trim() : "";
    const includeTools = {};
    if (toolsRaw) {
      const allowed = new Set([
        "vscode",
        "codex",
        "claude-code",
        "opencode",
        "cursor",
        "kiro",
        "antigravity",
        "vscode-extension",
      ]);
      for (const part of toolsRaw.split(",").map((p) => p.trim()).filter(Boolean)) {
        if (allowed.has(part)) includeTools[part] = true;
      }
    }

    let candidates = [];
    try {
      const mod = await getAutosearchModule();
      candidates = await mod.discoverTranscriptCandidates({
        scanMode,
        includeTools: toolsRaw ? includeTools : undefined,
      });
    } catch (err) {
      return sendError(res, 500, "discover_failed", "Failed to auto-discover local transcripts", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    res.json({ candidates });
  });

  app.post("/bridge/v1/local-transcripts/preview", async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "invalid_request", "Request body must be JSON");
    }

    const candidate = body.candidate;
    if (!candidate || typeof candidate !== "object") {
      return sendError(res, 400, "invalid_request", "candidate must be an object");
    }

    const tool = typeof candidate.tool === "string" ? candidate.tool.trim() : "";
    const source = candidate.source && typeof candidate.source === "object" ? candidate.source : null;
    const sourceKind = source && typeof source.kind === "string" ? source.kind : "";

    if (!tool) return sendError(res, 400, "invalid_request", "candidate.tool must be a non-empty string");
    if (!source || (sourceKind !== "file" && sourceKind !== "sqlite-kv")) {
      return sendError(res, 400, "invalid_request", "candidate.source.kind must be file or sqlite-kv");
    }

    const requestedPath = typeof source.path === "string" ? source.path.trim() : "";
    if (!requestedPath) return sendError(res, 400, "invalid_request", "candidate.source.path must be a non-empty string");

    const allowedRoots = allowedRootsForCandidate(candidate);
    if (allowedRoots.length === 0) {
      return sendError(res, 403, "forbidden", "No allowed roots configured for this candidate tool", { tool });
    }

    if (!allowedRoots.some((root) => isPathWithin(root, requestedPath))) {
      return sendError(res, 403, "forbidden", "Path is not within allowed transcript roots", { path: requestedPath });
    }

    const maxMessagesRaw = body.max_messages;
    const maxMessages =
      typeof maxMessagesRaw === "number" && Number.isFinite(maxMessagesRaw) && maxMessagesRaw > 0
        ? Math.min(500, Math.floor(maxMessagesRaw))
        : 200;

    let text = "";
    let stat = null;
    let exportedAt = new Date().toISOString();
    let format = "";

    if (sourceKind === "file") {
      format = typeof source.format === "string" ? source.format.trim() : "";

      try {
        stat = fs.statSync(requestedPath);
        // Antigravity Gemini storage uses binary `.pb` blobs. Avoid decoding/storing raw bytes as UTF-8.
        if (requestedPath.toLowerCase().endsWith(".pb")) text = "";
        else text = fs.readFileSync(requestedPath, "utf-8");
      } catch (err) {
        return sendError(res, 404, "not_found", "Failed to read transcript file", {
          path: requestedPath,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      exportedAt = new Date(stat.mtimeMs || Date.now()).toISOString();
    } else {
      const table = typeof source.table === "string" ? source.table.trim() : "";
      const key = typeof source.key === "string" ? source.key.trim() : "";
      if (!table) return sendError(res, 400, "invalid_request", "candidate.source.table must be a non-empty string");
      if (!key) return sendError(res, 400, "invalid_request", "candidate.source.key must be a non-empty string");

      const valueText = readSqliteKvValue(requestedPath, table, key);
      if (valueText == null) {
        return sendError(res, 404, "not_found", "Failed to read sqlite-kv transcript value", {
          path: requestedPath,
          table,
          key,
        });
      }

      text = valueText;
      format = "sqlite-kv";

      // Best-effort "exportedAt" based on candidate preview timestamps
      const updatedAt = typeof candidate.preview?.updatedAt === "string" ? candidate.preview.updatedAt : "";
      const startedAt = typeof candidate.preview?.startedAt === "string" ? candidate.preview.startedAt : "";
      exportedAt = updatedAt || startedAt || exportedAt;
    }

    const includeToolOutputs = body.include_tool_outputs === true;
    const includeEnvironmentContext = body.include_environment_context === true;

    const warnings = [];
    let source_type = "local_transcript";
    let projectName = typeof candidate.projectName === "string" ? candidate.projectName.trim() : "";
    let projectCwd = "";
    let sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";

    let parsed;
    let session_meta;

    if (tool === "codex" && sourceKind === "file" && format === "jsonl") {
      const meta = tryParseCodexSessionMeta(text);
      if (meta && meta.cwd) {
        projectCwd = meta.cwd;
        if (!projectName) projectName = path.basename(meta.cwd);
      }
      if (meta && meta.id) sessionName = meta.id;

      if (meta) {
        const port = inferCodexPortFromSessionMeta(meta);
        const out = {};
        if (meta.id) out.id = meta.id;
        if (meta.cwd) out.cwd = meta.cwd;
        if (meta.originator) out.originator = meta.originator;
        if (meta.source) out.source = meta.source;
        if (port) out.codex_port = port;
        if (Object.keys(out).length) session_meta = out;
      }

      const filtered = filterCodexJsonlRaw(text, { includeToolOutputs, includeEnvironmentContext });
      parsed = parseCodexJsonl(filtered, { includeToolOutputs, includeEnvironmentContext });
      for (const w of parsed.warnings) warnings.push(w);
      source_type = "codex_jsonl";
    } else if (tool === "claude-code" && sourceKind === "file" && format === "jsonl") {
      parsed = parseClaudeCodeJsonl(text);
      source_type = "claude_code_jsonl";
      const meta = findClaudeSessionMeta(text);
      if (meta.cwd) {
        projectCwd = meta.cwd;
        if (!projectName) projectName = path.basename(meta.cwd);
      }
      if (meta.sessionId) sessionName = meta.sessionId;
    } else if (tool === "opencode" && sourceKind === "file" && (format === "chat-json" || format === "json")) {
      parsed = parseGenericJson(text);
      source_type = "opencode_session_json";
      for (const w of parsed.warnings || []) warnings.push(w);

      projectCwd = "opencode://local";
      if (!projectName) projectName = "OpenCode";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "kiro" && sourceKind === "file" && (format === "chat-json" || requestedPath.toLowerCase().endsWith(".chat"))) {
      parsed = parseKiroChatJson(text);
      source_type = "kiro_chat";

      const workspaceId = path.basename(path.dirname(requestedPath));
      projectCwd = `kiro://${workspaceId}`;
      if (!projectName) projectName = `Kiro (${workspaceId.slice(0, 8)})`;
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "cursor" && sourceKind === "sqlite-kv") {
      let bubbleReader = null;
      try {
        bubbleReader = createSqliteKvReader(requestedPath, "cursorDiskKV");
        parsed = parseCursorComposerDataJson(text, { bubbleReader });
      } finally {
        try {
          bubbleReader && bubbleReader.close && bubbleReader.close();
        } catch {
          // ignore
        }
      }
      source_type = "cursor_sqlite_kv";
      for (const w of parsed.warnings || []) warnings.push(w);

      projectCwd = "cursor://globalStorage";
      if (!projectName) projectName = "Cursor";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = typeof source.key === "string" ? source.key.trim() : "cursor";
    } else if (tool === "antigravity" && sourceKind === "file" && requestedPath.toLowerCase().endsWith(".pb")) {
      source_type = "antigravity_gemini_pb";
      parsed = {
        messages: [
          {
            role: "system",
            timestamp: null,
            text: "Antigravity conversation blobs (.pb) are not yet supported for parsing. This preview shows a stub message only.",
            message_id: messageIdForIndex(0),
          },
        ],
        message_count: 1,
        warnings: [{ code: "unsupported_format", message: "Unsupported Antigravity .pb format; preview stub only." }],
      };
      for (const w of parsed.warnings || []) warnings.push(w);

      projectCwd = "antigravity://gemini";
      if (!projectName) projectName = "Antigravity";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "antigravity" && sourceKind === "sqlite-kv") {
      parsed = parseGenericJson(text);
      source_type = "antigravity_sqlite_kv";
      for (const w of parsed.warnings || []) warnings.push(w);

      projectCwd = "antigravity://globalStorage";
      if (!projectName) projectName = "Antigravity";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = typeof source.key === "string" ? source.key.trim() : "antigravity";
    } else if ((tool === "vscode-extension" || tool === "vscode") && sourceKind === "file") {
      source_type = "vscode_extension_file";
      if (format === "jsonl") parsed = parseGenericJsonl(text);
      else if (format === "json") parsed = parseGenericJson(text);
      else if (format === "chat-json") parsed = parseKiroChatJson(text);
      else {
        parsed = {
          messages: [{ role: "user", timestamp: null, text: String(text || "").slice(0, 50_000), message_id: messageIdForIndex(0) }],
          message_count: 1,
          warnings: [{ code: "unsupported_format", message: `Unsupported format for vscode-extension: ${format || "unknown"}` }],
        };
      }
      for (const w of parsed.warnings || []) warnings.push(w);
    } else {
      return sendError(res, 400, "unsupported", "Unsupported transcript preview type", { tool, format, path: requestedPath, sourceKind });
    }

    if (!projectName) projectName = "Imported Chat";
    if (!projectCwd) projectCwd = `file://${requestedPath}`;
    if (!sessionName) sessionName = path.basename(requestedPath);

    const allMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];

    res.json({
      project_name: projectName,
      project_cwd: projectCwd,
      session_name: sessionName,
      session_meta,
      exported_at: exportedAt,
      source_type,
      message_count: parsed?.message_count || allMessages.length,
      warnings,
      messages: allMessages.slice(0, maxMessages),
    });
  });

  app.post("/bridge/v1/local-transcripts/import", async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return sendError(res, 400, "invalid_request", "Request body must be JSON");
    }

    const candidate = body.candidate;
    if (!candidate || typeof candidate !== "object") {
      return sendError(res, 400, "invalid_request", "candidate must be an object");
    }

    const tool = typeof candidate.tool === "string" ? candidate.tool.trim() : "";
    const source = candidate.source && typeof candidate.source === "object" ? candidate.source : null;
    const sourceKind = source && typeof source.kind === "string" ? source.kind : "";

    if (!tool) return sendError(res, 400, "invalid_request", "candidate.tool must be a non-empty string");
    if (!source || (sourceKind !== "file" && sourceKind !== "sqlite-kv")) {
      return sendError(res, 400, "invalid_request", "candidate.source.kind must be file or sqlite-kv");
    }

    const requestedPath = typeof source.path === "string" ? source.path.trim() : "";
    if (!requestedPath) return sendError(res, 400, "invalid_request", "candidate.source.path must be a non-empty string");

    const allowedRoots = allowedRootsForCandidate(candidate);

    if (allowedRoots.length === 0) {
      return sendError(res, 403, "forbidden", "No allowed roots configured for this candidate tool", { tool });
    }

    if (!allowedRoots.some((root) => isPathWithin(root, requestedPath))) {
      return sendError(res, 403, "forbidden", "Path is not within allowed transcript roots", { path: requestedPath });
    }

    let text = "";
    let stat = null;
    let exportedAt = new Date().toISOString();
    let format = "";

    if (sourceKind === "file") {
      format = typeof source.format === "string" ? source.format.trim() : "";

      try {
        stat = fs.statSync(requestedPath);
        // Antigravity Gemini storage uses binary `.pb` blobs. Avoid decoding/storing raw bytes as UTF-8.
        if (requestedPath.toLowerCase().endsWith(".pb")) text = "";
        else text = fs.readFileSync(requestedPath, "utf-8");
      } catch (err) {
        return sendError(res, 404, "not_found", "Failed to read transcript file", {
          path: requestedPath,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      exportedAt = new Date(stat.mtimeMs || Date.now()).toISOString();
    } else {
      const table = typeof source.table === "string" ? source.table.trim() : "";
      const key = typeof source.key === "string" ? source.key.trim() : "";
      if (!table) return sendError(res, 400, "invalid_request", "candidate.source.table must be a non-empty string");
      if (!key) return sendError(res, 400, "invalid_request", "candidate.source.key must be a non-empty string");

      const valueText = readSqliteKvValue(requestedPath, table, key);
      if (valueText == null) {
        return sendError(res, 404, "not_found", "Failed to read sqlite-kv transcript value", {
          path: requestedPath,
          table,
          key,
        });
      }

      text = valueText;
      format = "sqlite-kv";

      // Best-effort "exportedAt" based on candidate preview timestamps
      const updatedAt = typeof candidate.preview?.updatedAt === "string" ? candidate.preview.updatedAt : "";
      const startedAt = typeof candidate.preview?.startedAt === "string" ? candidate.preview.startedAt : "";
      exportedAt = updatedAt || startedAt || exportedAt;
    }

    const includeToolOutputs = body.include_tool_outputs === true;
    const includeEnvironmentContext = body.include_environment_context === true;

    const warnings = [];
    let source_type = "local_transcript";
    let projectName = typeof candidate.projectName === "string" ? candidate.projectName.trim() : "";
    let projectCwd = "";
    let sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";

    let parsed;
    let raw_jsonl = "";
    let raw_markdown = null;

    if (tool === "codex" && sourceKind === "file" && format === "jsonl") {
      const meta = tryParseCodexSessionMeta(text);
      if (meta && meta.cwd) {
        projectCwd = meta.cwd;
        if (!projectName) projectName = path.basename(meta.cwd);
      }
      if (meta && meta.id) sessionName = meta.id;

      raw_jsonl = filterCodexJsonlRaw(text, { includeToolOutputs, includeEnvironmentContext });
      parsed = parseCodexJsonl(raw_jsonl, { includeToolOutputs, includeEnvironmentContext });
      for (const w of parsed.warnings) warnings.push(w);
      source_type = "codex_jsonl";
    } else if (tool === "claude-code" && sourceKind === "file" && format === "jsonl") {
      parsed = parseClaudeCodeJsonl(text);
      source_type = "claude_code_jsonl";

      // Best-effort: infer project cwd/name from the first message with a cwd field.
      const meta = findClaudeSessionMeta(text);
      if (meta.cwd) {
        projectCwd = meta.cwd;
        if (!projectName) projectName = path.basename(meta.cwd);
      }
      if (meta.sessionId) sessionName = meta.sessionId;

      raw_jsonl = text;
    } else if (tool === "opencode" && sourceKind === "file" && (format === "chat-json" || format === "json")) {
      parsed = parseGenericJson(text);
      source_type = "opencode_session_json";
      for (const w of parsed.warnings || []) warnings.push(w);
      raw_jsonl = text;
      raw_markdown = null;

      projectCwd = "opencode://local";
      if (!projectName) projectName = "OpenCode";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "kiro" && sourceKind === "file" && (format === "chat-json" || requestedPath.toLowerCase().endsWith(".chat"))) {
      parsed = parseKiroChatJson(text);
      source_type = "kiro_chat";
      raw_jsonl = text;
      raw_markdown = null;

      const workspaceId = path.basename(path.dirname(requestedPath));
      projectCwd = `kiro://${workspaceId}`;
      if (!projectName) projectName = `Kiro (${workspaceId.slice(0, 8)})`;
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "cursor" && sourceKind === "sqlite-kv") {
      let bubbleReader = null;
      try {
        bubbleReader = createSqliteKvReader(requestedPath, "cursorDiskKV");
        parsed = parseCursorComposerDataJson(text, { bubbleReader });
      } finally {
        try {
          bubbleReader && bubbleReader.close && bubbleReader.close();
        } catch {
          // ignore
        }
      }
      source_type = "cursor_sqlite_kv";
      for (const w of parsed.warnings || []) warnings.push(w);
      raw_jsonl = text;
      raw_markdown = null;

      projectCwd = "cursor://globalStorage";
      if (!projectName) projectName = "Cursor";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = typeof source.key === "string" ? source.key.trim() : "cursor";
    } else if (tool === "antigravity" && sourceKind === "file" && requestedPath.toLowerCase().endsWith(".pb")) {
      source_type = "antigravity_gemini_pb";
      raw_jsonl = null;
      raw_markdown = null;

      parsed = {
        messages: [
          {
            role: "system",
            timestamp: null,
            text: "Antigravity conversation blobs (.pb) are not yet supported for parsing. This import stores a stub message only.",
            message_id: messageIdForIndex(0),
          },
        ],
        message_count: 1,
        warnings: [{ code: "unsupported_format", message: "Unsupported Antigravity .pb format; stored as stub message only." }],
      };
      for (const w of parsed.warnings || []) warnings.push(w);

      projectCwd = "antigravity://gemini";
      if (!projectName) projectName = "Antigravity";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = path.basename(requestedPath);
    } else if (tool === "antigravity" && sourceKind === "sqlite-kv") {
      parsed = parseGenericJson(text);
      source_type = "antigravity_sqlite_kv";
      for (const w of parsed.warnings || []) warnings.push(w);
      raw_jsonl = text;
      raw_markdown = null;

      projectCwd = "antigravity://globalStorage";
      if (!projectName) projectName = "Antigravity";
      if (!sessionName) sessionName = typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!sessionName) sessionName = typeof source.key === "string" ? source.key.trim() : "antigravity";
    } else if ((tool === "vscode-extension" || tool === "vscode") && sourceKind === "file") {
      source_type = "vscode_extension_file";
      if (format === "jsonl") parsed = parseGenericJsonl(text);
      else if (format === "json") parsed = parseGenericJson(text);
      else if (format === "chat-json") parsed = parseKiroChatJson(text);
      else {
        raw_markdown = text;
        parsed = {
          messages: [{ role: "user", timestamp: null, text: String(text || "").slice(0, 50_000), message_id: messageIdForIndex(0) }],
          message_count: 1,
          warnings: [{ code: "unsupported_format", message: `Unsupported format for vscode-extension: ${format || "unknown"}` }],
        };
      }
      for (const w of parsed.warnings || []) warnings.push(w);
      raw_jsonl = text;
    } else {
      return sendError(res, 400, "unsupported", "Unsupported transcript import type", { tool, format, path: requestedPath, sourceKind });
    }

    if (!projectName) projectName = "Imported Chat";
    if (!projectCwd) projectCwd = `file://${requestedPath}`;
    if (!sessionName) sessionName = path.basename(requestedPath);

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
          source_type,
        });
        bridgeDb.addSource({
          id: randomId("src"),
          session_id,
          exported_at: exportedAt,
          raw_jsonl,
          raw_markdown,
          normalized_json: JSON.stringify(parsed.messages || []),
          warnings_json: JSON.stringify(warnings),
          message_count: parsed.message_count || 0,
          created_at: now,
        });
      });
    } catch (err) {
      return sendError(res, 500, "db_error", "Failed to persist import into SQLite", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    res.json({ project_id, session_id, message_count: parsed.message_count || 0, warnings });
  });

  app.get("/bridge/v1/projects", (req, res) => {
    let limit = 200;
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit.trim() : "";
    if (limitRaw) {
      const parsed = Number(limitRaw);
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(500, Math.floor(parsed));
    }

    const rows = bridgeDb.listProjects({ limit });
    res.json({
      projects: rows.map((p) => ({
        project_id: p.id,
        name: p.name,
        cwd: p.cwd,
        created_at: p.created_at,
      })),
    });
  });

  app.get("/bridge/v1/projects/:project_id/sessions", (req, res) => {
    const projectId = String(req.params.project_id || "");
    if (!projectId) return sendError(res, 400, "invalid_request", "project_id must be provided");

    const projectRow = bridgeDb.getProjectById(projectId);
    if (!projectRow) return sendError(res, 404, "not_found", "Project not found", { project_id: projectId });

    let limit = 200;
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit.trim() : "";
    if (limitRaw) {
      const parsed = Number(limitRaw);
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(500, Math.floor(parsed));
    }

    const rows = bridgeDb.listSessionsByProjectId({ project_id: projectId, limit });
    res.json({
      sessions: rows.map((s) => ({
        session_id: s.id,
        project_id: s.project_id,
        name: s.name,
        imported_at: s.imported_at,
        source_type: s.source_type,
      })),
    });
  });

  app.get("/bridge/v1/sessions/recent", (req, res) => {
    let limit = 50;
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit.trim() : "";
    if (limitRaw) {
      const parsed = Number(limitRaw);
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(200, Math.floor(parsed));
    }

    const rows = bridgeDb.listRecentSessions({ limit });
    res.json({
      sessions: rows.map((r) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        project_cwd: r.project_cwd,
        session_id: r.session_id,
        session_name: r.session_name,
        imported_at: r.imported_at,
        source_type: r.source_type,
        message_count: Number.isFinite(r.message_count) ? r.message_count : 0,
      })),
    });
  });

  app.get("/bridge/v1/projects/:project_id/sessions/:session_id/messages", (req, res) => {
    const projectId = String(req.params.project_id || "");
    const sessionId = String(req.params.session_id || "");

    const projectRow = bridgeDb.getProjectById(projectId);
    if (!projectRow) return sendError(res, 404, "not_found", "Project not found", { project_id: projectId });

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

    res.json({ messages });
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
    const adapterRaw = typeof body.adapter === "string" ? body.adapter.trim().toLowerCase() : "";
    const httpRaw = body.http && typeof body.http === "object" ? body.http : null;

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

    const adapterType = adapterRaw || "filesystem";

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

    let adapter;
    let adapterMeta = {};

    if (adapterType === "filesystem") {
      const rootDir = (process.env[OPEN_NOTEBOOK_FS_ROOT_ENV] || "").trim();
      if (!rootDir) {
        return sendError(
          res,
          400,
          "invalid_request",
          `OpenNotebook filesystem root is not set. Please set ${OPEN_NOTEBOOK_FS_ROOT_ENV} to a writable directory.`,
        );
      }
      adapter = FilesystemAdapter.fromEnv(OPEN_NOTEBOOK_FS_ROOT_ENV);
      adapterMeta = { adapter: "filesystem", root_dir: rootDir };
    } else if (adapterType === "http") {
      const httpApiBaseUrl =
        (httpRaw && typeof httpRaw.api_base_url === "string" ? httpRaw.api_base_url.trim() : "") ||
        (httpRaw && typeof httpRaw.apiBaseUrl === "string" ? httpRaw.apiBaseUrl.trim() : "") ||
        (process.env.OPEN_NOTEBOOK_API_URL || "").trim();

      const httpToken =
        (httpRaw && typeof httpRaw.app_password === "string" ? httpRaw.app_password.trim() : "") ||
        (httpRaw && typeof httpRaw.token === "string" ? httpRaw.token.trim() : "") ||
        (process.env.OPEN_NOTEBOOK_APP_PASSWORD || "").trim();

      if (!httpApiBaseUrl) {
        return sendError(
          res,
          400,
          "invalid_request",
          "OpenNotebook HTTP API base URL is not set. Provide body.http.apiBaseUrl (or set OPEN_NOTEBOOK_API_URL).",
        );
      }

      adapter = new OpenNotebookHttpAdapter(httpApiBaseUrl, { appPassword: httpToken || null });
      adapterMeta = { adapter: "http", api_base_url: httpApiBaseUrl };
    } else {
      return sendError(res, 400, "invalid_request", "adapter must be one of: filesystem, http", { adapter: adapterType });
    }

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
            ...adapterMeta,
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
        return sendError(res, 500, "sync_failed", "Failed to sync to OpenNotebook adapter", {
          project_id: projectId,
          session_id: sessionId,
          adapter: adapterType,
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
