const path = require("path");

const {
  DEFAULT_API_URL_ENV_VAR,
  DEFAULT_STATE_DIR_ENV_VAR,
  OpenNotebookHttpAdapter,
} = require("../src/adapters/http");

async function main() {
  const apiUrl = (process.env[DEFAULT_API_URL_ENV_VAR] || "").trim();
  if (!apiUrl) {
    throw new Error(
      [
        `${DEFAULT_API_URL_ENV_VAR} 未设置。`,
        "",
        "示例（bash/zsh）：",
        `  export ${DEFAULT_API_URL_ENV_VAR}=http://localhost:5055`,
        "",
        "可选：如果 Open Notebook 设置了 APP_PASSWORD：",
        "  export OPEN_NOTEBOOK_APP_PASSWORD=your_password",
        "",
        `可选：设置本地幂等状态目录（默认 ~/.codex/open-notebook-sync）：`,
        `  export ${DEFAULT_STATE_DIR_ENV_VAR}=$HOME/.codex/open-notebook-sync`,
      ].join("\n")
    );
  }

  const adapter = OpenNotebookHttpAdapter.fromEnv();
  await adapter.healthCheck();

  const project = "Codex Demo Workspace";
  const session = "demo-session-001";

  const sourceContent = [
    "# Codex Demo Export",
    "",
    "## 用户",
    "请总结一下 adapter 需要做什么。",
    "",
    "## Codex",
    "adapter 需要：创建/获取 notebook，幂等写入 sources 和 notes。",
  ].join("\n");

  const summary = [
    "# Summary",
    "",
    "- Notebook: 按 project 归档（MVP）。",
    "- Source: 按 session 幂等 upsert。",
    "- Note: 按 kind 幂等 upsert。",
  ].join("\n");

  const notebookId1 = await adapter.createOrGetNotebook(project);
  const sourceId1 = await adapter.upsertSource(notebookId1, session, sourceContent);
  const noteId1 = await adapter.upsertNote(notebookId1, "summary", summary, [
    "m-000001",
  ]);

  const notebookId2 = await adapter.createOrGetNotebook(project);
  const sourceId2 = await adapter.upsertSource(notebookId2, session, sourceContent);
  const noteId2 = await adapter.upsertNote(notebookId2, "summary", summary, [
    "m-000001",
  ]);

  console.log("Open Notebook HTTP demo (idempotent)");
  console.log(`API: ${apiUrl}`);
  console.log(`State file: ${adapter.statePath}`);
  console.log(`Notebook #1: ${notebookId1}`);
  console.log(`Notebook #2: ${notebookId2}`);
  console.log(`Source #1: ${sourceId1}`);
  console.log(`Source #2: ${sourceId2}`);
  console.log(`Note #1: ${noteId1}`);
  console.log(`Note #2: ${noteId2}`);
  console.log("");
  console.log(`Notebook imported under project: ${project}`);
  console.log(`Source title derived from session: ${session}`);
  console.log(`Note kind: summary`);
  let uiUrl = "http://localhost:8502";
  try {
    const u = new URL(apiUrl);
    u.port = "8502";
    u.pathname = "";
    u.search = "";
    u.hash = "";
    uiUrl = u.toString().replace(/\/$/, "");
  } catch {}
  console.log(`You can verify in UI: ${uiUrl}`);
  console.log(`API docs: ${apiUrl.replace(/\/+$/, "")}/docs`);
  console.log(`(Demo does not open browser; please check manually.)`);

  console.log("");
  console.log(
    `Tip: If you exported Markdown from this extension, use: node ${path.join(
      "bridge",
      "scripts",
      "sync-codex-markdown-to-open-notebook.js"
    )} <export.md>`
  );
}

main().catch((error) => {
  console.error("Demo failed:");
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
});
