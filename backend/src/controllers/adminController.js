const adminService = require("../services/adminService");
const { ok } = require("../utils/response");

async function overview(req, res) {
  return ok(res, await adminService.overview());
}

async function analytics(req, res) {
  return ok(res, await adminService.analytics());
}

module.exports = { overview, analytics };
