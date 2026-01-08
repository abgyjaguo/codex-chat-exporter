const { redactText } = require("./redact");
const { messageIdForIndex } = require("./messageIds");
const { renderEvidenceLinks, renderPlaceholderNotes } = require("./openNotebookContent");
const { createChatCompletion } = require("./openaiClient");

function normalizeProvider(provider) {
  const p = String(provider || "").trim().toLowerCase();
  if (p === "openai") return "openai";
  return "placeholder";
}

function defaultNoteKinds() {
  return ["summary", "study-pack", "milestones"];
}

function normalizeNoteKinds(kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) return defaultNoteKinds();
  const wanted = new Set(
    kinds
      .map((k) => String(k || "").trim().toLowerCase())
      .filter(Boolean)
      .map((k) => k.replace(/_/g, "-")),
  );
  return defaultNoteKinds().filter((k) => wanted.has(k));
}

function pickNotes(allNotes, kinds) {
  const out = {};
  for (const kind of kinds) {
    out[kind] = allNotes[kind] || allNotes[kind.replace(/_/g, "-")] || "";
  }
  return out;
}

function pickEvidenceAnchors(messages, max = 3) {
  const out = [];
  const limit = Math.max(0, Math.min(50, Number(max) || 0));
  for (let i = 0; i < messages.length && out.length < limit; i += 1) {
    const m = messages[i] || {};
    const id = typeof m.message_id === "string" && m.message_id ? m.message_id : messageIdForIndex(i);
    out.push(id);
  }
  return out;
}

function sanitizeMessagesForGeneration(messages, options = {}) {
  const includeToolMessages = !!options.includeToolMessages;
  const includeSystemMessages = !!options.includeSystemMessages;

  return (Array.isArray(messages) ? messages : []).filter((m) => {
    const role = m && typeof m === "object" ? String(m.role || "").toLowerCase() : "";
    if (role === "user" || role === "assistant") return true;
    if (role === "tool") return includeToolMessages;
    if (role === "system") return includeSystemMessages;
    return false;
  });
}

function buildTranscriptForPrompt(messages, options = {}) {
  const maxMessages = Number.isFinite(options.maxMessages) ? options.maxMessages : 80;
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : 20000;

  const slice = messages.length > maxMessages ? messages.slice(messages.length - maxMessages) : messages;
  const lines = [];

  for (let i = 0; i < slice.length; i += 1) {
    const m = slice[i] || {};
    const idx = messages.length > maxMessages ? messages.length - slice.length + i : i;
    const id = typeof m.message_id === "string" && m.message_id ? m.message_id : messageIdForIndex(idx);
    const role = typeof m.role === "string" ? m.role : "unknown";
    const ts = typeof m.timestamp === "string" ? m.timestamp : "";
    const header = ts ? `## ${id} ${role} (${ts})` : `## ${id} ${role}`;
    const body = redactText(typeof m.text === "string" ? m.text : "");
    lines.push(header, "", body, "");
    if (lines.join("\n").length > maxChars) break;
  }

  const transcript = lines.join("\n").trimEnd();
  return transcript.length > maxChars ? transcript.slice(0, maxChars) : transcript;
}

function promptForKind(kind) {
  switch (kind) {
    case "summary":
      return [
        "Write a Markdown session summary.",
        "Requirements:",
        "- Focus on key decisions, outcomes, and next steps.",
        "- Do NOT include secrets/tokens; avoid copying credentials.",
        "- Do NOT invent facts; if uncertain, say so.",
        "- When referencing specific moments, cite message ids like `m-000123`.",
      ].join("\n");
    case "study-pack":
      return [
        "Write a Markdown study pack for this session.",
        "Requirements:",
        "- Summarize concepts and provide a checklist of next learning steps.",
        "- Include a small quiz or exercises (optional).",
        "- Cite message ids like `m-000123` where relevant.",
      ].join("\n");
    case "milestones":
      return [
        "Write a Markdown milestones + evidence map.",
        "Requirements:",
        "- List milestones in chronological order.",
        "- For each milestone, add evidence references using message ids like `m-000123`.",
      ].join("\n");
    default:
      return "Write a Markdown note for this session.";
  }
}

async function generateOpenAiNotes({ noteKinds, messages, options = {} }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.code = "missing_openai_key";
    throw err;
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is not available. Use Node.js 18+.");
  }

  const sanitized = sanitizeMessagesForGeneration(messages, options);
  const transcript = buildTranscriptForPrompt(sanitized, {
    maxMessages: Number(process.env.BRIDGE_OPENAI_MAX_MESSAGES || 80),
    maxChars: Number(process.env.BRIDGE_OPENAI_MAX_CHARS || 20000),
  });

  const out = {};
  for (const kind of noteKinds) {
    const systemPrompt = promptForKind(kind);
    const userPrompt = [
      "# Transcript",
      "",
      transcript || "(empty transcript)",
      "",
      "Return only Markdown.",
    ].join("\n");

    const markdown = await createChatCompletion({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
      temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
    });

    out[kind] = redactText(markdown || "").trimEnd();
  }

  return out;
}

function appendEvidenceSection(markdown, evidenceLines) {
  const lines = Array.isArray(evidenceLines) ? evidenceLines : [];
  if (lines.length === 0) return String(markdown || "").trimEnd();

  const base = String(markdown || "").trimEnd();
  return [base, "", "## Evidence Links", ...lines].join("\n").trimEnd();
}

async function generateNotes({
  provider,
  noteKinds,
  project,
  session,
  project_id,
  session_id,
  sourceId = null,
  messages,
  replayBaseUrl = null,
  generationOptions = {},
}) {
  const normalizedProvider = normalizeProvider(provider);
  const kinds = normalizeNoteKinds(noteKinds);
  const safeMessages = Array.isArray(messages) ? messages : [];

  const anchors = pickEvidenceAnchors(safeMessages, 3);
  const evidenceLines = renderEvidenceLinks({ sourceId, anchors, project_id, session_id, replayBaseUrl });

  if (normalizedProvider === "openai") {
    const generated = await generateOpenAiNotes({
      noteKinds: kinds,
      messages: safeMessages,
      options: generationOptions,
    });

    const out = {};
    for (const kind of kinds) {
      out[kind] = appendEvidenceSection(generated[kind] || "", evidenceLines);
    }
    return { provider: normalizedProvider, notes: out };
  }

  const placeholderAll = renderPlaceholderNotes({
    project,
    session,
    project_id,
    session_id,
    sourceId,
    messages: safeMessages,
    replayBaseUrl,
  });

  return { provider: normalizedProvider, notes: pickNotes(placeholderAll, kinds) };
}

module.exports = {
  generateNotes,
  normalizeProvider,
  normalizeNoteKinds,
  sanitizeMessagesForGeneration,
};

