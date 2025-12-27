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
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory: ${dirPath}. ${error.message}`);
  }
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
    this.envVar = options.envVar || DEFAULT_ENV_VAR;
  }

  static fromEnv(envVar = DEFAULT_ENV_VAR) {
    const rootDir = process.env[envVar];
    if (!rootDir) {
      throw new Error(
        `${envVar} is not set. Please set it to the OpenNotebook filesystem root.`
      );
    }
    return new FilesystemAdapter(rootDir, { envVar });
  }

  async createOrGetNotebook(project) {
    assertNonEmpty(project, "project");
    const notebookId = stableId("nb", project);
    const notebookDir = path.join(this.notebooksDir, notebookId);
    const sourcesDir = path.join(notebookDir, "sources");
    const notesDir = path.join(notebookDir, "notes");

    await ensureDir(sourcesDir);
    await ensureDir(notesDir);

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
    const sourcePath = path.join(
      notebookDir,
      "sources",
      `${sourceId}.md`
    );
    const frontMatter = renderFrontMatter({
      notebook_id: notebookId,
      session,
    });
    await fs.writeFile(sourcePath, `${frontMatter}${content}\n`, "utf8");
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
    await fs.writeFile(notePath, `${frontMatter}${content}\n`, "utf8");
    return noteId;
  }

  async #ensureNotebookMeta(metaPath, notebookId, project) {
    let meta = null;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(
          `Failed to read notebook metadata: ${metaPath}. ${error.message}`
        );
      }
    }

    if (!meta) {
      meta = {
        id: notebookId,
        project,
        created_at: new Date().toISOString(),
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
      return;
    }

    if (meta.project && meta.project !== project) {
      throw new Error(
        `Notebook metadata mismatch at ${metaPath}: expected project "${project}".`
      );
    }
  }
}

module.exports = { DEFAULT_ENV_VAR, FilesystemAdapter };
