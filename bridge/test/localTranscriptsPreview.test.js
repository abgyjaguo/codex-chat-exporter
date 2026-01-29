const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createApp } = require("../src/app");

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

function writeJsonl(filePath, objs) {
  fs.writeFileSync(
    filePath,
    `${objs.map((o) => JSON.stringify(o)).join("\n")}\n`,
    "utf8",
  );
}

test("local-transcripts/preview exposes codex_port inferred from session_meta originator/source", async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-home-"));
  try {
    const sessionsDir = path.join(tmpHome, ".codex", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const idePath = path.join(sessionsDir, "ide.jsonl");
    const cliPath = path.join(sessionsDir, "cli.jsonl");

    writeJsonl(idePath, [
      {
        type: "session_meta",
        payload: {
          id: "sess-ide",
          cwd: "C:\\\\Users\\\\Alice\\\\ideproj",
          originator: "codex_vscode",
          source: "vscode",
        },
      },
    ]);

    writeJsonl(cliPath, [
      {
        type: "session_meta",
        payload: {
          id: "sess-cli",
          cwd: "C:\\\\Users\\\\Alice\\\\cliproj",
          originator: "codex_cli",
          source: "cli",
        },
      },
    ]);

    const prevUserProfile = process.env.USERPROFILE;
    const prevHome = process.env.HOME;
    process.env.USERPROFILE = tmpHome;
    process.env.HOME = tmpHome;

    try {
      const app = createApp({ bridgeDb: {} });

      await withServer(app, async (baseUrl) => {
        const ideRes = await postJson(baseUrl, "/bridge/v1/local-transcripts/preview", {
          candidate: {
            tool: "codex",
            source: { kind: "file", path: idePath, format: "jsonl" },
            title: "ide.jsonl",
          },
          max_messages: 1,
        });

        assert.equal(ideRes.status, 200);
        const ideJson = JSON.parse(ideRes.body);
        assert.equal(ideJson.session_name, "sess-ide");
        assert.equal(ideJson.session_meta.originator, "codex_vscode");
        assert.equal(ideJson.session_meta.source, "vscode");
        assert.equal(ideJson.session_meta.codex_port, "ide");

        const cliRes = await postJson(baseUrl, "/bridge/v1/local-transcripts/preview", {
          candidate: {
            tool: "codex",
            source: { kind: "file", path: cliPath, format: "jsonl" },
            title: "cli.jsonl",
          },
          max_messages: 1,
        });

        assert.equal(cliRes.status, 200);
        const cliJson = JSON.parse(cliRes.body);
        assert.equal(cliJson.session_name, "sess-cli");
        assert.equal(cliJson.session_meta.originator, "codex_cli");
        assert.equal(cliJson.session_meta.source, "cli");
        assert.equal(cliJson.session_meta.codex_port, "cli");
      });
    } finally {
      process.env.USERPROFILE = prevUserProfile;
      process.env.HOME = prevHome;
    }
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

