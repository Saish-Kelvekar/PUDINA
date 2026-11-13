// Incident reports: create, list, view, and status changes (verify / reject / resolve).
// Merge, severity estimate, duplicates and network impact come in Phase 3.
const incidents = require("../repositories/incidentRepository");
const graphService = require("./graphService");
const { nearestSegment } = require("../utils/geo");
const { withTransaction } = require("../config/tx");
const AppError = require("../utils/AppError");

const MAX_DISTANCE_FROM_ROAD_M = 200;
const iso = (d) => (d ? new Date(d).toISOString() : null);

// Database row -> the shape in API.md
function toApi(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    segment_id: row.segment_id,
    reported_severity: row.reported_severity,
    estimated_severity: row.estimated_severity
      ? { level: row.estimated_severity, confidence: row.severity_confidence, evidence: row.severity_evidence }
      : null, // filled in by the severity estimate (Phase 3)
    lanes_blocked: row.lanes_blocked,
    is_closure: row.is_closure,
    status: row.status,
    merged_into: row.merged_into,
    reported_by: row.reported_by ? { id: row.reported_by, name: row.reporter_name } : null,
    source: row.source,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    verified_at: iso(row.verified_at),
    resolved_at: iso(row.resolved_at),
  };
}

async function create(input, user) {
  const { edge, distance_m } = nearestSegment(graphService.getGraph().edges, input.lat, input.lng);
  if (!edge || distance_m > MAX_DISTANCE_FROM_ROAD_M) {
    throw new AppError(400, "VALIDATION_ERROR", `Point is ${distance_m} m from the nearest road. Pick a point on a road.`,
      [{ field: "lat", issue: `must be within ${MAX_DISTANCE_FROM_ROAD_M} m of a road` }]);
  }
  if (input.lanesBlocked > edge.lanes) {
    throw new AppError(400, "VALIDATION_ERROR", `${edge.name || edge.id} has only ${edge.lanes} lane(s)`,
      [{ field: "lanes_blocked", issue: `at most ${edge.lanes}` }]);
  }

  const id = await withTransaction(async (db) => {
    const newId = await incidents.create(db, {
      ...input, segmentId: edge.id, reportedBy: user.id, source: "USER_REPORTED",
    });
    await incidents.addLog(db, { incidentId: newId, actorId: user.id, action: "created",
      details: { segment_id: edge.id, distance_to_road_m: distance_m } });
    return newId;
  });
  return {
    incident: toApi(await incidents.findById(id)),
    possible_duplicates: null, // duplicate detection comes in Phase 3
  };
}

async function list(filters) {
  const rows = await incidents.list(filters);
  return { count: rows.length, incidents: rows.map(toApi) };
}

async function getOne(id) {
  const row = await incidents.findById(id);
  if (!row) throw new AppError(404, "NOT_FOUND", `Incident ${id} not found`);
  const logs = await incidents.findLogs(id);
  return {
    incident: toApi(row),
    logs: logs.map((l) => ({ id: l.id, action: l.action, by: l.actor_id ? { id: l.actor_id, name: l.actor_name } : null,
                             details: l.details, created_at: iso(l.created_at) })),
  };
}

// Which status each action needs, and what it changes to
const TRANSITIONS = {
  verify: { from: ["pending"], to: "verified", log: "verified" },
  reject: { from: ["pending"], to: "rejected", log: "rejected" },
  resolve: { from: ["verified"], to: "resolved", log: "resolved" },
};

async function changeStatus(id, action, admin, details = {}) {
  const t = TRANSITIONS[action];
  const log = await withTransaction(async (db) => {
    // FOR UPDATE locks the row, so two admins clicking at once can't both change it
    const r = await db.query("SELECT status FROM incidents WHERE id = $1 FOR UPDATE", [id]);
    if (!r.rows[0]) throw new AppError(404, "NOT_FOUND", `Incident ${id} not found`);
    const current = r.rows[0].status;
    if (!t.from.includes(current)) {
      throw new AppError(409, "CONFLICT", `Cannot ${action} an incident that is ${current} (needs ${t.from.join(" or ")})`);
    }
    await incidents.setStatus(db, id, t.to);
    return incidents.addLog(db, { incidentId: id, actorId: admin.id, action: t.log, details });
  });
  return {
    incident: toApi(await incidents.findById(id)),
    log: { id: log.id, action: log.action, by: { id: admin.id }, details: log.details, created_at: iso(log.created_at) },
  };
}

module.exports = { create, list, getOne, changeStatus, toApi };
