function messageIdForIndex(index) {
  const n = Number(index) + 1;
  return `m-${String(n).padStart(6, "0")}`;
}

function isValidMessageId(messageId) {
  return /^m-\d{6}$/.test(String(messageId || ""));
}

module.exports = { isValidMessageId, messageIdForIndex };
