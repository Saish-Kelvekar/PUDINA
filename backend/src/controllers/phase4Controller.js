const signalService = require("../services/signalService");
const emergencyService = require("../services/emergencyService");
const { validateSimulate, validateEmergency } = require("../validators/phase4Validator");
const { ok } = require("../utils/response");

async function junctions(req, res) {
  return ok(res, { junctions: signalService.listJunctions() });
}

async function simulate(req, res) {
  return ok(res, await signalService.simulate(validateSimulate(req.body || {}), req.user));
}

async function emergencyRoute(req, res) {
  return ok(res, await emergencyService.route(validateEmergency(req.body || {}), req.user));
}

module.exports = { junctions, simulate, emergencyRoute };
