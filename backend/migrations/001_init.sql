-- TrafficVision AI — 001_init.sql
-- Owner: Member 2. Plain PostgreSQL (no PostGIS). All timestamps are UTC (TIMESTAMPTZ).
-- Run: psql "$DATABASE_URL" -f backend/migrations/001_init.sql

BEGIN;

-- ---------- shared value types ----------
-- Every row that shows data to users carries one of these labels.
CREATE DOMAIN source_label AS TEXT
  CHECK (VALUE IN ('LIVE_EXTERNAL_API', 'USER_REPORTED', 'HISTORICAL', 'SIMULATED', 'AI_PREDICTED'));

-- From speed ratio (speed / free-flow): >0.75 flowing, 0.5–0.75 moderate, 0.25–0.5 heavy, <0.25 severe.
CREATE DOMAIN congestion_level AS TEXT
  CHECK (VALUE IN ('flowing', 'moderate', 'heavy', 'severe', 'no_data'));

CREATE DOMAIN severity_level AS TEXT
  CHECK (VALUE IN ('low', 'medium', 'high'));

-- ---------- users ----------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'emergency')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- road network (loaded from data/graph.json) ----------
CREATE TABLE road_nodes (
  id         TEXT PRIMARY KEY,                      -- "n1"
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  name       TEXT,
  signalised BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE road_segments (
  id             TEXT PRIMARY KEY,                  -- "e1" (same id as traffic CSV segment_id)
  from_node      TEXT NOT NULL REFERENCES road_nodes(id),
  to_node        TEXT NOT NULL REFERENCES road_nodes(id),
  name           TEXT,
  length_m       DOUBLE PRECISION NOT NULL CHECK (length_m > 0),
  road_type      TEXT NOT NULL,
  lanes          INT  NOT NULL DEFAULT 1 CHECK (lanes >= 1),
  free_flow_kmph DOUBLE PRECISION NOT NULL CHECK (free_flow_kmph > 0),
  oneway         BOOLEAN NOT NULL DEFAULT false,    -- false = usable both ways, stored once
  coords         JSONB NOT NULL                     -- [[lat, lng], ...] from -> to
);
CREATE INDEX idx_segments_from ON road_segments(from_node);
CREATE INDEX idx_segments_to   ON road_segments(to_node);

CREATE TABLE junctions (
  id         TEXT PRIMARY KEY,                      -- "J-n5"
  node_id    TEXT NOT NULL UNIQUE REFERENCES road_nodes(id),
  name       TEXT,
  default_green_s INT NOT NULL DEFAULT 30,
  yellow_s        INT NOT NULL DEFAULT 3,
  all_red_s       INT NOT NULL DEFAULT 2
);

-- ---------- traffic ----------
CREATE TABLE traffic_measurements (
  id               BIGSERIAL PRIMARY KEY,
  segment_id       TEXT NOT NULL REFERENCES road_segments(id),
  timestamp_utc    TIMESTAMPTZ NOT NULL,
  speed_kmph       DOUBLE PRECISION NOT NULL CHECK (speed_kmph >= 0),
  free_flow_kmph   DOUBLE PRECISION NOT NULL,
  congestion_level congestion_level NOT NULL,
  rain             BOOLEAN NOT NULL DEFAULT false,
  incident         BOOLEAN NOT NULL DEFAULT false,
  source           source_label NOT NULL,
  UNIQUE (segment_id, timestamp_utc)
);
CREATE INDEX idx_traffic_time ON traffic_measurements(timestamp_utc);

CREATE TABLE traffic_predictions (
  id                   BIGSERIAL PRIMARY KEY,
  segment_id           TEXT NOT NULL REFERENCES road_segments(id),
  made_at_utc          TIMESTAMPTZ NOT NULL,        -- simulation time the prediction was made from
  target_time_utc      TIMESTAMPTZ NOT NULL,        -- made_at + horizon
  horizon_min          INT NOT NULL CHECK (horizon_min IN (15, 30)),
  predicted_speed_kmph DOUBLE PRECISION NOT NULL,
  predicted_level      congestion_level NOT NULL,
  confidence           DOUBLE PRECISION CHECK (confidence BETWEEN 0 AND 1),  -- NULL for baseline
  model_version        TEXT NOT NULL,               -- "baseline" or e.g. "hgb-v1"
  source               source_label NOT NULL DEFAULT 'AI_PREDICTED',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (segment_id, made_at_utc, horizon_min, model_version)
);
CREATE INDEX idx_pred_lookup ON traffic_predictions(made_at_utc, horizon_min);

-- ---------- incidents ----------
CREATE TABLE incidents (
  id                  SERIAL PRIMARY KEY,
  category            TEXT NOT NULL
                      CHECK (category IN ('accident', 'breakdown', 'roadwork', 'flooding', 'closure', 'event', 'other')),
  description         TEXT NOT NULL DEFAULT '',
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  segment_id          TEXT REFERENCES road_segments(id),   -- nearest segment, set by the backend
  reported_severity   severity_level NOT NULL,
  estimated_severity  severity_level,
  severity_confidence DOUBLE PRECISION CHECK (severity_confidence BETWEEN 0 AND 1),
  severity_evidence   JSONB NOT NULL DEFAULT '[]',
  lanes_blocked       INT NOT NULL DEFAULT 0 CHECK (lanes_blocked >= 0),
  is_closure          BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'verified', 'rejected', 'merged', 'resolved')),
  merged_into         INT REFERENCES incidents(id),
  reported_by         INT REFERENCES users(id),
  source              source_label NOT NULL DEFAULT 'USER_REPORTED',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at         TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  CHECK (status <> 'merged' OR merged_into IS NOT NULL),
  CHECK (merged_into IS NULL OR merged_into <> id)
);
CREATE INDEX idx_incidents_status  ON incidents(status);
CREATE INDEX idx_incidents_segment ON incidents(segment_id);
CREATE INDEX idx_incidents_created ON incidents(created_at);

-- Every admin action is logged (PRD: "log every action").
CREATE TABLE incident_logs (
  id          SERIAL PRIMARY KEY,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_id    INT REFERENCES users(id),
  action      TEXT NOT NULL
              CHECK (action IN ('created', 'verified', 'rejected', 'merged', 'resolved', 'severity_changed')),
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_incident ON incident_logs(incident_id);

-- Duplicate candidates for admin review. Never auto-merged.
CREATE TABLE incident_duplicates (
  id           SERIAL PRIMARY KEY,
  incident_id  INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,  -- the newer report
  candidate_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,  -- the older one it may match
  score        DOUBLE PRECISION NOT NULL CHECK (score BETWEEN 0 AND 1),
  checks       JSONB NOT NULL,          -- distance_m, same_category, minutes_apart, text_jaccard, ...
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, candidate_id),
  CHECK (incident_id <> candidate_id)
);

-- ---------- saved results ----------
CREATE TABLE route_comparisons (
  id                 SERIAL PRIMARY KEY,
  user_id            INT REFERENCES users(id),
  source_node        TEXT NOT NULL REFERENCES road_nodes(id),
  dest_node          TEXT NOT NULL REFERENCES road_nodes(id),
  weights            JSONB NOT NULL,
  routes             JSONB NOT NULL,     -- the full routes array returned to the client
  recommended_type   TEXT,
  sim_time_utc       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signal_simulations (
  id                SERIAL PRIMARY KEY,
  junction_id       TEXT NOT NULL REFERENCES junctions(id),
  mode              TEXT NOT NULL CHECK (mode IN ('optimize', 'emergency')),
  input             JSONB NOT NULL,      -- queues, arrivals, cycles, seed
  current_result    JSONB NOT NULL,
  optimized_result  JSONB NOT NULL,
  avg_wait_before_s DOUBLE PRECISION,
  avg_wait_after_s  DOUBLE PRECISION,
  source            source_label NOT NULL DEFAULT 'SIMULATED',
  created_by        INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emergency_sessions (
  id                 SERIAL PRIMARY KEY,
  user_id            INT REFERENCES users(id),
  vehicle_type       TEXT NOT NULL CHECK (vehicle_type IN ('ambulance', 'fire', 'police')),
  source_node        TEXT NOT NULL REFERENCES road_nodes(id),
  dest_node          TEXT NOT NULL REFERENCES road_nodes(id),
  normal_eta_s       DOUBLE PRECISION NOT NULL,
  emergency_eta_s    DOUBLE PRECISION NOT NULL,
  time_saved_s       DOUBLE PRECISION NOT NULL,
  normal_route       JSONB NOT NULL,
  emergency_route    JSONB NOT NULL,
  signal_wait_source TEXT NOT NULL CHECK (signal_wait_source IN ('ASSUMED_FIXED_20S', 'SIGNAL_OPTIMIZER')),
  assumptions        JSONB NOT NULL DEFAULT '[]',
  source             source_label NOT NULL DEFAULT 'SIMULATED',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Tier 2: Telegram (tables are cheap; unused until the bot is built) ----------
CREATE TABLE telegram_accounts (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id    BIGINT NOT NULL UNIQUE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telegram_link_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE TABLE subscriptions (
  id         SERIAL PRIMARY KEY,
  chat_id    BIGINT NOT NULL,
  region     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, region)
);

-- "Alert once per user when an incident is verified"
CREATE TABLE telegram_alerts_sent (
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  chat_id     BIGINT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, chat_id)
);

COMMIT;
