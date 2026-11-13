const { query } = require("../config/db");

// Columns sent to the frontend, with the reporter's name joined in
const SELECT = `
  SELECT i.*, u.name AS reporter_name
  FROM incidents i LEFT JOIN users u ON u.id = i.reported_by`;

// Verified incidents that are still active. Only these change routes.
async function findActiveVerified() {
  const r = await query(
    `SELECT id, category, segment_id, lanes_blocked, is_closure,
            COALESCE(estimated_severity, reported_severity) AS severity
     FROM incidents WHERE status = 'verified' AND segment_id IS NOT NULL`);
  return r.rows;
}

async function findById(id, db = { query }) {
  const r = await db.query(`${SELECT} WHERE i.id = $1`, [id]);
  return r.rows[0] || null;
}

async function list({ statuses, category, since }) {
  const where = ["i.status = ANY($1)"];
  const params = [statuses];
  if (category) { params.push(category); where.push(`i.category = $${params.length}`); }
  if (since) { params.push(since); where.push(`i.created_at >= $${params.length}`); }
  const r = await query(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC`, params);
  return r.rows;
}

async function create(db, i) {
  const r = await db.query(
    `INSERT INTO incidents (category, description, lat, lng, segment_id, reported_severity,
                            lanes_blocked, is_closure, reported_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [i.category, i.description, i.lat, i.lng, i.segmentId, i.reportedSeverity,
     i.lanesBlocked, i.isClosure, i.reportedBy, i.source]);
  return r.rows[0].id;
}

// Changes status and stamps the matching time column
async function setStatus(db, id, status) {
  const stamp = { verified: ", verified_at = now()", resolved: ", resolved_at = now()" }[status] || "";
  await db.query(`UPDATE incidents SET status = $2, updated_at = now() ${stamp} WHERE id = $1`, [id, status]);
}

async function addLog(db, { incidentId, actorId, action, details = {} }) {
  const r = await db.query(
    `INSERT INTO incident_logs (incident_id, actor_id, action, details) VALUES ($1,$2,$3,$4)
     RETURNING id, action, details, created_at`,
    [incidentId, actorId, action, JSON.stringify(details)]);
  return r.rows[0];
}

async function findLogs(incidentId) {
  const r = await query(
    `SELECT l.id, l.action, l.details, l.created_at, l.actor_id, u.name AS actor_name
     FROM incident_logs l LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.incident_id = $1 ORDER BY l.created_at, l.id`, [incidentId]);
  return r.rows;
}


async function setSeverity(db, id, { level, confidence, evidence }) {
  await db.query(
    `UPDATE incidents SET estimated_severity = $2, severity_confidence = $3, severity_evidence = $4, updated_at = now()
     WHERE id = $1`, [id, level, confidence, JSON.stringify(evidence)]);
}

async function setMerged(db, id, intoId) {
  await db.query(`UPDATE incidents SET status = 'merged', merged_into = $2, updated_at = now() WHERE id = $1`, [id, intoId]);
}

// Earlier pending/verified reports within `minutes` of a time (duplicate candidates)
async function findRecentActive(db, { excludeId, around, minutes }) {
  const r = await db.query(
    `SELECT id, category, description, lat, lng, created_at FROM incidents
     WHERE id <> $1 AND status IN ('pending', 'verified')
       AND created_at BETWEEN $2::timestamptz - make_interval(mins => $3) AND $2::timestamptz + make_interval(mins => $3)`,
    [excludeId, around, minutes]);
  return r.rows;
}

async function saveDuplicate(db, { incidentId, candidateId, score, checks }) {
  await db.query(
    `INSERT INTO incident_duplicates (incident_id, candidate_id, score, checks) VALUES ($1, $2, $3, $4)
     ON CONFLICT (incident_id, candidate_id) DO UPDATE SET score = EXCLUDED.score, checks = EXCLUDED.checks`,
    [incidentId, candidateId, score, JSON.stringify(checks)]);
}

// Duplicate pairs involving this incident, in either direction
async function findDuplicates(id) {
  const r = await query(
    `SELECT d.id, d.score, d.checks, d.status,
            CASE WHEN d.incident_id = $1 THEN d.candidate_id ELSE d.incident_id END AS other_id
     FROM incident_duplicates d
     WHERE (d.incident_id = $1 OR d.candidate_id = $1)
     ORDER BY d.score DESC`, [id]);
  return r.rows;
}

async function setDuplicateStatus(db, a, b, status) {
  await db.query(
    `UPDATE incident_duplicates SET status = $3
     WHERE (incident_id = $1 AND candidate_id = $2) OR (incident_id = $2 AND candidate_id = $1)`, [a, b, status]);
}

async function countPendingDuplicates() {
  const r = await query("SELECT count(*)::int AS n FROM incident_duplicates WHERE status = 'pending'");
  return r.rows[0].n;
}

module.exports = {
  findActiveVerified, findById, list, create, setStatus, addLog, findLogs,
  setSeverity, setMerged, findRecentActive, saveDuplicate, findDuplicates, setDuplicateStatus, countPendingDuplicates,
};
