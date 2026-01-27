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

async function postJson(baseUrl, pathname, payload) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { res, json };
}

test("bridge JSON APIs list projects/sessions and fetch messages", async () => {
  const tmpDir = mkdtemp("bridge-json-api-");
  const dbPath = path.join(tmpDir, "bridge.db");
  const exportsDir = path.join(tmpDir, "exports");

  const { app, bridgeDb } = createBridgeApp({ dbPath, exportsDir });

  try {
    await withServer(app, async (baseUrl) => {
      const payload = {
        project: { name: "demo", cwd: "/tmp/demo" },
        session: { name: "session-1" },
        exported_at: "2026-01-01T00:00:00.000Z",
        codex: {
          jsonl_text:
            '{"type":"event_msg","timestamp":"2026-01-01T00:00:00.000Z","payload":{"type":"user_message","message":"hi"}}\n' +
            '{"type":"event_msg","timestamp":"2026-01-01T00:00:01.000Z","payload":{"type":"agent_message","message":"hello"}}\n',
        },
      };

      const { res: importRes, json: importJson } = await postJson(baseUrl, "/bridge/v1/import/codex-chat", payload);
      assert.equal(importRes.status, 200);
      assert.ok(importJson.project_id);
      assert.ok(importJson.session_id);

      const projectsRes = await fetch(`${baseUrl}/bridge/v1/projects`);
      assert.equal(projectsRes.status, 200);
      assert.equal(projectsRes.headers.get("access-control-allow-origin"), "*");
      const projectsJson = await projectsRes.json();
      assert.ok(Array.isArray(projectsJson.projects));

      const sessionsRes = await fetch(`${baseUrl}/bridge/v1/projects/${importJson.project_id}/sessions`);
      assert.equal(sessionsRes.status, 200);
      const sessionsJson = await sessionsRes.json();
      assert.ok(Array.isArray(sessionsJson.sessions));
      assert.equal(sessionsJson.sessions[0].session_id, importJson.session_id);

      const recentRes = await fetch(`${baseUrl}/bridge/v1/sessions/recent?limit=5`);
      assert.equal(recentRes.status, 200);
      const recentJson = await recentRes.json();
      assert.ok(Array.isArray(recentJson.sessions));
      assert.equal(recentJson.sessions[0].session_id, importJson.session_id);
      assert.equal(recentJson.sessions[0].message_count, 2);

      const messagesRes = await fetch(
        `${baseUrl}/bridge/v1/projects/${importJson.project_id}/sessions/${importJson.session_id}/messages`,
      );
      assert.equal(messagesRes.status, 200);
      const messagesJson = await messagesRes.json();
      assert.ok(Array.isArray(messagesJson.messages));
      assert.equal(messagesJson.messages.length, 2);
      assert.equal(messagesJson.messages[0].message_id, "m-000001");

      // Sync validation: filesystem adapter requires OPEN_NOTEBOOK_FS_ROOT.
      const fsSync = await postJson(baseUrl, `/bridge/v1/projects/${importJson.project_id}/sync/open-notebook`, {
        session_id: importJson.session_id,
        targets: ["sources"],
        adapter: "filesystem",
      });
      assert.equal(fsSync.res.status, 400);
      assert.ok(String(fsSync.json?.error?.message || "").includes("OPEN_NOTEBOOK_FS_ROOT"));

      // Sync validation: http adapter requires api base URL (or env OPEN_NOTEBOOK_API_URL).
      const httpSync = await postJson(baseUrl, `/bridge/v1/projects/${importJson.project_id}/sync/open-notebook`, {
        session_id: importJson.session_id,
        targets: ["sources"],
        adapter: "http",
        http: {},
      });
      assert.equal(httpSync.res.status, 400);
      assert.ok(String(httpSync.json?.error?.message || "").toLowerCase().includes("api"));
    });
  } finally {
    try {
      if (bridgeDb && typeof bridgeDb.close === "function") bridgeDb.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
