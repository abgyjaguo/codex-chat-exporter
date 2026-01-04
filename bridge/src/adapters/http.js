const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const { OpenNotebookAdapter } = require("./adapter");
const { redactForOpenNotebookMarkdown } = require("../lib/redact");

const DEFAULT_API_URL_ENV_VAR = "OPEN_NOTEBOOK_API_URL";
const DEFAULT_APP_PASSWORD_ENV_VAR = "OPEN_NOTEBOOK_APP_PASSWORD";
const DEFAULT_STATE_DIR_ENV_VAR = "OPEN_NOTEBOOK_SYNC_STATE_DIR";
const DEFAULT_EMBED_ENV_VAR = "OPEN_NOTEBOOK_EMBED";
const DEFAULT_ASYNC_ENV_VAR = "OPEN_NOTEBOOK_ASYNC_PROCESSING";

const DEFAULT_STATE_FILE = "open-notebook-sync-state.json";
const DEFAULT_TIMEOUT_MS = 30_000;

function assertNonEmpty(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required and must be a non-empty string.`);
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function toSlug(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function stableId(prefix, value) {
  const hash = crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 12);
  const slug = toSlug(value).slice(0, 32);
  return `${prefix}-${slug}-${hash}`;
}

function shorten(value, maxLen = 60) {
  const text = String(value).replace(/[\r\n]+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function normalizeApiBaseUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `http://${value}`;
  }

  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname === "/api" ? "" : pathname;
  url.search = "";
  url.hash = "";

  const base = `${url.origin}${url.pathname}`;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

class OpenNotebookApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "OpenNotebookApiError";
    this.status = options.status ?? null;
    this.method = options.method ?? null;
    this.url = options.url ?? null;
    this.bodyText = options.bodyText ?? null;
    this.bodyJson = options.bodyJson ?? null;
    this.cause = options.cause;
  }
}

function buildHelpfulHttpError(error, envVars) {
  const apiUrlEnvVar = envVars.apiUrlEnvVar || DEFAULT_API_URL_ENV_VAR;
  const appPasswordEnvVar = envVars.appPasswordEnvVar || DEFAULT_APP_PASSWORD_ENV_VAR;

  if (error instanceof OpenNotebookApiError) {
    if (error.status === 401) {
      error.message = [
        `${error.message}`,
        "Hints:",
        `- Open Notebook 启用了 APP_PASSWORD：请设置 ${appPasswordEnvVar} 并重试。`,
        `- 或者确认你的 ${apiUrlEnvVar} 指向正确的实例。`,
      ].join("\n");
      return error;
    }
    if (error.status === 404) {
      error.message = [
        `${error.message}`,
        "Hints:",
        `- 确认 ${apiUrlEnvVar} 不要包含 /api（例如 http://localhost:5055）。`,
        "- 确认 Open Notebook 后端已启动并暴露 5055 端口。",
      ].join("\n");
      return error;
    }
    return error;
  }

  const code = error && error.code ? error.code : null;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new Error(
        [
          `无法连接 Open Notebook API：${error.message}`,
          "Hints:",
          `- 确认 Open Notebook 已部署并可访问（例如浏览器打开 ${normalizeApiBaseUrl(process.env[apiUrlEnvVar] || "http://localhost:5055")}/health）。`,
          `- 检查 ${apiUrlEnvVar} 是否正确。`,
      ].join("\n")
    );
  }

  return error;
}

async function request({ method, url, headers, body, timeoutMs }) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  const bodyText = body == null ? null : String(body);

  return await new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        headers: {
          ...(headers || {}),
          ...(bodyText
            ? {
                "Content-Length": Buffer.byteLength(bodyText, "utf8"),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            text,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.setTimeout(timeoutMs);
    req.on("error", reject);

    if (bodyText) req.write(bodyText);
    req.end();
  });
}

function yamlValue(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function renderFrontMatter(meta) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${yamlValue(item)}`);
      }
      continue;
    }
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function notebookNameForProject(project) {
  const notebookKey = stableId("nb", project);
  return `Codex: ${shorten(project, 48)} [${notebookKey}]`;
}

function sourceTitleForSession(session) {
  const sessionKey = stableId("src", session);
  return `Codex Session: ${shorten(session, 48)} [${sessionKey}]`;
}

function noteTitleForKind(kind) {
  const noteKey = stableId("note", kind);
  return `Codex Note: ${shorten(kind, 48)} [${noteKey}]`;
}

function defaultStateDir() {
  return path.join(os.homedir(), ".codex", "open-notebook-sync");
}

class OpenNotebookHttpAdapter extends OpenNotebookAdapter {
  constructor(apiBaseUrl, options = {}) {
    super();
    assertNonEmpty(apiBaseUrl, "apiBaseUrl");

    const normalized = normalizeApiBaseUrl(apiBaseUrl);
    if (!normalized) {
      throw new Error("apiBaseUrl is invalid.");
    }

    this.apiBaseUrl = normalized;
    this.timeoutMs =
      typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.appPassword =
      typeof options.appPassword === "string" && options.appPassword.trim()
        ? options.appPassword.trim()
        : null;
    this.userAgent =
      typeof options.userAgent === "string" && options.userAgent.trim()
        ? options.userAgent.trim()
        : "cce-wt-open-notebook-sync/bridge";

    this.embedByDefault =
      typeof options.embedByDefault === "boolean" ? options.embedByDefault : false;
    this.asyncProcessingByDefault =
      typeof options.asyncProcessingByDefault === "boolean"
        ? options.asyncProcessingByDefault
        : false;

    this.stateDir =
      typeof options.stateDir === "string" && options.stateDir.trim()
        ? options.stateDir.trim()
        : defaultStateDir();
    this.statePath = path.join(this.stateDir, DEFAULT_STATE_FILE);

    this.apiUrlEnvVar = options.apiUrlEnvVar || DEFAULT_API_URL_ENV_VAR;
    this.appPasswordEnvVar = options.appPasswordEnvVar || DEFAULT_APP_PASSWORD_ENV_VAR;
    this.stateDirEnvVar = options.stateDirEnvVar || DEFAULT_STATE_DIR_ENV_VAR;

    this.#state = null;
  }

  static fromEnv() {
    const apiUrl = (process.env[DEFAULT_API_URL_ENV_VAR] || "").trim();
    if (!apiUrl) {
      throw new Error(
        `${DEFAULT_API_URL_ENV_VAR} 未设置。示例：${DEFAULT_API_URL_ENV_VAR}=http://localhost:5055`
      );
    }

    const stateDir = (process.env[DEFAULT_STATE_DIR_ENV_VAR] || "").trim();

    return new OpenNotebookHttpAdapter(apiUrl, {
      appPassword: process.env[DEFAULT_APP_PASSWORD_ENV_VAR],
      stateDir: stateDir || defaultStateDir(),
      apiUrlEnvVar: DEFAULT_API_URL_ENV_VAR,
      appPasswordEnvVar: DEFAULT_APP_PASSWORD_ENV_VAR,
      stateDirEnvVar: DEFAULT_STATE_DIR_ENV_VAR,
      embedByDefault: parseBoolean(process.env[DEFAULT_EMBED_ENV_VAR], false),
      asyncProcessingByDefault: parseBoolean(process.env[DEFAULT_ASYNC_ENV_VAR], false),
    });
  }

  async healthCheck() {
    const url = this.#buildUrl("health");
    const res = await request({
      method: "GET",
      url,
      headers: this.#headers({ contentType: null }),
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new OpenNotebookApiError(
        `GET ${url} failed with status ${res.status}`,
        { status: res.status, method: "GET", url, bodyText: res.text }
      );
    }
    return res.text;
  }

  async createOrGetNotebook(project) {
    assertNonEmpty(project, "project");

    const notebookKey = stableId("nb", project);
    const notebookName = notebookNameForProject(project);
    const description = [
      "Synced from Codex Chat Exporter (Bridge).",
      `project: ${project}`,
      `external_key: ${notebookKey}`,
    ].join("\n");

    const state = await this.#loadState();
    const cached = state.notebooks?.[notebookKey];
    if (cached && cached.id) {
      const existing = await this.#getNotebookSafe(cached.id);
      if (existing) return cached.id;
      delete state.notebooks[notebookKey];
      await this.#writeState(state);
    }

    const notebooks = await this.#listNotebooks();
    const matches = notebooks.filter((n) => n && n.name === notebookName);
    if (matches.length > 1) {
      throw new Error(
        `Open Notebook 中存在多个同名 notebook：${notebookName}（请手动清理重复项）`
      );
    }
    if (matches.length === 1) {
      const id = matches[0].id;
      state.notebooks[notebookKey] = {
        id,
        name: notebookName,
        project,
        updated_at: new Date().toISOString(),
      };
      await this.#writeState(state);
      return id;
    }

    const created = await this.#createNotebook(notebookName, description);
    const id = created.id;
    state.notebooks[notebookKey] = {
      id,
      name: notebookName,
      project,
      created_at: new Date().toISOString(),
    };
    await this.#writeState(state);
    return id;
  }

  async upsertSource(notebookId, session, content) {
    assertNonEmpty(notebookId, "notebookId");
    assertNonEmpty(session, "session");
    assertNonEmpty(content, "content");

    const sanitizedContent = redactForOpenNotebookMarkdown(content);

    const sessionKey = stableId("src", session);
    const title = sourceTitleForSession(session);
    const contentHash = sha256Hex(sanitizedContent);

    const state = await this.#loadState();
    state.sources[notebookId] = state.sources[notebookId] || {};
    const existingRecord = state.sources[notebookId][sessionKey] || null;

    if (
      existingRecord &&
      existingRecord.id &&
      existingRecord.content_sha256 === contentHash
    ) {
      return existingRecord.id;
    }

    const idsToDelete = new Set();
    if (existingRecord && existingRecord.id) idsToDelete.add(existingRecord.id);

    const remoteMatches = await this.#findSourcesByTitle(notebookId, title);
    for (const s of remoteMatches) idsToDelete.add(s.id);

    for (const id of idsToDelete) {
      await this.#deleteSourceSafe(id);
    }

    const created = await this.#createTextSource({
      notebookId,
      title,
      content: sanitizedContent,
      embed: this.embedByDefault,
      asyncProcessing: this.asyncProcessingByDefault,
    });

    state.sources[notebookId][sessionKey] = {
      id: created.id,
      title,
      session,
      content_sha256: contentHash,
      updated_at: new Date().toISOString(),
    };
    await this.#writeState(state);

    return created.id;
  }

  async upsertNote(notebookId, kind, content, links = []) {
    assertNonEmpty(notebookId, "notebookId");
    assertNonEmpty(kind, "kind");
    assertNonEmpty(content, "content");
    if (!Array.isArray(links)) {
      throw new Error("links must be an array of strings.");
    }

    const sanitizedContent = redactForOpenNotebookMarkdown(content);

    const noteKey = stableId("note", kind);
    const title = noteTitleForKind(kind);
    const body = `${renderFrontMatter({
      notebook_id: notebookId,
      kind,
      links,
    })}${sanitizedContent}\n`;
    const contentHash = sha256Hex(body);

    const state = await this.#loadState();
    state.notes[notebookId] = state.notes[notebookId] || {};
    const existingRecord = state.notes[notebookId][noteKey] || null;

    if (
      existingRecord &&
      existingRecord.id &&
      existingRecord.content_sha256 === contentHash
    ) {
      return existingRecord.id;
    }

    let noteId = existingRecord && existingRecord.id ? existingRecord.id : null;
    if (noteId) {
      const exists = await this.#getNoteSafe(noteId);
      if (!exists) noteId = null;
    }

    if (!noteId) {
      const match = await this.#findOrCleanupNotesByTitle(notebookId, title);
      noteId = match ? match.id : null;
    }

    if (noteId) {
      const updated = await this.#updateNote(noteId, {
        title,
        content: body,
        note_type: "ai",
      });
      state.notes[notebookId][noteKey] = {
        id: updated.id,
        title,
        kind,
        content_sha256: contentHash,
        updated_at: new Date().toISOString(),
      };
      await this.#writeState(state);
      return updated.id;
    }

    const created = await this.#createNote({
      notebookId,
      title,
      content: body,
      note_type: "ai",
    });

    state.notes[notebookId][noteKey] = {
      id: created.id,
      title,
      kind,
      content_sha256: contentHash,
      created_at: new Date().toISOString(),
    };
    await this.#writeState(state);

    return created.id;
  }

  async #ensureStateDir() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
    } catch (error) {
      const message = [
        `无法创建同步状态目录：${this.stateDir}`,
        `请设置 ${this.stateDirEnvVar} 到一个可写目录，或修复目录权限。`,
        `原始错误：${error.message}`,
      ].join("\n");
      throw new Error(message);
    }
  }

  async #loadState() {
    if (this.#state) return this.#state;

    await this.#ensureStateDir();

    const initial = { version: 1, notebooks: {}, sources: {}, notes: {} };
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.#state = {
          version: parsed.version || 1,
          notebooks: parsed.notebooks && typeof parsed.notebooks === "object" ? parsed.notebooks : {},
          sources: parsed.sources && typeof parsed.sources === "object" ? parsed.sources : {},
          notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
        };
        return this.#state;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`读取同步状态失败：${this.statePath}. ${error.message}`);
      }
    }

    this.#state = initial;
    await this.#writeState(initial);
    return this.#state;
  }

  async #writeState(state) {
    await this.#ensureStateDir();
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), "utf8");
    this.#state = state;
  }

  #headers({ contentType = "application/json" } = {}) {
    const headers = {
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (contentType) headers["Content-Type"] = contentType;
    if (this.appPassword) headers.Authorization = `Bearer ${this.appPassword}`;
    return headers;
  }

  #buildUrl(pathname, query = null) {
    const base = this.apiBaseUrl.endsWith("/") ? this.apiBaseUrl : `${this.apiBaseUrl}/`;
    const url = new URL(pathname.replace(/^\//, ""), base);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async #requestJson(method, pathname, body = null, query = null) {
    const url = this.#buildUrl(pathname, query);
    const rawBody = body == null ? null : JSON.stringify(body);

    let response;
    try {
      response = await request({
        method,
        url,
        headers: this.#headers({ contentType: rawBody ? "application/json" : null }),
        body: rawBody,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      throw buildHelpfulHttpError(error, {
        apiUrlEnvVar: this.apiUrlEnvVar,
        appPasswordEnvVar: this.appPasswordEnvVar,
      });
    }

    let json = null;
    try {
      json = response.text ? JSON.parse(response.text) : null;
    } catch {}

    if (response.status < 200 || response.status >= 300) {
      const detail =
        (json && typeof json === "object" && json.detail) ||
        response.text ||
        `HTTP ${response.status}`;
      throw buildHelpfulHttpError(
        new OpenNotebookApiError(`${method} ${url} failed: ${detail}`, {
          status: response.status,
          method,
          url,
          bodyText: response.text,
          bodyJson: json,
        }),
        {
          apiUrlEnvVar: this.apiUrlEnvVar,
          appPasswordEnvVar: this.appPasswordEnvVar,
        }
      );
    }

    return json;
  }

  async #listNotebooks() {
    return await this.#requestJson("GET", "api/notebooks");
  }

  async #createNotebook(name, description) {
    return await this.#requestJson("POST", "api/notebooks", { name, description });
  }

  async #getNotebookSafe(notebookId) {
    try {
      return await this.#requestJson("GET", `api/notebooks/${encodeURIComponent(notebookId)}`);
    } catch (error) {
      if (error instanceof OpenNotebookApiError && error.status === 404) return null;
      throw error;
    }
  }

  async #listSources(notebookId, limit, offset) {
    return await this.#requestJson("GET", "api/sources", null, {
      notebook_id: notebookId,
      limit,
      offset,
    });
  }

  async #findSourcesByTitle(notebookId, title) {
    const matches = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await this.#listSources(notebookId, limit, offset);
      if (!Array.isArray(page) || page.length === 0) break;
      for (const s of page) {
        if (s && s.title === title && s.id) matches.push(s);
      }
      if (page.length < limit) break;
      offset += limit;
    }
    return matches;
  }

  async #deleteSourceSafe(sourceId) {
    try {
      await this.#requestJson("DELETE", `api/sources/${encodeURIComponent(sourceId)}`);
    } catch (error) {
      if (error instanceof OpenNotebookApiError && error.status === 404) return;
      throw error;
    }
  }

  async #createTextSource({ notebookId, title, content, embed, asyncProcessing }) {
    return await this.#requestJson("POST", "api/sources/json", {
      notebook_id: notebookId,
      type: "text",
      title,
      content,
      embed: !!embed,
      async_processing: !!asyncProcessing,
      delete_source: false,
      transformations: [],
    });
  }

  async #listNotes(notebookId) {
    return await this.#requestJson("GET", "api/notes", null, { notebook_id: notebookId });
  }

  async #getNoteSafe(noteId) {
    try {
      return await this.#requestJson("GET", `api/notes/${encodeURIComponent(noteId)}`);
    } catch (error) {
      if (error instanceof OpenNotebookApiError && error.status === 404) return null;
      throw error;
    }
  }

  async #deleteNoteSafe(noteId) {
    try {
      await this.#requestJson("DELETE", `api/notes/${encodeURIComponent(noteId)}`);
    } catch (error) {
      if (error instanceof OpenNotebookApiError && error.status === 404) return;
      throw error;
    }
  }

  async #findOrCleanupNotesByTitle(notebookId, title) {
    const notes = await this.#listNotes(notebookId);
    if (!Array.isArray(notes) || notes.length === 0) return null;

    const matches = notes.filter((n) => n && n.title === title && n.id);
    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const ta = Date.parse(a.updated || "") || 0;
      const tb = Date.parse(b.updated || "") || 0;
      return tb - ta;
    });

    const keep = matches[0];
    for (const extra of matches.slice(1)) {
      await this.#deleteNoteSafe(extra.id);
    }
    return keep;
  }

  async #createNote({ notebookId, title, content, note_type }) {
    return await this.#requestJson("POST", "api/notes", {
      notebook_id: notebookId,
      title,
      content,
      note_type,
    });
  }

  async #updateNote(noteId, update) {
    return await this.#requestJson(
      "PUT",
      `api/notes/${encodeURIComponent(noteId)}`,
      update
    );
  }

  #state;
}

module.exports = {
  DEFAULT_API_URL_ENV_VAR,
  DEFAULT_APP_PASSWORD_ENV_VAR,
  DEFAULT_STATE_DIR_ENV_VAR,
  OpenNotebookHttpAdapter,
};
