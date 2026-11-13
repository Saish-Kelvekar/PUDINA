function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

module.exports = { ok, fail };