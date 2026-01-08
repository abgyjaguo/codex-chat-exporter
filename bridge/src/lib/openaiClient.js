async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAiBaseUrl() {
  const raw = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function getOpenAiModel() {
  // Keep this configurable; avoid assuming a single “latest” model name.
  return String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}

async function createChatCompletion({ apiKey, model, messages, temperature = 0.2, timeoutMs = 60000 }) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const baseUrl = getOpenAiBaseUrl();
  const resolvedModel = String(model || getOpenAiModel()).trim();

  const url = `${baseUrl}/chat/completions`;
  const payload = {
    model: resolvedModel,
    messages,
    temperature,
  };

  const { ok, status, json, text } = await fetchJsonWithTimeout(url, {
    timeoutMs,
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!ok) {
    const message =
      (json && json.error && (json.error.message || json.error.code)) ||
      (text ? text.slice(0, 400) : "") ||
      `OpenAI request failed (${status})`;
    throw new Error(String(message));
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing choices[0].message.content");
  }

  return content;
}

module.exports = {
  createChatCompletion,
  getOpenAiBaseUrl,
  getOpenAiModel,
};

