const { zipSync, strToU8 } = require("fflate");

function normalizeExportVersion(versionRaw) {
  const v = String(versionRaw || "").trim();
  return v || "v0.3.4";
}

function normalizeIncludes(includesRaw) {
  const obj = includesRaw && typeof includesRaw === "object" ? includesRaw : {};
  return {
    sessions: obj.sessions !== false,
    tech_cards: obj.tech_cards === true,
    playbooks: obj.playbooks === true,
    practices: obj.practices === true,
  };
}

function makeExportManifest({ version, export_id, created_at, scope, counts, replay_base_url }) {
  return {
    version: normalizeExportVersion(version),
    export_id: String(export_id || ""),
    created_at: String(created_at || ""),
    scope: scope && typeof scope === "object" ? scope : {},
    counts: counts && typeof counts === "object" ? counts : {},
    replay: replay_base_url ? { base_url: String(replay_base_url) } : undefined,
  };
}

function renderExportIndexMarkdown({ export_id, created_at, scope, session_links = [] }) {
  const lines = [];
  lines.push("# Export Bundle", "");
  if (export_id) lines.push(`- export_id: \`${export_id}\``);
  if (created_at) lines.push(`- created_at: \`${created_at}\``);
  if (scope && typeof scope === "object") {
    if (scope.project_id) lines.push(`- project_id: \`${scope.project_id}\``);
    if (scope.session_id) lines.push(`- session_id: \`${scope.session_id}\``);
  }
  lines.push("", "## Sessions", "");
  if (!session_links.length) {
    lines.push("- (none)");
  } else {
    for (const link of session_links) {
      lines.push(`- ${link}`);
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

function buildExportZipBuffer({ index_markdown, manifest, files = {} }) {
  const entries = {
    "00_Index.md": strToU8(String(index_markdown || "")),
    "manifest.json": strToU8(`${JSON.stringify(manifest || {}, null, 2)}\n`),
    "Sessions/": new Uint8Array(0),
    "TechCards/": new Uint8Array(0),
    "Playbooks/": new Uint8Array(0),
    "Practices/": new Uint8Array(0),
  };

  for (const [name, value] of Object.entries(files || {})) {
    if (!name || typeof name !== "string") continue;
    if (value == null) continue;
    if (value instanceof Uint8Array) {
      entries[name] = value;
      continue;
    }
    entries[name] = strToU8(String(value));
  }

  return Buffer.from(zipSync(entries, { level: 6 }));
}

module.exports = {
  normalizeExportVersion,
  normalizeIncludes,
  makeExportManifest,
  renderExportIndexMarkdown,
  buildExportZipBuffer,
};

