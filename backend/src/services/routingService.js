// A* search on the road graph.
// It does not know about traffic or incidents: the caller passes edgeCost(),
// so the same search gives fastest, shortest, eco, emergency... routes.
const MinHeap = require("../utils/MinHeap");

// Straight-line distance in metres between two [lat, lng] points
function haversineM(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Finds the cheapest path from `from` to `to`.
 *
 * graph      : { getNode(id), neighbours(id) -> [{ to, edge }] }
 * edgeCost   : (edge, fromId, toId) => number, or Infinity if the road can't be used
 * heuristic  : (nodeId, targetId) => a guess of the remaining cost that is NEVER too high.
 *              Use () => 0 to get plain Dijkstra.
 *
 * Returns { node_ids, edge_ids, cost, explored } or null if there is no path.
 */
function findPath({ graph, from, to, edgeCost, heuristic = () => 0 }) {
  if (!graph.getNode(from) || !graph.getNode(to)) return null;

  const g = new Map([[from, 0]]);   // best known cost from the start to each junction
  const prev = new Map();           // how we reached each junction: { node, edgeId }
  const done = new Set();           // junctions whose best cost is final
  const open = new MinHeap();
  open.push(from, heuristic(from, to));

  while (open.size > 0) {
    const current = open.pop();
    if (done.has(current)) continue; // an older, worse entry for the same junction
    if (current === to) break;
    done.add(current);

    for (const { to: next, edge } of graph.neighbours(current)) {
      if (done.has(next)) continue;
      const step = edgeCost(edge, current, next);
      if (!Number.isFinite(step)) continue; // closed road
      const newCost = g.get(current) + step;
      if (newCost < (g.has(next) ? g.get(next) : Infinity)) {
        g.set(next, newCost);
        prev.set(next, { node: current, edgeId: edge.id });
        open.push(next, newCost + heuristic(next, to)); // A*: cost so far + guess of the rest
      }
    }
  }

  if (!g.has(to)) return null;

  // Walk back from the end to the start to rebuild the path
  const node_ids = [to], edge_ids = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    edge_ids.push(p.edgeId);
    node_ids.push(p.node);
    cur = p.node;
  }
  node_ids.reverse(); edge_ids.reverse();
  return { node_ids, edge_ids, cost: g.get(to), explored: done.size };
}

// Heuristic for "shortest distance" costs (metres)
function distanceHeuristic(graph) {
  return (a, b) => {
    const A = graph.getNode(a), B = graph.getNode(b);
    return haversineM([A.lat, A.lng], [B.lat, B.lng]);
  };
}

// Heuristic for "travel time" costs (seconds): straight line at the fastest possible speed,
// so it never guesses too high.
function timeHeuristic(graph, maxKmph) {
  const toMetresPerSecond = maxKmph / 3.6;
  const dist = distanceHeuristic(graph);
  return (a, b) => dist(a, b) / toMetresPerSecond;
}

// Joins the coordinates of each road on the path into one line for Leaflet.
// A two-way road may be driven "backwards", so its coords are flipped when needed.
function pathCoords(graph, path) {
  const out = [];
  path.edge_ids.forEach((edgeId, i) => {
    const edge = graph.getEdge(edgeId);
    const coords = edge.from === path.node_ids[i] ? edge.coords : [...edge.coords].reverse();
    out.push(...(out.length ? coords.slice(1) : coords));
  });
  return out;
}

module.exports = { findPath, distanceHeuristic, timeHeuristic, pathCoords, haversineM };
