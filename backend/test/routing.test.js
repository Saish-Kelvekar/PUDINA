// Run: npm test   (uses Node's built-in test runner, nothing to install)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { findPath, distanceHeuristic, timeHeuristic, pathCoords } = require("../src/services/routingService");

// Makes a small graph object with the same functions graphService gives
function makeGraph({ nodes, edges }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.from).push({ to: e.to, edge: e });
    if (!e.oneway) adj.get(e.to).push({ to: e.from, edge: e });
  }
  return { getNode: (id) => byId.get(id), getEdge: (id) => edgeById.get(id), neighbours: (id) => adj.get(id) || [] };
}

//   A ---e1--- B ---e2--- C          straight-line gap between neighbours ≈ 556 m
//   |          ^          |          e7 is ONE-WAY from E up to B
//   e3         e7         e6
//   |          |          |
//   D ---e4--- E ---e5--- F
const small = makeGraph({
  nodes: [
    { id: "A", lat: 0.005, lng: 0.000 }, { id: "B", lat: 0.005, lng: 0.005 }, { id: "C", lat: 0.005, lng: 0.010 },
    { id: "D", lat: 0.000, lng: 0.000 }, { id: "E", lat: 0.000, lng: 0.005 }, { id: "F", lat: 0.000, lng: 0.010 },
  ],
  edges: [
    { id: "e1", from: "A", to: "B", length_m: 600, oneway: false, coords: [[0.005, 0], [0.005, 0.005]] },
    { id: "e2", from: "B", to: "C", length_m: 600, oneway: false, coords: [[0.005, 0.005], [0.005, 0.01]] },
    { id: "e3", from: "A", to: "D", length_m: 600, oneway: false, coords: [[0.005, 0], [0, 0]] },
    { id: "e4", from: "D", to: "E", length_m: 600, oneway: false, coords: [[0, 0], [0, 0.005]] },
    { id: "e5", from: "E", to: "F", length_m: 600, oneway: false, coords: [[0, 0.005], [0, 0.01]] },
    { id: "e6", from: "C", to: "F", length_m: 900, oneway: false, coords: [[0.005, 0.01], [0, 0.01]] },
    { id: "e7", from: "E", to: "B", length_m: 600, oneway: true, coords: [[0, 0.005], [0.005, 0.005]] },
  ],
});
const byLength = (closed = []) => (edge) => (closed.includes(edge.id) ? Infinity : edge.length_m);

test("finds the shortest path", () => {
  const p = findPath({ graph: small, from: "A", to: "F", edgeCost: byLength(), heuristic: distanceHeuristic(small) });
  assert.deepStrictEqual(p.node_ids, ["A", "D", "E", "F"]);
  assert.deepStrictEqual(p.edge_ids, ["e3", "e4", "e5"]);
  assert.strictEqual(p.cost, 1800);
});

test("goes around a closed road", () => {
  const p = findPath({ graph: small, from: "A", to: "F", edgeCost: byLength(["e4"]), heuristic: distanceHeuristic(small) });
  assert.deepStrictEqual(p.node_ids, ["A", "B", "C", "F"]); // can't use B->E: e7 is one-way E->B
  assert.strictEqual(p.cost, 2100);
});

test("respects one-way roads", () => {
  const down = findPath({ graph: small, from: "B", to: "E", edgeCost: byLength(), heuristic: distanceHeuristic(small) });
  assert.notDeepStrictEqual(down.edge_ids, ["e7"]);         // not allowed B -> E on e7
  const up = findPath({ graph: small, from: "E", to: "B", edgeCost: byLength(), heuristic: distanceHeuristic(small) });
  assert.deepStrictEqual(up.edge_ids, ["e7"]);              // allowed E -> B
});

test("returns null when there is no path", () => {
  const p = findPath({ graph: small, from: "A", to: "F", edgeCost: byLength(["e1", "e3"]) });
  assert.strictEqual(p, null);
});

test("start equals end gives an empty path", () => {
  const p = findPath({ graph: small, from: "C", to: "C", edgeCost: byLength() });
  assert.deepStrictEqual(p.node_ids, ["C"]);
  assert.strictEqual(p.cost, 0);
});

test("unknown junction gives null", () => {
  assert.strictEqual(findPath({ graph: small, from: "A", to: "Z", edgeCost: byLength() }), null);
});

test("coordinates join into one line, flipped when driving a road backwards", () => {
  const p = findPath({ graph: small, from: "F", to: "D", edgeCost: byLength() }); // only answer: F-E-D
  assert.deepStrictEqual(p.edge_ids, ["e5", "e4"]); // both roads are stored the other way round
  assert.deepStrictEqual(pathCoords(small, p), [[0, 0.01], [0, 0.005], [0, 0]]);
});

// ---------- Member 3's real sample graph ----------
const real = makeGraph(JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/sample/graph.json"), "utf8")));
const travelSeconds = (edge) => edge.length_m / (edge.free_flow_kmph / 3.6);

test("A* gives the same cost as Dijkstra for every pair of junctions", () => {
  const ids = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];
  for (const from of ids) for (const to of ids) {
    const dijkstra = findPath({ graph: real, from, to, edgeCost: travelSeconds });
    const astar = findPath({ graph: real, from, to, edgeCost: travelSeconds, heuristic: timeHeuristic(real, 60) });
    assert.strictEqual(astar === null, dijkstra === null, `${from}->${to}`);
    if (astar) assert.ok(Math.abs(astar.cost - dijkstra.cost) < 1e-6, `${from}->${to}`);
  }
});

test("demo trip n5 -> n7 on the real graph", () => {
  const p = findPath({ graph: real, from: "n5", to: "n7", edgeCost: travelSeconds, heuristic: timeHeuristic(real, 60) });
  assert.strictEqual(p.node_ids[0], "n5");
  assert.strictEqual(p.node_ids.at(-1), "n7");
  console.log("    n5 -> n7:", p.node_ids.join(" -> "), `(${Math.round(p.cost)} s at free-flow speed)`);
});
