const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const users = require("../repositories/userRepository");
const AppError = require("../utils/AppError");

function makeToken(user) {
  // The token carries the user's id and role, signed with our secret, valid 12 hours
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

async function register({ name, email, password }) {
  if (await users.findByEmail(email)) {
    throw new AppError(409, "CONFLICT", "Email already registered");
  }
  const passwordHash = await bcrypt.hash(password, 10); // never store the real password
  const user = await users.create({ name, email, passwordHash, role: "user" });
  return { token: makeToken(user), user };
}

async function login({ email, password }) {
  const row = await users.findByEmail(email);
  // Same message for "no such email" and "wrong password", so attackers can't guess emails
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError(401, "UNAUTHORIZED", "Wrong email or password");
  }
  const { password_hash, ...user } = row;
  return { token: makeToken(user), user };
}

module.exports = { register, login };