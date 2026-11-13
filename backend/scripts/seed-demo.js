// Loads M3's demo data: data/seed/users.json and data/seed/incidents.json
//   node scripts/seed-demo.js          add/update users, add incidents
//   node scripts/seed-demo.js --reset  delete ALL incidents first (fresh demo)
// Run load-graph.js and load-traffic.js before this.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { pool } = require("../src/config/db");
const graphService = require("../src/services/graphService");
const trafficService = require("../src/services/trafficService");
const simClock = require("../src/services/simClock");
const { estimateSeverity } = require("../src/services/severityService");
const duplicates = require("../src/services/duplicateService");
const { nearestSegment } = require("../src/utils/geo");

const DIR = path.resolve(__dirname, "..", process.env.SEED_DIR || "../data/seed");
const RESET = process.argv.includes("--reset");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

(async () => {
  graphService.loadGraph();
  const users = readJson("users.json");
  // oldest first, so each report is compared with the ones before it
  const incidents = readJson("incidents.json").sort((a, b) => b.minutes_ago - a.minutes_ago);
  const { step, speeds, bySegmentHasData } = await trafficService.getSpeeds(simClock.getSimTime());

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (RESET) {
      await client.query("TRUNCATE incidents, incident_logs, incident_duplicates RESTART IDENTITY CASCADE");
      console.log("Deleted all incidents (--reset)");
    }

    // Users: add, or update name/role/password if the email exists
    const userId = {};
    for (const u of users) {
      const r = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash
         RETURNING id`,
        [u.name, u.email.toLowerCase(), await bcrypt.hash(u.password, 10), u.role]);
      userId[u.email.toLowerCase()] = r.rows[0].id;
    }
    const adminId = Object.entries(userId).find(([email]) => users.find((u) => u.email.toLowerCase() === email).role === "admin")?.[1] || null;
    console.log(`Users: ${users.map((u) => `${u.email} (${u.role})`).join(", ")}`);

    const existing = (await client.query("SELECT count(*)::int AS n FROM incidents")).rows[0].n;
    const saved = [];
    let dupPairs = 0;
    if (existing > 0 && !RESET) {
      console.log(`Incidents: skipped, ${existing} already in the database. Run with --reset for a fresh demo.`);
      incidents.length = 0;
    }
    for (const inc of incidents) {
      const { edge, distance_m } = nearestSegment(graphService.getGraph().edges, inc.lat, inc.lng);
      if (!edge || distance_m > 200) { console.warn(`  skipped "${inc.description}": ${distance_m} m from a road`); continue; }
      const createdAt = new Date(Date.now() - inc.minutes_ago * 60000);
      const isClosure = inc.is_closure === true || inc.category === "closure";
      const sev = estimateSeverity({
        category: inc.category, isClosure, lanesBlocked: inc.lanes_blocked || 0, reportedSeverity: inc.reported_severity,
        roadLanes: edge.lanes, speedRatio: step && bySegmentHasData.has(edge.id) ? speeds.get(edge.id) / edge.free_flow_kmph : null,
      });
      const reporter = userId[(inc.reported_by_email || "").toLowerCase()] || null;
      const verified = inc.status === "verified";
      const r = await client.query(
        `INSERT INTO incidents (category, description, lat, lng, segment_id, reported_severity, estimated_severity,
           severity_confidence, severity_evidence, lanes_blocked, is_closure, status, reported_by, source,
           created_at, updated_at, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'SIMULATED',$14,$14,$15) RETURNING id`,
        [inc.category, inc.description || "", inc.lat, inc.lng, edge.id, inc.reported_severity, sev.level, sev.confidence,
         JSON.stringify(sev.evidence), Math.min(inc.lanes_blocked || 0, edge.lanes), isClosure,
         verified ? "verified" : "pending", reporter, createdAt, verified ? new Date(createdAt.getTime() + 60000) : null]);
      const id = r.rows[0].id;
      await client.query(`INSERT INTO incident_logs (incident_id, actor_id, action, details, created_at) VALUES ($1,$2,'created',$3,$4)`,
        [id, reporter, JSON.stringify({ segment_id: edge.id, seeded: true }), createdAt]);
      if (verified) {
        await client.query(`INSERT INTO incident_logs (incident_id, actor_id, action, details, created_at) VALUES ($1,$2,'verified','{}',$3)`,
          [id, adminId, new Date(createdAt.getTime() + 60000)]);
      }

      // duplicate check against the reports seeded before this one
      const me = { lat: inc.lat, lng: inc.lng, category: inc.category, description: inc.description, created_at: createdAt };
      for (const other of saved) {
        const res = duplicates.scorePair(me, other);
        if (res && res.score >= duplicates.THRESHOLD) {
          await client.query(
            `INSERT INTO incident_duplicates (incident_id, candidate_id, score, checks) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [id, other.id, res.score, JSON.stringify(res.checks)]);
          dupPairs++;
          console.log(`  duplicate pair: #${id} ~ #${other.id} (score ${res.score})`);
        }
      }
      saved.push({ ...me, id, verified });
    }
    await client.query("COMMIT");
    if (saved.length) console.log(`Incidents: ${saved.length} added (${saved.filter((x) => x.verified).length} verified), ${dupPairs} duplicate pair(s) found`);
    console.log("Log in with any seeded email and the password in users.json.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed (nothing saved):", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
