function extractTextFromResponseMessageContent(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const t = item.type;
    if (t === "input_text" || t === "output_text" || t === "text") {
      if (typeof item.text === "string" && item.text) parts.push(item.text);
    }
  }
  return parts.join("");
}

function looksLikeEnvironmentContext(text) {
  const t = String(text || "").trimStart();
  return t.startsWith("<environment_context>");
}

function messageIdForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function isToolOutputEntry(obj) {
  return (
    obj &&
    obj.type === "response_item" &&
    obj.payload &&
    typeof obj.payload === "object" &&
    obj.payload.type === "function_call_output"
  );
}

function isEnvironmentContextEntry(obj) {
  if (!obj || typeof obj !== "object") return false;

  if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
    const p = obj.payload;
    if (p.type === "user_message" && typeof p.message === "string") {
      return looksLikeEnvironmentContext(p.message);
    }
    if (p.type === "agent_message" && typeof p.message === "string") {
      return looksLikeEnvironmentContext(p.message);
    }
    if (p.type === "agent_reasoning" && typeof p.text === "string") {
      return looksLikeEnvironmentContext(p.text);
    }
  }

  if (obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
    const p = obj.payload;
    if (p.type === "message" && typeof p.role === "string") {
      const text = extractTextFromResponseMessageContent(p.content);
      return looksLikeEnvironmentContext(text);
    }
  }

  return false;
}

function filterCodexJsonlRaw(jsonlText, options = {}) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  if (includeToolOutputs && includeEnvironmentContext) {
    return String(jsonlText ?? "");
  }

  const lines = String(jsonlText ?? "").split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const trimmed = String(line || "");
    if (!trimmed.trim()) {
      out.push(line);
      continue;
    }

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      out.push(line);
      continue;
    }

    if (!includeToolOutputs && isToolOutputEntry(obj)) continue;
    if (!includeEnvironmentContext && isEnvironmentContextEntry(obj)) continue;

    out.push(line);
  }

  return out.join("\n");
}

function parseCodexJsonl(jsonlText, options = {}) {
  const warningLimit = Number.isFinite(options.warningLimit) ? options.warningLimit : 50;
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;
  const warnings = [];
  let suppressedWarnings = 0;

  const pushWarning = (w) => {
    if (warnings.length < warningLimit) warnings.push(w);
    else suppressedWarnings += 1;
  };

  const lines = String(jsonlText || "").split(/\r?\n/);

  const messageSources = detectMessageSources(lines);

  const messages = [];
  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (err) {
      pushWarning({
        code: "invalid_json_line",
        message: `Line ${lineNo} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    if (!obj || typeof obj !== "object") continue;

    const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;

    if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
      const t = obj.payload.type;
      if (t === "user_message" && typeof obj.payload.message === "string") {
        const text = obj.payload.message;
        if (!includeEnvironmentContext && looksLikeEnvironmentContext(text)) continue;
        messages.push({ role: "user", timestamp: ts, text });
      }
      if (t === "agent_message" && typeof obj.payload.message === "string") {
        const text = obj.payload.message;
        if (!includeEnvironmentContext && looksLikeEnvironmentContext(text)) continue;
        messages.push({ role: "assistant", timestamp: ts, text });
      }
      continue;
    }

    if (obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
      const p = obj.payload;

      if (includeToolOutputs && p.type === "function_call_output" && typeof p.call_id === "string") {
        const text = typeof p.output === "string" ? p.output : "";
        if (text.trim()) {
          messages.push({ role: "tool", timestamp: ts, tool_call_id: p.call_id, text });
        }
        continue;
      }

      if (p.type === "message" && typeof p.role === "string") {
        const role = p.role;
        if (messageSources.hasEventUserMessage && role === "user") continue;
        if (messageSources.hasEventAgentMessage && role === "assistant") continue;

        const text = extractTextFromResponseMessageContent(p.content);
        if (!text.trim()) continue;
        if (!includeEnvironmentContext && looksLikeEnvironmentContext(text)) continue;

        if (role === "user" || role === "assistant") {
          messages.push({ role, timestamp: ts, text });
        }
      }
      continue;
    }
  }

  if (suppressedWarnings > 0) {
    warnings.push({
      code: "warnings_truncated",
      message: `Suppressed ${suppressedWarnings} additional warnings`,
    });
  }

  const normalized = messages.map((m, i) => ({ ...m, message_id: messageIdForIndex(i) }));

  return { messages: normalized, message_count: normalized.length, warnings };
}

function detectMessageSources(lines) {
  const flags = {
    hasEventUserMessage: false,
    hasEventAgentMessage: false,
  };

  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!obj || typeof obj !== "object") continue;

    if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
      const t = obj.payload.type;
      if (t === "user_message") flags.hasEventUserMessage = true;
      if (t === "agent_message") flags.hasEventAgentMessage = true;
      if (flags.hasEventUserMessage && flags.hasEventAgentMessage) return flags;
    }
  }

  return flags;
}

module.exports = { filterCodexJsonlRaw, parseCodexJsonl };

