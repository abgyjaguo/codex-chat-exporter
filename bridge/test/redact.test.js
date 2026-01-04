const assert = require("node:assert/strict");
const test = require("node:test");

const {
  redactText,
  redactForExportMarkdown,
  redactForOpenAIGenerationInput,
  redactForOpenNotebookMarkdown,
} = require("../src/lib/redact");

test("redacts Authorization: Bearer tokens", () => {
  const input = "Authorization: Bearer abc.def.ghi";
  const out = redactText(input);
  assert.equal(out, "Authorization: Bearer [REDACTED_TOKEN]");
});

test("redacts OpenAI-style sk- API keys", () => {
  const key = ["s", "k"].join("") + "-" + "abcdefghijklmnopqrstuvwxyz123456";
  const input = `key=${key}`;
  const out = redactText(input);
  assert.equal(out, "key=[REDACTED_API_KEY]");
});

test("redacts GitHub tokens", () => {
  const ghp = ["gh", "p"].join("") + "_" + "a".repeat(36);
  const fineGrained = ["github", "pat"].join("_") + "_" + "b".repeat(40);
  const input = `tokens: ${ghp} ${fineGrained}`;
  const out = redactText(input);
  assert.equal(out, "tokens: [REDACTED_GITHUB_TOKEN] [REDACTED_GITHUB_TOKEN]");
});

test("redacts Slack tokens", () => {
  const slack = ["xo", "xb"].join("") + "-1234567890-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out = redactText(`slack=${slack}`);
  assert.equal(out, "slack=[REDACTED_SLACK_TOKEN]");
});

test("redacts email addresses", () => {
  const input = "Contact: test.user+tag@example.co.uk";
  const out = redactText(input);
  assert.equal(out, "Contact: [REDACTED_EMAIL]");
});

test("redacts phone numbers (best-effort)", () => {
  const input = "Call +1 (415) 555-2671 now.";
  const out = redactText(input);
  assert.equal(out, "Call [REDACTED_PHONE] now.");
});

test("does not treat ISO dates as phone numbers", () => {
  const input = "Date: 2026-01-04";
  const out = redactText(input);
  assert.equal(out, input);
});

test("redacts PEM private key blocks", () => {
  const input = [
    "```pem",
    "-----BEGIN PRIVATE KEY-----",
    "abc",
    "-----END PRIVATE KEY-----",
    "```",
  ].join("\n");
  const out = redactText(input);
  assert.ok(out.includes("[REDACTED_PRIVATE_KEY]"));
  assert.ok(!out.includes("BEGIN PRIVATE KEY"));
});

test("does not break basic markdown structure", () => {
  const input = [
    "# Title",
    "",
    "Email: test@example.com",
    "",
    "[Email](mailto:test@example.com)",
    "",
    "```sh",
    "curl -H 'Authorization: Bearer abc' https://example.test",
    "echo sk-abcdefghijklmnopqrstuvwxyz123456",
    "```",
    "",
    "Call (415) 555-2671",
    "",
  ].join("\n");

  const out = redactText(input);

  const fenceCountIn = (input.match(/```/g) || []).length;
  const fenceCountOut = (out.match(/```/g) || []).length;
  assert.equal(fenceCountOut, fenceCountIn);

  assert.ok(out.includes("# Title"));
  assert.ok(out.includes("Email: [REDACTED_EMAIL]"));
  assert.ok(out.includes("[Email](mailto:[REDACTED_EMAIL])"));
  assert.ok(out.includes("Authorization: Bearer [REDACTED_TOKEN]"));
  assert.ok(out.includes("[REDACTED_API_KEY]"));
  assert.ok(out.includes("[REDACTED_PHONE]"));
});

test("use-case helpers behave like redactText for now", () => {
  const key = ["s", "k"].join("") + "-" + "abcdefghijklmnopqrstuvwxyz123456";
  const input = `Authorization: Bearer abc ${key}`;
  const expected = redactText(input);
  assert.equal(redactForOpenNotebookMarkdown(input), expected);
  assert.equal(redactForExportMarkdown(input), expected);
  assert.equal(redactForOpenAIGenerationInput(input), expected);
});
