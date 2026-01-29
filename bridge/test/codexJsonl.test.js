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
  assert.equal(parsed.messages[0].blocks?.[0]?.type, "text");
  assert.equal(parsed.messages[1].blocks?.[0]?.type, "text");
});

test("parseCodexJsonl includes tool outputs only when opted in", () => {
  const parsed = parseCodexJsonl(fixtureJsonl, { includeToolOutputs: true });
  assert.equal(parsed.message_count, 3);

  const roles = parsed.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "assistant", "tool"]);
  assert.equal(parsed.messages[2].tool_call_id, "call_1");
  assert.equal(parsed.messages[2].blocks?.[0]?.type, "tool_result");
});

test("parseCodexJsonl includes <environment_context> only when opted in", () => {
  const parsed = parseCodexJsonl(fixtureJsonl, { includeEnvironmentContext: true });
  assert.equal(parsed.message_count, 3);

  assert.equal(parsed.messages[2].role, "system");
  assert.ok(String(parsed.messages[2].text).startsWith("<environment_context>"));
  assert.equal(parsed.messages[2].blocks?.[0]?.type, "text");
});

test("parseCodexJsonl preserves tool calls + reasoning as blocks when opted in", () => {
  const jsonl = [
    JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:00.000Z", payload: { type: "user_message", message: "hi" } }),
    JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:01.000Z", payload: { type: "agent_reasoning", text: "plan: do thing" } }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: { type: "function_call", call_id: "call_99", name: "shell_command", arguments: JSON.stringify({ command: "echo hi" }) },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-01-01T00:00:03.000Z",
      payload: { type: "function_call_output", call_id: "call_99", output: "hi\\n" },
    }),
    JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:04.000Z", payload: { type: "agent_message", message: "done" } }),
  ].join("\n");

  const parsed = parseCodexJsonl(jsonl, { includeToolOutputs: true });

  const roles = parsed.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "system", "tool", "tool", "assistant"]);

  assert.equal(parsed.messages[1].blocks?.[0]?.type, "thinking");

  assert.equal(parsed.messages[2].blocks?.[0]?.type, "tool_use");
  assert.equal(parsed.messages[2].blocks?.[0]?.name, "shell_command");
  assert.equal(parsed.messages[2].blocks?.[0]?.id, "call_99");

  assert.equal(parsed.messages[3].blocks?.[0]?.type, "tool_result");
  assert.equal(parsed.messages[3].blocks?.[0]?.tool_use_id, "call_99");
  assert.equal(parsed.messages[3].blocks?.[0]?.tool_name, "shell_command");
});
