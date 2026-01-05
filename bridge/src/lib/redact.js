function redactPhoneNumbers(text) {
  const input = String(text ?? "");

  return input.replace(
    /(^|[^0-9A-Za-z_])(\+?(?:\(\d|\d)[\d\s().-]{5,}\d)(?=[^0-9A-Za-z_]|$)/g,
    (match, prefix, candidate) => {
      const digits = String(candidate).replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) return match;

      if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(candidate)) return match;

      return `${prefix}[REDACTED_PHONE]`;
    },
  );
}

function redactText(text) {
  let out = String(text ?? "");

  out = out.replace(
    /(Authorization:\s*Bearer\s+)[^\s]+/gi,
    "$1[REDACTED_TOKEN]",
  );

  out = out.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]");

  out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, "[REDACTED_GITHUB_TOKEN]");
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g, "[REDACTED_GITHUB_TOKEN]");

  out = out.replace(/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]");

  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );

  out = out.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[REDACTED_EMAIL]",
  );

  out = redactPhoneNumbers(out);

  return out;
}

function redactForOpenNotebookMarkdown(markdown) {
  return redactText(markdown);
}

function redactForExportMarkdown(markdown) {
  return redactText(markdown);
}

function redactForOpenAIGenerationInput(text) {
  return redactText(text);
}

module.exports = {
  redactText,
  redactForOpenNotebookMarkdown,
  redactForExportMarkdown,
  redactForOpenAIGenerationInput,
};
