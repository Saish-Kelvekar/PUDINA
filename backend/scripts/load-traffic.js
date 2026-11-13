// Loads M3's traffic CSV into traffic_measurements.
// Run from backend/:  node scripts/load-traffic.js
// Safe to run again: existing rows are updated, not duplicated.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { pool } = require("../src/config/db");

const FILE = path.resolve(__dirname, "..", process.env.TRAFFIC_PATH || "../data/sample/traffic.csv");
const HEADER = "segment_id,timestamp_utc,speed_kmph,free_flow_kmph,congestion_level,rain,incident,source";
const LEVELS = new Set(["flowing", "moderate", "heavy", "severe", "no_data"]);
const BATCH = 5000; // rows per INSERT: much faster than one INSERT per row

async function insertBatch(client, rows) {
  // unnest() turns 8 arrays into rows, so one query inserts the whole batch
  const cols = [[], [], [], [], [], [], [], []];
  for (const r of rows) r.forEach((v, i) => cols[i].push(v));
  await client.query(
    `INSERT INTO traffic_measurements
       (segment_id, timestamp_utc, speed_kmph, free_flow_kmph, congestion_level, rain, incident, source)
     SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::float8[], $4::float8[], $5::text[], $6::bool[], $7::bool[], $8::text[])
     ON CONFLICT (segment_id, timestamp_utc) DO UPDATE SET
       speed_kmph = EXCLUDED.speed_kmph, free_flow_kmph = EXCLUDED.free_flow_kmph,
       congestion_level = EXCLUDED.congestion_level, rain = EXCLUDED.rain,
       incident = EXCLUDED.incident, source = EXCLUDED.source`,
    cols);
}

(async () => {
  console.log("Reading", FILE);
  const client = await pool.connect();
  const known = new Set((await client.query("SELECT id FROM road_segments")).rows.map((r) => r.id));
  if (known.size === 0) throw new Error("road_segments is empty. Run scripts/load-graph.js first.");

  const lines = readline.createInterface({ input: fs.createReadStream(FILE), crlfDelay: Infinity });
  let lineNo = 0, loaded = 0, batch = [];
  const skipped = { unknownSegment: 0, badRow: 0 };

  try {
    await client.query("BEGIN");
    for await (const line of lines) {
      lineNo++;
      if (lineNo === 1) {
        if (line.trim() !== HEADER) throw new Error(`Unexpected header:\n  ${line}\nexpected:\n  ${HEADER}`);
        continue;
      }
      if (!line.trim()) continue;
      const [seg, ts, speed, ff, lvl, rain, inc, src] = line.split(",").map((s) => s.trim());
      if (!known.has(seg)) { skipped.unknownSegment++; continue; }
      const sp = Number(speed), f = Number(ff);
      if (!ts || Number.isNaN(sp) || Number.isNaN(f) || !LEVELS.has(lvl)) { skipped.badRow++; continue; }
      batch.push([seg, ts, sp, f, lvl, rain === "1", inc === "1", src || "SIMULATED"]);
      if (batch.length === BATCH) {
        await insertBatch(client, batch); loaded += batch.length; batch = [];
        process.stdout.write(`\r  ${loaded} rows...`);
      }
    }
    if (batch.length) { await insertBatch(client, batch); loaded += batch.length; }
    await client.query("COMMIT");
    console.log(`\nLoaded ${loaded} rows. Skipped: ${skipped.unknownSegment} unknown segment, ${skipped.badRow} bad rows.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nLoad failed (nothing saved):", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
