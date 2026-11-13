// Current speed of every road at the simulation time.
// Used by GET /api/traffic/flow and (in Part B) by the routing costs.
const traffic = require("../repositories/trafficRepository");
const graphService = require("./graphService");
const simClock = require("./simClock");
const { congestionLevel } = require("../utils/congestion");

const iso = (d) => (d ? new Date(d).toISOString().replace(".000Z", "Z") : null);
const cache = new Map(); // step time -> Map(segment_id -> row). Data never changes, so caching is safe.

async function rowsAt(time) {
  const step = await traffic.findStepAtOrBefore(time);
  if (!step) return { step: null, bySegment: new Map() };
  const key = iso(step);
  if (!cache.has(key)) {
    const bySegment = new Map();
    for (const r of await traffic.findRowsAt(step)) bySegment.set(r.segment_id, r);
    if (cache.size > 200) cache.clear(); // keep memory small
    cache.set(key, bySegment);
  }
  return { step: key, bySegment: cache.get(key) };
}

// For the map: one entry per road, "no_data" when the CSV has nothing for it
async function getFlow(time) {
  const simTime = time || simClock.getSimTime();
  const { step, bySegment } = await rowsAt(simTime);
  const segments = graphService.getGraph().edges.map((e) => {
    const r = bySegment.get(e.id);
    if (!r) {
      return { segment_id: e.id, speed_kmph: null, free_flow_kmph: e.free_flow_kmph, speed_ratio: null,
               congestion_level: "no_data", rain: null, source: "SIMULATED", timestamp_utc: null };
    }
    const ratio = Math.round((r.speed_kmph / e.free_flow_kmph) * 100) / 100;
    return { segment_id: e.id, speed_kmph: r.speed_kmph, free_flow_kmph: e.free_flow_kmph, speed_ratio: ratio,
             congestion_level: congestionLevel(ratio), rain: r.rain, source: r.source, timestamp_utc: iso(r.timestamp_utc) };
  });
  return { sim_time_utc: simTime, data_time_utc: step, source: "SIMULATED",
           last_updated: new Date().toISOString(), segments };
}

// For routing: segment_id -> speed in km/h. Roads with no data use their free-flow speed.
async function getSpeeds(time) {
  const { step, bySegment } = await rowsAt(time || simClock.getSimTime());
  const speeds = new Map();
  for (const e of graphService.getGraph().edges) {
    const r = bySegment.get(e.id);
    speeds.set(e.id, r ? r.speed_kmph : e.free_flow_kmph);
  }
  return { step, speeds, bySegmentHasData: bySegment }; // bySegmentHasData.has(id): real data for that road?
}

module.exports = { getFlow, getSpeeds };
