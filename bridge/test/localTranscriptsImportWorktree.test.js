const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createBridgeApp } = require("../src/app");

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function writeJsonl(filePath, objs) {
  fs.writeFileSync(filePath, `${objs.map((o) => JSON.stringify(o)).join("\n")}\n`, "utf8");
}

test("local-transcripts/import groups worktree sessions under repo_root and prefixes session_name", async () => {
  const tmpDir = mkdtemp("bridge-local-import-worktree-");
  const dbPath = path.join(tmpDir, "bridge.db");
  const exportsDir = path.join(tmpDir, "exports");

  const sessionsDir = path.join(tmpDir, ".codex", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });

  const transcriptPath = path.join(sessionsDir, "worktree.jsonl");

  const repoRoot = "C:\\\\Users\\\\Alice\\\\vibe-kanban";
  const cwd = "C:\\\\Users\\\\Alice\\\\vibe-kanban\\\\worktrees\\\\wt-feature";

  writeJsonl(transcriptPath, [
    {
      type: "session_meta",
      payload: {
        id: "sess-wt-1",
        cwd,
        originator: "codex_vscode",
        source: "vscode",
      },
    },
  ]);

  const prevUserProfile = process.env.USERPROFILE;
  const prevHome = process.env.HOME;
  process.env.USERPROFILE = tmpDir;
  process.env.HOME = tmpDir;

  const { app, bridgeDb } = createBridgeApp({ dbPath, exportsDir });
  try {
    await withServer(app, async (baseUrl) => {
      const importRes = await fetch(`${baseUrl}/bridge/v1/local-transcripts/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: {
            tool: "codex",
            projectName: "vibe-kanban",
            title: "worktree.jsonl",
            source: { kind: "file", path: transcriptPath, format: "jsonl" },
            meta: { repo_root: repoRoot, worktree: true, worktree_name: "wt-feature" },
          },
          include_tool_outputs: true,
          include_environment_context: true,
        }),
      });

      assert.equal(importRes.status, 200);
      const importJson = await importRes.json();
      assert.ok(importJson.project_id);
      assert.ok(importJson.session_id);

      const recentRes = await fetch(`${baseUrl}/bridge/v1/sessions/recent?limit=10`);
      assert.equal(recentRes.status, 200);
      const recentJson = await recentRes.json();
      const match = (recentJson.sessions || []).find((s) => s.session_id === importJson.session_id);
      assert.ok(match);
      assert.equal(match.project_cwd, repoRoot);
      assert.equal(match.project_name, "vibe-kanban");
      assert.ok(String(match.session_name).startsWith("worktree/wt-feature/"));
    });
  } finally {
    try {
      if (bridgeDb && typeof bridgeDb.close === "function") bridgeDb.close();
    } catch {}
    process.env.USERPROFILE = prevUserProfile;
    process.env.HOME = prevHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

