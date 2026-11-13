const AppError = require("../utils/AppError");

function validateRegister(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push({ field: "name", issue: "required" });
  if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) errors.push({ field: "email", issue: "must be a valid email" });
  if (!body.password || body.password.length < 6) errors.push({ field: "password", issue: "at least 6 characters" });
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", errors);
  return { name: body.name.trim(), email: body.email.trim().toLowerCase(), password: body.password };
}

function validateLogin(body) {
  if (!body.email || !body.password) {
    throw new AppError(400, "VALIDATION_ERROR", "email and password are required");
  }
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

module.exports = { validateRegister, validateLogin };