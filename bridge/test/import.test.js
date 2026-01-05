const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const { createApp } = require("../src/app");

const fixturePath = path.join(__dirname, "fixtures", "mixed.jsonl");
const fixtureJsonl = fs.readFileSync(fixturePath, "utf8");

function makeStubDb() {
  const calls = { projects: [], sessions: [], sources: [] };

  const bridgeDb = {
    transaction: (fn) => fn(),
    ensureProject: (p) => calls.projects.push(p),
    ensureSession: (s) => calls.sessions.push(s),
    addSource: (src) => calls.sources.push(src),
    getProjectById: () => null,
    getSessionById: () => null,
    getLatestSourceBySessionId: () => null,
  };

  return { bridgeDb, calls };
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function postJson(baseUrl, pathname, payload) {
  const url = new URL(pathname, baseUrl);
  const data = JSON.stringify(payload);

  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test("import accepts jsonl-only payload (defaults filter sensitive content)", async () => {
  const { bridgeDb, calls } = makeStubDb();
  const app = createApp({ bridgeDb });

  await withServer(app, async (baseUrl) => {
    const payload = {
      project: { name: "demo", cwd: "/tmp/demo" },
      session: { name: "s1" },
      exported_at: "2025-12-26T00:00:00.000Z",
      codex: { jsonl_text: fixtureJsonl },
    };

    const res = await postJson(baseUrl, "/bridge/v1/import/codex-chat", payload);
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.message_count, 2);

    assert.equal(calls.sources.length, 1);
    const source = calls.sources[0];
    assert.ok(!source.raw_jsonl.includes("function_call_output"));
    assert.ok(!source.raw_jsonl.includes("<environment_context>"));

    const normalized = JSON.parse(source.normalized_json);
    assert.deepEqual(
      normalized.map((m) => m.role),
      ["user", "assistant"],
    );
    assert.equal(normalized[0].message_id, "m-000001");
  });
});

test("import preserves sensitive content only when opted in", async () => {
  const { bridgeDb, calls } = makeStubDb();
  const app = createApp({ bridgeDb });

  await withServer(app, async (baseUrl) => {
    const payload = {
      project: { name: "demo", cwd: "/tmp/demo" },
      session: { name: "s1" },
      exported_at: "2025-12-26T00:00:00.000Z",
      codex: {
        jsonl_text: fixtureJsonl,
        include_tool_outputs: true,
        include_environment_context: true,
      },
    };

    const res = await postJson(baseUrl, "/bridge/v1/import/codex-chat", payload);
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.message_count, 4);

    assert.equal(calls.sources.length, 1);
    const source = calls.sources[0];
    assert.ok(source.raw_jsonl.includes("function_call_output"));
    assert.ok(source.raw_jsonl.includes("<environment_context>"));

    const normalized = JSON.parse(source.normalized_json);
    assert.deepEqual(
      normalized.map((m) => m.role),
      ["user", "assistant", "tool", "system"],
    );
  });
});

test("import accepts markdown-only payload (defaults filter sensitive content)", async () => {
  const { bridgeDb, calls } = makeStubDb();
  const app = createApp({ bridgeDb });

  await withServer(app, async (baseUrl) => {
    const markdownText = [
      "# Codex Session",
      "",
      "### 工具输出：`call_1`",
      "",
      "```text",
      "tool out",
      "```",
      "",
      "<environment_context>",
      "SECRET=sk-test",
      "</environment_context>",
      "",
      "## 用户",
      "",
      "hi",
      "",
    ].join("\n");

    const payload = {
      project: { name: "demo", cwd: "/tmp/demo" },
      session: { name: "s1" },
      exported_at: "2025-12-26T00:00:00.000Z",
      codex: { markdown_text: markdownText },
    };

    const res = await postJson(baseUrl, "/bridge/v1/import/codex-chat", payload);
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.message_count, 0);

    assert.equal(calls.sources.length, 1);
    const source = calls.sources[0];
    assert.equal(source.raw_jsonl, "");
    assert.ok(source.raw_markdown);
    assert.ok(!source.raw_markdown.includes("工具输出"));
    assert.ok(!source.raw_markdown.includes("<environment_context>"));
  });
});

test("import accepts payload with both jsonl and markdown", async () => {
  const { bridgeDb, calls } = makeStubDb();
  const app = createApp({ bridgeDb });

  await withServer(app, async (baseUrl) => {
    const payload = {
      project: { name: "demo", cwd: "/tmp/demo" },
      session: { name: "s1" },
      exported_at: "2025-12-26T00:00:00.000Z",
      codex: {
        jsonl_text: fixtureJsonl,
        markdown_text: "# Codex Session\n\nhello\n",
      },
    };

    const res = await postJson(baseUrl, "/bridge/v1/import/codex-chat", payload);
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.message_count, 2);

    assert.equal(calls.sources.length, 1);
    const source = calls.sources[0];
    assert.ok(source.raw_markdown.includes("# Codex Session"));
  });
});

