const routeService = require("../services/routeService");
const { validateCompare } = require("../validators/routeValidator");
const { ok } = require("../utils/response");

async function compare(req, res) {
  const input = validateCompare(req.body || {});
  return ok(res, await routeService.compare({ ...input, userId: req.user.id }));
}

module.exports = { compare };
