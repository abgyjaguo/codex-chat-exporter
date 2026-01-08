const path = require("path");

const { redactText } = require("./redact");
const { messageIdForIndex } = require("./messageIds");
const { replayMessageUrl, replaySessionUrl } = require("./replayUrls");

function anchorForIndex(index) {
  return messageIdForIndex(index);
}

function renderSourceMarkdown({ project, session, project_id, session_id, messages, replayBaseUrl = null }) {
  const lines = [];
  lines.push("# Codex Session Source", "");
  lines.push(`- project_id: \`${project_id}\``);
  lines.push(`- project: \`${project.name}\``);
  lines.push(`- cwd: \`${project.cwd}\``);
  lines.push(`- session_id: \`${session_id}\``);
  lines.push(`- session: \`${session.name}\``);
  lines.push(`- message_count: \`${messages.length}\``);

  const replayUrl = replaySessionUrl({ projectId: project_id, sessionId: session_id, baseUrl: replayBaseUrl });
  if (replayBaseUrl) {
    lines.push(`- Open in Replay: ${replayUrl}`);
  } else {
    lines.push(`- Open in Replay: _(set \`BRIDGE_PUBLIC_BASE_URL\` to generate an absolute link)_`);
  }

  lines.push("", "---", "");

  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i] || {};
    const anchor = m.message_id || anchorForIndex(i);
    const role = m.role || "unknown";
    const ts = m.timestamp ? ` (${m.timestamp})` : "";
    lines.push(`<a id="${anchor}"></a>`);
    lines.push(`## ${anchor} ${role}${ts}`, "");
    lines.push(redactText(m.text || ""), "");
  }

  return lines.join("\n").trimEnd();
}

function relativeLinkToSourceAnchor(sourceId, anchor) {
  const sourceRel = path.posix.join("..", "sources", `${sourceId}.md`);
  return `${sourceRel}#${anchor}`;
}

function renderEvidenceLinks({ sourceId, anchors, project_id, session_id, replayBaseUrl = null }) {
  const safeAnchors = Array.isArray(anchors) ? anchors.filter(Boolean) : [];

  if (safeAnchors.length === 0) return ["- (no messages)"];

  return safeAnchors.map((a) => {
    const replayLink = replayBaseUrl
      ? replayMessageUrl({ projectId: project_id, sessionId: session_id, messageId: a, baseUrl: replayBaseUrl })
      : null;

    if (sourceId) {
      const sourceLink = relativeLinkToSourceAnchor(sourceId, a);
      return replayLink
        ? `- [${a}](${sourceLink}) · [Open in Replay](${replayLink})`
        : `- [${a}](${sourceLink}) · _(set \`BRIDGE_PUBLIC_BASE_URL\` for Open in Replay)_`;
    }

    return replayLink ? `- ${a} · [Open in Replay](${replayLink})` : `- ${a}`;
  });
}

function renderPlaceholderNotes({ project, session, project_id, session_id, sourceId, messages, replayBaseUrl = null }) {
  const anchors = messages
    .slice(0, 3)
    .map((m, i) => (m && typeof m === "object" && m.message_id ? m.message_id : anchorForIndex(i)));

  const evidenceLines = renderEvidenceLinks({ sourceId, anchors, project_id, session_id, replayBaseUrl });

  const summary = [
    "# Summary",
    "",
    "_(MVP: Summary generation not implemented yet.)_",
    "",
    "## Session",
    `- project_id: \`${project_id}\``,
    `- project: \`${project.name}\``,
    `- cwd: \`${project.cwd}\``,
    `- session_id: \`${session_id}\``,
    `- session: \`${session.name}\``,
    `- message_count: \`${messages.length}\``,
    "",
    "## Evidence Links",
    ...evidenceLines,
  ].join("\n");

  const studyPack = [
    "# Study Pack",
    "",
    "_(MVP: Study pack generation not implemented yet.)_",
    "",
    "## Suggested Next Steps",
    "- Extract key decisions into milestones",
    "- Attach evidence links to each claim",
    "- Convert repeated fixes into checklists",
  ].join("\n");

  const milestones = [
    "# Milestones & Evidence Map",
    "",
    "_(MVP: Milestones generation not implemented yet.)_",
    "",
    "## Evidence Links",
    ...evidenceLines,
  ].join("\n");

  return {
    summary,
    "study-pack": studyPack,
    milestones,
  };
}

module.exports = {
  anchorForIndex,
  renderSourceMarkdown,
  renderEvidenceLinks,
  renderPlaceholderNotes,
};
