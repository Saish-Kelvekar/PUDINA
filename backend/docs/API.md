# TrafficVision AI — API Contract (v0.1, Phase 0)

Owner: Member 2. Agreed in hour 0. **Change only after telling the whole team.**
Every endpoint has an example response in `backend/mocks/` (file name shown as 📄). M1 copies them into `frontend/src/mocks/` and builds against them; when an endpoint goes live, the real response has the same shape.

The mocks are generated from Member 3's `data/sample/graph.json` and `data/sample/traffic.csv` by `backend/scripts/make_mocks.py` (run it again whenever those files change). Simulation time in the mocks: **2026-11-10 09:00 IST** (`03:30Z`). Demo trip: **n5 Jyothi Nivas College Junction → n7 St. John's Junction**.

---

## 1. Rules for every endpoint

**Base URL:** `http://localhost:5000/api`  ·  **Content type:** JSON

**Every response looks like this:**

```json
{ "success": true,  "data": { ... }, "error": null }
{ "success": false, "data": null,    "error": { "code": "VALIDATION_ERROR", "message": "destination is required", "details": [ ... ] } }
```
📄 `error_example.json`

| Error code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Bad or missing input (`details` lists the fields) |
| `UNAUTHORIZED` | 401 | No token, bad token, expired token |
| `FORBIDDEN` | 403 | Logged in but wrong role |
| `NOT_FOUND` | 404 | Unknown id |
| `CONFLICT` | 409 | Email already registered; action not allowed in current status (e.g. verify a rejected incident) |
| `NO_ROUTE` | 422 | No path between the two points (e.g. all roads closed) |
| `INTERNAL_ERROR` | 500 | Anything else |

**Auth:** send `Authorization: Bearer <token>`. Roles: `user`, `admin`, `emergency`. The token lasts 12 hours.

**Times:** always ISO 8601 UTC with a `Z`, e.g. `"2026-11-10T03:30:00Z"`. The frontend converts to IST for display.

**Coordinates:** always `[lat, lng]` (Leaflet order, **not** GeoJSON order).

**Source labels:** `LIVE_EXTERNAL_API`, `USER_REPORTED`, `HISTORICAL`, `SIMULATED`, `AI_PREDICTED`. Any response that shows traffic, incidents or predictions has a `source` field. Road geometry from OpenStreetMap is labelled `HISTORICAL`.

**Congestion levels** (from speed ratio = speed ÷ free-flow speed):

| Level | Ratio | Colour |
| --- | --- | --- |
| `flowing` | > 0.75 | green |
| `moderate` | 0.50 – 0.75 | yellow |
| `heavy` | 0.25 – 0.50 | orange |
| `severe` | < 0.25 | red |
| `no_data` | no measurement | grey |

**Simulation clock:** traffic is simulated, so the backend has a "current" simulation time (`sim_time_utc`), set by `SIM_START` in `.env` and moved forward in 15-minute steps. Responses that depend on it return `sim_time_utc`.

**Points (source / destination):** send either `{ "node_id": "n1" }` or `{ "lat": 12.9081, "lng": 77.5850 }`. The backend snaps a lat/lng to the nearest node and returns `snapped_m` (how far it moved).

---

## 2. Endpoint list

| # | Method | Endpoint | Role | Mock 📄 |
| --- | --- | --- | --- | --- |
| 2.1 | POST | `/auth/register` | public | `auth_register.json` |
| 2.1 | POST | `/auth/login` | public | `auth_login.json` |
| 2.1 | GET | `/auth/me` | any | `auth_me.json` |
| 2.2 | GET | `/map/graph` | public | `map_graph.json` |
| 2.3 | GET | `/traffic/flow` | public | `traffic_flow.json` |
| 2.3 | GET | `/traffic/clock` ⭐ | public | — |
| 2.3 | POST | `/traffic/clock` ⭐ | admin | — |
| 2.4 | POST | `/routes/compare` | any | `routes_compare.json` |
| 2.5 | POST | `/incidents` | any | `incident_create.json` |
| 2.5 | GET | `/incidents` | public | `incidents_list.json` |
| 2.5 | GET | `/incidents/:id` | public | `incident_get.json` |
| 2.6 | POST | `/incidents/:id/verify` · `/reject` · `/resolve` | admin | `incident_action.json` |
| 2.6 | POST | `/incidents/:id/merge` | admin | `incident_merge.json` |
| 2.6 | PATCH | `/incidents/:id/severity` ⭐ | admin | `incident_action.json` |
| 2.7 | GET | `/incidents/:id/duplicates` | admin | `incident_duplicates.json` |
| 2.8 | POST | `/incidents/:id/impact` | admin | `incident_impact.json` |
| 2.9 | GET | `/predictions?horizon=15` | public | `predictions_15.json`, `predictions_30.json` (baseline), `predictions_model_example.json` |
| 2.9 | GET | `/predictions/metrics` | public | `predictions_metrics.json` |
| 2.10 | GET | `/signals/junctions` | any | `signals_junctions.json` |
| 2.10 | POST | `/signals/simulate` | any | `signals_simulate.json` |
| 2.11 | POST | `/emergency/routes` | emergency, admin | `emergency_routes.json` |
| 2.12 | GET | `/admin/overview` | admin | `admin_overview.json` |
| 2.12 | GET | `/admin/analytics` | admin | `admin_analytics.json` |
| 2.13 | Socket.IO | `incident:new`, `incident:verified` | — | `socket_events.json` |

⭐ = small addition to the PRD table (the PRD lists "change severity" as an admin action but had no endpoint for it).

---

### 2.1 Auth

`POST /auth/register` — body `{ "name": "Riya Sharma", "email": "riya@demo.test", "password": "min 6 chars" }`. New users are always role `user`; admin and emergency accounts come from the seed script.
`POST /auth/login` — body `{ "email", "password" }`.
Both return `{ token, user }`. `GET /auth/me` returns `{ user }`.

`user` = `{ id, name, email, role, created_at }` (never the password hash).

### 2.2 `GET /map/graph`

Returns the whole road graph in the agreed `graph.json` format, plus `node_count`, `edge_count`, `source: "HISTORICAL"`, `generated_at`.

Edge rule agreed with M3: **each road appears once.** `oneway: false` means it can be driven both ways (`from`/`to` is just the drawing direction). `oneway: true` means only `from → to`. The traffic CSV's `segment_id` is the edge `id`, so one speed applies to both directions.

### 2.3 `GET /traffic/flow`

Optional query: `?time=2026-11-10T03:30:00Z` (defaults to the simulation clock).
Returns `{ sim_time_utc, source, last_updated, segments: [ { segment_id, speed_kmph, free_flow_kmph, speed_ratio, congestion_level, rain, source, timestamp_utc } ] }`.
Segments with no data are returned with `congestion_level: "no_data"` and `speed_kmph: null`.
`data_time_utc` is the CSV time step actually used: the newest step that is not after `sim_time_utc` (or `null` if there is no data that early).

**Simulation clock** ⭐: `GET /traffic/clock` returns `{ sim_time_utc, step_minutes: 15, data_from_utc, data_until_utc, rows }`. Admin only: `POST /traffic/clock` with `{ "action": "next" }`, `{ "action": "prev" }` or `{ "time": "<ISO>" }` moves it (snapped to a 15-minute step). Useful in the demo to move from 08:00 to 09:00 and show traffic getting worse.

### 2.4 `POST /routes/compare`

Body:
```json
{
  "source": { "node_id": "n5" },
  "destination": { "lat": 12.9368, "lng": 77.5670 },
  "weights": { "time": 0.35, "distance": 0.15, "congestion": 0.2, "incidents": 0.15, "fuel": 0.05, "reliability": 0.1 }
}
```
`weights` is optional (defaults above). Weights don't have to add up to 1; the backend divides by their total.

Returns `{ comparison_id, sim_time_utc, source, destination, weights, recommended_route_id, traffic_source, signal_wait_assumption_s, routes: [...] }`. `routes` are **sorted best first**.

Each route:

| Field | Meaning |
| --- | --- |
| `route_id`, `type`, `label` | `type` is one of `fastest`, `shortest`, `least_congested`, `safest` (fewest incidents), `eco` |
| `is_alternative` | true if found by the "×1.5 on used edges, rerun" rule |
| `same_path_as` | `null`, or the `route_id` of an identical route when no different path exists. **M1: show it as "Same as Fastest"** instead of a separate line |
| `node_ids`, `edge_ids`, `coords` | the path; `coords` is ready for a Leaflet polyline |
| `distance_km`, `eta_min`, `eta_s` | ETA = drive time + signal waits + incident delays |
| `congestion_pct` | length-weighted average of (1 − speed ratio) × 100 |
| `signals_on_route` | signalised junctions passed (not counting start/end) |
| `incident_ids`, `incident_count` | verified incidents on the route |
| `closure_warnings` | text list: verified closed roads that touch the route (so it went around them) |
| `fuel_litres` | km × 0.07 × (1 + 0.5 × congestion share) |
| `reliability` | 100 − 10 per incident − 30 × share of length in heavy/severe traffic |
| `score`, `score_breakdown` | 0–100, min-max normalised weighted sum; breakdown per factor |
| `rank`, `recommended`, `explanation` | explanation names the 2 strongest factors |

Edge cost rules: travel time = length ÷ speed, plus 20 s at each signalised junction passed; verified incident adds 60 / 180 / 300 s for low / medium / high; a closure makes the edge unusable. Roads with no traffic data use their free-flow speed. All numbers live in `backend/src/config/constants.js`.

Per type: **fastest** = time · **shortest** = metres · **least_congested** = time × (1 + 3 × (1 − speed ratio)) · **safest** = time + 5 × incident delay + 120 s per incident · **eco** = fuel.

Needs login. Errors: `VALIDATION_ERROR` (bad points or weights, or source = destination), `NOT_FOUND` (unknown `node_id`), `NO_ROUTE` (422) if no path. Every comparison is saved in `route_comparisons`.

### 2.5 Incidents

`POST /incidents` body:
```json
{ "category": "accident", "description": "Car crash at Lake Road junction",
  "lat": 12.9046, "lng": 77.5912, "reported_severity": "high", "lanes_blocked": 0, "is_closure": false }
```
`category`: `accident`, `breakdown`, `roadwork`, `flooding`, `closure`, `event`, `other`. `reported_severity`: `low`, `medium`, `high`.
The backend finds the nearest segment, estimates severity (see below), looks for duplicates and returns `{ incident, possible_duplicates }` (a count). New incidents start as `pending` and **do not change routes until verified**.

`GET /incidents` query (all optional): `status=pending,verified`, `category=accident`, `since=<ISO time>`. Returns `{ count, incidents }`. Default: everything except `rejected` and `merged`.
`GET /incidents/:id` returns `{ incident, logs }`.

Incident object:
```
id, category, description, lat, lng, segment_id, reported_severity,
estimated_severity: { level, confidence (0–1), evidence: [text] },
lanes_blocked, is_closure, status, merged_into, reported_by: { id, name },
source, created_at, updated_at, verified_at, resolved_at
```
`status`: `pending` → `verified` → `resolved`, or `pending` → `rejected`, or → `merged`.

**Severity estimate** (points): category (closure +3, accident/flooding +2, roadwork/breakdown +1) · road closed +3, or lanes blocked +1 (+2 if all lanes) · segment already heavy/severe +1 · reported medium +1 / high +2. Total ≥ 5 = `high`, 3–4 = `medium`, else `low`. `confidence` = 0.5 + 0.08 per piece of evidence (max 0.95). `evidence` lists each point in words.

### 2.6 Admin actions on an incident

| Endpoint | Body | Allowed from status |
| --- | --- | --- |
| `POST /incidents/:id/verify` | `{}` | pending |
| `POST /incidents/:id/reject` | `{ "reason": "..." }` | pending |
| `POST /incidents/:id/resolve` | `{}` | verified |
| `POST /incidents/:id/merge` | `{ "into_id": 101 }` — this incident is merged into 101 | pending, verified |
| `PATCH /incidents/:id/severity` | `{ "level": "high" }` | any except rejected/merged |

All return `{ incident, log }` (merge also returns `merged_into`). Wrong status → `CONFLICT`. Every action is written to `incident_logs`.

### 2.7 `GET /incidents/:id/duplicates`

Returns `{ incident_id, threshold, candidates: [ { incident, score, checks, weights, status } ] }`, highest score first.
Score (0–1) = 0.35 × distance score + 0.25 × same category + 0.25 × time score + 0.15 × word overlap, where distance score = 1 − metres/200 (0 beyond 200 m) and time score = 1 − minutes/30 (0 beyond 30 min). Candidate if score ≥ `threshold` (0.6). **Never auto-merged.**

### 2.8 `POST /incidents/:id/impact`

Body: `{ "mode": "lane_blockage" }` or `{ "mode": "closure" }` (default: closure if `is_closure`, else lane blockage).
Returns `{ incident_id, mode, speed_factor, max_hops, affected_segments: [ { segment_id, hops, speed_before_kmph, speed_after_kmph, extra_delay_s, congestion_level_after } ], total_extra_delay_min, detour_minutes, hop_factors, diversion_route: { from_node, to_node, node_ids, edge_ids, coords, distance_km, eta_min }, blocked_route: { node_ids, edge_ids, eta_min_before, eta_min_after }, source: "SIMULATED", computed_at }`.
Speed is multiplied by `hop_factors`: incident road (hop 0) × 0.5 for lane blockage, then × 0.85 / 0.93 / 0.97 for roads 1 / 2 / 3 junctions away (found by breadth-first search). Closure mode removes the road instead. The diversion is the fastest way between the two ends of the incident road without using it.

### 2.9 Predictions

`GET /predictions?horizon=15` (or `30`). Optional `segment_ids=e1,e7`.
Returns `{ horizon_min, model_version, made_at_utc, generated_at, predictions: [ { segment_id, current_speed_kmph, predicted_speed_kmph, predicted_level, confidence, target_time_utc, source: "AI_PREDICTED" } ] }`.
**Until M3's service is up**, `model_version` is `"baseline"` (speed later = speed now) and `confidence` is `null`. The 📄 `predictions_15.json` / `predictions_30.json` mocks are this baseline, so M1 should show "Baseline model" when it sees that. 📄 `predictions_model_example.json` shows the shape once M3's model is connected (M3's example, 2 segments).

`GET /predictions/metrics` (optional `?segment_id=e7&horizon=15` for the chart).
Returns `{ model_version, trained_on, tested_on, split, source, horizons: { "15": { mae_model_kmph, mae_baseline_kmph, improvement_pct, level_accuracy_model, level_accuracy_baseline, test_rows }, "30": {...} }, series: { segment_id, horizon_min, points: [ { timestamp_utc, actual_kmph, predicted_kmph, baseline_kmph } ] } }`.
⚠️ The mock is M3's `ml-service/examples/metrics.json` passed through: the numbers are **placeholders**, never show them in the demo. The real ones come from M3's test week. The UI must also handle `null` values (show "—").

### 2.10 Signals

`GET /signals/junctions` returns `{ junctions: [ { junction_id, node_id, name, lat, lng, approaches: [ { approach_id, edge_id, from_node, label } ], current_timing: { cycle_s, green_s_each, yellow_s, all_red_s }, source } ] }`.

`POST /signals/simulate` body `{ "junction_id": "J-n2", "mode": "optimize", "cycles": 10, "seed": 42 }`. For emergency mode add `"emergency_approach_id": "n2-e1"`.
Returns `{ simulation_id, junction_id, mode, cycles, seed, queues: [ { approach_id, queue_now, arrivals_per_min } ], current: { cycle_s, phases: [ { approach_id, green_s, yellow_s, all_red_s } ], avg_wait_s, max_queue, throughput }, optimized: { same shape }, improvement: { avg_wait_saved_s, avg_wait_change_pct, throughput_change_pct }, reasons: [ { approach_id, text } ], source: "SIMULATED", created_at }`. Emergency mode adds `red_wait_saved_s`.
The backend forwards to M3's `/signals/optimize` and saves the result in `signal_simulations`. Each green is between 10 and 60 s; 3 s yellow + 2 s all-red per phase.

### 2.11 `POST /emergency/routes`

Body `{ "vehicle_type": "ambulance", "source": {...point}, "destination": {...point} }`. `vehicle_type`: `ambulance`, `fire`, `police`.
Returns `{ session_id, vehicle_type, simulation: true, source: "SIMULATED", from, to, normal_route, emergency_route, time_saved_min, signal_wait_source, assumptions, created_at }`.

- `normal_route`: fastest route on current speeds, with red-light waits.
- `emergency_route`: uses 15-min predicted speeds, avoids verified incidents and closures, no red waits; has `signal_wait_saved_s`.
- `time_saved_min` = normal ETA − emergency ETA.
- `signal_wait_source`: `"ASSUMED_FIXED_20S"` (stand-in) until M3's optimizer is connected, then `"SIGNAL_OPTIMIZER"`. M1 shows the `assumptions` list under the result.

### 2.12 Admin data

`GET /admin/overview` returns `{ counts: { incidents_total, pending, verified, rejected, merged, resolved, active_closures, duplicate_candidates, users }, recent_actions: [...], ml_service: { status: "up" | "down", model_version }, sim_time_utc }`.

`GET /admin/analytics` returns `{ congestion_by_hour: [ { hour_ist, avg_speed_ratio, heavy_or_severe_share } ], incidents_by_type: [ { category, count } ], prediction_error: { "15": {...}, "30": {...} }, signal_improvement: [ { junction_id, name, avg_wait_before_s, avg_wait_after_s } ], emergency_time_saved: { sessions, avg_saved_min, total_saved_min }, source_note, generated_at }`.

### 2.13 Socket.IO events

Connect to the same server (`http://localhost:5000`). Server → client only.

| Event | Payload | When |
| --- | --- | --- |
| `incident:new` | `{ incident }` | any new report |
| `incident:verified` | `{ incident }` | admin verifies one |

On `incident:verified`, the frontend should re-fetch `/incidents` (and the route, if one is shown).

---

## 3. Member 3's side

Everything Member 3 needs (graph and CSV rules, ML service requests and responses, seed data) is in **`backend/docs/CONTRACT_M3.md`**. Approach IDs are `<node id>-<edge id>`, e.g. `n2-e1`; junction IDs are `J-<node id>`, e.g. `J-n2`.
