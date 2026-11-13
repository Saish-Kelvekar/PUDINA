const routeService = require("../services/routeService");
const history = require("../services/routeHistoryService");
const { validateCompare } = require("../validators/routeValidator");
const hv = require("../validators/routeHistoryValidator");
const { ok } = require("../utils/response");

async function compare(req, res) {
  const input = validateCompare(req.body || {});
  return ok(res, await routeService.compare({ ...input, userId: req.user.id }));
}

// ---------- search history (always the logged-in user's own) ----------
async function listHistory(req, res) {
  return ok(res, await history.list(req.user.id, hv.validateListQuery(req.query)));
}

async function getHistory(req, res) {
  return ok(res, await history.getOne(req.user.id, hv.parseId(req.params.id)));
}

async function chooseRoute(req, res) {
  return ok(res, await history.choose(req.user.id, hv.parseId(req.params.id), hv.validateChoose(req.body)));
}

async function deleteHistory(req, res) {
  return ok(res, await history.remove(req.user.id, hv.parseId(req.params.id)));
}

async function clearHistory(req, res) {
  return ok(res, await history.clear(req.user.id));
}

module.exports = { compare, listHistory, getHistory, chooseRoute, deleteHistory, clearHistory };
