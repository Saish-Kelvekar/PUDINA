// "What happens to the roads around this incident?"
// Slows the incident road and its neighbours (up to 3 junctions away, by breadth-first search)
// and finds a diversion between the two ends of the incident road.
const { findPath, timeHeuristic, pathCoords } = require("./routingService");

const LANE_BLOCKAGE_FACTOR = 0.5;               // incident road: half speed
const NEIGHBOUR_FACTORS = { 1: 0.85, 2: 0.93, 3: 0.97 }; // spill-over to roads 1/2/3 junctions away
const MAX_HOPS = 3;

const round1 = (x) => Math.round(x * 10) / 10;
const travelS = (edge, kmph) => edge.length_m / (Math.max(kmph, 1) / 3.6);

// node id -> every road touching it (both directions), built once per graph
const touchCache = new WeakMap();
function roadsAtNode(graphData) {
  if (!touchCache.has(graphData)) {
    const m = new Map();
    for (const e of graphData.edges) {
      for (const n of [e.from, e.to]) {
        if (!m.has(n)) m.set(n, []);
        m.get(n).push(e);
      }
    }
    touchCache.set(graphData, m);
  }
  return touchCache.get(graphData);
}

// Breadth-first search over roads that share a junction. Returns Map(edgeId -> hops)
function roadsWithinHops(graphData, startEdge, maxHops) {
  const atNode = roadsAtNode(graphData);
  const hops = new Map([[startEdge.id, 0]]);
  const queue = [startEdge];
  while (queue.length) {
    const e = queue.shift();
    const h = hops.get(e.id);
    if (h === maxHops) continue;
    for (const n of [e.from, e.to]) {
      for (const next of atNode.get(n) || []) {
        if (!hops.has(next.id)) { hops.set(next.id, h + 1); queue.push(next); }
      }
    }
  }
  return hops;
}

/**
 * graph  : graphService-like object
 * edge   : the incident road
 * speeds : Map(edgeId -> km/h) now
 * mode   : "lane_blockage" or "closure"
 */
function simulateImpact({ graph, edge, speeds, mode }) {
  const data = graph.getGraph();
  const hops = roadsWithinHops(data, edge, MAX_HOPS);
  const after = new Map(speeds);
  const affected = [];

  for (const [id, h] of [...hops.entries()].sort((a, b) => a[1] - b[1])) {
    const e = graph.getEdge(id);
    const before = speeds.get(id);
    const factor = h === 0 ? (mode === "closure" ? 0 : LANE_BLOCKAGE_FACTOR) : NEIGHBOUR_FACTORS[h];
    const now = round1(before * factor);
    after.set(id, now);
    const extra = factor === 0 ? null : Math.round(travelS(e, now) - travelS(e, before));
    const ratioAfter = now / e.free_flow_kmph;
    affected.push({
      segment_id: id, hops: h, speed_before_kmph: before, speed_after_kmph: now,
      extra_delay_s: extra,
      congestion_level_after: factor === 0 ? "closed"
        : ratioAfter > 0.75 ? "flowing" : ratioAfter >= 0.5 ? "moderate" : ratioAfter >= 0.25 ? "heavy" : "severe",
    });
  }

  // Diversion: fastest way between the incident road's two ends without using it
  const maxSpeed = Math.max(...data.edges.map((e) => Math.max(e.free_flow_kmph, speeds.get(e.id) || 0)));
  const cost = (e) => (e.id === edge.id ? Infinity : travelS(e, after.get(e.id)));
  const diversion = findPath({ graph, from: edge.from, to: edge.to, edgeCost: cost, heuristic: timeHeuristic(graph, maxSpeed) });

  const directBefore = travelS(edge, speeds.get(edge.id));
  const directAfter = mode === "closure" ? null : travelS(edge, after.get(edge.id));
  const divEta = diversion ? diversion.cost : null;

  return {
    mode,
    speed_factor: mode === "closure" ? 0 : LANE_BLOCKAGE_FACTOR,
    max_hops: MAX_HOPS,
    hop_factors: { 0: mode === "closure" ? 0 : LANE_BLOCKAGE_FACTOR, ...NEIGHBOUR_FACTORS },
    affected_segments: affected,
    total_extra_delay_min: round1(affected.reduce((s, a) => s + (a.extra_delay_s || 0), 0) / 60),
    detour_minutes: divEta === null ? null : round1((divEta - directBefore) / 60),
    diversion_route: diversion && {
      from_node: edge.from, to_node: edge.to, node_ids: diversion.node_ids, edge_ids: diversion.edge_ids,
      coords: pathCoords(graph, diversion),
      distance_km: Math.round(diversion.edge_ids.reduce((s, id) => s + graph.getEdge(id).length_m, 0) / 10) / 100,
      eta_min: round1(divEta / 60),
    },
    blocked_route: {
      node_ids: [edge.from, edge.to], edge_ids: [edge.id],
      eta_min_before: round1(directBefore / 60),
      eta_min_after: directAfter === null ? null : round1(directAfter / 60),
    },
  };
}

module.exports = { simulateImpact, roadsWithinHops };
