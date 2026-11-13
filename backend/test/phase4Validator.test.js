const test = require("node:test");
const assert = require("node:assert");
const { validateSimulate, validateEmergency } = require("../src/validators/phase4Validator");

test("signal simulate: defaults are optimize, 10 cycles, seed 42", () => {
  assert.deepStrictEqual(validateSimulate({ junction_id: "J-n271" }),
    { junctionId: "J-n271", mode: "optimize", cycles: 10, seed: 42, emergencyApproachId: null });
});

test("signal simulate: emergency mode needs an approach", () => {
  assert.throws(() => validateSimulate({ junction_id: "J-n271", mode: "emergency" }), /Invalid input/);
  assert.strictEqual(validateSimulate({ junction_id: "J-n271", mode: "emergency", emergency_approach_id: "n271-e2664" }).emergencyApproachId, "n271-e2664");
});

test("signal simulate: bad cycles and mode are rejected", () => {
  assert.throws(() => validateSimulate({ junction_id: "J-n271", cycles: 0 }));
  assert.throws(() => validateSimulate({ junction_id: "J-n271", mode: "fast" }));
});

test("emergency: vehicle type and both points are required", () => {
  const ok = validateEmergency({ vehicle_type: "ambulance", source: { node_id: "n1" }, destination: { lat: 12.9, lng: 77.5 } });
  assert.strictEqual(ok.vehicleType, "ambulance");
  assert.throws(() => validateEmergency({ vehicle_type: "taxi", source: { node_id: "n1" }, destination: { node_id: "n2" } }));
  assert.throws(() => validateEmergency({ vehicle_type: "fire", source: {}, destination: { node_id: "n2" } }));
});
