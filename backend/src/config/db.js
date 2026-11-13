// Connects to PostgreSQL once and shares the connection with the whole app.
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Small helper so other files can write: db.query("SELECT ...", [values])
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };