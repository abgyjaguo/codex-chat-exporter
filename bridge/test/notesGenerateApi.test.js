const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");

const { createApp } = require("../src/app");

function makeStubDb() {
  const projectRow = { id: "proj_1", name: "demo", cwd: "/tmp/demo" };
  const sessionRow = { id: "sess_1", name: "s1", project_id: "proj_1" };
  const normalized = [
    { role: "user", timestamp: "2025-12-26T00:00:00.000Z", text: "hello" },
    { role: "assistant", timestamp: "2025-12-26T00:00:01.000Z", text: "hi" },
  ];

  return {
    bridgeDb: {
      getProjectById: (id) => (id === "proj_1" ? projectRow : null),
      getSessionById: (id) => (id === "sess_1" ? sessionRow : null),
      getLatestSourceBySessionId: (id) =>
        id === "sess_1" ? { normalized_json: JSON.stringify(normalized) } : null,
    },
  };
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

test("notes/generate returns placeholder notes by default", async () => {
  const { bridgeDb } = makeStubDb();
  const app = createApp({ bridgeDb });

  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, "/bridge/v1/projects/proj_1/sessions/sess_1/notes/generate", {});
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.provider, "placeholder");
    assert.ok(typeof json.notes?.summary === "string");
    assert.ok(json.notes.summary.includes("# Summary"));
    assert.ok(json.notes.summary.includes("## Evidence Links"));
  });
});

test("notes/generate returns a clear 400 when OpenAI provider is requested without a key", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const { bridgeDb } = makeStubDb();
    const app = createApp({ bridgeDb });

    await withServer(app, async (baseUrl) => {
      const res = await postJson(baseUrl, "/bridge/v1/projects/proj_1/sessions/sess_1/notes/generate", {
        provider: "openai",
      });
      assert.equal(res.status, 400);

      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "invalid_config");
      assert.ok(Array.isArray(json.error.details?.missing));
      assert.ok(json.error.details.missing.includes("OPENAI_API_KEY"));
    });
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

