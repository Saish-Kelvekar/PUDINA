const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { nearestSegment, pointToPieceM } = require("../src/utils/geo");

const { edges } = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/sample/graph.json"), "utf8"));

test("a point on a road's bend finds that road", () => {
  const r = nearestSegment(edges, 12.931, 77.559); // middle bend of 1st Block Main Road (e7)
  assert.strictEqual(r.edge.id, "e7");
  assert.strictEqual(r.distance_m, 0);
});

test("a point a little off the road still finds it, with the distance", () => {
  const r = nearestSegment(edges, 12.9311, 77.5591);
  assert.strictEqual(r.edge.id, "e7");
  assert.ok(r.distance_m < 20);
});

test("a point far away reports a large distance", () => {
  assert.ok(nearestSegment(edges, 12.95, 77.6).distance_m > 1000);
});

test("distance to a piece is measured to its closest point, not just the ends", () => {
  // piece runs east-west along lat 0; point is 0.001 deg (~111 m) north of its middle
  const d = pointToPieceM([0.001, 0.005], [0, 0], [0, 0.01]);
  assert.ok(Math.abs(d - 111) < 1, String(d));
});
