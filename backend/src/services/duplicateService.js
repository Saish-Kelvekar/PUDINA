// Is a new report the same event as an earlier one?
// Hard rules first (within 200 m and 30 min), then a 0-1 score from 4 checks.
// Pairs at or above the threshold are shown to the admin. Never merged automatically.
const { haversineM } = require("./routingService");

const MAX_DISTANCE_M = 200;
const MAX_MINUTES = 30;
const THRESHOLD = 0.6;
const WEIGHTS = { distance: 0.35, category: 0.25, time: 0.25, text: 0.15 };
const STOP_WORDS = new Set(["the", "and", "near", "with", "for", "from", "very", "there", "this", "that", "road", "at"]);

function words(text) {
  return new Set((text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w)));
}

// Word overlap: shared words / all words (Jaccard). Two empty descriptions count as 0.
function jaccard(a, b) {
  const A = words(a), B = words(b);
  const union = new Set([...A, ...B]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return Math.round((shared / union.size) * 100) / 100;
}

const r2 = (x) => Math.round(x * 100) / 100;

// a, b: { lat, lng, category, description, created_at }
function scorePair(a, b) {
  const distance_m = Math.round(haversineM([a.lat, a.lng], [b.lat, b.lng]));
  const minutes_apart = Math.round(Math.abs(new Date(a.created_at) - new Date(b.created_at)) / 6000) / 10;
  if (distance_m > MAX_DISTANCE_M || minutes_apart > MAX_MINUTES) return null; // can't be the same event

  const checks = {
    distance_m,
    distance_score: r2(1 - distance_m / MAX_DISTANCE_M),
    same_category: a.category === b.category,
    category_score: a.category === b.category ? 1 : 0,
    minutes_apart,
    time_score: r2(1 - minutes_apart / MAX_MINUTES),
    text_jaccard: jaccard(a.description, b.description),
  };
  const score = r2(WEIGHTS.distance * checks.distance_score + WEIGHTS.category * checks.category_score +
                   WEIGHTS.time * checks.time_score + WEIGHTS.text * checks.text_jaccard);
  return { score, checks };
}

module.exports = { scorePair, jaccard, THRESHOLD, WEIGHTS, MAX_DISTANCE_M, MAX_MINUTES };
