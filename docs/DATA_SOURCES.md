# DATA_SOURCES.md — provenance & assumptions

TrafficVision AI is a **simulation**, not a live traffic feed. Nothing in this folder is real-time. Road geometry is historical OpenStreetMap data (label `HISTORICAL`); all speeds, congestion, rain, incidents and signal behaviour are simulated (`SIMULATED`) or model estimates (`AI_PREDICTED`).

## Road graph — `data/graph.json`

| Item | Value |
| --- | --- |
| Source | OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0) |
| Tool | `osmnx` 2.1.1 → Overpass API (`overpass-api.de`, fallback `lz4.overpass-api.de`), downloaded 2026-11-13 |
| Area | Koramangala, Bengaluru — centre **12.9345, 77.5640**, radius **1.5 km**, `network_type="drive"` |
| Scope | Largest weakly-connected component only (**3,191 nodes / 4,797 edges** after merging two-way pairs) |
| Format | Contract (`docs/CONTRACT_M3.md` §2): IDs reassigned deterministically (`n1..n3191`, `e1..e4797`); `coords` as `[lat, lng]` from the `from` node to the `to` node; `oneway: true` only where OSM has a single direction (653 edges) |
| `length_m` | From OSM way lengths (min 1 m — 29 sub-5 m edges exist in OSM source; kept, not silently altered) |
| `road_type` | OSM `highway` class mapped to contract classes: motorway/trunk/primary(+links)→`primary`, secondary→`secondary`, tertiary→`tertiary`, everything else→`residential` |
| `free_flow_kmph` | OSM `maxspeed` if present, else contract defaults: **primary 40, secondary 30, tertiary 30, residential 25** |
| `lanes` | OSM `lanes` if present, else **1** |
| `name` | OSM street name if present, else `null`; `name`-less ways are unnamed in source |
| `signalised` | Top 10 junctions by edge degree (≥ 4 roads) marked `true`. **Synthetic marker** — OSM does not encode which junctions have working signals |
| OSM extract | Raw download cached locally at `data/cache/koramangala.graphml` (gitignored; rebuild with `--from-cache`) |
| Known limitations | Two perpendicular carriageways sharing the same nodes collapse into one bidirectional edge (this is desired for two-way routing); no turn restrictions, elevation or lane-level geometry; tiny OSM ways preserved as-is |

## Traffic dataset — `data/traffic.csv`

**Scope restriction (important):** only **primary** segments (147 of 4,797 edges) are covered. All main roads (primary+secondary+tertiary, ~1,083 segments) would produce ~4.4M rows (~230 MB), exceeding GitHub's 100 MB file limit. Covered segments have complete data (4,032 steps each, no gaps) as the contract requires; segments without rows return `no_data` from `/api/traffic/flow`. If the team later wants secondary/tertiary coverage, it must ship via Git LFS or a separate channel, not this file.

| Item | Value |
| --- | --- |
| Window | **2026-10-05T00:00:00Z → 2026-11-15T23:45:00Z** (42 days × 96 steps = 4,032 steps) |
| Size | 147 segments × 4,032 steps = **592,704 rows** (~33 MB), seed `20261113` |
| Week 6 (2026-11-09..15) | **Test week** — reserved, never used for training. IST 09:00 = UTC 03:30 |
| Columns | `segment_id,timestamp_utc,speed_kmph,free_flow_kmph,congestion_level,rain,incident,source` |
| Levels | `flowing` > 0.75 · `moderate` 0.50–0.75 · `heavy` 0.25–0.50 · `severe` < 0.25 (ratio = speed / free-flow) |

**Simulation model** — `speed = free_flow × hour_factor(IST) × rain_factor × incident_factor × (1 + N(0, 0.045))`, clamped to `[1, free_flow]`, 1 decimal:

- **hour_factor** — rush-hour dips centred at **09:00 IST** (−0.70, σ 1.05 h) and **18:30 IST** (−0.64, σ 1.25 h), smaller midday dip at 13:00 (−0.16, σ 2.2 h); weekends get 40% of the dips. Floor clamp 0.15.
- **rain** — 6 seeded rain days (2026-10-11/13, 2026-11-05/06/07/08), one window of 2–6 h per rain day, identical for all segments in that window; rain knocks speeds to **0.78×**; `rain=1` only inside the window.
- **incidents** — 47 seeded events over 42 days (≈60% of days get ≥1); each event: random primary segment, 1–4 steps (15–60 min), speeds drop to **0.45–0.70×**; `incident=1` for that window only. Severe rows land mostly in peak hours, as expected.
- **noise** — `N(0, 0.045)` per segment per step (±4.5%).
- **source** — always `SIMULATED`; timestamps UTC with `Z`; IST = UTC+5:30.

Resulting level mix (approx.): flowing 499k · moderate 53k · heavy 45k · severe ~245. A free-flowing city with real morning/evening peaks and incident-driven gridlock — deliberately mild, because real networks flow most of the day.

## Sample data — `data/sample/`

Kept for continuity. Tiny hand-made stand-in (8 nodes/10 edges, 50 rows) created in Phase 0. Replaced everywhere now by the real files; kept in-repo so M1/M2 diffs stay meaningful.

## Phase 2 model card (rf-v1)

- **Task**: predict segment speed 15 and 30 minutes ahead (two targets, two models).
- **Algorithms**: `RandomForestRegressor` per horizon — 150 trees, `max_depth=18`, `min_samples_leaf=5`, `n_jobs=-1`, `random_state=20261113`. RandomForest chosen over HistGradientBoosting because it exposes per-tree predictions, required for the confidence score.
- **Features** (all from `traffic.csv` + `graph.json`): `hour_ist`, `dow` (Mon=0), `weekend`, `speed_now`, `speed_lag15`, `speed_lag30`, `free_flow_kmph`, `lanes`, `rain`, `incident`, `neighbour_speed_now` = mean current speed of **primary edges sharing a node** with this segment (all 147 primaries have ≥ 1 primary neighbour, mean 2.29).
- **Split**: chronological — train ≤ 2026-11-08T23:45:00Z (493,626 rows after lag drops), test 2026-11-09T00:00:00Z .. 2026-11-15T23:15:00Z (98,490 rows). Week 6 (2026-11-09..15) is the test week, never trained on.
- **Baseline**: "speed later = speed now", reported alongside for an honest comparison.
- **Results (test week, MAE km/h, level accuracy)**:
  - ~15 min: baseline 2.0 → **rf-v1 1.1** (+44.7%), level accuracy **0.98** vs baseline 0.92
  - ~30 min: baseline 2.8 → **rf-v1 1.1** (+60.9%), level accuracy **0.98** vs baseline 0.86
- **Artefacts**: `ml-service/models/rf_15.joblib`, `rf_30.joblib` — **gitignored, reproducible** (re-run `ml-service/scripts/train_model.py` with the same seed and input data). Only the script and `ml-service/metrics.json` are committed.
- **Confidence formula** (used by the FastAPI service in Phase 3): per segment, take the per-tree predictions, compute their population std `σ`, then
  `confidence = 1 − min(1, σ / free_flow_kmph)`, rounded to 2 decimals. A spread that is small relative to free-flow → high confidence.
- **Level thresholds** (shared with the CSV): `flowing` > 0.75 · `moderate` 0.50–0.75 · `heavy` 0.25–0.50 · `severe` < 0.25.
- **Known limits**: `incident` positives are rare (118 rows) so incident weight is small by construction; week 6 congestion is deliberately light (all simulated); the model predicts *this segment* only — no graph-wide propagation yet.

## Licensing / attribution

- OpenStreetMap © contributors — ODbL 1.0. Attribution required on any output that shows the map or its data.
- Simulated values are ours; no third-party traffic data was used.
- Fonts/tiles: OSM tile servers show attribution automatically in Leaflet; demo slides must credit OpenStreetMap.
