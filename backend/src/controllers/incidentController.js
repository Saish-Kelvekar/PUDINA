const incidentService = require("../services/incidentService");
const { validateCreate, validateListQuery, parseId } = require("../validators/incidentValidator");
const AppError = require("../utils/AppError");
const { ok } = require("../utils/response");

async function create(req, res) {
  return ok(res, await incidentService.create(validateCreate(req.body || {}), req.user), 201);
}

async function list(req, res) {
  return ok(res, await incidentService.list(validateListQuery(req.query)));
}

async function getOne(req, res) {
  return ok(res, await incidentService.getOne(parseId(req.params.id)));
}

async function verify(req, res) {
  return ok(res, await incidentService.changeStatus(parseId(req.params.id), "verify", req.user));
}

async function reject(req, res) {
  const reason = (req.body && req.body.reason) || "";
  if (typeof reason !== "string") throw new AppError(400, "VALIDATION_ERROR", "reason must be text");
  return ok(res, await incidentService.changeStatus(parseId(req.params.id), "reject", req.user, { reason }));
}

async function resolve(req, res) {
  return ok(res, await incidentService.changeStatus(parseId(req.params.id), "resolve", req.user));
}

module.exports = { create, list, getOne, verify, reject, resolve };
