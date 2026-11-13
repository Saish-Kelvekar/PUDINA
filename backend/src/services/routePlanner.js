// Builds the 5 route options with the same A* search and different cost rules.
// Pure functions: everything they need is passed in, so they are easy to test.
const { findPath, timeHeuristic, distanceHeuristic, pathCoords } = require("./routingService");
const C = require("../config/constants");

const ROUTE_TYPES = {
  fastest: "Fastest",
  shortest: "Shortest",
  least_congested: "Least congested",
  safest: "Fewest incidents",
  eco: "Eco (least fuel)",
};

const FACTOR_FIELD = {
  time: "eta_s", distance: "distance_km", congestion: "congestion_pct",
  incidents: "incident_count", fuel: "fuel_litres", reliability: "reliability",
};
const FACTOR_WORDS = {
  time: "lowest travel time", distance: "short distance", congestion: "light traffic",
  incidents: "few incidents", fuel: "low fuel use", reliability: "high reliability",
};

// ---------- small helpers ----------
const travelS = (edge, speeds) => edge.length_m / (Math.max(speeds.get(edge.id) || 1, 1) / 3.6);
const ratioOf = (edge, speeds) => Math.min(1, (speeds.get(edge.id) || 0) / edge.free_flow_kmph); // capped at 1
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function groupIncidents(incidents) {
  const byEdge = new Map();
  for (const i of incidents) {
    if (!byEdge.has(i.segment_id)) byEdge.set(i.segment_id, []);
    byEdge.get(i.segment_id).push(i);
  }
  return byEdge;
}

// Extra seconds on a road because of incidents; Infinity if it is closed
function incidentPenaltyS(edgeId, incidentsByEdge) {
  let total = 0;
  for (const i of incidentsByEdge.get(edgeId) || []) {
    if (i.is_closure) return Infinity;
    total += C.INCIDENT_PENALTY_S[i.severity] || 0;
  }
  return total;
}

// ---------- cost of driving one road, for each route type ----------
function makeEdgeCost(kind, { graph, speeds, incidentsByEdge, destination, multipliers = new Map() }) {
  return (edge, fromId, toId) => {
    const penalty = incidentPenaltyS(edge.id, incidentsByEdge);
    if (penalty === Infinity) return Infinity;              // closed road
    const t = travelS(edge, speeds);
    const ratio = ratioOf(edge, speeds);
    const node = graph.getNode(toId);
    const signal = node.signalised && toId !== destination ? C.SIGNAL_WAIT_S : 0;
    const incidentCount = (incidentsByEdge.get(edge.id) || []).length;

    let cost;
    switch (kind) {
      case "fastest": cost = t + signal + penalty; break;
      case "shortest": cost = edge.length_m; break;                                    // metres only
      case "least_congested": cost = t * (1 + 3 * (1 - ratio)) + signal + penalty; break; // slow roads cost up to 4x
      case "safest": cost = t + signal + 5 * penalty + 120 * incidentCount; break;    // strongly avoid incidents
      case "eco": cost = edge.length_m * C.FUEL_L_PER_KM * (1 + 0.5 * (1 - ratio)) + penalty / 10; break;
      default: throw new Error(`Unknown route type ${kind}`);
    }
    return cost * (multipliers.get(edge.id) || 1);
  };
}

// A* guess for each type. It must never be higher than the real remaining cost.
function makeHeuristic(kind, graph, maxSpeedKmph) {
  if (kind === "shortest") return distanceHeuristic(graph);
  if (kind === "eco") {
    const dist = distanceHeuristic(graph);
    return (a, b) => dist(a, b) * C.FUEL_L_PER_KM;
  }
  return timeHeuristic(graph, maxSpeedKmph);
}

// ---------- numbers shown on each route card ----------
function routeStats(path, { graph, speeds, incidentsByEdge, signalWaitS = C.SIGNAL_WAIT_S }) {
  const edges = path.edge_ids.map((id) => graph.getEdge(id));
  const distM = edges.reduce((s, e) => s + e.length_m, 0);
  const driveS = edges.reduce((s, e) => s + travelS(e, speeds), 0);
  const signals = path.node_ids.slice(1, -1).filter((id) => graph.getNode(id).signalised).length;
  const penaltyS = edges.reduce((s, e) => s + incidentPenaltyS(e.id, incidentsByEdge), 0);
  const etaS = driveS + signals * signalWaitS + penaltyS;
  const congShare = distM ? edges.reduce((s, e) => s + e.length_m * (1 - ratioOf(e, speeds)), 0) / distM : 0;
  const heavyM = edges.filter((e) => ratioOf(e, speeds) < 0.5).reduce((s, e) => s + e.length_m, 0);
  const incidents = edges.flatMap((e) => incidentsByEdge.get(e.id) || []);
  return {
    distance_km: round(distM / 1000, 2),
    eta_min: round(etaS / 60, 1),
    eta_s: Math.round(etaS),
    congestion_pct: Math.round(congShare * 100),
    signals_on_route: signals,
    incident_ids: incidents.map((i) => i.id),
    incident_count: incidents.length,
    fuel_litres: round((distM / 1000) * C.FUEL_L_PER_KM * (1 + 0.5 * congShare), 3),
    reliability: Math.round(Math.max(0, 100 - 10 * incidents.length - 30 * (distM ? heavyM / distM : 0))),
  };
}

// ---------- score: min-max normalise each factor, then weighted sum (0-100) ----------
function scoreRoutes(routes, weights) {
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  const good = new Map(routes.map((r) => [r.route_id, {}]));
  for (const [factor, field] of Object.entries(FACTOR_FIELD)) {
    const vals = routes.map((r) => r[field]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    for (const r of routes) {
      const x = hi === lo ? 0.5 : (r[field] - lo) / (hi - lo);       // 0 = lowest value, 1 = highest
      good.get(r.route_id)[factor] = factor === "reliability" ? x : 1 - x; // 1 = best for every factor
    }
  }
  for (const r of routes) {
    const contrib = {};
    for (const f of Object.keys(FACTOR_FIELD)) contrib[f] = ((weights[f] || 0) * good.get(r.route_id)[f]) / totalW;
    r.score = round(100 * Object.values(contrib).reduce((a, b) => a + b, 0));
    r.score_breakdown = Object.fromEntries(Object.entries(contrib).map(([f, v]) => [f, round(100 * v)]));
    r._top = Object.keys(contrib).sort((a, b) => contrib[b] - contrib[a]).slice(0, 2);
  }
  routes.sort((a, b) => b.score - a.score || a.eta_s - b.eta_s);
  routes.forEach((r, i) => {
    r.rank = i + 1;
    r.recommended = i === 0;
    r.explanation = (i === 0 ? "Recommended: " : "") + `${FACTOR_WORDS[r._top[0]]} and ${FACTOR_WORDS[r._top[1]]}.`;
    delete r._top;
  });
  return routes;
}

// ---------- the main function ----------
function compareRoutes({ graph, from, to, speeds, incidents = [], weights = C.DEFAULT_WEIGHTS }) {
  const incidentsByEdge = groupIncidents(incidents);
  const maxSpeed = Math.max(...graph.getGraph().edges.map((e) => Math.max(e.free_flow_kmph, speeds.get(e.id) || 0)));
  const ctx = { graph, speeds, incidentsByEdge, destination: to };
  const routes = [];
  const seen = []; // edge lists already used, as strings

  for (const [kind, label] of Object.entries(ROUTE_TYPES)) {
    const heuristic = makeHeuristic(kind, graph, maxSpeed);
    const run = (multipliers) => findPath({ graph, from, to, heuristic,
      edgeCost: makeEdgeCost(kind, { ...ctx, multipliers }) });

    let path = run(new Map());
    if (!path) continue;
    let isAlternative = false, sameAs = null;

    // Same path as an earlier type? Make its roads 1.5x more expensive and search again.
    const multipliers = new Map();
    for (let tries = 0; seen.includes(path.edge_ids.join()) && tries < C.MAX_ALTERNATIVE_TRIES; tries++) {
      for (const id of path.edge_ids) multipliers.set(id, (multipliers.get(id) || 1) * C.ALTERNATIVE_MULTIPLIER);
      path = run(multipliers);
      isAlternative = true;
    }
    if (seen.includes(path.edge_ids.join())) {
      // No different path exists: keep the normal answer and say which route it matches
      path = run(new Map());
      isAlternative = false;
      sameAs = routes[seen.indexOf(path.edge_ids.join())].route_id;
    }
    seen.push(path.edge_ids.join());

    routes.push({
      route_id: `r${routes.length + 1}`, type: kind, label,
      is_alternative: isAlternative, same_path_as: sameAs,
      node_ids: path.node_ids, edge_ids: path.edge_ids, coords: pathCoords(graph, path),
      ...routeStats(path, ctx),
    });
  }
  if (routes.length === 0) return [];

  scoreRoutes(routes, weights);

  // Warn about closed roads that touch the route (the route avoided them)
  const closures = incidents.filter((i) => i.is_closure);
  for (const r of routes) {
    const onRoute = new Set(r.node_ids);
    r.closure_warnings = closures
      .filter((i) => { const e = graph.getEdge(i.segment_id); return e && (onRoute.has(e.from) || onRoute.has(e.to)); })
      .map((i) => `${graph.getEdge(i.segment_id).name || i.segment_id} is closed (incident #${i.id}), avoided`);
  }
  return routes;
}

module.exports = { compareRoutes, routeStats, makeEdgeCost, incidentPenaltyS, groupIncidents, ROUTE_TYPES };
