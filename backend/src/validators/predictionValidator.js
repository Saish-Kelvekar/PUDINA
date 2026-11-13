const AppError = require("../utils/AppError");
const graphService = require("../services/graphService");

function parseHorizon(raw, { required }) {
  if (raw === undefined && !required) return undefined;
  const h = Number(raw === undefined ? 15 : raw);
  if (h !== 15 && h !== 30) throw new AppError(400, "VALIDATION_ERROR", "horizon must be 15 or 30");
  return h;
}

// GET /api/predictions?horizon=15&segment_ids=e1,e7
function validatePredictionsQuery(q) {
  const horizon = parseHorizon(q.horizon ?? 15, { required: true });
  let segmentIds = null;
  if (q.segment_ids) {
    segmentIds = String(q.segment_ids).split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = segmentIds.filter((id) => !graphService.getEdge(id));
    if (unknown.length) throw new AppError(400, "VALIDATION_ERROR", `Unknown segment_ids: ${unknown.slice(0, 5).join(", ")}`);
  }
  return { horizon, segmentIds };
}

// GET /api/predictions/metrics?segment_id=e41&horizon=15 (both or neither)
function validateMetricsQuery(q) {
  if (!q.segment_id && q.horizon === undefined) return { segmentId: null, horizon: null };
  if (!q.segment_id) throw new AppError(400, "VALIDATION_ERROR", "segment_id and horizon go together");
  if (!graphService.getEdge(q.segment_id)) throw new AppError(400, "VALIDATION_ERROR", `Unknown segment_id: ${q.segment_id}`);
  return { segmentId: q.segment_id, horizon: parseHorizon(q.horizon ?? 15, { required: true }) };
}

module.exports = { validatePredictionsQuery, validateMetricsQuery };
