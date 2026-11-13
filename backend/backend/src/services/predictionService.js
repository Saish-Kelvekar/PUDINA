// Congestion predictions 15 or 30 minutes ahead.
// First choice: M3's model. If it is down or refuses, we use the honest baseline
// "speed later = speed now" and say so (model_version: "baseline").
const ml = require("./mlClient");
const trafficService = require("./trafficService");
const simClock = require("./simClock");
const predictionRepo = require("../repositories/predictionRepository");
const { congestionLevel } = require("../utils/congestion");
const { PREDICTION_CACHE_MS } = require("../config/constants");

const cache = new Map(); // "step|horizon" -> { at, result }
const addMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString().replace(".000Z", "Z");

function baseline(step, horizon, bySegment, segmentIds) {
  return segmentIds.map((id) => {
    const r = bySegment.get(id);
    return {
      segment_id: id,
      current_speed_kmph: r.speed_kmph,
      predicted_speed_kmph: r.speed_kmph,
      predicted_level: congestionLevel(r.speed_kmph / r.free_flow_kmph),
      confidence: null,
      target_time_utc: addMinutes(step, horizon),
      source: "AI_PREDICTED",
    };
  });
}

// All predictions at the current simulation time; the map filters on its side
async function getAll(horizon) {
  const simTime = simClock.getSimTime();
  const { step, bySegmentHasData: bySegment } = await trafficService.getSpeeds(simTime);
  const base = { horizon_min: horizon, sim_time_utc: simTime, made_at_utc: step };
  if (!step) return { ...base, model_version: "baseline", generated_at: new Date().toISOString(), predictions: [] };

  const key = `${step}|${horizon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < PREDICTION_CACHE_MS) return hit.result;

  const withData = [...bySegment.keys()];
  let result;
  try {
    const r = await ml.predict({ asOf: step, horizon, segmentIds: withData });
    result = { ...base, model_version: r.model_version, generated_at: new Date().toISOString(),
               fallback_reason: null, predictions: r.predictions };
  } catch (err) {
    if (!(err instanceof ml.MlUnavailableError)) throw err;
    result = { ...base, model_version: "baseline", generated_at: new Date().toISOString(),
               fallback_reason: err.reason, predictions: baseline(step, horizon, bySegment, withData) };
  }

  // Keep a record (also what Analytics reads later). Never let a save failure break the map.
  predictionRepo.saveMany(result.predictions.map((p) => ({ ...p, horizon_min: horizon, made_at_utc: step,
    model_version: result.model_version }))).catch((e) => console.error("Saving predictions failed:", e.message));

  // Only cache real model answers, so we retry the model as soon as it is back
  if (result.model_version !== "baseline") cache.set(key, { at: Date.now(), result });
  return result;
}

async function get({ horizon, segmentIds }) {
  const all = await getAll(horizon);
  if (!segmentIds) return all;
  const wanted = new Set(segmentIds);
  const predictions = all.predictions.filter((p) => wanted.has(p.segment_id));
  const found = new Set(predictions.map((p) => p.segment_id));
  return { ...all, predictions, no_data_segment_ids: segmentIds.filter((id) => !found.has(id)) };
}

async function getMetrics({ segmentId, horizon }) {
  try {
    const m = await ml.metrics(segmentId ? { segmentId, horizon } : {});
    return { ...m, available: true, source: "AI_PREDICTED" };
  } catch (err) {
    if (!(err instanceof ml.MlUnavailableError)) throw err;
    return { model_version: "baseline", available: false, fallback_reason: err.reason,
             horizons: { 15: null, 30: null }, series: null, source: "AI_PREDICTED" };
  }
}

module.exports = { get, getMetrics };
