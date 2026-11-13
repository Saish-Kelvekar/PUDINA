-- TrafficVision AI — 002_route_history.sql
-- Owner: Member 2. Route search history: which route the user chose from each search.
-- Only ADDS columns and an index; existing data and code keep working.
-- Run once: psql -U postgres -d trafficvision -f migrations/002_route_history.sql
-- Safe to run again (IF NOT EXISTS).

BEGIN;

ALTER TABLE route_comparisons
  ADD COLUMN IF NOT EXISTS chosen_route_id TEXT,         -- "r1".."r5", NULL = not chosen yet
  ADD COLUMN IF NOT EXISTS chosen_type     TEXT,         -- fastest / shortest / least_congested / safest / eco
  ADD COLUMN IF NOT EXISTS chosen_at       TIMESTAMPTZ;

-- "My last 20 searches" must stay fast
CREATE INDEX IF NOT EXISTS idx_route_comparisons_user_time
  ON route_comparisons (user_id, created_at DESC);

COMMIT;
