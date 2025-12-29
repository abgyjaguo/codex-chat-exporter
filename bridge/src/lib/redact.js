function redactText(text) {
  let out = String(text ?? "");

  out = out.replace(
    /(Authorization:\s*Bearer\s+)[^\s]+/gi,
    "$1[REDACTED_TOKEN]",
  );

  out = out.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]");

  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );

  return out;
}

module.exports = { redactText };
