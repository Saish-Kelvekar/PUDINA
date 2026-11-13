// Severity estimate, duplicate score and network impact. No database needed.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { estimateSeverity } = require("../src/services/severityService");
const { scorePair, jaccard, THRESHOLD } = require("../src/services/duplicateService");
const { simulateImpact, roadsWithinHops } = require("../src/services/impactService");

// ---------- severity ----------
test("severity: accident, 1 of 2 lanes, heavy road, reported medium = high", () => {
  const s = estimateSeverity({ category: "accident", isClosure: false, lanesBlocked: 1, reportedSeverity: "medium",
                               roadLanes: 2, speedRatio: 0.3 });
  assert.strictEqual(s.points, 5);
  assert.strictEqual(s.level, "high");
  assert.strictEqual(s.evidence.length, 4);
  assert.strictEqual(s.confidence, 0.82);
});

test("severity: small breakdown on a free road = low", () => {
  const s = estimateSeverity({ category: "breakdown", isClosure: false, lanesBlocked: 0, reportedSeverity: "low",
                               roadLanes: 2, speedRatio: 0.9 });
  assert.strictEqual(s.level, "low");
  assert.deepStrictEqual(s.evidence, ["Category breakdown (+1)"]);
});

test("severity: all lanes blocked counts more than some lanes", () => {
  const some = estimateSeverity({ category: "other", isClosure: false, lanesBlocked: 1, reportedSeverity: "low", roadLanes: 2, speedRatio: null });
  const all = estimateSeverity({ category: "other", isClosure: false, lanesBlocked: 2, reportedSeverity: "low", roadLanes: 2, speedRatio: null });
  assert.strictEqual(all.points - some.points, 1);
});

test("severity: no traffic data means no congestion point", () => {
  const s = estimateSeverity({ category: "accident", isClosure: false, lanesBlocked: 0, reportedSeverity: "low", roadLanes: 1, speedRatio: null });
  assert.ok(!s.evidence.some((e) => e.startsWith("Road already")));
});

// ---------- duplicates ----------
const base = { lat: 12.9, lng: 77.6, category: "accident", description: "Car crash at the signal", created_at: "2026-11-10T03:00:00Z" };

test("duplicate: same place, same time, same category scores high", () => {
  const r = scorePair(base, { ...base, description: "Crash near signal, car hit bike" });
  assert.ok(r.score >= THRESHOLD, String(r.score));
  assert.strictEqual(r.checks.distance_m, 0);
});

test("duplicate: more than 200 m apart is never a duplicate", () => {
  assert.strictEqual(scorePair(base, { ...base, lat: 12.9025 }), null); // ~278 m north
});

test("duplicate: more than 30 minutes apart is never a duplicate", () => {
  assert.strictEqual(scorePair(base, { ...base, created_at: "2026-11-10T03:31:00Z" }), null);
});

test("duplicate: different category at the same spot scores lower", () => {
  const same = scorePair(base, { ...base }).score;
  const diff = scorePair(base, { ...base, category: "roadwork" }).score;
  assert.ok(Math.abs(same - diff - 0.25) < 1e-9);
});

test("word overlap ignores case, punctuation and filler words", () => {
  assert.strictEqual(jaccard("Car CRASH, near the signal!", "car crash signal"), 1);
  assert.strictEqual(jaccard("", ""), 0);
});

// ---------- network impact (on M3's sample graph) ----------
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/sample/graph.json"), "utf8"));
const nodes = new Map(raw.nodes.map((n) => [n.id, n]));
const edges = new Map(raw.edges.map((e) => [e.id, e]));
const adj = new Map(raw.nodes.map((n) => [n.id, []]));
for (const e of raw.edges) { adj.get(e.from).push({ to: e.to, edge: e }); if (!e.oneway) adj.get(e.to).push({ to: e.from, edge: e }); }
const graph = { getGraph: () => raw, getNode: (id) => nodes.get(id), getEdge: (id) => edges.get(id), neighbours: (id) => adj.get(id) };
const speeds = new Map(raw.edges.map((e) => [e.id, e.free_flow_kmph / 2]));

test("impact: breadth-first search counts junctions away correctly", () => {
  const hops = roadsWithinHops(raw, edges.get("e7"), 3); // e7 = n2-n5
  assert.strictEqual(hops.get("e7"), 0);
  assert.strictEqual(hops.get("e1"), 1);  // shares n2
  assert.strictEqual(hops.get("e4"), 1);  // shares n5
  assert.strictEqual(hops.get("e9"), 2);  // via e2 (n2-n3)
});

test("impact: lane blockage halves the incident road and finds a diversion around it", () => {
  const r = simulateImpact({ graph, edge: edges.get("e7"), speeds, mode: "lane_blockage" });
  const own = r.affected_segments[0];
  assert.strictEqual(own.segment_id, "e7");
  assert.ok(Math.abs(own.speed_after_kmph - own.speed_before_kmph * 0.5) <= 0.05); // rounded to 1 decimal
  assert.ok(own.extra_delay_s > 0);
  assert.ok(!r.diversion_route.edge_ids.includes("e7"));
  assert.deepStrictEqual(r.diversion_route.node_ids, ["n2", "n1", "n5"]);
});

test("impact: closure marks the road closed and still finds the diversion", () => {
  const r = simulateImpact({ graph, edge: edges.get("e7"), speeds, mode: "closure" });
  assert.strictEqual(r.affected_segments[0].congestion_level_after, "closed");
  assert.strictEqual(r.blocked_route.eta_min_after, null);
  assert.ok(r.detour_minutes !== null);
});

test("impact: a dead-end road has no diversion", () => {
  const r = simulateImpact({ graph, edge: edges.get("e9"), speeds, mode: "closure" }); // only road to n7
  assert.strictEqual(r.diversion_route, null);
  assert.strictEqual(r.detour_minutes, null);
});
