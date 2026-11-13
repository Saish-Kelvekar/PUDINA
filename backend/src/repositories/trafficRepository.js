const { query } = require("../config/db");

// The newest time step that is not after `time` (data comes every 15 min)
async function findStepAtOrBefore(time) {
  const r = await query(
    "SELECT max(timestamp_utc) AS t FROM traffic_measurements WHERE timestamp_utc <= $1", [time]);
  return r.rows[0].t; // a Date, or null if there is no data that early
}

async function findRowsAt(stepTime) {
  const r = await query(
    `SELECT segment_id, timestamp_utc, speed_kmph, free_flow_kmph, congestion_level, rain, incident, source
     FROM traffic_measurements WHERE timestamp_utc = $1`, [stepTime]);
  return r.rows;
}

async function findRange() {
  const r = await query(
    "SELECT min(timestamp_utc) AS first, max(timestamp_utc) AS last, count(*)::int AS rows FROM traffic_measurements");
  return r.rows[0];
}

module.exports = { findStepAtOrBefore, findRowsAt, findRange };
