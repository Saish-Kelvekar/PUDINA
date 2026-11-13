const AppError = require("../utils/AppError");
const { DEFAULT_WEIGHTS } = require("../config/constants");

// A point is { "node_id": "n5" } or { "lat": 12.93, "lng": 77.55 }
function checkPoint(p, field, errors) {
  if (!p || typeof p !== "object") return errors.push({ field, issue: "required" });
  if (typeof p.node_id === "string" && p.node_id) return;
  const latOk = typeof p.lat === "number" && p.lat >= -90 && p.lat <= 90;
  const lngOk = typeof p.lng === "number" && p.lng >= -180 && p.lng <= 180;
  if (!latOk || !lngOk) errors.push({ field, issue: 'give { "node_id" } or numeric { "lat", "lng" }' });
}

function validateCompare(body) {
  const errors = [];
  checkPoint(body.source, "source", errors);
  checkPoint(body.destination, "destination", errors);

  let weights = DEFAULT_WEIGHTS;
  if (body.weights !== undefined) {
    weights = { ...DEFAULT_WEIGHTS };
    for (const [k, v] of Object.entries(body.weights || {})) {
      if (!(k in DEFAULT_WEIGHTS)) errors.push({ field: `weights.${k}`, issue: "unknown factor" });
      else if (typeof v !== "number" || v < 0) errors.push({ field: `weights.${k}`, issue: "must be a number >= 0" });
      else weights[k] = v;
    }
    if (Object.values(weights).every((v) => v === 0)) errors.push({ field: "weights", issue: "at least one weight must be above 0" });
  }
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", errors);
  return { source: body.source, destination: body.destination, weights };
}

module.exports = { validateCompare };
