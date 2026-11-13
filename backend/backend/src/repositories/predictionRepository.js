const { query } = require("../config/db");

// Saves a batch of predictions in one query; already-saved ones are skipped
async function saveMany(rows) {
  if (!rows.length) return;
  const cols = [[], [], [], [], [], [], [], []];
  for (const r of rows) {
    [r.segment_id, r.made_at_utc, r.target_time_utc, r.horizon_min, r.predicted_speed_kmph,
     r.predicted_level, r.confidence, r.model_version].forEach((v, i) => cols[i].push(v));
  }
  await query(
    `INSERT INTO traffic_predictions
       (segment_id, made_at_utc, target_time_utc, horizon_min, predicted_speed_kmph, predicted_level, confidence, model_version)
     SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::timestamptz[], $4::int[], $5::float8[], $6::text[], $7::float8[], $8::text[])
     ON CONFLICT (segment_id, made_at_utc, horizon_min, model_version) DO NOTHING`,
    cols);
}

module.exports = { saveMany };
