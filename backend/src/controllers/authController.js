const authService = require("../services/authService");
const users = require("../repositories/userRepository");
const { validateRegister, validateLogin } = require("../validators/authValidator");
const AppError = require("../utils/AppError");
const { ok } = require("../utils/response");

async function register(req, res) {
  const result = await authService.register(validateRegister(req.body || {}));
  return ok(res, result, 201);
}

async function login(req, res) {
  const result = await authService.login(validateLogin(req.body || {}));
  return ok(res, result);
}

async function me(req, res) {
  const user = await users.findById(req.user.id);
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  return ok(res, { user });
}

module.exports = { register, login, me };