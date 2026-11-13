// Route search history: request checks and how a saved search becomes a list item. No database.
const test = require("node:test");
const assert = require("node:assert");
const { parseId, validateListQuery, validateChoose } = require("../src/validators/routeHistoryValidator");
const { toItem } = require("../src/services/routeHistoryService");

test("list query: defaults and limits", () => {
  assert.deepStrictEqual(validateListQuery({}), { limit: 20, offset: 0 });
  assert.deepStrictEqual(validateListQuery({ limit: "5", offset: "10" }), { limit: 5, offset: 10 });
  assert.throws(() => validateListQuery({ limit: "0" }));
  assert.throws(() => validateListQuery({ limit: "101" }));
  assert.throws(() => validateListQuery({ offset: "-1" }));
});

test("choose: a route id, or null to clear", () => {
  assert.strictEqual(validateChoose({ route_id: "r2" }), "r2");
  assert.strictEqual(validateChoose({ route_id: null }), null);
  assert.throws(() => validateChoose({}), /route_id/);
  assert.throws(() => validateChoose({ route_id: "fastest" }));
  assert.throws(() => validateChoose({ route_id: 2 }));
});

test("ids must be positive whole numbers", () => {
  assert.strictEqual(parseId("7"), 7);
  assert.throws(() => parseId("abc"));
  assert.throws(() => parseId("0"));
});

const row = (chosen) => ({
  id: 3, source_node: "x1", dest_node: "x2", weights: { time: 1 }, sim_time_utc: "2026-11-10T03:30:00Z",
  created_at: "2026-11-13T10:00:00.000Z", chosen_route_id: chosen, chosen_at: chosen ? "2026-11-13T10:01:00.000Z" : null,
  route_count: 2,
  route_summaries: [
    { route_id: "r2", type: "eco", label: "Eco (least fuel)", rank: 1, recommended: true, eta_min: 5, distance_km: 2, score: 80 },
    { route_id: "r1", type: "fastest", label: "Fastest", rank: 2, recommended: false, eta_min: 4.5, distance_km: 2.4, score: 70 },
  ],
});

test("list item: recommended route and no choice yet", () => {
  const item = toItem(row(null));
  assert.strictEqual(item.recommended.route_id, "r2");
  assert.strictEqual(item.chosen, null);
  assert.strictEqual(item.created_at, "2026-11-13T10:00:00Z");
});

test("list item: says whether the user followed the recommendation", () => {
  assert.strictEqual(toItem(row("r2")).chosen.followed_recommendation, true);
  const other = toItem(row("r1")).chosen;
  assert.strictEqual(other.followed_recommendation, false);
  assert.strictEqual(other.label, "Fastest");
});
