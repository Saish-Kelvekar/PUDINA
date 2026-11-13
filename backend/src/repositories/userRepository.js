const { query } = require("../config/db");

const PUBLIC = "id, name, email, role, created_at"; // never send password_hash out

async function findByEmail(email) {
  const r = await query("SELECT * FROM users WHERE email = $1", [email]);
  return r.rows[0] || null;
}

async function findById(id) {
  const r = await query(`SELECT ${PUBLIC} FROM users WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function create({ name, email, passwordHash, role = "user" }) {
  const r = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC}`,
    [name, email, passwordHash, role]
  );
  return r.rows[0];
}

module.exports = { findByEmail, findById, create };