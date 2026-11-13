const { query } = require("../config/db");

async function saveComparison({ userId, sourceNode, destNode, weights, routes, recommendedType, simTime }) {
  const r = await query(
    `INSERT INTO route_comparisons (user_id, source_node, dest_node, weights, routes, recommended_type, sim_time_utc)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, sourceNode, destNode, JSON.stringify(weights), JSON.stringify(routes), recommendedType, simTime]);
  return r.rows[0].id;
}

module.exports = { saveComparison };
