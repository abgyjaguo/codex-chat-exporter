const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { parseCodexJsonl } = require("../src/lib/codexJsonl");
const { messageIdForIndex } = require("../src/lib/messageIds");
const { renderReplaySessionHtml } = require("../src/lib/replayHtml");
const { replaySessionPath } = require("../src/lib/replayUrls");

function main() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "replay-session.jsonl");
  const jsonlText = fs.readFileSync(fixturePath, "utf8");

  const { messages, message_count } = parseCodexJsonl(jsonlText);
  assert.strictEqual(message_count, messages.length);
  assert.strictEqual(messages.length, 4);

  assert.strictEqual(messageIdForIndex(0), "m-000001");
  assert.strictEqual(messageIdForIndex(3), "m-000004");

  const project = { id: "proj_fixture", name: "Fixture Project" };
  const session = { id: "sess_fixture", name: "Fixture Session" };
  const html = renderReplaySessionHtml({ project, session, messages });

  for (let i = 0; i < messages.length; i += 1) {
    const id = messageIdForIndex(i);
    assert.ok(html.includes(`id=\"${id}\"`), `missing anchor id=${id}`);
    assert.ok(html.includes(`href=\"#${id}\"`), `missing self-link href=#${id}`);
  }

  assert.ok(
    html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
    "expected message text to be HTML-escaped",
  );

  assert.strictEqual(
    replaySessionPath(project.id, session.id),
    "/replay/projects/proj_fixture/sessions/sess_fixture",
  );

  // If you want to verify manually in the browser:
  // - Start the Bridge server: `cd bridge && npm install && npm start`
  // - Import the fixture via POST /bridge/v1/import/codex-chat
  // - Open: http://127.0.0.1:7331/replay

  console.log("ok: replay fixture anchors are stable and linkable");
}

main();
