// Incident reports: create (with severity estimate + duplicate check), list, view,
// verify / reject / resolve, merge, change severity, and network impact.
const incidents = require("../repositories/incidentRepository");
const graphService = require("./graphService");
const trafficService = require("./trafficService");
const simClock = require("./simClock");
const { estimateSeverity } = require("./severityService");
const duplicates = require("./duplicateService");
const { simulateImpact } = require("./impactService");
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
      : null,
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

async function mustFind(id, db) {
  const row = await incidents.findById(id, db);
  if (!row) throw new AppError(404, "NOT_FOUND", `Incident ${id} not found`);
  return row;
}

// ---------- create ----------
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

  // Severity from the report + how slow the road is right now (null if the road has no traffic data)
  const { step, bySegmentHasData, speeds } = await trafficService.getSpeeds(simClock.getSimTime());
  const hasData = bySegmentHasData ? bySegmentHasData.has(edge.id) : true;
  const severity = estimateSeverity({
    category: input.category, isClosure: input.isClosure, lanesBlocked: input.lanesBlocked,
    reportedSeverity: input.reportedSeverity, roadLanes: edge.lanes,
    speedRatio: step && hasData ? speeds.get(edge.id) / edge.free_flow_kmph : null,
  });

  const { id, found } = await withTransaction(async (db) => {
    const newId = await incidents.create(db, {
      ...input, segmentId: edge.id, reportedBy: user.id, source: "USER_REPORTED",
    });
    await incidents.setSeverity(db, newId, severity);
    await incidents.addLog(db, { incidentId: newId, actorId: user.id, action: "created",
      details: { segment_id: edge.id, distance_to_road_m: distance_m } });

    // Duplicate check against recent reports
    const me = await incidents.findById(newId, db);
    const recent = await incidents.findRecentActive(db, { excludeId: newId, around: me.created_at, minutes: duplicates.MAX_MINUTES });
    let count = 0;
    for (const other of recent) {
      const result = duplicates.scorePair(me, other);
      if (result && result.score >= duplicates.THRESHOLD) {
        await incidents.saveDuplicate(db, { incidentId: newId, candidateId: other.id, ...result });
        count++;
      }
    }
    return { id: newId, found: count };
  });
  return { incident: toApi(await incidents.findById(id)), possible_duplicates: found };
}

// ---------- read ----------
async function list(filters) {
  const rows = await incidents.list(filters);
  return { count: rows.length, incidents: rows.map(toApi) };
}

async function getOne(id) {
  const row = await mustFind(id);
  const logs = await incidents.findLogs(id);
  return {
    incident: toApi(row),
    logs: logs.map((l) => ({ id: l.id, action: l.action, by: l.actor_id ? { id: l.actor_id, name: l.actor_name } : null,
                             details: l.details, created_at: iso(l.created_at) })),
  };
}

async function getDuplicates(id) {
  await mustFind(id);
  const pairs = await incidents.findDuplicates(id);
  const candidates = [];
  for (const p of pairs) {
    const other = await incidents.findById(p.other_id);
    if (other) candidates.push({ incident: toApi(other), score: p.score, checks: p.checks,
                                 weights: duplicates.WEIGHTS, status: p.status });
  }
  return { incident_id: id, threshold: duplicates.THRESHOLD, candidates };
}

// ---------- admin actions ----------
const TRANSITIONS = {
  verify: { from: ["pending"], to: "verified", log: "verified" },
  reject: { from: ["pending"], to: "rejected", log: "rejected" },
  resolve: { from: ["verified"], to: "resolved", log: "resolved" },
};

// Locks the row so two admins clicking at once can't both change it
async function lockStatus(db, id) {
  const r = await db.query("SELECT status FROM incidents WHERE id = $1 FOR UPDATE", [id]);
  if (!r.rows[0]) throw new AppError(404, "NOT_FOUND", `Incident ${id} not found`);
  return r.rows[0].status;
}

function logToApi(log, admin) {
  return { id: log.id, action: log.action, by: { id: admin.id }, details: log.details, created_at: iso(log.created_at) };
}

async function changeStatus(id, action, admin, details = {}) {
  const t = TRANSITIONS[action];
  const log = await withTransaction(async (db) => {
    const current = await lockStatus(db, id);
    if (!t.from.includes(current)) {
      throw new AppError(409, "CONFLICT", `Cannot ${action} an incident that is ${current} (needs ${t.from.join(" or ")})`);
    }
    await incidents.setStatus(db, id, t.to);
    return incidents.addLog(db, { incidentId: id, actorId: admin.id, action: t.log, details });
  });
  return { incident: toApi(await incidents.findById(id)), log: logToApi(log, admin) };
}

// This incident is the same event as `intoId`: mark it merged into that one
async function merge(id, intoId, admin) {
  if (id === intoId) throw new AppError(400, "VALIDATION_ERROR", "Cannot merge an incident into itself");
  const log = await withTransaction(async (db) => {
    const mine = await lockStatus(db, id);
    if (!["pending", "verified"].includes(mine)) {
      throw new AppError(409, "CONFLICT", `Cannot merge an incident that is ${mine} (needs pending or verified)`);
    }
    const target = await lockStatus(db, intoId);
    if (!["pending", "verified"].includes(target)) {
      throw new AppError(409, "CONFLICT", `Cannot merge into incident ${intoId}: it is ${target}`);
    }
    await incidents.setMerged(db, id, intoId);
    await incidents.setDuplicateStatus(db, id, intoId, "merged");
    return incidents.addLog(db, { incidentId: id, actorId: admin.id, action: "merged", details: { into_id: intoId } });
  });
  return {
    incident: toApi(await incidents.findById(id)),
    merged_into: toApi(await incidents.findById(intoId)),
    log: logToApi(log, admin),
  };
}

async function changeSeverity(id, level, admin) {
  const log = await withTransaction(async (db) => {
    const status = await lockStatus(db, id);
    if (["rejected", "merged"].includes(status)) {
      throw new AppError(409, "CONFLICT", `Cannot change severity of an incident that is ${status}`);
    }
    const before = (await incidents.findById(id, db)).estimated_severity;
    await incidents.setSeverity(db, id, { level, confidence: 1, evidence: [`Set to ${level} by admin`] });
    return incidents.addLog(db, { incidentId: id, actorId: admin.id, action: "severity_changed", details: { from: before, to: level } });
  });
  return { incident: toApi(await incidents.findById(id)), log: logToApi(log, admin) };
}

// ---------- network impact ----------
async function impact(id, mode) {
  const row = await mustFind(id);
  const edge = graphService.getEdge(row.segment_id);
  if (!edge) throw new AppError(409, "CONFLICT", `Incident ${id} is not on a known road`);
  const chosenMode = mode || (row.is_closure ? "closure" : "lane_blockage");
  const { speeds } = await trafficService.getSpeeds(simClock.getSimTime());
  return {
    incident_id: id,
    ...simulateImpact({ graph: graphService, edge, speeds, mode: chosenMode }),
    source: "SIMULATED",
    computed_at: new Date().toISOString(),
  };
}

module.exports = { create, list, getOne, getDuplicates, changeStatus, merge, changeSeverity, impact, toApi };
