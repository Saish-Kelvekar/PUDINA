// Traffic signals: the list of signalised junctions, simulations through M3's optimizer,
// and the red-light wait an emergency vehicle saves at a junction.
const graphService = require("./graphService");
const trafficService = require("./trafficService");
const simClock = require("./simClock");
const ml = require("./mlClient");
const { query } = require("../config/db");
const AppError = require("../utils/AppError");
const { SIGNAL_WAIT_S } = require("../config/constants");

const GREEN_S = 30, YELLOW_S = 3, ALL_RED_S = 2; // current fixed timing at every junction (contract)

// Roads you can drive INTO the junction on. Same rule as M3: approach id = "<node>-<edge>".
function approachesInto(nodeId) {
  const out = [];
  for (const e of graphService.getGraph().edges) {
    if (e.from !== nodeId && e.to !== nodeId) continue;
    if (e.oneway && e.to !== nodeId) continue; // one-way road leaving the junction
    const other = e.to === nodeId ? e.from : e.to;
    const otherNode = graphService.getNode(other);
    out.push({ approach_id: `${nodeId}-${e.id}`, edge_id: e.id, from_node: other,
               label: `from ${(otherNode && otherNode.name) || other} (${e.name || e.id})` });
  }
  return out;
}

function listJunctions() {
  return graphService.getGraph().nodes.filter((n) => n.signalised).map((n) => {
    const approaches = approachesInto(n.id);
    return {
      junction_id: `J-${n.id}`, node_id: n.id, name: n.name, lat: n.lat, lng: n.lng, approaches,
      current_timing: { cycle_s: approaches.length * (GREEN_S + YELLOW_S + ALL_RED_S),
                        green_s_each: GREEN_S, yellow_s: YELLOW_S, all_red_s: ALL_RED_S },
      source: "SIMULATED",
    };
  });
}

function findJunction(junctionId) {
  const j = listJunctions().find((x) => x.junction_id === junctionId);
  if (!j) throw new AppError(404, "NOT_FOUND", `Unknown junction ${junctionId}`);
  return j;
}

// The traffic time step M3 must use (it only knows steps that exist in the CSV)
async function currentStep() {
  const { step } = await trafficService.getSpeeds(simClock.getSimTime());
  if (!step) throw new AppError(409, "CONFLICT", "No traffic data at the current simulation time");
  return step;
}

async function simulate({ junctionId, mode, cycles, seed, emergencyApproachId }, user) {
  const j = findJunction(junctionId);
  if (mode === "emergency" && !j.approaches.some((a) => a.approach_id === emergencyApproachId)) {
    throw new AppError(400, "VALIDATION_ERROR", `emergency_approach_id must be one of: ${j.approaches.map((a) => a.approach_id).join(", ")}`);
  }
  const asOf = await currentStep();
  const input = { junction_id: j.junction_id, node_id: j.node_id, as_of: asOf, mode,
                  emergency_approach_id: mode === "emergency" ? emergencyApproachId : null, cycles, seed };
  let result;
  try {
    result = await ml.signalsOptimize(input);
  } catch (err) {
    if (err instanceof ml.MlUnavailableError) {
      throw new AppError(503, "ML_UNAVAILABLE", `Signal optimizer unavailable: ${err.reason}`);
    }
    throw err;
  }
  const saved = await query(
    `INSERT INTO signal_simulations (junction_id, mode, input, current_result, optimized_result,
       avg_wait_before_s, avg_wait_after_s, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
    [j.junction_id, mode, JSON.stringify(input), JSON.stringify(result.current), JSON.stringify(result.optimized),
     result.current.avg_wait_s, result.optimized.avg_wait_s, user.id]);
  return { simulation_id: saved.rows[0].id, ...result, junction_name: j.name, as_of_utc: asOf,
           source: "SIMULATED", created_at: saved.rows[0].created_at };
}

// Red wait an emergency vehicle avoids when it reaches `nodeId` on road `edgeId`.
// From M3's optimizer (emergency mode); 20 s assumption if it can't answer.
const redWaitCache = new Map(); // "step|approach" -> seconds
async function redWaitS(nodeId, edgeId, step) {
  const approach = `${nodeId}-${edgeId}`;
  const key = `${step}|${approach}`;
  if (redWaitCache.has(key)) return { seconds: redWaitCache.get(key), source: "SIGNAL_OPTIMIZER" };
  try {
    const r = await ml.signalsOptimize({ junction_id: `J-${nodeId}`, node_id: nodeId, as_of: step,
                                         mode: "emergency", emergency_approach_id: approach, cycles: 10, seed: 42 });
    if (typeof r.red_wait_saved_s !== "number") throw new ml.MlUnavailableError("no red_wait_saved_s in answer");
    if (redWaitCache.size > 2000) redWaitCache.clear();
    redWaitCache.set(key, r.red_wait_saved_s);
    return { seconds: r.red_wait_saved_s, source: "SIGNAL_OPTIMIZER" };
  } catch (err) {
    if (!(err instanceof ml.MlUnavailableError)) throw err;
    return { seconds: SIGNAL_WAIT_S, source: "ASSUMED_FIXED_20S" };
  }
}

module.exports = { listJunctions, simulate, redWaitS, approachesInto };
