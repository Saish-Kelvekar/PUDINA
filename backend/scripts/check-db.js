const { query, pool } = require("../src/config/db");

(async () => {
  const res = await query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
  console.log("Connected! Tables in database:", res.rows[0].count);
  await pool.end();
})().catch((err) => {
  console.error("Connection failed:", err.message);
  process.exit(1);
});