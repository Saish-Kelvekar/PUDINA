// Our traffic is simulated, so the app has its own "current time" that we control.
// It starts at SIM_START (from .env) and moves in 15-minute steps (the CSV's step size).
const AppError = require("../utils/AppError");

const STEP_MS = 15 * 60 * 1000;

function snap(date) {
  // round down to a 15-minute step: 09:07 -> 09:00
  return new Date(Math.floor(date.getTime() / STEP_MS) * STEP_MS);
}

let simTime = snap(new Date(process.env.SIM_START || "2026-11-10T03:30:00Z"));

function getSimTime() {
  return simTime.toISOString().replace(".000Z", "Z");
}

function setSimTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new AppError(400, "VALIDATION_ERROR", "time must be an ISO date like 2026-11-10T03:30:00Z");
  simTime = snap(d);
  return getSimTime();
}

function step(n = 1) {
  simTime = new Date(simTime.getTime() + n * STEP_MS);
  return getSimTime();
}

module.exports = { getSimTime, setSimTime, step, STEP_MS };
