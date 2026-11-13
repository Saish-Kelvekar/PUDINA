// Numbers for the Admin dashboard and the Analytics page. All calculated from our own data.
const { query } = require("../config/db");
const ml = require("./mlClient");
const simClock = require("./simClock");

let congestionCache = null; // traffic data never changes while the server runs

async function mlStatus() {
  try {
    const h = await ml.health();
    return { status: "up", model_version: h.model_version };
  } catch (err) {
    return { status: "down", reason: err.reason || err.message };
  }
}

async function overview() {
  const [byStatus, closures, dups, users, recent, mlService] = await Promise.all([
    query("SELECT status, count(*)::int AS n FROM incidents GROUP BY status"),
    query("SELECT count(*)::int AS n FROM incidents WHERE status = 'verified' AND is_closure"),
    query("SELECT count(*)::int AS n FROM incident_duplicates WHERE status = 'pending'"),
    query("SELECT role, count(*)::int AS n FROM users GROUP BY role"),
    query(`SELECT l.id, l.incident_id, l.action, l.details, l.created_at, l.actor_id, u.name AS actor_name
           FROM incident_logs l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC, l.id DESC LIMIT 10`),
    mlStatus(),
  ]);
  const counts = { pending: 0, verified: 0, rejected: 0, merged: 0, resolved: 0 };
  for (const r of byStatus.rows) counts[r.status] = r.n;
  const usersByRole = Object.fromEntries(users.rows.map((r) => [r.role, r.n]));
  return {
    counts: {
      incidents_total: Object.values(counts).reduce((a, b) => a + b, 0),
      ...counts,
      active_closures: closures.rows[0].n,
      duplicate_candidates: dups.rows[0].n,
      users: users.rows.reduce((a, r) => a + r.n, 0),
      users_by_role: usersByRole,
    },
    recent_actions: recent.rows.map((r) => ({
      id: r.id, incident_id: r.incident_id, action: r.action, details: r.details,
      by: r.actor_id ? { id: r.actor_id, name: r.actor_name } : null, created_at: r.created_at,
    })),
    ml_service: mlService,
    sim_time_utc: simClock.getSimTime(),
  };
}

async function congestionByHour() {
  if (!congestionCache) {
    // IST = UTC + 5:30. heavy/severe = speed below half of free-flow.
    const r = await query(`
      SELECT extract(hour FROM timestamp_utc AT TIME ZONE 'Asia/Kolkata')::int AS hour_ist,
             round(avg(speed_kmph / free_flow_kmph)::numeric, 2)::float AS avg_speed_ratio,
             round(avg(CASE WHEN speed_kmph / free_flow_kmph < 0.5 THEN 1 ELSE 0 END)::numeric, 2)::float AS heavy_or_severe_share,
             count(*)::int AS samples
      FROM traffic_measurements GROUP BY 1 ORDER BY 1`);
    congestionCache = r.rows;
  }
  return congestionCache;
}

async function analytics() {
  const [hours, byType, signals, emergency, metrics] = await Promise.all([
    congestionByHour(),
    query(`SELECT category, count(*)::int AS count FROM incidents
           WHERE status NOT IN ('rejected', 'merged') GROUP BY category ORDER BY count DESC, category`),
    // latest "optimize" run per junction
    query(`SELECT DISTINCT ON (s.junction_id) s.junction_id, j.name, s.avg_wait_before_s, s.avg_wait_after_s, s.created_at
           FROM signal_simulations s JOIN junctions j ON j.id = s.junction_id
           WHERE s.mode = 'optimize' ORDER BY s.junction_id, s.created_at DESC`),
    query(`SELECT count(*)::int AS sessions, coalesce(avg(time_saved_s), 0)::float AS avg_s, coalesce(sum(time_saved_s), 0)::float AS total_s
           FROM emergency_sessions`),
    ml.metrics().catch(() => null),
  ]);
  const r1 = (x) => Math.round(x * 10) / 10;
  const e = emergency.rows[0];
  return {
    congestion_by_hour: hours,
    incidents_by_type: byType.rows,
    prediction_error: metrics
      ? Object.fromEntries(Object.entries(metrics.horizons).map(([h, m]) => [h, {
          mae_model_kmph: m.mae_model_kmph, mae_baseline_kmph: m.mae_baseline_kmph, improvement_pct: m.improvement_pct }]))
      : { 15: null, 30: null },
    prediction_model: metrics ? metrics.model_version : null,
    signal_improvement: signals.rows.map((s) => ({
      junction_id: s.junction_id, name: s.name, avg_wait_before_s: s.avg_wait_before_s, avg_wait_after_s: s.avg_wait_after_s,
      improvement_pct: s.avg_wait_before_s ? r1((100 * (s.avg_wait_before_s - s.avg_wait_after_s)) / s.avg_wait_before_s) : null,
    })),
    emergency_time_saved: { sessions: e.sessions, avg_saved_min: r1(e.avg_s / 60), total_saved_min: r1(e.total_s / 60) },
    source_note: "Traffic is SIMULATED. Prediction error comes from M3's test week. Signal and emergency numbers come from simulations run in this app.",
    generated_at: new Date().toISOString(),
  };
}

module.exports = { overview, analytics };
