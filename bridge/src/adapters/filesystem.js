const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { OpenNotebookAdapter } = require("./adapter");

const DEFAULT_ENV_VAR = "OPEN_NOTEBOOK_FS_ROOT";

function assertNonEmpty(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required and must be a non-empty string.`);
  }
}

function formatFsError(error, context) {
  const { action, targetPath, envVar, rootDir } = context;
  const code = error && error.code ? error.code : "UNKNOWN";
  const base = `${action} failed (${code}): ${targetPath}. ${error.message}`;

  const hints = [];
  if (code === "EACCES" || code === "EPERM") {
    hints.push(
      `Permission denied. Set ${envVar} to a writable directory (e.g. /tmp/open-notebook or $HOME/open-notebook).`,
    );
  }
  if (code === "ENOENT") {
    hints.push(
      `Path not found. Ensure ${envVar} points to an existing/writable directory: ${rootDir}`,
    );
  }

  return hints.length ? `${base}\nHints:\n- ${hints.join("\n- ")}` : base;
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

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function assertDirectoryExists(dirPath, label) {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${label} is not a directory: ${dirPath}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${dirPath}`);
    }
    throw error;
  }
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

class FilesystemAdapter extends OpenNotebookAdapter {
  constructor(rootDir, options = {}) {
    super();
    assertNonEmpty(rootDir, "rootDir");
    this.rootDir = rootDir;
    this.notebooksDir = path.join(rootDir, "notebooks");
    this.mapPath = path.join(rootDir, "notebook-map.json");
    this.envVar = options.envVar || DEFAULT_ENV_VAR;
  }

  static fromEnv(envVar = DEFAULT_ENV_VAR) {
    const rootDir = (process.env[envVar] || "").trim();
    if (!rootDir) {
      throw new Error(
        `${envVar} is not set. Example: ${envVar}=/tmp/open-notebook`,
      );
    }
    return new FilesystemAdapter(rootDir, { envVar });
  }

  async createOrGetNotebook(project) {
    assertNonEmpty(project, "project");
    try {
      await ensureDir(this.rootDir);
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Create notebook root directory",
          targetPath: this.rootDir,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }

    try {
      await ensureDir(this.notebooksDir);
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Create notebooks directory",
          targetPath: this.notebooksDir,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }

    const map = await this.#loadNotebookMap();
    let notebookId = map.projects[project];
    let mapUpdated = false;
    if (!notebookId) {
      notebookId = stableId("nb", project);
      map.projects[project] = notebookId;
      mapUpdated = true;
    }

    if (mapUpdated) {
      await this.#writeNotebookMap(map);
    }

    const notebookDir = path.join(this.notebooksDir, notebookId);
    const sourcesDir = path.join(notebookDir, "sources");
    const notesDir = path.join(notebookDir, "notes");

    try {
      await ensureDir(sourcesDir);
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Create sources directory",
          targetPath: sourcesDir,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }

    try {
      await ensureDir(notesDir);
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Create notes directory",
          targetPath: notesDir,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }

    const metaPath = path.join(notebookDir, "notebook.json");
    await this.#ensureNotebookMeta(metaPath, notebookId, project);

    return notebookId;
  }

  async upsertSource(notebookId, session, content) {
    assertNonEmpty(notebookId, "notebookId");
    assertNonEmpty(session, "session");
    assertNonEmpty(content, "content");

    const notebookDir = path.join(this.notebooksDir, notebookId);
    await assertDirectoryExists(notebookDir, "Notebook directory");

    const sourceId = stableId("src", session);
    const sourcePath = path.join(notebookDir, "sources", `${sourceId}.md`);
    const frontMatter = renderFrontMatter({
      notebook_id: notebookId,
      session,
    });
    try {
      await fs.writeFile(sourcePath, `${frontMatter}${content}\n`, "utf8");
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Write source",
          targetPath: sourcePath,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }
    return sourceId;
  }

  async upsertNote(notebookId, kind, content, links = []) {
    assertNonEmpty(notebookId, "notebookId");
    assertNonEmpty(kind, "kind");
    assertNonEmpty(content, "content");
    if (!Array.isArray(links)) {
      throw new Error("links must be an array of strings.");
    }

    const notebookDir = path.join(this.notebooksDir, notebookId);
    await assertDirectoryExists(notebookDir, "Notebook directory");

    const noteId = stableId("note", kind);
    const notePath = path.join(notebookDir, "notes", `${noteId}.md`);
    const frontMatter = renderFrontMatter({
      notebook_id: notebookId,
      kind,
      links,
    });
    try {
      await fs.writeFile(notePath, `${frontMatter}${content}\n`, "utf8");
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Write note",
          targetPath: notePath,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }
    return noteId;
  }

  async #loadNotebookMap() {
    let map = { version: 1, projects: {} };
    try {
      const raw = await fs.readFile(this.mapPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        map = {
          version: parsed.version || 1,
          projects:
            parsed.projects && typeof parsed.projects === "object"
              ? parsed.projects
              : {},
        };
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(
          `Failed to read notebook map: ${this.mapPath}. ${error.message}`,
        );
      }
    }
    return map;
  }

  async #writeNotebookMap(map) {
    try {
      await fs.writeFile(this.mapPath, JSON.stringify(map, null, 2), "utf8");
    } catch (error) {
      throw new Error(
        formatFsError(error, {
          action: "Write notebook map",
          targetPath: this.mapPath,
          envVar: this.envVar,
          rootDir: this.rootDir,
        }),
      );
    }
  }

  async #ensureNotebookMeta(metaPath, notebookId, project) {
    let meta = null;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(
          `Failed to read notebook metadata: ${metaPath}. ${error.message}`,
        );
      }
    }

    if (!meta) {
      meta = {
        id: notebookId,
        project,
        created_at: new Date().toISOString(),
      };
      try {
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
      } catch (error) {
        throw new Error(
          formatFsError(error, {
            action: "Write notebook metadata",
            targetPath: metaPath,
            envVar: this.envVar,
            rootDir: this.rootDir,
          }),
        );
      }
      return;
    }

    if (meta.project && meta.project !== project) {
      throw new Error(
        `Notebook metadata mismatch at ${metaPath}: expected project "${project}".`,
      );
    }
  }
}

module.exports = { DEFAULT_ENV_VAR, FilesystemAdapter };
