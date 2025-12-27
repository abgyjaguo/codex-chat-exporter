function sendError(res, httpStatus, code, message, details) {
  const payload = {
    error: {
      code: String(code || "error"),
      message: String(message || "Error"),
    },
  };
  if (details !== undefined) payload.error.details = details;
  res.status(httpStatus).json(payload);
}

module.exports = { sendError };

