const childProcess = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const util = require("util");

const {
  DEFAULT_API_URL_ENV_VAR,
  DEFAULT_STATE_DIR_ENV_VAR,
  OpenNotebookHttpAdapter,
} = require("../src/adapters/http");

const execFile = util.promisify(childProcess.execFile);

function usage() {
  return [
    "用法：",
    "  node bridge/scripts/sync-codex-markdown-to-open-notebook.js <export1.md> [export2.md ...]",
    "",
    "必需环境变量：",
    `  ${DEFAULT_API_URL_ENV_VAR}=http://localhost:5055`,
    "",
    "可选环境变量：",
    "  OPEN_NOTEBOOK_APP_PASSWORD=<password>   # 如果 Open Notebook 设置了 APP_PASSWORD",
    `  ${DEFAULT_STATE_DIR_ENV_VAR}=<dir>        # 同步状态文件目录（用于幂等）`,
  ].join("\n");
}

function parseExportMarkdownMeta(markdown) {
  const meta = {};
  const lines = String(markdown || "").split(/\r?\n/);
  for (const line of lines.slice(0, 60)) {
    const m = line.match(/^\-\s*([^：:]+)[：:]\s*`([^`]*)`\s*$/);
    if (!m) continue;
    const key = String(m[1] || "").trim();
    const value = String(m[2] || "");
    meta[key] = value;
  }

  return {
    sourcePath: meta["源文件"] || null,
    sessionId: meta["sessionId"] || null,
    timestamp: meta["开始时间"] || null,
    cwd: meta["cwd"] || null,
    originator: meta["originator"] || null,
    cliVersion: meta["cli_version"] || null,
  };
}

async function resolveProjectFromCwd(cwd) {
  const trimmed = String(cwd || "").trim();
  if (!trimmed) return "Codex Inbox";

  try {
    const { stdout } = await execFile(
      "git",
      ["-C", trimmed, "rev-parse", "--show-toplevel"],
      { timeout: 5000 }
    );
    const top = String(stdout || "").trim();
    if (top) return top;
  } catch {}

  return trimmed;
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    console.error(usage());
    process.exit(2);
  }

  const adapter = OpenNotebookHttpAdapter.fromEnv();

  try {
    await adapter.healthCheck();
  } catch (error) {
    console.error("无法访问 Open Notebook，请先确认它已启动：");
    console.error(String(error && error.message ? error.message : error));
    process.exit(1);
  }

  for (const inputPath of args) {
    const filePath = path.resolve(process.cwd(), inputPath);
    const markdown = await fs.readFile(filePath, "utf8");
    const meta = parseExportMarkdownMeta(markdown);

    const project = await resolveProjectFromCwd(meta.cwd);
    const session =
      meta.sessionId || path.basename(filePath, path.extname(filePath));

    const notebookId = await adapter.createOrGetNotebook(project);
    const sourceId = await adapter.upsertSource(notebookId, session, markdown);

    console.log("Synced:");
    console.log(`- file: ${filePath}`);
    if (meta.cwd) console.log(`- cwd: ${meta.cwd}`);
    console.log(`- project: ${project}`);
    console.log(`- notebook_id: ${notebookId}`);
    console.log(`- session: ${session}`);
    console.log(`- source_id: ${sourceId}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error("Sync failed:");
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
});

