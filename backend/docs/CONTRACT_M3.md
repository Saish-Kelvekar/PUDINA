# Contract for Member 3 (ML, data & simulations)

From Member 2 (backend). Read this before starting Phase 0.
If you want to change anything here, tell M2 first. A change on one side alone breaks the other.

**The short version:** you only make **files** and **one FastAPI service**. You never touch the database or the backend code. M2 loads your files into PostgreSQL and calls your service.

---

## 1. What you give, and when

| What | Path | Phase 0 (sample) | Real version |
| --- | --- | --- | --- |
| Road graph | `data/sample/graph.json` → `data/graph.json` | 8 nodes, 10 edges (a sample already exists, keep or replace it) | End of Phase 1 (hour 4) |
| Traffic data | `data/sample/traffic.csv` → `data/traffic.csv` | about 50 rows | End of Phase 1 (hour 4) |
| Example ML responses | `ml-service/examples/*.json` | one file per endpoint in section 4 | — |
| FastAPI service | `ml-service/` on port **8000** | — | `/predict`, `/metrics`: hour 13 · `/signals/optimize`: hour 16 |
| Demo seed data | `data/seed/users.json`, `data/seed/incidents.json` | — | Phase 4 |

---

## 2. `graph.json`

```json
{
  "nodes": [
    { "id": "n1", "lat": 12.9081, "lng": 77.5850, "name": "Junction A", "signalised": true }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "name": "Main Road", "length_m": 433,
      "road_type": "primary", "lanes": 2, "free_flow_kmph": 40, "oneway": false,
      "coords": [[12.9081, 77.5850], [12.9081, 77.5890]] }
  ]
}
```

Rules:

1. **IDs are strings**: nodes `n1, n2, …`, edges `e1, e2, …`. Never reuse or renumber an ID after you share the file.
2. **Each road appears once.** osmnx gives two edges for a two-way road (A→B and B→A). Keep only one and set `oneway: false`. For a real one-way road keep the single edge with `oneway: true`, pointing in the driving direction.
3. `coords` are `[lat, lng]` (lat first), from the `from` node to the `to` node, including both end points.
4. `name` can be `null` if OSM has no name. Every other field is required.
5. `lanes` is a whole number, at least 1 (use 1 if OSM has no value). `free_flow_kmph`: use the OSM speed limit if there is one; otherwise primary 40, secondary 30, tertiary 30, residential 25.
6. `signalised: true` on about 10 junctions that have 4 or more roads. M2 creates one junction per signalised node with ID `J-<node id>`, e.g. `J-n5`.
7. Every edge's `from` and `to` must be a node in `nodes`. The graph must be connected (keep the largest connected part only).

---

## 3. `traffic.csv`

Columns, in this order, with a header row:

```
segment_id,timestamp_utc,speed_kmph,free_flow_kmph,congestion_level,rain,incident,source
e1,2026-11-10T03:30:00Z,22.0,40,moderate,0,0,SIMULATED
e4,2026-11-10T03:30:00Z,12.0,30,heavy,0,0,SIMULATED
e7,2026-11-10T03:30:00Z,18.0,40,heavy,0,1,SIMULATED
e10,2026-11-10T03:30:00Z,34.0,40,flowing,1,0,SIMULATED
```

| Column | Rule |
| --- | --- |
| `segment_id` | An edge `id` from `graph.json`. One speed per road, used for both directions |
| `timestamp_utc` | UTC with `Z`, every 15 min, exactly on :00, :15, :30, :45. **IST 09:00 = UTC 03:30** |
| `speed_kmph` | Number ≥ 0, one decimal |
| `free_flow_kmph` | Same value as the edge in `graph.json` |
| `congestion_level` | From ratio = speed ÷ free-flow: `> 0.75` **flowing**, `0.50–0.75` **moderate**, `0.25–0.50` **heavy**, `< 0.25` **severe**. Exactly these lowercase words |
| `rain`, `incident` | `0` or `1` |
| `source` | Always `SIMULATED` |

- One row per segment per 15-minute step. No missing steps for a segment (if you skip main roads only, skip the whole road, not some rows).
- Size check: 6 weeks × 96 steps a day = 4,032 rows per segment. 500 segments ≈ 2 million rows, which is fine.
- Please make the dataset **end on Sunday 2026-11-15**, so "week 6" is 2026-11-09 to 2026-11-15. M2's simulation clock starts in week 6 (the test week), so the demo shows predictions the model never trained on.

---

## 4. The FastAPI service (`http://localhost:8000`)

- Return **plain JSON** (no `{ success, data, error }` wrapper; M2 adds that).
- On bad input, return HTTP 400 with `{ "detail": "what is wrong" }`.
- M2 waits **3 seconds**. If there's no answer, M2 falls back to the baseline / the fixed 20 s wait, so a slow or crashed service never breaks the website.
- Times you receive (`as_of`) are always on a 15-minute step that exists in your CSV.

### 4.1 `GET /health`

```json
{ "status": "ok", "model_version": "hgb-v1", "data_until": "2026-11-15T23:45:00Z" }
```

### 4.2 `POST /predict`

Request:
```json
{ "as_of": "2026-11-10T03:30:00Z", "horizon": 15, "segment_ids": ["e1", "e7"] }
```
`horizon` is `15` or `30`. An empty or missing `segment_ids` means **all segments**.

Response:
```json
{
  "model_version": "hgb-v1",
  "horizon_min": 15,
  "made_at_utc": "2026-11-10T03:30:00Z",
  "predictions": [
    { "segment_id": "e7", "current_speed_kmph": 18.0, "predicted_speed_kmph": 16.2,
      "predicted_level": "heavy", "confidence": 0.86,
      "target_time_utc": "2026-11-10T03:45:00Z", "source": "AI_PREDICTED" }
  ]
}
```
- `current_speed_kmph` is the CSV speed at `as_of`. `target_time_utc` = `as_of` + horizon.
- `predicted_level` uses the same thresholds as the CSV.
- `confidence` is between 0 and 1 (from how much the individual trees disagree). Write in `DATA_SOURCES.md` how you turn the spread into 0–1.

### 4.3 `GET /metrics`

Optional query: `?segment_id=e7&horizon=15` adds the chart series.

```json
{
  "model_version": "hgb-v1",
  "trained_on": "2026-10-05 to 2026-11-08",
  "tested_on": "2026-11-09 to 2026-11-15",
  "split": "time-based",
  "horizons": {
    "15": { "mae_model_kmph": 2.1, "mae_baseline_kmph": 3.4, "improvement_pct": 38.2,
            "level_accuracy_model": 0.81, "level_accuracy_baseline": 0.72, "test_rows": 120960 },
    "30": { "mae_model_kmph": 2.9, "mae_baseline_kmph": 4.6, "improvement_pct": 37.0,
            "level_accuracy_model": 0.76, "level_accuracy_baseline": 0.65, "test_rows": 120960 }
  },
  "series": {
    "segment_id": "e7", "horizon_min": 15,
    "points": [
      { "timestamp_utc": "2026-11-10T03:30:00Z", "actual_kmph": 18.0, "predicted_kmph": 17.6, "baseline_kmph": 19.0 }
    ]
  }
}
```
⚠️ The numbers above only show the shape. The real ones must come from your test week. `series` is `null` when no `segment_id` is given. Give about 48 points (12 hours) around `as_of`, or the first day of the test week.
`improvement_pct` = (baseline MAE − model MAE) ÷ baseline MAE × 100.

### 4.4 `POST /signals/optimize`

Request:
```json
{ "junction_id": "J-n5", "node_id": "n5", "as_of": "2026-11-10T03:30:00Z",
  "mode": "optimize", "emergency_approach_id": null, "cycles": 10, "seed": 42 }
```
- `mode`: `optimize`, or `emergency` (then `emergency_approach_id` is set, e.g. `"n5-e4"`).
- **Approaches:** you work them out yourself from `graph.json`: every edge that touches the node and can be driven *into* it is one approach. **Approach ID = `<node id>-<edge id>`**, e.g. `n5-e4`.
- Queues and arrival rates: work them out from your traffic CSV at `as_of` (slower road = longer queue). Write the formula in `DATA_SOURCES.md`.
- Current timing for every junction: 30 s green per approach, 3 s yellow, 2 s all-red.

Response:
```json
{
  "junction_id": "J-n5", "mode": "optimize", "cycles": 10, "seed": 42,
  "queues": [ { "approach_id": "n5-e4", "queue_now": 9, "arrivals_per_min": 5.0 } ],
  "current":   { "cycle_s": 140, "phases": [ { "approach_id": "n5-e4", "green_s": 30, "yellow_s": 3, "all_red_s": 2 } ],
                 "avg_wait_s": 48.2, "max_queue": 21, "throughput": 312 },
  "optimized": { "cycle_s": 140, "phases": [ { "approach_id": "n5-e4", "green_s": 26, "yellow_s": 3, "all_red_s": 2 } ],
                 "avg_wait_s": 36.9, "max_queue": 14, "throughput": 331 },
  "improvement": { "avg_wait_saved_s": 11.3, "avg_wait_change_pct": -23.4, "throughput_change_pct": 6.1 },
  "reasons": [ { "approach_id": "n5-e4", "text": "Green shorter (30s → 26s): demand is 27% of the junction total." } ],
  "red_wait_saved_s": null,
  "source": "SIMULATED"
}
```
- `phases` list every approach, in the same order in `current`, `optimized`, `queues` and `reasons`.
- Every `green_s` between 10 and 60. Both runs use the **same seed**, so the comparison is fair.
- In `emergency` mode, `red_wait_saved_s` = the average red wait the emergency vehicle would have had on its approach with normal timings (M2 uses this instead of the fixed 20 s). In `optimize` mode it is `null`.

---

## 5. Demo seed data (Phase 4)

`data/seed/users.json`:
```json
[ { "name": "Riya Sharma", "email": "user@demo.test", "password": "demo123", "role": "user" },
  { "name": "Admin", "email": "admin@demo.test", "password": "demo123", "role": "admin" },
  { "name": "Ambulance Desk", "email": "ems@demo.test", "password": "demo123", "role": "emergency" } ]
```
(Plain passwords are fine here: M2's seed script hashes them with bcrypt.)

`data/seed/incidents.json` (about 15, including 2 pairs of near-duplicates):
```json
[ { "category": "accident", "description": "Car crash near Lake Road signal", "lat": 12.9045, "lng": 77.5910,
    "reported_severity": "medium", "lanes_blocked": 1, "is_closure": false,
    "status": "pending", "reported_by_email": "user@demo.test", "minutes_ago": 12 } ]
```
Allowed values: `category` = accident, breakdown, roadwork, flooding, closure, event, other · `reported_severity` = low, medium, high · `status` = pending or verified. Put each incident on a real road in your graph (within about 30 m).

---

## 6. Your Phase 0 checklist

- [ ] Read this file; tell M2 "agreed", or what you want to change
- [ ] Keep or replace `data/sample/graph.json` (same IDs `n1…n8`, `e1…e10` if you replace it, so M1's mocks still match)
- [ ] `data/sample/traffic.csv`: about 50 rows, IDs from the sample graph
- [ ] `ml-service/examples/health.json`, `predict.json`, `metrics.json`, `signals_optimize.json` in the shapes above
- [ ] Push to your own branch and tell the team
