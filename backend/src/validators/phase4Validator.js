const AppError = require("../utils/AppError");

function validateSimulate(b) {
  const errors = [];
  if (!b.junction_id || typeof b.junction_id !== "string") errors.push({ field: "junction_id", issue: 'required, e.g. "J-n271"' });
  const mode = b.mode || "optimize";
  if (!["optimize", "emergency"].includes(mode)) errors.push({ field: "mode", issue: "optimize or emergency" });
  if (mode === "emergency" && !b.emergency_approach_id) errors.push({ field: "emergency_approach_id", issue: "required in emergency mode" });
  const cycles = b.cycles === undefined ? 10 : b.cycles;
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 100) errors.push({ field: "cycles", issue: "whole number 1-100" });
  const seed = b.seed === undefined ? 42 : b.seed;
  if (!Number.isInteger(seed)) errors.push({ field: "seed", issue: "whole number" });
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", errors);
  return { junctionId: b.junction_id, mode, cycles, seed, emergencyApproachId: b.emergency_approach_id || null };
}

function validateEmergency(b) {
  const errors = [];
  if (!["ambulance", "fire", "police"].includes(b.vehicle_type)) errors.push({ field: "vehicle_type", issue: "ambulance, fire or police" });
  for (const field of ["source", "destination"]) {
    const p = b[field];
    const okNode = p && typeof p.node_id === "string" && p.node_id;
    const okPoint = p && typeof p.lat === "number" && typeof p.lng === "number";
    if (!okNode && !okPoint) errors.push({ field, issue: 'give { "node_id" } or numeric { "lat", "lng" }' });
  }
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", errors);
  return { vehicleType: b.vehicle_type, source: b.source, destination: b.destination };
}

module.exports = { validateSimulate, validateEmergency };
