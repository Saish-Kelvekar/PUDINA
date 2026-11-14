// Live Trip legs: same timing rules as the route cards. No database needed.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { compareRoutes, groupIncidents } = require("../src/services/routePlanner");
const { buildLegs, TRIP_TYPES } = require("../src/services/tripService");

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

test("trip types: recommended plus the 5 route types", () => {
  assert.deepStrictEqual(TRIP_TYPES, ["recommended", "fastest", "shortest", "least_congested", "safest", "eco"]);
});

test("legs add up to exactly the route card's ETA, for every route type", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident] });
  for (const r of routes) {
    const legs = buildLegs({ graph, path: r, speeds, incidentsByEdge: groupIncidents([accident]), destination: "n7" });
    assert.strictEqual(legs.length, r.edge_ids.length);
    const total = legs.reduce((s, l) => s + l.drive_s + l.incident_delay_s + l.signal_wait_s, 0);
    assert.strictEqual(Math.round(total), r.eta_s, r.type);
    const signals = legs.filter((l) => l.signal_wait_s > 0).length;
    assert.strictEqual(signals, r.signals_on_route, r.type);
  }
});

test("legs are joined end to end and face the driving direction", () => {
  const [r] = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [] });
  const legs = buildLegs({ graph, path: r, speeds, incidentsByEdge: new Map(), destination: "n7" });
  for (let i = 0; i < legs.length; i++) {
    const edge = edges.get(legs[i].edge_id);
    const expected = edge.from === legs[i].from_node ? edge.coords : [...edge.coords].reverse();
    assert.deepStrictEqual(legs[i].coords, expected);
    if (i > 0) assert.strictEqual(legs[i].from_node, legs[i - 1].to_node);
  }
  assert.strictEqual(legs[0].from_node, "n5");
  assert.strictEqual(legs[legs.length - 1].to_node, "n7");
  assert.strictEqual(legs[legs.length - 1].signal_wait_s, 0); // no red light at the destination
});

test("an incident on a road adds its delay to that leg only", () => {
  const routes = compareRoutes({ graph, from: "n5", to: "n7", speeds, incidents: [accident] });
  const shortest = routes.find((r) => r.type === "shortest"); // goes through e7
  const legs = buildLegs({ graph, path: shortest, speeds, incidentsByEdge: groupIncidents([accident]), destination: "n7" });
  const hit = legs.find((l) => l.edge_id === "e7");
  assert.strictEqual(hit.incident_delay_s, 300);
  assert.deepStrictEqual(hit.incident_ids, [101]);
  assert.ok(legs.filter((l) => l.edge_id !== "e7").every((l) => l.incident_delay_s === 0));
});
