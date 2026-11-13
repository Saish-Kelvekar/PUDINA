// Emergency routing: the normal route a car would take vs the emergency route
// (15-min predicted speeds, avoids verified incidents and closures, green lights all the way).
const graphService = require("./graphService");
const trafficService = require("./trafficService");
const predictionService = require("./predictionService");
const signalService = require("./signalService");
const simClock = require("./simClock");
const { resolvePoint } = require("./routeService");
const { makeEdgeCost, groupIncidents, incidentPenaltyS } = require("./routePlanner");
const { findPath, timeHeuristic, pathCoords } = require("./routingService");
const incidentRepo = require("../repositories/incidentRepository");
const { query } = require("../config/db");
const AppError = require("../utils/AppError");

const round1 = (x) => Math.round(x * 10) / 10;
const travelS = (edge, kmph) => edge.length_m / (Math.max(kmph || 1, 1) / 3.6);

// Signalised junctions passed on a path (not start or end), with the road used to arrive
function signalsOnPath(path) {
  const out = [];
  for (let i = 1; i < path.node_ids.length - 1; i++) {
    const node = graphService.getNode(path.node_ids[i]);
    if (node.signalised) out.push({ node_id: node.id, name: node.name, edge_id: path.edge_ids[i - 1] });
  }
  return out;
}

async function route({ vehicleType, source, destination }, user) {
  const from = resolvePoint(source, "source");
  const to = resolvePoint(destination, "destination");
  if (from.node_id === to.node_id) throw new AppError(400, "VALIDATION_ERROR", "Source and destination are the same junction");

  const simTime = simClock.getSimTime();
  const { step, speeds } = await trafficService.getSpeeds(simTime);
  const incidents = await incidentRepo.findActiveVerified();
  const byEdge = groupIncidents(incidents);

  // 15-minute predicted speeds where we have them; current speed elsewhere
  const pred = await predictionService.get({ horizon: 15, segmentIds: null });
  const predicted = new Map(speeds);
  for (const p of pred.predictions) predicted.set(p.segment_id, p.predicted_speed_kmph);

  const graph = graphService;
  const maxSpeed = Math.max(...graph.getGraph().edges.map((e) => Math.max(e.free_flow_kmph, speeds.get(e.id) || 0, predicted.get(e.id) || 0)));
  const heuristic = timeHeuristic(graph, maxSpeed);

  // Normal car: fastest route on current speeds, stops at red lights, drives through incidents if faster
  const normal = findPath({ graph, from: from.node_id, to: to.node_id, heuristic,
    edgeCost: makeEdgeCost("fastest", { graph, speeds, incidentsByEdge: byEdge, destination: to.node_id }) });
  if (!normal) throw new AppError(422, "NO_ROUTE", `No route from ${from.name} to ${to.name}`);

  // Emergency vehicle: predicted speeds, no red lights, never on a road with a verified incident
  const avoid = (e) => (byEdge.has(e.id) ? Infinity : travelS(e, predicted.get(e.id)));
  let emergency = findPath({ graph, from: from.node_id, to: to.node_id, heuristic, edgeCost: avoid });
  let avoidedAll = true;
  if (!emergency) { // only way is through an incident: allow it (closures stay closed), with its delay
    avoidedAll = false;
    emergency = findPath({ graph, from: from.node_id, to: to.node_id, heuristic,
      edgeCost: (e) => { const p = incidentPenaltyS(e.id, byEdge); return p === Infinity ? Infinity : travelS(e, predicted.get(e.id)) + p; } });
  }
  if (!emergency) throw new AppError(422, "NO_ROUTE", `No route for an emergency vehicle from ${from.name} to ${to.name}`);

  // Red-light waits at each signal (M3's optimizer, or 20 s if it can't answer)
  const normalSignals = signalsOnPath(normal);
  const emergencySignals = signalsOnPath(emergency);
  const waits = await Promise.all([...normalSignals, ...emergencySignals].map((s) => signalService.redWaitS(s.node_id, s.edge_id, step)));
  normalSignals.forEach((s, i) => Object.assign(s, { red_wait_s: waits[i].seconds, source: waits[i].source }));
  emergencySignals.forEach((s, i) => Object.assign(s, { red_wait_saved_s: waits[normalSignals.length + i].seconds,
                                                         source: waits[normalSignals.length + i].source }));
  const allFromOptimizer = waits.every((w) => w.source === "SIGNAL_OPTIMIZER");

  const edgeList = (p) => p.edge_ids.map((id) => graph.getEdge(id));
  const distKm = (p) => Math.round(edgeList(p).reduce((s, e) => s + e.length_m, 0) / 10) / 100;
  const normalS = edgeList(normal).reduce((s, e) => s + travelS(e, speeds.get(e.id)) + incidentPenaltyS(e.id, byEdge), 0)
                + normalSignals.reduce((s, x) => s + x.red_wait_s, 0);
  const emergencyS = edgeList(emergency).reduce((s, e) => s + travelS(e, predicted.get(e.id)) + (avoidedAll ? 0 : incidentPenaltyS(e.id, byEdge)), 0);
  const signalSource = allFromOptimizer ? "SIGNAL_OPTIMIZER" : "ASSUMED_FIXED_20S";

  const normalRoute = { node_ids: normal.node_ids, edge_ids: normal.edge_ids, coords: pathCoords(graph, normal),
    distance_km: distKm(normal), eta_min: round1(normalS / 60), eta_s: Math.round(normalS),
    signals_on_route: normalSignals.length, signals: normalSignals, speed_basis: "current (SIMULATED)" };
  const emergencyRoute = { node_ids: emergency.node_ids, edge_ids: emergency.edge_ids, coords: pathCoords(graph, emergency),
    distance_km: distKm(emergency), eta_min: round1(emergencyS / 60), eta_s: Math.round(emergencyS),
    signals_on_route: emergencySignals.length, signals: emergencySignals,
    signal_wait_saved_s: round1(emergencySignals.reduce((s, x) => s + x.red_wait_saved_s, 0)),
    avoided_all_incidents: avoidedAll,
    speed_basis: pred.model_version === "baseline" ? "15-min prediction (baseline: speed later = speed now)"
                                                    : `15-min prediction (${pred.model_version})` };
  const assumptions = [
    allFromOptimizer ? "Red-light wait per junction comes from the signal optimizer (emergency mode)"
                     : "Each red light costs 20 s without priority (fixed assumption: signal optimizer not available)",
    avoidedAll ? "Emergency route avoids roads with verified incidents and closures"
               : "No route avoids every incident, so the emergency route passes one (closed roads are still avoided)",
    "Emergency route uses 15-minute predicted speeds and gets green lights at every signal",
    "Normal route: fastest route on current speeds, waiting at every red light",
  ];

  const saved = await query(
    `INSERT INTO emergency_sessions (user_id, vehicle_type, source_node, dest_node, normal_eta_s, emergency_eta_s,
       time_saved_s, normal_route, emergency_route, signal_wait_source, assumptions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
    [user.id, vehicleType, from.node_id, to.node_id, normalS, emergencyS, normalS - emergencyS,
     JSON.stringify(normalRoute), JSON.stringify(emergencyRoute), signalSource, JSON.stringify(assumptions)]);

  return {
    session_id: saved.rows[0].id, vehicle_type: vehicleType, simulation: true, source: "SIMULATED",
    sim_time_utc: simTime, from, to,
    normal_route: normalRoute, emergency_route: emergencyRoute,
    time_saved_min: round1((normalS - emergencyS) / 60),
    signal_wait_source: signalSource, assumptions, created_at: saved.rows[0].created_at,
  };
}

module.exports = { route };
