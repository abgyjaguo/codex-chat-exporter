const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCursorComposerDataJson } = require("../src/lib/cursorComposerData");

function makeBubbleReader(map) {
  return {
    get(key) {
      return map.get(key) ?? null;
    },
  };
}

test("parseCursorComposerDataJson does not drop assistant content when bubble.text is empty", () => {
  const composerId = "c1";
  const headers = [
    { bubbleId: "b1", type: 1 },
    { bubbleId: "b2", type: 2 },
  ];
  const composerData = { composerId, fullConversationHeadersOnly: headers };

  const bubbles = new Map();
  bubbles.set(`bubbleId:${composerId}:b1`, JSON.stringify({ text: "hi" }));
  bubbles.set(`bubbleId:${composerId}:b2`, JSON.stringify({ text: "", thinking: "plan: do the thing" }));

  const parsed = parseCursorComposerDataJson(JSON.stringify(composerData), { bubbleReader: makeBubbleReader(bubbles) });

  assert.equal(parsed.message_count, 2);
  assert.deepEqual(
    parsed.messages.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(parsed.messages[1].blocks?.[0]?.type, "thinking");
  assert.equal(parsed.messages[1].text, "plan: do the thing");
});

test("parseCursorComposerDataJson can extract tool/diff/edit-like fields when bubble.text is empty", () => {
  const composerId = "c2";
  const headers = [
    { bubbleId: "u1", type: 1 },
    { bubbleId: "a1", type: 2 },
  ];
  const composerData = { composerId, fullConversationHeadersOnly: headers };

  const bubbles = new Map();
  bubbles.set(`bubbleId:${composerId}:u1`, JSON.stringify({ text: "please do it" }));
  bubbles.set(
    `bubbleId:${composerId}:a1`,
    JSON.stringify({
      text: "",
      toolCalls: [{ id: "call_1", name: "shell_command", arguments: JSON.stringify({ command: "echo hi" }) }],
      diff: "--- a/file.txt\n+++ b/file.txt\n@@\n-foo\n+bar\n",
      edits: [{ path: "file.txt", type: "replace", from: "foo", to: "bar" }],
    }),
  );

  const parsed = parseCursorComposerDataJson(JSON.stringify(composerData), { bubbleReader: makeBubbleReader(bubbles) });

  assert.equal(parsed.message_count, 2);
  assert.equal(parsed.messages[1].role, "assistant");

  const types = parsed.messages[1].blocks.map((b) => b.type);
  assert.ok(types.includes("tool_use"));
  assert.ok(types.includes("diff"));
  assert.ok(types.includes("edit"));
  assert.ok(String(parsed.messages[1].text).includes("shell_command"));
});

test("parseCursorComposerDataJson supports block filtering", () => {
  const composerId = "c3";
  const headers = [
    { bubbleId: "u1", type: 1 },
    { bubbleId: "a1", type: 2 },
  ];
  const composerData = { composerId, fullConversationHeadersOnly: headers };

  const bubbles = new Map();
  bubbles.set(`bubbleId:${composerId}:u1`, JSON.stringify({ text: "hi" }));
  bubbles.set(`bubbleId:${composerId}:a1`, JSON.stringify({ text: "", toolCalls: [{ name: "shell_command", arguments: "{}" }] }));

  const parsed = parseCursorComposerDataJson(JSON.stringify(composerData), {
    bubbleReader: makeBubbleReader(bubbles),
    excludeBlockTypes: ["tool_use"],
  });

  assert.equal(parsed.message_count, 1);
  assert.equal(parsed.messages[0].role, "user");
});

test("parseCursorComposerDataJson merges adjacent blocks (within a bubble) by default", () => {
  const composerId = "c4";
  const headers = [{ bubbleId: "a1", type: 2 }];
  const composerData = { composerId, fullConversationHeadersOnly: headers };

  const bubbles = new Map();
  bubbles.set(
    `bubbleId:${composerId}:a1`,
    JSON.stringify({
      text: "",
      blocks: [
        { type: "text", text: "one" },
        { type: "text", text: "two" },
      ],
    }),
  );

  const parsed = parseCursorComposerDataJson(JSON.stringify(composerData), { bubbleReader: makeBubbleReader(bubbles) });

  assert.equal(parsed.message_count, 1);
  assert.equal(parsed.messages[0].blocks.length, 1);
  assert.equal(parsed.messages[0].blocks[0].type, "text");
  assert.equal(parsed.messages[0].text, "one\ntwo");
});

test("parseCursorComposerDataJson can merge adjacent messages (opt-in)", () => {
  const composerId = "c5";
  const headers = [
    { bubbleId: "u1", type: 1 },
    { bubbleId: "a1", type: 2 },
    { bubbleId: "a2", type: 2 },
  ];
  const composerData = { composerId, fullConversationHeadersOnly: headers };

  const bubbles = new Map();
  bubbles.set(`bubbleId:${composerId}:u1`, JSON.stringify({ text: "hi" }));
  bubbles.set(`bubbleId:${composerId}:a1`, JSON.stringify({ text: "part 1" }));
  bubbles.set(`bubbleId:${composerId}:a2`, JSON.stringify({ text: "part 2" }));

  const parsed = parseCursorComposerDataJson(JSON.stringify(composerData), {
    bubbleReader: makeBubbleReader(bubbles),
    mergeAdjacentMessages: true,
  });

  assert.equal(parsed.message_count, 2);
  assert.deepEqual(
    parsed.messages.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(parsed.messages[1].text, "part 1\npart 2");
});

