const path = require("path");

const {
  DEFAULT_ENV_VAR,
  FilesystemAdapter,
} = require("../src/adapters/filesystem");

async function main() {
  const rootDir = (process.env[DEFAULT_ENV_VAR] || "").trim();
  if (!rootDir) {
    throw new Error(
      [
        `${DEFAULT_ENV_VAR} 未设置。请先设置到一个可写目录。`,
        "",
        "示例（bash/zsh）：",
        `  export ${DEFAULT_ENV_VAR}=/tmp/open-notebook-sync-demo`,
        "",
        "示例（PowerShell）：",
        `  $env:${DEFAULT_ENV_VAR} = \"C:\\\\temp\\\\open-notebook-sync-demo\"`,
      ].join("\n")
    );
  }

  const adapter = FilesystemAdapter.fromEnv();
  const project = "OpenNotebook Demo Project";
  const notebookId = await adapter.createOrGetNotebook(project);

  const session = "demo-session-001";
  const sourceContent = [
    "# Demo Session",
    "",
    "m-000001 system: You are a helpful assistant.",
    "m-000002 user: Summarize the spec.",
    "m-000003 assistant: The spec defines an adapter with three methods.",
  ].join("\n");
  const sourceId = await adapter.upsertSource(
    notebookId,
    session,
    sourceContent
  );

  const summaryContent = [
    "# Summary",
    "",
    "- Goal: sync sources and notes into OpenNotebook.",
    "- Adapter: createOrGetNotebook, upsertSource, upsertNote.",
    "- MVP: filesystem adapter with idempotent writes.",
  ].join("\n");
  const summaryId = await adapter.upsertNote(notebookId, "summary", summaryContent, [
    "m-000002",
    "m-000003",
  ]);

  const studyPackContent = [
    "# Study Pack",
    "",
    "1) Define a stable mapping for project -> notebook.",
    "2) Upsert sources per session id.",
    "3) Upsert notes per kind.",
  ].join("\n");
  const studyPackId = await adapter.upsertNote(
    notebookId,
    "study-pack",
    studyPackContent,
    ["m-000003"]
  );

  const notebookIdAgain = await adapter.createOrGetNotebook(project);

  console.log("OpenNotebook filesystem demo");
  console.log(`Root: ${rootDir}`);
  console.log(`Notebook: ${notebookId}`);
  console.log(`Notebook (repeat): ${notebookIdAgain}`);
  console.log(`Source: ${sourceId}`);
  console.log(`Notes: ${summaryId}, ${studyPackId}`);
  console.log(`Notebook directory: ${path.join(rootDir, "notebooks", notebookId)}`);
}

main().catch((error) => {
  console.error("Demo failed:", error.message);
  if (error.cause) {
    console.error("Cause:", error.cause.message);
  }
  process.exit(1);
});
