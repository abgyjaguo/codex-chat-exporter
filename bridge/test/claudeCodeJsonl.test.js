const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { filterClaudeCodeJsonlRaw, parseClaudeCodeJsonl } = require("../src/lib/claudeCodeJsonl");

const fixturePath = path.join(__dirname, "fixtures", "claude.jsonl");
const fixtureJsonl = fs.readFileSync(fixturePath, "utf8");

test("parseClaudeCodeJsonl assigns stable message_id (m-000001...)", () => {
  const first = parseClaudeCodeJsonl(fixtureJsonl, { includeToolOutputs: true });
  const second = parseClaudeCodeJsonl(fixtureJsonl, { includeToolOutputs: true });

  const firstIds = first.messages.map((m) => m.message_id);
  const secondIds = second.messages.map((m) => m.message_id);

  assert.deepEqual(firstIds, secondIds);
  assert.equal(firstIds[0], "m-000001");
  assert.equal(firstIds[1], "m-000002");
});

test("parseClaudeCodeJsonl emits rich blocks and merges adjacent text blocks", () => {
  const parsed = parseClaudeCodeJsonl(fixtureJsonl, { includeToolOutputs: true });
  assert.equal(parsed.message_count, 4);

  const roles = parsed.messages.map((m) => m.role);
  assert.deepEqual(roles, ["assistant", "tool", "assistant", "tool"]);

  const firstBlocks = parsed.messages[0].blocks || [];
  assert.equal(firstBlocks[0].type, "text");
  assert.equal(firstBlocks[0].text, "hello\nworld");
  assert.equal(firstBlocks[1].type, "thinking");
  assert.equal(firstBlocks[2].type, "tool_use");
  assert.equal(firstBlocks[2].name, "Read");
});

test("parseClaudeCodeJsonl attaches tool_name on tool_result blocks when possible", () => {
  const parsed = parseClaudeCodeJsonl(fixtureJsonl, { includeToolOutputs: true });
  const toolMsg = parsed.messages.find((m) => m.role === "tool" && Array.isArray(m.blocks) && m.blocks[0]?.type === "tool_result");
  assert.ok(toolMsg);

  const blocks = toolMsg.blocks;
  assert.equal(blocks[0].type, "tool_result");
  assert.equal(blocks[0].tool_use_id, "toolu_1");
  assert.equal(blocks[0].tool_name, "Read");
});

test("filterClaudeCodeJsonlRaw can remove tool outputs and environment context", () => {
  const filtered = filterClaudeCodeJsonlRaw(fixtureJsonl, { includeToolOutputs: false, includeEnvironmentContext: false });
  assert.ok(!filtered.includes("\"tool_use\""));
  assert.ok(!filtered.includes("\"tool_result\""));
  assert.ok(!filtered.includes("<environment_context>"));

  const parsed = parseClaudeCodeJsonl(filtered, { includeToolOutputs: false, includeEnvironmentContext: false });
  assert.equal(parsed.message_count, 2);
  assert.deepEqual(
    parsed.messages.map((m) => m.role),
    ["assistant", "assistant"],
  );
});

