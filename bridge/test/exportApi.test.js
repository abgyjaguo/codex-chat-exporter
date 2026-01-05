const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { unzipSync } = require("fflate");

const { createBridgeApp } = require("../src/app");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("export create/list/download happy path", async (t) => {
  const tmpDir = makeTempDir("bridge-export-");
  const dbPath = path.join(tmpDir, "bridge.db");
  const exportsDir = path.join(tmpDir, "exports");

  const { app, bridgeDb } = createBridgeApp({ dbPath, exportsDir });

  const now = new Date().toISOString();
  const project_id = "proj_test";
  const session_id = "sess_test";

  bridgeDb.transaction(() => {
    bridgeDb.ensureProject({ id: project_id, name: "Demo", cwd: "/tmp/demo", created_at: now });
    bridgeDb.ensureSession({ id: session_id, project_id, name: "Session 1", imported_at: now, source_type: "codex_jsonl" });
    bridgeDb.addSource({
      id: "src_test",
      session_id,
      exported_at: now,
      raw_jsonl: '{"type":"event_msg","timestamp":"2026-01-03T00:00:00Z","payload":{"type":"user_message","message":"hi"}}',
      normalized_json: JSON.stringify([{ role: "user", timestamp: now, text: "hi" }]),
      warnings_json: "[]",
      message_count: 1,
      created_at: now,
    });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : null;
  assert.ok(port, "failed to bind server port");

  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    try {
      server.close();
    } catch {}
    try {
      bridgeDb.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const createResp = await fetch(`${baseUrl}/bridge/v1/exports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: { project_id, session_id },
      includes: { sessions: true },
      version: "v0.3.4",
      include_raw_jsonl: false,
    }),
  });
  assert.equal(createResp.status, 200);
  const created = await createResp.json();
  assert.ok(created.export_id);
  assert.equal(created.status, "ready");
  assert.equal(created.download_url, `/bridge/v1/exports/${created.export_id}/download`);

  const listResp = await fetch(`${baseUrl}/bridge/v1/exports`);
  assert.equal(listResp.status, 200);
  const listed = await listResp.json();
  assert.ok(Array.isArray(listed.exports));
  assert.equal(listed.exports[0].export_id, created.export_id);

  const downloadResp = await fetch(`${baseUrl}${created.download_url}`);
  assert.equal(downloadResp.status, 200);
  assert.equal(downloadResp.headers.get("content-type"), "application/zip");

  const zipBytes = new Uint8Array(await downloadResp.arrayBuffer());
  const entries = unzipSync(zipBytes);
  assert.ok(entries["00_Index.md"]);
  assert.ok(entries["manifest.json"]);
});

