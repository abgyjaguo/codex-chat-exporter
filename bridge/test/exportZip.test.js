const assert = require("node:assert/strict");
const test = require("node:test");

const { unzipSync } = require("fflate");

const {
  makeExportManifest,
  renderExportIndexMarkdown,
  buildExportZipBuffer,
} = require("../src/lib/exportZip");

test("export ZIP contains stable layout + manifest", () => {
  const manifest = makeExportManifest({
    version: "v0.3.4",
    export_id: "exp_test",
    created_at: "2026-01-03T00:00:00Z",
    scope: { project_id: "proj_test", session_id: "sess_test" },
    counts: { sessions: 1, tech_cards: 0, playbooks: 0, practices: 0 },
    replay_base_url: "http://127.0.0.1:7331",
  });

  const index = renderExportIndexMarkdown({
    export_id: "exp_test",
    created_at: "2026-01-03T00:00:00Z",
    scope: { project_id: "proj_test", session_id: "sess_test" },
    session_links: ["[sess_test](Sessions/sess_test.md)"],
  });

  const zip = buildExportZipBuffer({
    index_markdown: index,
    manifest,
    files: {
      "Sessions/sess_test.md": "# Session\n",
    },
  });

  const entries = unzipSync(new Uint8Array(zip));

  assert.ok(entries["00_Index.md"], "00_Index.md missing");
  assert.ok(entries["manifest.json"], "manifest.json missing");

  const parsedManifest = JSON.parse(Buffer.from(entries["manifest.json"]).toString("utf8"));
  assert.equal(parsedManifest.export_id, "exp_test");
  assert.equal(parsedManifest.version, "v0.3.4");
  assert.equal(parsedManifest.scope.project_id, "proj_test");
  assert.equal(parsedManifest.scope.session_id, "sess_test");
});

