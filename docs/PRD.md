# TrafficVision AI — Team PRD (PS-01)

Nov 13, 2026 · @Aryan

## Overview and scope

In 20 hours, our team of 3 builds a working website for PS-01: route search and comparison, incident reporting, congestion prediction, network-impact analysis, signal optimization and emergency routing. Traffic, weather and incident history are simulated and clearly labelled, which PS-01 allows.

We build in three tiers. Nobody starts a lower tier until the tier above it works end to end.

| Tier | What it includes | When |
| --- | --- | --- |
| 1. Must build | PS-01 core: source/destination, multiple routes, shortest vs fastest, ETA and distance, incident reporting, incidents on map, alternate routes, admin review. Plus all 5 advanced features: congestion prediction, incident intelligence and network impact, signal optimization, emergency routing, multi-factor ranking | Hours 0–16 |
| 2. Nice to have | Telegram bot for incident alerts and subscriptions; live TomTom traffic if a free key works | Only after Tier 1 works |
| 3. Stretch | Camera explorer, laptop webcam studio, NVIDIA image/video analysis | Only if Tiers 1 and 2 are done by hour 16 |

Two rules apply to everyone:

- Every piece of data shown carries a source label (SIMULATED, USER\_REPORTED, AI\_PREDICTED and so on). Simulated data is never shown as live.
- No made-up numbers. Accuracy, time saved and waiting times come from real calculations on our data.

## Tech stack

We use React, Node/Express, PostgreSQL and one small Python service. Everything here is free and is allowed by PS-01.

| Part | Choice | Why |
| --- | --- | --- |
| Frontend | React + Vite (JavaScript), React Router, axios | Fast setup; PS-01 lists React |
| Map | Leaflet + react-leaflet, OpenStreetMap tiles | PS-01 names Leaflet; works with no setup |
| Charts | Recharts | One chart library only |
| Backend | Node.js + Express (JavaScript) | PS-01 lists Node |
| Database | PostgreSQL with the `pg` library and SQL migration files | Lat/lng stored as numbers; PostGIS is optional |
| Auth | JWT + bcrypt | Simple login with roles: user, admin, emergency |
| Live updates | Socket.IO | Only for new and verified incidents |
| ML + simulations | Python, pandas, scikit-learn, FastAPI, joblib | ML is far easier in Python than in Node |
| Road network | osmnx (Python), exported once to `graph.json` | Real road graph for Dijkstra / A\* |
| Telegram (Tier 2) | python-telegram-bot in polling mode | Polling works on a laptop with no public URL |

Two changes from the original PRD: Leaflet replaces MapLibre, and plain PostgreSQL replaces PostGIS. Both cut setup time. Use TypeScript only if all three members are already comfortable with it.

## Team split at a glance

Each member owns one layer from start to finish. They meet at the shared contracts below: API endpoints, database tables and `graph.json`.

| Member | Owns | PS-01 features they deliver | Gives to others | Stand-ins they use (so they never wait) |
| --- | --- | --- | --- | --- |
| Member 1: Frontend | Every page, the map, forms, charts, the API client | All screens for core features and the 5 advanced features | A working UI for the demo | Mock JSON for every endpoint; sample `graph.json` |
| Member 2: Backend & routing | Express API, database, auth, routing engine, incidents, emergency routing | Routes, ETA, multi-factor ranking, incidents, duplicate detection, severity, network impact, emergency routing | All REST endpoints, Socket.IO events, example responses for M1 | Sample `graph.json` and sample CSV; baseline predictions and a fixed 20 s signal wait until M3's service is up |
| Member 3: ML, data & simulations | Road graph export, simulated traffic data, prediction model, FastAPI service, signal optimizer, demo data, docs, Telegram | Congestion prediction (15/30 min), adaptive signal optimization, all simulated datasets | `graph.json`, traffic dataset, `/predict` and `/signals/optimize` | Nothing: works only with files and their own service |

## How nobody waits

Nobody ever waits for another member, because each member always has a **stand-in** for what they need. Stand-ins are small fake files shaped exactly like the real thing. When the real thing is ready, it replaces the stand-in, and because the shape is the same, nothing breaks.

### The 3 rules

1. **Phase 0 (first hour) produces all the stand-ins.** Before anyone writes feature code, the team agrees on file formats and API responses and saves a sample of each.
2. **Swap at the merge.** At the end of every phase, everyone merges to `main` and switches stand-ins to the real versions that are ready.
3. **Late means "keep the stand-in", not "wait".** If something isn't ready at a merge, the others keep using the stand-in and move on. The owner finishes it in the next phase.

### Stand-ins made in Phase 0

| Stand-in | Made by | Used by | Replaced by the real one |
| --- | --- | --- | --- |
| `data/sample/graph.json`: 8 nodes, 10 edges | M3 (first 30 min) | M1 (map), M2 (routing) | End of Phase 1 |
| `data/sample/traffic.csv`: about 50 rows | M3 | M2 (traffic loader) | End of Phase 1 |
| `frontend/src/mocks/*.json`: one example response per endpoint | M2 (writes the shapes), M1 (saves the files) | M1 (every page) | Phase by phase, as M2's endpoints go live |
| Example `/predict`, `/metrics` and `/signals/optimize` responses | M3 | M2 (ML proxy), M1 (Prediction and Signal pages) | End of Phase 3 and Phase 4 |
| Database schema (`migrations/001_init.sql`) | M2 | M2 (loaders); M3 only writes files, never the database | Final from Phase 1 |

M3 only produces **files** (`graph.json`, CSV, JSON) and one FastAPI service. M3 never needs the database or M2's code. M2 writes the scripts that load M3's files into PostgreSQL.

In `api.js`, M1 adds one switch per feature, for example `USE_MOCK.routes = true`. Swapping to the real API means flipping it to `false`.

### The `graph.json` format (agree in Phase 0)

```json
{
  "nodes": [
    { "id": "n1", "lat": 12.9081, "lng": 77.5850, "name": "Junction A", "signalised": true }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "length_m": 420, "road_type": "primary",
      "lanes": 2, "free_flow_kmph": 40, "oneway": false,
      "coords": [[12.9081, 77.5850], [12.9100, 77.5870]] }
  ]
}
```

### The traffic CSV columns (agree in Phase 0)

`segment_id, timestamp_utc, speed_kmph, free_flow_kmph, congestion_level, rain, incident, source`

### Two fallbacks that also remove waiting

- **Predictions:** until M3's FastAPI is running, M2's `/api/predictions` returns the baseline ("speed later = speed now") with `model_version: "baseline"`. That is an honest prediction, not fake data.
- **Emergency signal priority:** until M3's `/signals/optimize` is ready, M2 uses a fixed 20 s red-light wait per signalised junction, written as an assumption. M3's real value replaces it later.

## Member 1: Frontend

Member 1 builds every screen against mock JSON first, then flips each page to the real API when M2's endpoint goes live. Every page always works: on mocks early, on real data later.

### Phase 0 (h0–1): Contracts

- [ ] List every page and the endpoint each one calls (table below)
- [ ] Save M2's example responses as `frontend/src/mocks/*.json`
- [ ] Copy M3's sample `graph.json` into the mocks

### Phase 1 (h1–4): App shell and map

- [ ] Vite project, React Router, layout with grouped sidebar navigation
- [ ] `api.js` with a `USE_MOCK` switch per feature and the JWT attached
- [ ] Shared components: `MapView`, `Legend`, `SourceBadge`, `StatCard`, `LoadingState`, `ErrorState`, `EmptyState`
- [ ] Login / Register pages and role-protected routes
- [ ] `MapView` drawing road segments from the sample graph

Stand-ins: mock auth, sample `graph.json`. **Merge h4:** switch auth and `/api/map/graph` to real.

### Phase 2 (h4–9): Core PS-01 screens

- [ ] Live Traffic Map: segments coloured by congestion, incident markers, source badge, last-updated time
- [ ] Route Planner: pick points by click or junction search, 5 route cards, weight sliders, "why recommended" text, coloured polylines
- [ ] Report Incident form with click-to-place location

Stand-ins: mocks for `/traffic/flow`, `/routes/compare`, `/incidents`. **Merge h9:** switch all three to real.

### Phase 3 (h9–13): Admin and prediction

- [ ] Admin Dashboard: counts, incident table with Verify / Reject / Merge / Resolve, duplicate candidates side by side
- [ ] Network impact view: affected segments highlighted, diversion route drawn
- [ ] Traffic Prediction page: actual vs predicted chart, 15/30-min toggle, confidence, MAE vs baseline
- [ ] Predicted congestion layer (purple) on the map

Stand-ins: mocks for duplicates, impact, predictions, metrics. **Merge h13:** switch to real.

### Phase 4 (h13–16): Remaining advanced screens

- [ ] Signal Optimization page: junction picker, queue bars per approach, current vs optimized timings, before/after wait, reason per phase
- [ ] Emergency Routing page: vehicle type, both routes on the map, both ETAs, time saved, "SIMULATION" banner
- [ ] Analytics page: congestion by hour, incidents by type, prediction error, signal improvement, emergency time saved

Stand-ins: mocks for signals, emergency, analytics. **Merge h16:** switch to real; feature freeze.

### Phase 5 (h16–20): Polish and demo

- [ ] Every `USE_MOCK` switch set to `false`
- [ ] Loading, error and empty state on every page; check on a phone-sized screen
- [ ] Run the demo script end to end with the team

### Pages and endpoints

| Page | Calls |
| --- | --- |
| Login / Register | `/api/auth/*` |
| Live Traffic Map | `/api/map/graph`, `/api/traffic/flow`, `/api/incidents`, `/api/predictions` |
| Route Planner | `/api/routes/compare` |
| Report Incident | `POST /api/incidents` |
| Traffic Prediction | `/api/predictions`, `/api/predictions/metrics` |
| Signal Optimization | `/api/signals/*` |
| Emergency Routing | `/api/emergency/*` |
| Admin Dashboard | `/api/admin/*`, `/api/incidents/*` |
| Analytics | `/api/admin/analytics` |

Colours: green = flowing, yellow = moderate, orange = heavy, red = severe, grey = no data, blue = selected route, purple = predicted. Keep the design clean: no neon, no heavy gradients, no fake "live" pulses.

## Member 2: Backend & routing

Member 2 builds the API and the routing engine on M3's sample files from the first hour, so the real graph and dataset just drop in later. The routing engine is the centre: routes, incidents, network impact and emergency routing all reuse it.

### Phase 0 (h0–1): Contracts

- [ ] Write the API contract and one example JSON response per endpoint; hand them to M1 as mocks
- [ ] Draft `migrations/001_init.sql` with every table in Shared contracts
- [ ] Agree the `graph.json` and CSV formats with M3

### Phase 1 (h1–4): Foundation and routing core

- [ ] Express project split into `routes/`, `controllers/`, `services/`, `repositories/`, `middleware/`, `validators/`
- [ ] `.env.example`, `pg` connection pool, run migrations, seed script
- [ ] Register/login with bcrypt + JWT; roles `user`, `admin`, `emergency`; `requireRole()` middleware
- [ ] One response format: `{ success, data, error }`
- [ ] `GET /api/map/graph` serving `graph.json`; load it into an in-memory adjacency list; nearest-node lookup
- [ ] A\* with a straight-line (haversine) heuristic, Dijkstra fallback; tests on a 6-node hand-made graph, a closed road and a no-path case

Stand-ins: sample `graph.json`. **Merge h4:** switch to M3's real graph (same format, no code change).

### Phase 2 (h4–9): Routes, traffic, incidents

- [ ] Loader script: M3's CSV into `traffic_measurements`; a "simulation clock" picks the current time step
- [ ] `GET /api/traffic/flow`: speed, congestion level, source label, timestamp per segment
- [ ] Edge cost = travel time, plus penalties for incidents; closed road = infinite
- [ ] 5 route types = the same A\* with 5 cost settings; if two match, multiply used-edge costs by 1.5 and rerun for an alternative
- [ ] Per route: distance, ETA, congestion %, incidents, closure warnings, fuel, reliability
- [ ] Multi-factor score: min-max normalise each factor, then weighted sum; explanation names the 2 strongest factors
- [ ] `POST /api/routes/compare`
- [ ] Incidents: create, list, view, statuses; verified incidents change edge costs

Stand-ins: sample CSV until M3's full dataset lands (same columns). **Merge h9:** M1 switches traffic, routes and incidents to real.

### Phase 3 (h9–13): Incident intelligence and predictions

- [ ] Duplicate detection score from 4 checks: within 200 m, same category, within 30 min, word overlap (Jaccard). Above the threshold = candidate for admin. Never auto-merge
- [ ] Severity estimate: type + lanes + congestion + reported severity → low/medium/high with confidence and evidence
- [ ] Admin actions: verify, reject, merge, resolve, change severity; log every action
- [ ] Network impact: breadth-first search up to 3 hops; simulate lane blockage (speed × 0.5) or closure; detour minutes; diversion route; simulated closures labelled `SIMULATED`
- [ ] `/api/predictions` and `/api/predictions/metrics` forwarding to M3's FastAPI, saving to `traffic_predictions`

Stand-ins: until M3's FastAPI is up, predictions return the baseline (`model_version: "baseline"`). **Merge h13:** point at M3's service.

### Phase 4 (h13–16): Emergency and admin data

- [ ] Emergency routing: same engine, cost uses 15-min predicted speeds, avoids verified incidents and closures
- [ ] Signal priority: remove the expected red wait at each signalised junction; time saved = normal ETA − emergency ETA; store each session
- [ ] `/api/signals/junctions` and `/api/signals/simulate` forwarding to M3
- [ ] Socket.IO events `incident:new`, `incident:verified`
- [ ] `/api/admin/overview` and `/api/admin/analytics`

Stand-ins: fixed 20 s red wait per junction until M3's `/signals/optimize` is ready. **Merge h16:** switch to M3's value; feature freeze.

### Phase 5 (h16–20): Hardening

- [ ] Test failure states: ML service down, no route, empty results, bad input
- [ ] Write `ROUTING.md` (fuel and reliability formulas) and the API section of the README

Example formulas for `ROUTING.md`: fuel = km × 0.07 L × (1 + 0.5 × congestion share); reliability = 100 − 10 per incident − 30 × share of length in heavy/severe traffic.

## Member 3: ML, data & simulations

Member 3 works only with files and a separate FastAPI service, so M3 never waits on anyone. The sample files come first, in the first 30 minutes, so the others can start at once.

### Phase 0 (h0–1): Samples first

- [ ] `data/sample/graph.json`: 8 hand-made nodes and 10 edges in the agreed format (first 30 min, push right away)
- [ ] `data/sample/traffic.csv`: about 50 rows in the agreed columns
- [ ] Example JSON responses for `/predict`, `/metrics` and `/signals/optimize`; hand them to M2 and M1

### Phase 1 (h1–4): Real graph and dataset

- [ ] osmnx: drivable roads in about a 1.5 km radius around a point in Bengaluru (for example, near the college)
- [ ] Export `data/graph.json` in the same format; mark about 10 junctions with 4+ roads as signalised
- [ ] Dataset generator: 6 weeks, one row per 15 min per segment (main roads only if the graph is large)
- [ ] speed = free-flow × rush-hour factor × rain factor × incident factor + small noise; random rain days and incidents
- [ ] Save `data/traffic.csv`; write every assumption in `DATA_SOURCES.md`

**Merge h4:** real `graph.json` and `traffic.csv` replace the samples. M2 loads them; M3 never touches the database.

### Phase 2 (h4–9): Prediction model

- [ ] Features: hour, day of week, weekend flag, current speed, speed 15 and 30 min ago, free-flow speed, lanes, incident flag, rain flag, average speed of neighbouring segments
- [ ] Targets: speed 15 min later and 30 min later (two models)
- [ ] Baseline first: "speed later = speed now"
- [ ] Train `RandomForestRegressor` or `HistGradientBoostingRegressor`; weeks 1–5 train, week 6 test, never a random split
- [ ] Metrics: MAE in km/h for model and baseline; accuracy of the predicted colour; save `metrics.json`
- [ ] Confidence = spread of the individual trees' predictions; save models with `joblib`

Congestion level from speed ratio (current / free-flow): above 0.75 green, 0.5–0.75 yellow, 0.25–0.5 orange, below 0.25 red.

### Phase 3 (h9–13): FastAPI and signal core

- [ ] `POST /predict`: segment ids + horizon (15 or 30) → predicted speed, level, confidence, `AI_PREDICTED`, model version
- [ ] `GET /metrics`: MAE, accuracy, baseline comparison
- [ ] Signal optimizer core: share usable cycle time between 4 approaches by demand (queue + expected arrivals); each green clamped to 10–60 s; 3 s yellow and 2 s all-red per phase
- [ ] Second-by-second simulation for 10 cycles: random arrivals; while green, about 1 car leaves every 2 s

**Merge h13:** M2 points `/api/predictions` at this service instead of the baseline.

### Phase 4 (h13–16): Signal API and demo data

- [ ] `POST /signals/optimize`: current vs optimized average wait, max queue, throughput, and a one-line reason per phase
- [ ] Emergency mode: green for the emergency vehicle's approach; return the red wait saved
- [ ] Demo seed data: 3 users (user, admin, emergency), about 15 incidents including 2 pairs of near-duplicates
- [ ] Tier 2 (only if on track): Telegram bot with `/start` one-time link token, `/incidents`, `/subscribe <region>`, `/unsubscribe`; alert once per user when an incident is verified. It reads M2's real API, which is live from h9

**Merge h16:** M2 replaces the fixed 20 s wait with this endpoint; feature freeze.

### Phase 5 (h16–20): Docs and presentation

- [ ] `README.md` (setup and run) and `DATA_SOURCES.md` final
- [ ] Demo script and PPT, including the real model metrics

## Shared contracts

Agree on these in hour 0 and change them only by telling the whole team. They are what let three people work in parallel without waiting.

### API endpoints

Every response: `{ "success": true, "data": ..., "error": null }`. Every list with timestamps and source labels.

| Method | Endpoint | Owner | Used on page |
| --- | --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | M2 | Login |
| GET | `/api/auth/me` | M2 | All |
| GET | `/api/map/graph` | M2 | Map, Route Planner |
| GET | `/api/traffic/flow` | M2 | Map |
| POST | `/api/routes/compare` | M2 | Route Planner |
| POST / GET | `/api/incidents` | M2 | Report, Map |
| POST | `/api/incidents/:id/verify`, `/reject`, `/resolve`, `/merge` | M2 | Admin |
| GET | `/api/incidents/:id/duplicates` | M2 | Admin |
| POST | `/api/incidents/:id/impact` | M2 | Admin |
| GET | `/api/predictions?horizon=15` | M2 → M3 | Map, Prediction |
| GET | `/api/predictions/metrics` | M2 → M3 | Prediction, Analytics |
| GET | `/api/signals/junctions` | M2 | Signal |
| POST | `/api/signals/simulate` | M2 → M3 | Signal |
| POST | `/api/emergency/routes` | M2 | Emergency |
| GET | `/api/admin/overview`, `/api/admin/analytics` | M2 | Admin, Analytics |

### Database tables

- `users` (with `role`)
- `road_nodes`, `road_segments`, `junctions` (loaded from `graph.json`)
- `traffic_measurements`, `traffic_predictions` (both with `source` and `timestamp`)
- `incidents`, `incident_logs`, `incident_duplicates`
- `route_comparisons`, `signal_simulations`, `emergency_sessions`
- Tier 2: `telegram_accounts`, `telegram_link_tokens`, `subscriptions`

All timestamps stored in UTC, shown in local time (IST).

### Source labels

`LIVE_EXTERNAL_API`, `USER_REPORTED`, `HISTORICAL`, `SIMULATED`, `AI_PREDICTED`

### Folder structure

```
trafficvision/
  frontend/        # Member 1 (React + Vite)
  backend/         # Member 2 (Express)
    migrations/
    src/routes  src/controllers  src/services  src/repositories
  ml-service/      # Member 3 (FastAPI, models, simulators)
  data/            # graph.json, traffic CSV, seed data
  docs/            # README, DATA_SOURCES, ROUTING, API
  .env.example
```

One GitHub repo. Each member works on their own branch and merges into `main` at every checkpoint.

## 20-hour timeline

All three members follow the same 6 phases and merge at the same times. At each merge, stand-ins switch to whatever real piece is ready; nobody stops to wait for the rest. Feature freeze is at hour 16.

| Phase | Hours | Member 1: Frontend | Member 2: Backend | Member 3: ML & data | Switched to real at the merge |
| --- | --- | --- | --- | --- | --- |
| 0. Contracts | 0–1 | Page list, save mocks | API examples, DB schema | Sample graph, sample CSV, ML response examples | (all stand-ins created) |
| 1. Foundation | 1–4 | App shell, shared components, login, map | Express, DB, auth, graph loading, A\* core | Real `graph.json`, traffic dataset | Auth, real graph, real dataset |
| 2. Core PS-01 | 4–9 | Traffic map, Route Planner, Report Incident | Traffic API, 5 route types, scoring, incidents | Prediction model and metrics | Traffic, routes, incidents |
| 3. Advanced I | 9–13 | Admin, network impact view, Prediction page | Duplicates, severity, admin actions, network impact, ML proxy | FastAPI `/predict`, signal optimizer core | Admin actions, predictions |
| 4. Advanced II | 13–16 | Signal, Emergency, Analytics pages | Emergency routing, Socket.IO, analytics | `/signals/optimize`, seed data, Telegram (Tier 2) | Signals, emergency, analytics; **feature freeze** |
| 5. Finish | 16–20 | All: demo run-throughs, bug fixes, failure-state tests, docs, PPT |  |  | Every `USE_MOCK` off |

If something is late at a merge, keep its stand-in and finish it in the next phase. If something is still late at hour 16, cut Analytics first, then Telegram. Never cut an advanced feature, because PS-01 marks all 5 as mandatory.

## Demo script and definition of done

The demo follows one story that touches every PS-01 requirement in about 6 minutes.

1. Log in as a user. The map shows roads coloured by congestion, with a "SIMULATED" badge and the last-updated time.
2. Pick a source and destination. Five route cards appear; the recommended one explains why. Move a weight slider and the ranking changes.
3. Report an accident on the recommended route. Report it again from a second account with slightly different words.
4. Log in as admin. Both reports show as duplicate candidates with their score. Merge and verify. Open network impact: affected roads light up and a diversion is suggested.
5. Back on the Route Planner, the same search now avoids the accident.
6. Turn on the 15-min and 30-min predicted layer. Open the Prediction page: actual vs predicted chart, model MAE vs baseline.
7. Open a junction on the Signal page: current vs optimized timings, before/after waiting time and the reason for each change.
8. Log in as emergency. Route an ambulance: normal vs emergency ETA and the time saved, marked as a simulation.
9. Finish on Analytics, and (if built) show a Telegram alert that arrived when the incident was verified.

### A feature counts as done only when

- [ ] Its page, API and database parts all work together
- [ ] It shows a loading state and a clear error state, and never crashes
- [ ] Its data shows a source label
- [ ] It works inside the demo script above, not only on its own

### Stretch (Tier 3, only after hour 16 with nothing broken)

- Live TomTom traffic through the same provider interface
- Camera Explorer and laptop webcam Demo Camera Studio, labelled "DEMO CAMERA — LOCAL DEVICE"
- NVIDIA image analysis of webcam snapshots, with the model chosen later and set in `.env`
