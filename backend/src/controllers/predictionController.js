const predictionService = require("../services/predictionService");
const { validatePredictionsQuery, validateMetricsQuery } = require("../validators/predictionValidator");
const { ok } = require("../utils/response");

async function list(req, res) {
  return ok(res, await predictionService.get(validatePredictionsQuery(req.query)));
}

async function metrics(req, res) {
  return ok(res, await predictionService.getMetrics(validateMetricsQuery(req.query)));
}

module.exports = { list, metrics };
