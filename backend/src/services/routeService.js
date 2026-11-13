// POST /api/routes/compare: turns the request into points, gets traffic and incidents,
// runs the planner, saves the result and builds the response.
const graphService = require("./graphService");
const trafficService = require("./trafficService");
const simClock = require("./simClock");
const { compareRoutes } = require("./routePlanner");
const incidentRepo = require("../repositories/incidentRepository");
const routeRepo = require("../repositories/routeRepository");
const AppError = require("../utils/AppError");
const { SIGNAL_WAIT_S, MAX_SNAP_DISTANCE_M } = require("../config/constants");

// { node_id } -> that junction; { lat, lng } -> nearest junction
function resolvePoint(p, field) {
  if (p.node_id) {
    const n = graphService.getNode(p.node_id);
    if (!n) throw new AppError(404, "NOT_FOUND", `${field}: unknown junction ${p.node_id}`);
    return { node_id: n.id, name: n.name, lat: n.lat, lng: n.lng, snapped_m: 0 };
  }
  const { node, distance_m } = graphService.nearestNode(p.lat, p.lng);
  if (distance_m > MAX_SNAP_DISTANCE_M) {
    throw new AppError(400, "VALIDATION_ERROR",
      `${field} is ${distance_m} m from the nearest junction. Pick a point closer to the roads on the map.`,
      [{ field, issue: `must be within ${MAX_SNAP_DISTANCE_M} m of a junction` }]);
  }
  return { node_id: node.id, name: node.name, lat: node.lat, lng: node.lng, snapped_m: distance_m };
}

async function compare({ source, destination, weights, userId }) {
  const from = resolvePoint(source, "source");
  const to = resolvePoint(destination, "destination");
  if (from.node_id === to.node_id) {
    throw new AppError(400, "VALIDATION_ERROR", "Source and destination are the same junction",
      [{ field: "destination", issue: "pick a different point" }]);
  }

  const simTime = simClock.getSimTime();
  const { speeds } = await trafficService.getSpeeds(simTime);
  const incidents = await incidentRepo.findActiveVerified();

  const routes = compareRoutes({ graph: graphService, from: from.node_id, to: to.node_id, speeds, incidents, weights });
  if (routes.length === 0) throw new AppError(422, "NO_ROUTE", `No route from ${from.name} to ${to.name}`);

  const comparisonId = await routeRepo.saveComparison({
    userId, sourceNode: from.node_id, destNode: to.node_id, weights, routes,
    recommendedType: routes[0].type, simTime,
  });

  return {
    comparison_id: comparisonId,
    sim_time_utc: simTime,
    source: from,
    destination: to,
    weights,
    recommended_route_id: routes[0].route_id,
    traffic_source: "SIMULATED",
    signal_wait_assumption_s: SIGNAL_WAIT_S,
    routes,
  };
}

module.exports = { compare };