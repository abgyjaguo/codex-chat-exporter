const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseCodexJsonl } = require("../src/lib/codexJsonl");

const fixturePath = path.join(__dirname, "fixtures", "mixed.jsonl");
const fixtureJsonl = fs.readFileSync(fixturePath, "utf8");

test("parseCodexJsonl assigns stable message_id (m-000001...)", () => {
  const first = parseCodexJsonl(fixtureJsonl);
  const second = parseCodexJsonl(fixtureJsonl);

  const firstIds = first.messages.map((m) => m.message_id);
  const secondIds = second.messages.map((m) => m.message_id);

  assert.deepEqual(firstIds, secondIds);
  assert.equal(firstIds[0], "m-000001");
  assert.equal(firstIds[1], "m-000002");
});

test("parseCodexJsonl excludes tool outputs and <environment_context> by default", () => {
  const parsed = parseCodexJsonl(fixtureJsonl);
  assert.equal(parsed.message_count, 2);

  const roles = parsed.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "assistant"]);
});

test("parseCodexJsonl includes tool outputs only when opted in", () => {
  const parsed = parseCodexJsonl(fixtureJsonl, { includeToolOutputs: true });
  assert.equal(parsed.message_count, 3);

  const roles = parsed.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "assistant", "tool"]);
  assert.equal(parsed.messages[2].tool_call_id, "call_1");
});

test("parseCodexJsonl includes <environment_context> only when opted in", () => {
  const parsed = parseCodexJsonl(fixtureJsonl, { includeEnvironmentContext: true });
  assert.equal(parsed.message_count, 3);

  assert.equal(parsed.messages[2].role, "user");
  assert.ok(String(parsed.messages[2].text).startsWith("<environment_context>"));
});

