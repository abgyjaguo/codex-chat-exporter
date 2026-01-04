const { messageIdForIndex, isValidMessageId } = require("./messageIds");
const { replayIndexPath, replaySessionPath } = require("./replayUrls");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLayout({ title, bodyHtml }) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "  :root {",
    "    color-scheme: light dark;",
    "    --bg: #0b0f19;",
    "    --panel: rgba(255, 255, 255, 0.06);",
    "    --text: #e6e6e6;",
    "    --muted: rgba(230, 230, 230, 0.7);",
    "    --link: #7aa2ff;",
    "    --border: rgba(255, 255, 255, 0.14);",
    "    --target: rgba(255, 215, 0, 0.16);",
    "  }",
    "  @media (prefers-color-scheme: light) {",
    "    :root {",
    "      --bg: #fafafa;",
    "      --panel: rgba(0, 0, 0, 0.04);",
    "      --text: #111827;",
    "      --muted: rgba(17, 24, 39, 0.7);",
    "      --link: #2457ff;",
    "      --border: rgba(0, 0, 0, 0.12);",
    "      --target: rgba(255, 204, 0, 0.22);",
    "    }",
    "  }",
    "  html, body { height: 100%; }",
    "  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;",
    "         background: var(--bg); color: var(--text); }",
    "  a { color: var(--link); text-decoration: none; }",
    "  a:hover { text-decoration: underline; }",
    "  .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }",
    "  .header { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }",
    "  .header h1 { font-size: 18px; margin: 0; }",
    "  .muted { color: var(--muted); }",
    "  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }",
    "  .list { list-style: none; padding: 0; margin: 0; }",
    "  .list li { padding: 10px 0; border-top: 1px solid var(--border); }",
    "  .list li:first-child { border-top: none; }",
    "  .row { display: flex; gap: 12px; justify-content: space-between; }",
    "  .row .meta { display: flex; flex-direction: column; gap: 4px; }",
    "  .row .meta .title { font-weight: 600; }",
    "  .row .meta .sub { font-size: 12px; color: var(--muted); }",
    "  .messages { list-style: none; padding: 0; margin: 0; }",
    "  .message { border-top: 1px solid var(--border); padding: 14px 10px; }",
    "  .message:first-child { border-top: none; }",
    "  .message:target { background: var(--target); outline: 2px solid rgba(255, 215, 0, 0.3); border-radius: 10px; }",
    "  .msg-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }",
    "  .msg-head .id { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; }",
    "  .msg-head .role { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); font-size: 12px; }",
    "  .msg-head .ts { font-size: 12px; color: var(--muted); }",
    "  .msg-body { margin-top: 8px; }",
    "  .msg-body pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45;",
    "               font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; }",
    "</style>",
    "</head>",
    "<body>",
    `<div class="wrap">${bodyHtml}</div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function renderReplayErrorHtml({ title, message }) {
  const body = [
    '<div class="header">',
    `  <h1>${escapeHtml(title || "Replay")}</h1>`,
    `  <div><a href="${replayIndexPath()}">Replay index</a></div>`,
    "</div>",
    '<div class="panel">',
    `  <p>${escapeHtml(message || "Unexpected error.")}</p>`,
    "</div>",
  ].join("\n");

  return renderLayout({ title: title || "Replay Error", bodyHtml: body });
}

function renderReplayIndexHtml({ sessions }) {
  const listHtml = Array.isArray(sessions) && sessions.length
    ? [
        '<ul class="list">',
        ...sessions.map((s) => {
          const href = replaySessionPath(s.project_id, s.session_id);
          const title = `${s.project_name || s.project_id} / ${s.session_name || s.session_id}`;
          const sub = [
            s.imported_at ? `imported_at: ${s.imported_at}` : null,
            `project_id: ${s.project_id}`,
            `session_id: ${s.session_id}`,
          ]
            .filter(Boolean)
            .join(" · ");

          return [
            "<li>",
            '  <div class="row">',
            '    <div class="meta">',
            `      <div class="title"><a href="${href}">${escapeHtml(title)}</a></div>`,
            `      <div class="sub">${escapeHtml(sub)}</div>`,
            "    </div>",
            "  </div>",
            "</li>",
          ].join("\n");
        }),
        "</ul>",
      ].join("\n")
    : `<p class="muted">No sessions imported yet. Import via <code>POST /bridge/v1/import/codex-chat</code>.</p>`;

  const body = [
    '<div class="header">',
    "  <h1>Replay</h1>",
    '  <div class="muted">Stub UI</div>',
    "</div>",
    '<div class="panel">',
    "  <p class=\"muted\">Select a session:</p>",
    `  ${listHtml}`,
    "</div>",
  ].join("\n");

  return renderLayout({ title: "Replay", bodyHtml: body });
}

function renderReplaySessionHtml({ project, session, messages }) {
  const projectLabel = project && typeof project === "object" ? project.name || project.id : "";
  const sessionLabel = session && typeof session === "object" ? session.name || session.id : "";

  const metaLines = [];
  if (project && project.id) metaLines.push(`project_id: ${project.id}`);
  if (session && session.id) metaLines.push(`session_id: ${session.id}`);

  const list = Array.isArray(messages)
    ? messages
        .map((m, i) => {
          const id = messageIdForIndex(i);
          const role = m && typeof m === "object" && typeof m.role === "string" ? m.role : "unknown";
          const ts = m && typeof m === "object" && typeof m.timestamp === "string" ? m.timestamp : "";
          const text = m && typeof m === "object" && typeof m.text === "string" ? m.text : "";

          const displayTs = ts ? escapeHtml(ts) : "";
          const displayRole = escapeHtml(role);

          return [
            `<li class="message" id="${id}">`,
            '  <div class="msg-head">',
            `    <a class="id" href="#${id}">${id}</a>`,
            `    <span class="role">${displayRole}</span>`,
            displayTs ? `    <span class="ts">${displayTs}</span>` : "",
            "  </div>",
            '  <div class="msg-body">',
            `    <pre>${escapeHtml(text)}</pre>`,
            "  </div>",
            "</li>",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n")
    : "";

  const body = [
    '<div class="header">',
    `  <h1>${escapeHtml([projectLabel, sessionLabel].filter(Boolean).join(" / ") || "Replay Session")}</h1>`,
    `  <div><a href="${replayIndexPath()}">Replay index</a></div>`,
    "</div>",
    '<div class="panel">',
    metaLines.length ? `  <div class="muted">${escapeHtml(metaLines.join(" · "))}</div>` : "",
    Array.isArray(messages) && messages.length ? `  <ol class="messages">${list}</ol>` : '  <p class="muted">No messages found.</p>',
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");

  return renderLayout({ title: "Replay Session", bodyHtml: body });
}

function looksLikeMessageHash(hash) {
  const raw = String(hash || "");
  const decoded = raw.startsWith("#") ? decodeURIComponent(raw.slice(1)) : decodeURIComponent(raw);
  return isValidMessageId(decoded);
}

module.exports = {
  looksLikeMessageHash,
  renderReplayErrorHtml,
  renderReplayIndexHtml,
  renderReplaySessionHtml,
};
