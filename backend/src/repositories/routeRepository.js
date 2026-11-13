const { query } = require("../config/db");

async function saveComparison({ userId, sourceNode, destNode, weights, routes, recommendedType, simTime }) {
  const r = await query(
    `INSERT INTO route_comparisons (user_id, source_node, dest_node, weights, routes, recommended_type, sim_time_utc)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, sourceNode, destNode, JSON.stringify(weights), JSON.stringify(routes), recommendedType, simTime]);
  return r.rows[0].id;
}

// ---------- search history (migration 002) ----------

// Short summary of each route (no map lines), so the history list stays small
const SUMMARY = `
  SELECT c.id, c.source_node, c.dest_node, c.weights, c.recommended_type, c.sim_time_utc, c.created_at,
         c.chosen_route_id, c.chosen_type, c.chosen_at,
         jsonb_array_length(c.routes) AS route_count,
         (SELECT jsonb_agg(jsonb_build_object(
                   'route_id', r->'route_id', 'type', r->'type', 'label', r->'label', 'rank', r->'rank',
                   'recommended', r->'recommended', 'eta_min', r->'eta_min', 'distance_km', r->'distance_km',
                   'score', r->'score'))
            FROM jsonb_array_elements(c.routes) r) AS route_summaries
  FROM route_comparisons c`;

async function listForUser(userId, { limit, offset }) {
  const [rows, total] = await Promise.all([
    query(`${SUMMARY} WHERE c.user_id = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]),
    query("SELECT count(*)::int AS n FROM route_comparisons WHERE user_id = $1", [userId]),
  ]);
  return { rows: rows.rows, total: total.rows[0].n };
}

async function findSummaryForUser(id, userId) {
  const r = await query(`${SUMMARY} WHERE c.id = $1 AND c.user_id = $2`, [id, userId]);
  return r.rows[0] || null;
}

// Full saved search, including every route's map line
async function findFullForUser(id, userId) {
  const r = await query("SELECT * FROM route_comparisons WHERE id = $1 AND user_id = $2", [id, userId]);
  return r.rows[0] || null;
}

async function setChoice(id, userId, { routeId, type }) {
  const r = await query(
    `UPDATE route_comparisons
     SET chosen_route_id = $3, chosen_type = $4, chosen_at = CASE WHEN $3::text IS NULL THEN NULL ELSE now() END
     WHERE id = $1 AND user_id = $2`,
    [id, userId, routeId, type]);
  return r.rowCount;
}

async function deleteOne(id, userId) {
  const r = await query("DELETE FROM route_comparisons WHERE id = $1 AND user_id = $2", [id, userId]);
  return r.rowCount;
}

async function deleteAll(userId) {
  const r = await query("DELETE FROM route_comparisons WHERE user_id = $1", [userId]);
  return r.rowCount;
}

module.exports = { saveComparison, listForUser, findSummaryForUser, findFullForUser, setChoice, deleteOne, deleteAll };
