const { query } = require("../config/db");

// Verified incidents that are still active. Only these change routes.
async function findActiveVerified() {
  const r = await query(
    `SELECT id, category, segment_id, lanes_blocked, is_closure,
            COALESCE(estimated_severity, reported_severity) AS severity
     FROM incidents WHERE status = 'verified' AND segment_id IS NOT NULL`);
  return r.rows;
}

module.exports = { findActiveVerified };
