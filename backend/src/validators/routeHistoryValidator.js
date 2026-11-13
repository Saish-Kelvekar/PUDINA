const AppError = require("../utils/AppError");

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "VALIDATION_ERROR", "id must be a positive whole number");
  return id;
}

// ?limit=20&offset=0
function validateListQuery(q) {
  const limit = q.limit === undefined ? 20 : Number(q.limit);
  const offset = q.offset === undefined ? 0 : Number(q.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError(400, "VALIDATION_ERROR", "limit must be 1-100");
  if (!Number.isInteger(offset) || offset < 0) throw new AppError(400, "VALIDATION_ERROR", "offset must be 0 or more");
  return { limit, offset };
}

// { "route_id": "r2" } to choose, { "route_id": null } to clear the choice
function validateChoose(b) {
  if (!b || !("route_id" in b)) throw new AppError(400, "VALIDATION_ERROR", 'Send { "route_id": "r2" } (or null to clear)');
  if (b.route_id === null) return null;
  if (typeof b.route_id !== "string" || !/^r\d+$/.test(b.route_id)) {
    throw new AppError(400, "VALIDATION_ERROR", 'route_id looks like "r1".."r5"');
  }
  return b.route_id;
}

module.exports = { parseId, validateListQuery, validateChoose };
