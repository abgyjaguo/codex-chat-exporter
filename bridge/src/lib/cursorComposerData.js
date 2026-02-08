function messageIdForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function msToIso(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function truncateString(s, maxChars) {
  const raw = String(s ?? "");
  if (!raw) return "";
  const max = typeof maxChars === "number" && Number.isFinite(maxChars) ? maxChars : 50_000;
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

function joinWithSingleNewline(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left) return right;
  if (!right) return left;
  if (left.endsWith("\n") || right.startsWith("\n")) return left + right;
  return left + "\n" + right;
}

function getAtPath(obj, dottedPath) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(dottedPath || "")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function firstNonEmptyString(obj, paths) {
  const list = Array.isArray(paths) ? paths : [];
  for (const p of list) {
    const v = getAtPath(obj, p);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractPlainTextFromRichValue(value, options = {}) {
  const maxParts = typeof options.maxParts === "number" && Number.isFinite(options.maxParts) ? options.maxParts : 200;
  const maxDepth = typeof options.maxDepth === "number" && Number.isFinite(options.maxDepth) ? options.maxDepth : 8;

  const parts = [];
  const seen = new Set();

  const walk = (node, depth) => {
    if (parts.length >= maxParts) return;
    if (depth > maxDepth) return;
    if (!node) return;

    if (typeof node === "string") {
      const t = node.trim();
      if (t) parts.push(t);
      return;
    }

    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (typeof node.text === "string") {
      const t = node.text.trim();
      if (t) parts.push(t);
    }

    const childKeys = ["content", "children", "nodes"];
    for (const k of childKeys) {
      const child = node[k];
      if (Array.isArray(child)) {
        for (const item of child) walk(item, depth + 1);
      }
    }
  };

  let start = value;
  if (typeof start === "string") {
    const t = start.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        start = JSON.parse(t);
      } catch {
        // keep string
      }
    }
  }

  walk(start, 0);
  return parts.join("\n").trim();
}

function isProbablyNonContentKey(key) {
  const k = String(key || "").toLowerCase();
  return (
    k === "id" ||
    k === "bubbleid" ||
    k === "serverbubbleid" ||
    k === "type" ||
    k === "role" ||
    k === "timestamp" ||
    k === "createdat" ||
    k === "lastupdatedat" ||
    k === "composerid"
  );
}

function collectStringLeavesByInterestingKey(obj, options = {}) {
  const keyRe =
    options.keyRe instanceof RegExp
      ? options.keyRe
      : /(text|message|markdown|content|diff|patch|edit|thinking|reasoning|analysis|thought)/i;
  const maxParts = typeof options.maxParts === "number" && Number.isFinite(options.maxParts) ? options.maxParts : 25;
  const maxDepth = typeof options.maxDepth === "number" && Number.isFinite(options.maxDepth) ? options.maxDepth : 6;

  const parts = [];
  const seen = new Set();

  const walk = (node, depth) => {
    if (parts.length >= maxParts) return;
    if (depth > maxDepth) return;
    if (!node) return;

    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      if (parts.length >= maxParts) break;
      if (isProbablyNonContentKey(k)) continue;

      if (typeof v === "string") {
        if (keyRe.test(k) && v.trim()) parts.push(v.trim());
        continue;
      }

      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };

  walk(obj, 0);
  return parts;
}

function normalizeCursorBubbleBlocks(bubble, options = {}) {
  const maxChars = typeof options.maxChars === "number" && Number.isFinite(options.maxChars) ? options.maxChars : 50_000;

  const blocks = [];
  if (!bubble || typeof bubble !== "object") return blocks;

  const explicitBlocks =
    Array.isArray(bubble.blocks) ? bubble.blocks : Array.isArray(bubble.contentBlocks) ? bubble.contentBlocks : Array.isArray(bubble.content)
      ? bubble.content
      : null;

  if (explicitBlocks) {
    for (const b of explicitBlocks) {
      if (typeof b === "string") {
        const t = b.trim();
        if (t) blocks.push({ type: "text", text: truncateString(t, maxChars) });
        continue;
      }
      if (!b || typeof b !== "object") continue;
      const t = typeof b.type === "string" ? b.type : "";

      if (t === "text" || t === "markdown") {
        const text = typeof b.text === "string" ? b.text : typeof b.content === "string" ? b.content : "";
        if (String(text || "").trim()) blocks.push({ type: "text", text: truncateString(text.trim(), maxChars) });
        continue;
      }

      if (t === "thinking") {
        const thinking = typeof b.thinking === "string" ? b.thinking : typeof b.text === "string" ? b.text : "";
        if (String(thinking || "").trim()) blocks.push({ type: "thinking", thinking: truncateString(thinking.trim(), maxChars) });
        continue;
      }

      if (t === "diff") {
        const diff = typeof b.diff === "string" ? b.diff : typeof b.text === "string" ? b.text : "";
        if (String(diff || "").trim()) blocks.push({ type: "diff", diff: truncateString(diff.trim(), maxChars) });
        continue;
      }

      if (t === "edit") {
        const edit = Object.prototype.hasOwnProperty.call(b, "edit") ? b.edit : Object.prototype.hasOwnProperty.call(b, "data") ? b.data : b;
        if (edit != null) blocks.push({ type: "edit", edit });
        continue;
      }

      if (t === "tool_use" && (typeof b.name === "string" || typeof b.tool_name === "string")) {
        const id = typeof b.id === "string" ? b.id : typeof b.tool_use_id === "string" ? b.tool_use_id : undefined;
        const name = typeof b.name === "string" ? b.name : String(b.tool_name || "");
        const input = Object.prototype.hasOwnProperty.call(b, "input") ? b.input : undefined;
        blocks.push({ type: "tool_use", id, name, input });
        continue;
      }

      if (t === "tool_result") {
        const toolUseId = typeof b.tool_use_id === "string" ? b.tool_use_id : typeof b.toolUseId === "string" ? b.toolUseId : undefined;
        const content = Object.prototype.hasOwnProperty.call(b, "content") ? b.content : undefined;
        const isError = b.is_error === true;
        const toolName = typeof b.tool_name === "string" ? b.tool_name : typeof b.toolName === "string" ? b.toolName : undefined;
        blocks.push({ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError, tool_name: toolName });
        continue;
      }

      // Preserve unknown block shapes as an "edit" block for visibility.
      blocks.push({ type: "edit", edit: b });
    }
  }

  const text =
    (typeof bubble.text === "string" && bubble.text.trim()) ||
    firstNonEmptyString(bubble, ["markdown", "message", "response.text", "assistantText", "assistant_message", "finalText"]) ||
    "";
  const richText =
    (!text && (typeof bubble.richText === "string" || (bubble.richText && typeof bubble.richText === "object")))
      ? extractPlainTextFromRichValue(bubble.richText)
      : "";
  const bestText = text || richText;
  if (bestText) blocks.unshift({ type: "text", text: truncateString(bestText.trim(), maxChars) });

  const thinking = firstNonEmptyString(bubble, [
    "thinking.text",
    "thinking",
    "reasoning",
    "analysis",
    "thought",
    "thoughts",
    "internalThought",
    "internal_thought",
  ]);
  if (thinking) blocks.push({ type: "thinking", thinking: truncateString(thinking.trim(), maxChars) });

  const diff = firstNonEmptyString(bubble, ["diff", "patch", "unifiedDiff", "unified_diff", "gitDiff", "git_diff"]);
  if (diff) blocks.push({ type: "diff", diff: truncateString(diff.trim(), maxChars) });

  const edits = getAtPath(bubble, "edits") ?? getAtPath(bubble, "edit") ?? getAtPath(bubble, "fileEdits") ?? getAtPath(bubble, "file_edits");
  if (edits != null && (Array.isArray(edits) ? edits.length > 0 : typeof edits === "object")) {
    blocks.push({ type: "edit", edit: edits });
  }

  const toolCalls = getAtPath(bubble, "toolCalls") ?? getAtPath(bubble, "tool_calls") ?? getAtPath(bubble, "functionCalls") ?? getAtPath(bubble, "function_calls");
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      if (!call || typeof call !== "object") continue;
      const id = typeof call.id === "string" ? call.id : typeof call.call_id === "string" ? call.call_id : typeof call.callId === "string" ? call.callId : undefined;
      const name = typeof call.name === "string" ? call.name : typeof call.tool_name === "string" ? call.tool_name : typeof call.toolName === "string" ? call.toolName : "";
      let input =
        Object.prototype.hasOwnProperty.call(call, "input")
          ? call.input
          : Object.prototype.hasOwnProperty.call(call, "arguments")
            ? call.arguments
            : Object.prototype.hasOwnProperty.call(call, "args")
              ? call.args
              : undefined;
      if (typeof input === "string") {
        const tt = input.trim();
        if (tt.startsWith("{") || tt.startsWith("[")) {
          try {
            input = JSON.parse(tt);
          } catch {
            // keep string
          }
        }
      }
      if (String(name || "").trim()) blocks.push({ type: "tool_use", id, name, input });
      else blocks.push({ type: "edit", edit: call });
    }
  }

  const toolResults =
    getAtPath(bubble, "toolResults") ??
    getAtPath(bubble, "tool_results") ??
    getAtPath(bubble, "functionCallOutputs") ??
    getAtPath(bubble, "function_call_outputs");
  if (Array.isArray(toolResults)) {
    for (const r of toolResults) {
      if (!r || typeof r !== "object") continue;
      const toolUseId = typeof r.tool_use_id === "string" ? r.tool_use_id : typeof r.call_id === "string" ? r.call_id : typeof r.callId === "string" ? r.callId : undefined;
      const toolName = typeof r.tool_name === "string" ? r.tool_name : typeof r.name === "string" ? r.name : typeof r.toolName === "string" ? r.toolName : undefined;
      let content = Object.prototype.hasOwnProperty.call(r, "content") ? r.content : Object.prototype.hasOwnProperty.call(r, "output") ? r.output : r;
      if (typeof content === "string") {
        const tt = content.trim();
        if (tt.startsWith("{") || tt.startsWith("[")) {
          try {
            content = JSON.parse(tt);
          } catch {
            // keep string
          }
        }
      }
      blocks.push({ type: "tool_result", tool_use_id: toolUseId, content, is_error: r.is_error === true, tool_name: toolName });
    }
  }

  if (blocks.length === 0 && typeof bubble === "object") {
    const fallback = collectStringLeavesByInterestingKey(bubble);
    const joined = fallback.join("\n").trim();
    if (joined) blocks.push({ type: "text", text: truncateString(joined, maxChars) });
  }

  return blocks;
}

function blockToText(block) {
  if (!block || typeof block !== "object") return "";
  const t = block.type;
  if (t === "text") return typeof block.text === "string" ? block.text : "";
  if (t === "thinking") return typeof block.thinking === "string" ? block.thinking : "";
  if (t === "diff") return typeof block.diff === "string" ? block.diff : "";
  if (t === "tool_use") return `[tool_use] ${String(block.name || "").trim()}`.trim();
  if (t === "tool_result") {
    const content = Object.prototype.hasOwnProperty.call(block, "content") ? block.content : "";
    if (typeof content === "string") return content;
    try {
      const s = JSON.stringify(content);
      return s && s !== "null" ? s : "Tool result";
    } catch {
      return "Tool result";
    }
  }
  if (t === "edit") {
    const edit = Object.prototype.hasOwnProperty.call(block, "edit") ? block.edit : "";
    if (typeof edit === "string") return edit;
    try {
      const s = JSON.stringify(edit);
      return s && s !== "null" ? s : "";
    } catch {
      return "";
    }
  }
  return "";
}

function deriveTextFromBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const parts = [];
  for (const b of list) {
    const t = blockToText(b);
    if (String(t || "").trim()) parts.push(String(t).trim());
  }
  return parts.join("\n").trim();
}

function normalizeCursorBlocks(blocks, options = {}) {
  const includeTypes = Array.isArray(options.includeTypes) ? options.includeTypes.map(String) : null;
  const excludeTypes = Array.isArray(options.excludeTypes) ? new Set(options.excludeTypes.map(String)) : null;
  const mergeAdjacent = options.mergeAdjacent !== false;

  let out = Array.isArray(blocks) ? blocks.slice() : [];

  if (includeTypes && includeTypes.length > 0) {
    const allow = new Set(includeTypes);
    out = out.filter((b) => b && typeof b === "object" && allow.has(String(b.type || "")));
  }

  if (excludeTypes && excludeTypes.size > 0) {
    out = out.filter((b) => b && typeof b === "object" && !excludeTypes.has(String(b.type || "")));
  }

  if (!mergeAdjacent) return out;

  const merged = [];
  for (const b of out) {
    if (!b || typeof b !== "object") continue;
    const prev = merged.length > 0 ? merged[merged.length - 1] : null;
    if (prev && prev.type === b.type) {
      if (b.type === "text" && typeof prev.text === "string" && typeof b.text === "string") {
        prev.text = joinWithSingleNewline(prev.text, b.text);
        continue;
      }
      if (b.type === "thinking" && typeof prev.thinking === "string" && typeof b.thinking === "string") {
        prev.thinking = joinWithSingleNewline(prev.thinking, b.thinking);
        continue;
      }
      if (b.type === "diff" && typeof prev.diff === "string" && typeof b.diff === "string") {
        prev.diff = joinWithSingleNewline(prev.diff, b.diff);
        continue;
      }
    }
    merged.push({ ...b });
  }
  return merged;
}

function mergeAdjacentMessages(messages) {
  const out = [];
  const list = Array.isArray(messages) ? messages : [];

  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const prev = out.length > 0 ? out[out.length - 1] : null;
    if (
      prev &&
      prev.role === m.role &&
      prev.timestamp === m.timestamp &&
      !prev.tool_call_id &&
      !m.tool_call_id
    ) {
      const mergedBlocks = normalizeCursorBlocks([...(prev.blocks || []), ...(m.blocks || [])], { mergeAdjacent: true });
      prev.blocks = mergedBlocks;
      prev.text = truncateString(deriveTextFromBlocks(mergedBlocks), 50_000);
      continue;
    }
    out.push({ ...m });
  }

  return out;
}

function parseCursorComposerDataJson(text, opts = {}) {
  let obj;
  try {
    obj = JSON.parse(String(text || ""));
  } catch {
    return { messages: [], message_count: 0, warnings: [{ code: "invalid_json", message: "Invalid Cursor composerData JSON" }] };
  }

  const warnings = [];

  const bubbleReader = opts && typeof opts === "object" ? opts.bubbleReader : null;
  const maxBubblesRaw = typeof opts.maxBubbles === "number" ? opts.maxBubbles : 800;
  const maxBubbles = Math.max(1, Math.min(2000, Math.floor(maxBubblesRaw)));
  const includeTypes = Array.isArray(opts.includeBlockTypes) ? opts.includeBlockTypes : null;
  const excludeTypes = Array.isArray(opts.excludeBlockTypes) ? opts.excludeBlockTypes : null;
  const mergeBlocks = opts.mergeAdjacentBlocks !== false;
  const mergeMessages = opts.mergeAdjacentMessages === true;

  const composerId = typeof obj.composerId === "string" ? obj.composerId.trim() : "";
  const headers = Array.isArray(obj.fullConversationHeadersOnly) ? obj.fullConversationHeadersOnly : null;

  // Support Cursor variants that store an inline bubbles array (e.g. composerData/bubbles).
  const inlineBubbles = Array.isArray(obj.bubbles) ? obj.bubbles : Array.isArray(obj.bubbleHistory) ? obj.bubbleHistory : null;
  if (inlineBubbles && inlineBubbles.length > 0) {
    const rawMessages = [];
    for (const b of inlineBubbles.slice(0, maxBubbles)) {
      if (!b || typeof b !== "object") continue;
      const bubbleType = typeof b.type === "number" ? b.type : null;
      const role = bubbleType === 1 ? "user" : bubbleType === 2 ? "assistant" : "system";
      const blocks = normalizeCursorBlocks(normalizeCursorBubbleBlocks(b), { includeTypes, excludeTypes, mergeAdjacent: mergeBlocks });
      if (blocks.length === 0) continue;
      rawMessages.push({ role, timestamp: null, blocks, text: truncateString(deriveTextFromBlocks(blocks), 50_000) });
    }

    const finalMessages = mergeMessages ? mergeAdjacentMessages(rawMessages) : rawMessages;
    const normalized = finalMessages.map((m, i) => ({ ...m, message_id: messageIdForIndex(i) }));
    return { messages: normalized, message_count: normalized.length, warnings };
  }

  if (bubbleReader && composerId && headers && headers.length > 0) {
    const rawMessages = [];

    for (const h of headers) {
      if (rawMessages.length >= maxBubbles) {
        warnings.push({ code: "truncated", message: `Cursor conversation truncated at ${maxBubbles} messages.` });
        break;
      }
      if (!h || typeof h !== "object") continue;
      const bubbleId = typeof h.bubbleId === "string" ? h.bubbleId : "";
      const bubbleType = typeof h.type === "number" ? h.type : null;
      if (!bubbleId) continue;

      const bubbleKey = `bubbleId:${composerId}:${bubbleId}`;
      const bubbleRaw = typeof bubbleReader.get === "function" ? bubbleReader.get(bubbleKey) : null;
      if (!bubbleRaw) continue;

      let bubble;
      try {
        bubble = JSON.parse(String(bubbleRaw));
      } catch {
        continue;
      }

      const role = bubbleType === 1 ? "user" : bubbleType === 2 ? "assistant" : "system";
      const blocks = normalizeCursorBlocks(normalizeCursorBubbleBlocks(bubble), { includeTypes, excludeTypes, mergeAdjacent: mergeBlocks });
      if (blocks.length === 0) continue;

      rawMessages.push({
        role,
        timestamp: null,
        blocks,
        text: truncateString(deriveTextFromBlocks(blocks), 50_000),
      });
    }

    if (rawMessages.length > 0) {
      const finalMessages = mergeMessages ? mergeAdjacentMessages(rawMessages) : rawMessages;
      const normalized = finalMessages.map((m, i) => ({ ...m, message_id: messageIdForIndex(i) }));
      return { messages: normalized, message_count: normalized.length, warnings };
    }

    warnings.push({
      code: "empty_conversation",
      message: "Cursor fullConversationHeadersOnly present, but no bubble content was found.",
    });
  }

  const prompt =
    typeof obj.text === "string" && obj.text.trim()
      ? obj.text.trim()
      : typeof obj.richText === "string" && obj.richText.trim()
        ? obj.richText.trim()
        : "";
  const timestamp = msToIso(obj.lastUpdatedAt) || msToIso(obj.createdAt);

  if (!prompt) warnings.push({ code: "empty_prompt", message: "Cursor composerData.text is empty; imported with no user message" });

  const messages = [];
  if (prompt) {
    messages.push({ role: "user", timestamp, text: truncateString(prompt, 50_000), blocks: [{ type: "text", text: truncateString(prompt, 50_000) }] });
  }

  const normalized = messages.map((m, i) => ({ ...m, message_id: messageIdForIndex(i) }));
  return { messages: normalized, message_count: normalized.length, warnings };
}

module.exports = {
  parseCursorComposerDataJson,
  normalizeCursorBubbleBlocks,
  normalizeCursorBlocks,
};
