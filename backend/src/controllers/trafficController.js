const trafficService = require("../services/trafficService");
const simClock = require("../services/simClock");
const trafficRepo = require("../repositories/trafficRepository");
const AppError = require("../utils/AppError");
const { ok } = require("../utils/response");

const iso = (d) => (d ? new Date(d).toISOString().replace(".000Z", "Z") : null);

async function getFlow(req, res) {
  let time;
  if (req.query.time) {
    time = new Date(req.query.time);
    if (Number.isNaN(time.getTime())) throw new AppError(400, "VALIDATION_ERROR", "time must be an ISO date");
    time = time.toISOString();
  }
  return ok(res, await trafficService.getFlow(time));
}

async function getClock(req, res) {
  const range = await trafficRepo.findRange();
  return ok(res, { sim_time_utc: simClock.getSimTime(), step_minutes: 15,
                   data_from_utc: iso(range.first), data_until_utc: iso(range.last), rows: range.rows });
}

// Admin: { "action": "next" } / { "action": "prev" } / { "time": "2026-11-10T08:00:00Z" }
async function setClock(req, res) {
  const { action, time } = req.body || {};
  if (time) simClock.setSimTime(time);
  else if (action === "next") simClock.step(1);
  else if (action === "prev") simClock.step(-1);
  else throw new AppError(400, "VALIDATION_ERROR", 'Send { "action": "next" | "prev" } or { "time": "<ISO>" }');
  return ok(res, { sim_time_utc: simClock.getSimTime() });
}

module.exports = { getFlow, getClock, setClock };
