const path = require("path");

const { redactText } = require("./redact");

function anchorForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function renderSourceMarkdown({ project, session, project_id, session_id, messages }) {
  const lines = [];
  lines.push("# Codex Session Source", "");
  lines.push(`- project_id: \`${project_id}\``);
  lines.push(`- project: \`${project.name}\``);
  lines.push(`- cwd: \`${project.cwd}\``);
  lines.push(`- session_id: \`${session_id}\``);
  lines.push(`- session: \`${session.name}\``);
  lines.push(`- message_count: \`${messages.length}\``);
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

function renderPlaceholderNotes({ project, session, project_id, session_id, sourceId, messages }) {
  const anchors = messages
    .slice(0, 3)
    .map((m, i) => (m && typeof m === "object" && m.message_id ? m.message_id : anchorForIndex(i)));

  const evidenceLines = anchors.length
    ? anchors.map((a) => `- [${a}](${relativeLinkToSourceAnchor(sourceId, a)})`)
    : ["- (no messages)"];

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
  renderPlaceholderNotes,
};
