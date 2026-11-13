const incidentService = require("../services/incidentService");
const v = require("../validators/incidentValidator");
const AppError = require("../utils/AppError");
const { ok } = require("../utils/response");

async function create(req, res) {
  return ok(res, await incidentService.create(v.validateCreate(req.body || {}), req.user), 201);
}

async function list(req, res) {
  return ok(res, await incidentService.list(v.validateListQuery(req.query)));
}

async function getOne(req, res) {
  return ok(res, await incidentService.getOne(v.parseId(req.params.id)));
}

async function duplicates(req, res) {
  return ok(res, await incidentService.getDuplicates(v.parseId(req.params.id)));
}

async function verify(req, res) {
  return ok(res, await incidentService.changeStatus(v.parseId(req.params.id), "verify", req.user));
}

async function reject(req, res) {
  const reason = (req.body && req.body.reason) || "";
  if (typeof reason !== "string") throw new AppError(400, "VALIDATION_ERROR", "reason must be text");
  return ok(res, await incidentService.changeStatus(v.parseId(req.params.id), "reject", req.user, { reason }));
}

async function resolve(req, res) {
  return ok(res, await incidentService.changeStatus(v.parseId(req.params.id), "resolve", req.user));
}

async function merge(req, res) {
  return ok(res, await incidentService.merge(v.parseId(req.params.id), v.validateMerge(req.body), req.user));
}

async function severity(req, res) {
  return ok(res, await incidentService.changeSeverity(v.parseId(req.params.id), v.validateSeverity(req.body), req.user));
}

async function impact(req, res) {
  return ok(res, await incidentService.impact(v.parseId(req.params.id), v.validateImpact(req.body)));
}

module.exports = { create, list, getOne, duplicates, verify, reject, resolve, merge, severity, impact };
