function replayIndexPath() {
  return "/replay";
}

function replaySessionPath(projectId, sessionId) {
  const p = encodeURIComponent(String(projectId || ""));
  const s = encodeURIComponent(String(sessionId || ""));
  return `/replay/projects/${p}/sessions/${s}`;
}

function getBridgePublicBaseUrl(env = process.env) {
  const raw = String(env.BRIDGE_PUBLIC_BASE_URL || "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) return null;
  return normalized;
}

function replaySessionUrl({ projectId, sessionId, baseUrl }) {
  const path = replaySessionPath(projectId, sessionId);
  return baseUrl ? `${baseUrl}${path}` : path;
}

function replayMessageUrl({ projectId, sessionId, messageId, baseUrl }) {
  return `${replaySessionUrl({ projectId, sessionId, baseUrl })}#${encodeURIComponent(String(messageId || ""))}`;
}

module.exports = {
  getBridgePublicBaseUrl,
  replayIndexPath,
  replayMessageUrl,
  replaySessionPath,
  replaySessionUrl,
};
