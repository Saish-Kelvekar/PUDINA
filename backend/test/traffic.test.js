const test = require("node:test");
const assert = require("node:assert");
const { congestionLevel } = require("../src/utils/congestion");

test("congestion levels match the agreed thresholds", () => {
  assert.strictEqual(congestionLevel(0.9), "flowing");
  assert.strictEqual(congestionLevel(0.76), "flowing");
  assert.strictEqual(congestionLevel(0.75), "moderate"); // 0.75 itself is moderate
  assert.strictEqual(congestionLevel(0.5), "moderate");
  assert.strictEqual(congestionLevel(0.49), "heavy");
  assert.strictEqual(congestionLevel(0.25), "heavy");
  assert.strictEqual(congestionLevel(0.1), "severe");
  assert.strictEqual(congestionLevel(null), "no_data");
});

test("simulation clock snaps to 15-minute steps and moves", () => {
  process.env.SIM_START = "2026-11-10T03:37:12Z";
  delete require.cache[require.resolve("../src/services/simClock")];
  const clock = require("../src/services/simClock");
  assert.strictEqual(clock.getSimTime(), "2026-11-10T03:30:00Z");   // 03:37 -> 03:30
  assert.strictEqual(clock.step(1), "2026-11-10T03:45:00Z");
  assert.strictEqual(clock.step(-2), "2026-11-10T03:15:00Z");
  assert.strictEqual(clock.setSimTime("2026-11-10T08:05:00Z"), "2026-11-10T08:00:00Z");
  assert.throws(() => clock.setSimTime("banana"), /ISO date/);
});
