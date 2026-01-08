const test = require("node:test");
const assert = require("node:assert/strict");

const { renderReplaySessionHtml } = require("../src/lib/replayHtml");

test("replay session HTML includes search/filter controls and copy actions", () => {
  const html = renderReplaySessionHtml({
    project: { id: "proj_1", name: "demo" },
    session: { id: "sess_1", name: "s1" },
    messages: [
      { role: "user", timestamp: "2025-12-26T00:00:00.000Z", text: "hello" },
      { role: "assistant", timestamp: "2025-12-26T00:00:01.000Z", text: "hi" },
    ],
  });

  assert.ok(html.includes('id="replay-search"'));
  assert.ok(html.includes('id="replay-filters"'));
  assert.ok(html.includes('class="btn btn-copy-link"'));
  assert.ok(html.includes('class="btn btn-copy-text"'));
  assert.ok(html.includes('data-message-id="m-000001"'));
  assert.ok(html.includes('data-message-id="m-000002"'));
  assert.ok(html.includes('data-role="user"'));
  assert.ok(html.includes('data-role="assistant"'));
});

test("replay session HTML omits controls when there are no messages", () => {
  const html = renderReplaySessionHtml({
    project: { id: "proj_1", name: "demo" },
    session: { id: "sess_1", name: "s1" },
    messages: [],
  });

  assert.ok(!html.includes('id="replay-search"'));
  assert.ok(!html.includes("btn-copy-link"));
});

