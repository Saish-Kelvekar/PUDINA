const fs = require("fs");
const path = require("path");

let graph = null;                // the raw file: { nodes, edges }
let loadedAt = null;
const nodesById = new Map();     // "n1" -> node
const edgesById = new Map();     // "e1" -> edge
const adj = new Map();           // "n1" -> [ { to: "n2", edge }, ... ]  (adjacency list)

// Distance in metres between two [lat, lng] points
function haversineM(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function loadGraph() {
  const file = path.resolve(__dirname, "../..", process.env.GRAPH_PATH || "../data/sample/graph.json");
  graph = JSON.parse(fs.readFileSync(file, "utf8"));
  loadedAt = fs.statSync(file).mtime.toISOString();

  nodesById.clear(); edgesById.clear(); adj.clear();
  for (const n of graph.nodes) { nodesById.set(n.id, n); adj.set(n.id, []); }

  for (const e of graph.edges) {
    if (!nodesById.has(e.from) || !nodesById.has(e.to)) {
      throw new Error(`Edge ${e.id} points to a missing node`);
    }
    edgesById.set(e.id, e);
    adj.get(e.from).push({ to: e.to, edge: e });               // always drivable from -> to
    if (!e.oneway) adj.get(e.to).push({ to: e.from, edge: e }); // two-way: also to -> from
  }
  console.log(`Graph loaded: ${graph.nodes.length} nodes, ${graph.edges.length} edges from ${file}`);
}

// Closest junction to a clicked point
function nearestNode(lat, lng) {
  let best = null, bestD = Infinity;
  for (const n of graph.nodes) {
    const d = haversineM([lat, lng], [n.lat, n.lng]);
    if (d < bestD) { bestD = d; best = n; }
  }
  return { node: best, distance_m: Math.round(bestD) };
}

module.exports = {
  loadGraph, nearestNode, haversineM,
  getGraph: () => graph, getLoadedAt: () => loadedAt,
  getNode: (id) => nodesById.get(id), getEdge: (id) => edgesById.get(id),
  neighbours: (id) => adj.get(id) || [],
};