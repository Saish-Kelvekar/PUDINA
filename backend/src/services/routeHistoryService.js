// A user's route search history: every POST /routes/compare is saved, and the user can mark
// which of the 5 routes they used. Users only ever see and change their OWN history.
const routes = require("../repositories/routeRepository");
const graphService = require("./graphService");
const AppError = require("../utils/AppError");

const iso = (d) => (d ? new Date(d).toISOString().replace(".000Z", "Z") : null);

function place(nodeId) {
  const n = graphService.getNode(nodeId);
  return { node_id: nodeId, name: n ? n.name : nodeId, lat: n ? n.lat : null, lng: n ? n.lng : null };
}

const brief = (r) => r && { route_id: r.route_id, type: r.type, label: r.label, rank: r.rank,
                            eta_min: r.eta_min, distance_km: r.distance_km, score: r.score };

// Database row -> one entry in the history list
function toItem(row) {
  const list = row.route_summaries || [];
  const recommended = list.find((r) => r.recommended) || list[0] || null;
  const chosen = row.chosen_route_id ? list.find((r) => r.route_id === row.chosen_route_id) : null;
  return {
    id: row.id,
    created_at: iso(row.created_at),
    sim_time_utc: iso(row.sim_time_utc),
    source: place(row.source_node),
    destination: place(row.dest_node),
    weights: row.weights,
    route_count: row.route_count,
    recommended: brief(recommended),
    chosen: chosen ? { ...brief(chosen), chosen_at: iso(row.chosen_at),
                       followed_recommendation: !!recommended && chosen.route_id === recommended.route_id } : null,
  };
}

async function list(userId, { limit, offset }) {
  const { rows, total } = await routes.listForUser(userId, { limit, offset });
  return { total, limit, offset, items: rows.map(toItem) };
}

async function getOne(userId, id) {
  const row = await routes.findFullForUser(id, userId);
  if (!row) throw new AppError(404, "NOT_FOUND", `No saved search ${id} in your history`);
  const recommended = row.routes.find((r) => r.recommended) || row.routes[0];
  // Same shape as POST /routes/compare, plus the saved choice, so the frontend can reuse its route cards
  return {
    comparison_id: row.id,
    saved: true,
    created_at: iso(row.created_at),
    sim_time_utc: iso(row.sim_time_utc),
    source: place(row.source_node),
    destination: place(row.dest_node),
    weights: row.weights,
    recommended_route_id: recommended ? recommended.route_id : null,
    chosen_route_id: row.chosen_route_id,
    chosen_at: iso(row.chosen_at),
    traffic_source: "SIMULATED",
    routes: row.routes,
  };
}

// routeId = "r2" marks it as used; routeId = null clears the choice
async function choose(userId, id, routeId) {
  const row = await routes.findSummaryForUser(id, userId);
  if (!row) throw new AppError(404, "NOT_FOUND", `No saved search ${id} in your history`);
  let type = null;
  if (routeId !== null) {
    const r = (row.route_summaries || []).find((x) => x.route_id === routeId);
    if (!r) {
      throw new AppError(400, "VALIDATION_ERROR", `route_id must be one of: ${(row.route_summaries || []).map((x) => x.route_id).join(", ")}`,
        [{ field: "route_id", issue: "not a route of this search" }]);
    }
    type = r.type;
  }
  await routes.setChoice(id, userId, { routeId, type });
  return { item: toItem(await routes.findSummaryForUser(id, userId)) };
}

async function remove(userId, id) {
  if (!(await routes.deleteOne(id, userId))) throw new AppError(404, "NOT_FOUND", `No saved search ${id} in your history`);
  return { deleted: 1 };
}

async function clear(userId) {
  return { deleted: await routes.deleteAll(userId) };
}

module.exports = { list, getOne, choose, remove, clear, toItem };
