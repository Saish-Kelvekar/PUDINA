// Tests the 5 route types on M3's sample graph with the speeds from traffic.csv at 09:00 IST.
// No database needed.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { compareRoutes, makeEdgeCost, groupIncidents } = require("../src/services/routePlanner");
const { findPath } = require("../src/services/routingService");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/sample/graph.json"), "utf8"));
const nodes = new Map(raw.nodes.map((n) => [n.id, n]));
const edges = new Map(raw.edges.map((e) => [e.id, e]));
const adj = new Map(raw.nodes.map((n) => [n.id, []]));
for (const e of raw.edges) {
  adj.get(e.from).push({ to: e.to, edge: e });
  if (!e.oneway) adj.get(e.to).push({ to: e.from, edge: e });
}
const graph = { getGraph: () => raw, getNode: (id) => nodes.get(id), getEdge: (id) => edges.get(id), neighbours: (id) => adj.get(id) };

const speeds = new Map();
for (const line of fs.readFileSync(path.join(__dirname, "../../data/sample/traffic.csv"), "utf8").trim().split(/\r?\n/).slice(1)) {
  const [seg, ts, speed] = line.split(",");
  if (ts === "2026-11-10T03:30:00Z") speeds.set(seg, Number(speed));
}

const accident = { id: 101, segment_id: "e7", severity: "high", is_closure: false };
const closure = { id: 103, segment_id: "e10", severity: "high", is_closure: true };

test("returns 5 route cards, best first, exactly one recommended", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident, closure] });
  assert.strictEqual(routes.length, 5);
  assert.deepStrictEqual(routes.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.strictEqual(routes.filter((r) => r.recommended).length, 1);
  for (let i = 1; i < routes.length; i++) assert.ok(routes[i - 1].score >= routes[i].score);
  assert.match(routes[0].explanation, /^Recommended: /);
});

test("the recommended route avoids the accident; the shortest goes through it", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident, closure] });
  assert.ok(!routes[0].edge_ids.includes("e7"));
  const shortest = routes.find((r) => r.type === "shortest");
  assert.deepStrictEqual(shortest.incident_ids, [101]);
});

test("no route ever uses a closed road", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n8", speeds, incidents: [{ ...closure }] });
  assert.strictEqual(routes.length, 0); // e10 is the only road to n8
});

test("a route that repeats another one says so", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident, closure] });
  for (const r of routes.filter((x) => x.same_path_as)) {
    const twin = routes.find((x) => x.route_id === r.same_path_as);
    assert.deepStrictEqual(r.edge_ids, twin.edge_ids);
  }
});

test("moving the weights changes the ranking", () => {
  const distanceOnly = { time: 0, distance: 1, congestion: 0, incidents: 0, fuel: 0, reliability: 0 };
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident], weights: distanceOnly });
  assert.strictEqual(routes[0].type, "shortest");
});

test("ETA = driving time + 20 s per signal + incident delay", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident] });
  const r = routes.find((x) => x.type === "shortest"); // n5-n2-n3-n7 through the accident on e7
  const drive = r.edge_ids.reduce((s, id) => s + edges.get(id).length_m / (speeds.get(id) / 3.6), 0);
  assert.strictEqual(r.signals_on_route, 2);                      // n2 and n3
  assert.strictEqual(r.eta_s, Math.round(drive + 2 * 20 + 300));  // high-severity accident = +300 s
});

test("A* heuristics never overestimate: same cost as Dijkstra for every route type", () => {
  const byEdge = groupIncidents([accident]);
  const ids = [...nodes.keys()];
  const { timeHeuristic, distanceHeuristic } = require("../src/services/routingService");
  for (const kind of ["fastest", "shortest", "least_congested", "safest", "eco"]) {
    for (const from of ids) for (const to of ids) {
      const edgeCost = makeEdgeCost(kind, { graph, speeds, incidentsByEdge: byEdge, destination: to });
      const dij = findPath({ graph, from, to, edgeCost });
      const h = kind === "shortest" ? distanceHeuristic(graph)
        : kind === "eco" ? ((d) => (a, b) => d(a, b) * 0.07)(distanceHeuristic(graph))
        : timeHeuristic(graph, 40);
      const ast = findPath({ graph, from, to, edgeCost, heuristic: h });
      assert.strictEqual(ast === null, dij === null);
      if (ast) assert.ok(Math.abs(ast.cost - dij.cost) < 1e-6, `${kind} ${from}->${to}`);
    }
  }
});
