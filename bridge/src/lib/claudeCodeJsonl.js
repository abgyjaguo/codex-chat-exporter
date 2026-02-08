function stripEnvironmentContextBlocks(text) {
  return String(text ?? "").replace(/<environment_context>[\s\S]*?(?:<\/environment_context>|$)/g, "");
}

function messageIdForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function mergeAdjacentBlocks(blocks) {
  const out = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== "object") continue;
    const t = typeof b.type === "string" ? b.type : "";
    const prev = out.length ? out[out.length - 1] : null;
    const pt = prev && typeof prev.type === "string" ? prev.type : "";

    if (t === "text" && pt === "text" && typeof b.text === "string" && typeof prev.text === "string") {
      const merged = [String(prev.text), String(b.text)].filter(Boolean).join("\n");
      out[out.length - 1] = { ...prev, text: merged };
      continue;
    }

    if (t === "thinking" && pt === "thinking" && typeof b.thinking === "string" && typeof prev.thinking === "string") {
      const merged = [String(prev.thinking), String(b.thinking)].filter(Boolean).join("\n");
      out[out.length - 1] = { ...prev, thinking: merged };
      continue;
    }

    out.push(b);
  }
  return out;
}

function applyBlockFilter(blocks, filter, toolNameById) {
  if (!filter || typeof filter !== "object") return blocks;

  const includeTypes = Array.isArray(filter.includeTypes) ? new Set(filter.includeTypes.map(String)) : null;
  const excludeTypes = Array.isArray(filter.excludeTypes) ? new Set(filter.excludeTypes.map(String)) : null;
  const includeTools = Array.isArray(filter.includeTools) ? new Set(filter.includeTools.map(String)) : null;
  const excludeTools = Array.isArray(filter.excludeTools) ? new Set(filter.excludeTools.map(String)) : null;

  const shouldKeep = (b) => {
    const t = typeof b?.type === "string" ? String(b.type) : "";
    if (includeTypes && includeTypes.size > 0 && !includeTypes.has(t)) return false;
    if (excludeTypes && excludeTypes.size > 0 && excludeTypes.has(t)) return false;

    if (t === "tool_use") {
      const name = typeof b?.name === "string" ? String(b.name) : "";
      if (includeTools && includeTools.size > 0 && !includeTools.has(name)) return false;
      if (excludeTools && excludeTools.size > 0 && excludeTools.has(name)) return false;
    }

    if (t === "tool_result") {
      const toolUseId = typeof b?.tool_use_id === "string" ? String(b.tool_use_id) : "";
      const toolName =
        typeof b?.tool_name === "string"
          ? String(b.tool_name)
          : toolUseId && toolNameById && typeof toolNameById.get === "function"
            ? toolNameById.get(toolUseId)
            : "";
      if (includeTools && includeTools.size > 0 && toolName && !includeTools.has(toolName)) return false;
      if (excludeTools && excludeTools.size > 0 && toolName && excludeTools.has(toolName)) return false;
    }

    return true;
  };

  return (Array.isArray(blocks) ? blocks : []).filter(shouldKeep);
}

function normalizeClaudeContentToBlocks(content, options, toolNameById) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  const blocks = [];

  const pushText = (rawText) => {
    let text = typeof rawText === "string" ? rawText : "";
    if (!includeEnvironmentContext) text = stripEnvironmentContextBlocks(text).trim();
    text = String(text ?? "");
    if (text.trim()) blocks.push({ type: "text", text });
  };

  const pushThinking = (rawThinking) => {
    let thinking = typeof rawThinking === "string" ? rawThinking : "";
    if (!includeEnvironmentContext) thinking = stripEnvironmentContextBlocks(thinking).trim();
    thinking = String(thinking ?? "");
    if (thinking.trim()) blocks.push({ type: "thinking", thinking });
  };

  if (typeof content === "string") {
    pushText(content);
    return blocks;
  }

  if (!Array.isArray(content)) return blocks;

  for (const item of content) {
    if (typeof item === "string") {
      pushText(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const t = typeof item.type === "string" ? String(item.type) : "";

    if (t === "text") {
      pushText(item.text);
      continue;
    }

    if (t === "thinking") {
      pushThinking(item.thinking);
      continue;
    }

    if (t === "tool_use") {
      if (!includeToolOutputs) continue;
      const name = typeof item.name === "string" && item.name.trim() ? String(item.name) : "Unknown tool";
      const id = typeof item.id === "string" && item.id.trim() ? String(item.id) : undefined;
      const input = item.input;
      if (id) toolNameById.set(id, name);
      blocks.push({ type: "tool_use", id, name, input });
      continue;
    }

    if (t === "tool_result") {
      if (!includeToolOutputs) continue;
      const toolUseIdRaw = item.tool_use_id ?? item.toolUseId;
      const tool_use_id = typeof toolUseIdRaw === "string" && toolUseIdRaw.trim() ? String(toolUseIdRaw) : undefined;
      let toolContent = item.content;

      if (typeof toolContent === "string" && !includeEnvironmentContext) {
        toolContent = stripEnvironmentContextBlocks(toolContent).trim();
      }

      const tool_name = tool_use_id ? toolNameById.get(tool_use_id) : undefined;
      const is_error = Boolean(item.is_error);

      if (typeof toolContent === "string" && !String(toolContent).trim()) continue;
      blocks.push({ type: "tool_result", tool_use_id, content: toolContent, is_error, ...(tool_name ? { tool_name } : {}) });
      continue;
    }

    if (includeToolOutputs) {
      blocks.push(item);
    }
  }

  return blocks;
}

function timeMs(ts) {
  const iso = typeof ts === "string" ? ts : "";
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function shallowStableStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function messageSignature(msg) {
  const role = typeof msg?.role === "string" ? msg.role : "";
  const text = typeof msg?.text === "string" ? msg.text : "";
  const toolCall = typeof msg?.tool_call_id === "string" ? msg.tool_call_id : "";
  const blocks = Array.isArray(msg?.blocks) ? msg.blocks : [];
  return `${role}|${toolCall}|${text}|${shallowStableStringify(blocks)}`;
}

function isAdjacentDuplicate(prev, next) {
  if (!prev || !next) return false;
  if (prev.role !== next.role) return false;
  if (prev.role === "tool") return false;

  const a = timeMs(prev.timestamp);
  const b = timeMs(next.timestamp);
  const closeInTime = a !== null && b !== null ? Math.abs(b - a) <= 2000 : String(prev.timestamp || "") === String(next.timestamp || "");
  if (!closeInTime) return false;

  return messageSignature(prev) === messageSignature(next);
}

function parseClaudeCodeJsonl(jsonlText, options = {}) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const mergeAdjacent = options.mergeAdjacent !== false;

  const lines = String(jsonlText || "").split(/\r?\n/);
  const messages = [];
  const warnings = [];

  const toolNameById = new Map();

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!obj || typeof obj !== "object") continue;
    if (obj.type !== "user" && obj.type !== "assistant") continue;
    if (!obj.message || typeof obj.message !== "object") continue;

    const roleRaw = typeof obj.message.role === "string" ? obj.message.role.toLowerCase() : obj.type;
    const role = roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
    if (!role) continue;

    let blocks = normalizeClaudeContentToBlocks(obj.message.content, options, toolNameById);
    blocks = applyBlockFilter(blocks, options.filter, toolNameById);
    if (mergeAdjacent) blocks = mergeAdjacentBlocks(blocks);

    const text = blocks
      .filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
      .map((b) => String(b.text))
      .filter(Boolean)
      .join("\n")
      .trim();

    let outRole = role;
    if (includeToolOutputs && blocks.length > 0) {
      const onlyToolResults = blocks.every((b) => b && typeof b === "object" && b.type === "tool_result");
      const onlyToolUses = blocks.every((b) => b && typeof b === "object" && b.type === "tool_use");
      if (role === "user" && onlyToolResults) outRole = "tool";
      if (role === "assistant" && onlyToolUses) outRole = "tool";
    }

    let messageText = text;
    let tool_call_id = undefined;

    if (outRole === "tool" && blocks.length > 0) {
      const first = blocks[0];
      if (first.type === "tool_use") {
        tool_call_id = typeof first.id === "string" ? first.id : undefined;
        if (!messageText.trim()) messageText = typeof first.name === "string" ? first.name : "Tool call";
      } else if (first.type === "tool_result") {
        tool_call_id = typeof first.tool_use_id === "string" ? first.tool_use_id : undefined;
        const c = first.content;
        if (!messageText.trim() && typeof c === "string" && c.trim()) messageText = c;
        if (!messageText.trim()) messageText = "Tool reply";
      }
    }

    if (!messageText.trim() && (!blocks || blocks.length === 0)) continue;

    const next = {
      role: outRole,
      timestamp: typeof obj.timestamp === "string" ? obj.timestamp : null,
      text: messageText,
      message_id: messageIdForIndex(messages.length),
      blocks: blocks && blocks.length ? blocks : undefined,
      ...(tool_call_id ? { tool_call_id } : {}),
    };

    const prev = messages.length ? messages[messages.length - 1] : null;
    if (prev && isAdjacentDuplicate(prev, next)) {
      continue;
    }

    messages.push(next);
  }

  return { messages, message_count: messages.length, warnings };
}

function filterClaudeCodeJsonlRaw(jsonlText, options = {}) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  if (includeToolOutputs && includeEnvironmentContext) {
    return String(jsonlText ?? "");
  }

  const lines = String(jsonlText ?? "").split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
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

    if (!obj || typeof obj !== "object") {
      out.push(line);
      continue;
    }

    if ((obj.type === "user" || obj.type === "assistant") && obj.message && typeof obj.message === "object") {
      const content = obj.message.content;
      if (typeof content === "string") {
        let next = content;
        if (!includeEnvironmentContext) next = stripEnvironmentContextBlocks(next);
        if (String(next || "").trim()) {
          obj.message.content = next;
          out.push(JSON.stringify(obj));
        }
        continue;
      }

      if (Array.isArray(content)) {
        const filtered = [];
        for (const item of content) {
          if (typeof item === "string") {
            let next = item;
            if (!includeEnvironmentContext) next = stripEnvironmentContextBlocks(next);
            if (String(next || "").trim()) filtered.push(next);
            continue;
          }
          if (!item || typeof item !== "object") continue;
          const t = typeof item.type === "string" ? String(item.type) : "";

          if (!includeToolOutputs && (t === "tool_use" || t === "tool_result")) continue;

          if (!includeEnvironmentContext) {
            if (t === "text" && typeof item.text === "string") {
              const next = stripEnvironmentContextBlocks(item.text);
              if (!String(next || "").trim()) continue;
              filtered.push({ ...item, text: next });
              continue;
            }
            if (t === "thinking" && typeof item.thinking === "string") {
              const next = stripEnvironmentContextBlocks(item.thinking);
              if (!String(next || "").trim()) continue;
              filtered.push({ ...item, thinking: next });
              continue;
            }
            if (t === "tool_result" && typeof item.content === "string") {
              const next = stripEnvironmentContextBlocks(item.content);
              if (!String(next || "").trim()) continue;
              filtered.push({ ...item, content: next });
              continue;
            }
          }

          filtered.push(item);
        }

        if (filtered.length > 0) {
          obj.message.content = filtered;
          out.push(JSON.stringify(obj));
        }
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

module.exports = { filterClaudeCodeJsonlRaw, parseClaudeCodeJsonl };

