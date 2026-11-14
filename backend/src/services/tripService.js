// Live Trip: plans one route and splits it into legs (one per road) with the time each takes,
// so the website can move a simulated vehicle along it. Nothing is saved (Recent searches is untouched).
// Uses the same planner, speeds, incidents and 20 s signal wait as Route Planner, so the ETA matches.
const graphService = require("./graphService");
const trafficService = require("./trafficService");
const simClock = require("./simClock");
const { resolvePoint } = require("./routeService");
const { compareRoutes, groupIncidents, incidentPenaltyS, ROUTE_TYPES } = require("./routePlanner");
const incidentRepo = require("../repositories/incidentRepository");
const AppError = require("../utils/AppError");
const { congestionLevel } = require("../utils/congestion");
const { SIGNAL_WAIT_S } = require("../config/constants");

const TRIP_TYPES = ["recommended", ...Object.keys(ROUTE_TYPES)];
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Pure: one leg per road on the path. Times use the same formulas as routeStats(),
 * so sum(drive_s + incident_delay_s + signal_wait_s) === the route's ETA.
 */
function buildLegs({ graph, path, speeds, incidentsByEdge, destination }) {
  return path.edge_ids.map((edgeId, i) => {
    const edge = graph.getEdge(edgeId);
    const fromId = path.node_ids[i];
    const toId = path.node_ids[i + 1];
    const speed = Math.max(speeds.get(edgeId) || 1, 1);
    const ratio = Math.min(1, (speeds.get(edgeId) || 0) / edge.free_flow_kmph);
    const penalty = incidentPenaltyS(edgeId, incidentsByEdge);
    const toNode = graph.getNode(toId);
    const coords = edge.from === fromId ? edge.coords : [...edge.coords].reverse();
    return {
      edge_id: edgeId,
      road_name: edge.name || null,
      from_node: fromId,
      to_node: toId,
      coords,
      length_m: Math.round(edge.length_m * 10) / 10,
      speed_kmph: round(speed),
      congestion_level: congestionLevel(ratio),
      drive_s: edge.length_m / (speed / 3.6),
      incident_delay_s: Number.isFinite(penalty) ? penalty : 0,
      incident_ids: (incidentsByEdge.get(edgeId) || []).map((x) => x.id),
      // red light at the end of this road (not at the destination)
      signal_wait_s: toNode.signalised && toId !== destination ? SIGNAL_WAIT_S : 0,
      signal_node: toNode.signalised && toId !== destination ? toId : null,
    };
  });
}

async function plan({ source, destination, routeType = "recommended" }) {
  if (!TRIP_TYPES.includes(routeType)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid input",
      [{ field: "route_type", issue: `one of ${TRIP_TYPES.join(", ")}` }]);
  }
  const from = resolvePoint(source, "source");
  const to = resolvePoint(destination, "destination");
  if (from.node_id === to.node_id) {
    throw new AppError(400, "VALIDATION_ERROR", "Source and destination are the same junction",
      [{ field: "destination", issue: "pick a different point" }]);
  }

  const simTime = simClock.getSimTime();
  const { speeds } = await trafficService.getSpeeds(simTime);
  const incidents = await incidentRepo.findActiveVerified();
  const routes = compareRoutes({ graph: graphService, from: from.node_id, to: to.node_id, speeds, incidents });
  if (routes.length === 0) throw new AppError(422, "NO_ROUTE", `No route from ${from.name} to ${to.name}`);

  const route = routeType === "recommended" ? routes[0] : routes.find((r) => r.type === routeType) || routes[0];
  const legs = buildLegs({ graph: graphService, path: route, speeds,
                           incidentsByEdge: groupIncidents(incidents), destination: to.node_id });
  const totalS = legs.reduce((s, l) => s + l.drive_s + l.incident_delay_s + l.signal_wait_s, 0);

  return {
    sim_time_utc: simTime,
    source: from,
    destination: to,
    route_type: route.type,
    route_label: route.label,
    recommended: route.recommended,
    explanation: route.explanation,
    distance_km: route.distance_km,
    eta_s: Math.round(totalS),
    eta_min: round(totalS / 60),
    signals_on_route: route.signals_on_route,
    incident_ids: route.incident_ids,
    closure_warnings: route.closure_warnings,
    node_ids: route.node_ids,
    coords: route.coords,
    legs: legs.map((l) => ({ ...l, drive_s: round(l.drive_s, 2) })),
    signal_wait_assumption_s: SIGNAL_WAIT_S,
    position_source: "SIMULATED",
    traffic_source: "SIMULATED",
  };
}

module.exports = { plan, buildLegs, TRIP_TYPES };
