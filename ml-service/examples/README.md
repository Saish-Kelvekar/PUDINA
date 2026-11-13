# ML service example responses (Phase 0)

These files are the agreed shapes for Member 3's FastAPI service (port 8000).
Member 2 forwards these payloads inside its own `{ success, data, error }` wrapper;
Member 1 uses them as mocks. Plain JSON only — no wrapper here.

## Endpoints and requests

| File | Endpoint | Request |
| --- | --- | --- |
| `health.json` | `GET /health` | — |
| `predict.json` | `POST /predict` | `{ "as_of": "2026-11-10T03:30:00Z", "horizon": 15, "segment_ids": ["e1", "e7"] }` — empty/missing `segment_ids` = all segments |
| `metrics.json` | `GET /metrics` | optional `?segment_id=e7&horizon=15` (adds the chart `series`; `null` without it) |
| `signals_optimize.json` | `POST /signals/optimize` | `{ "junction_id": "J-n2", "node_id": "n2", "as_of": "2026-11-10T03:30:00Z", "mode": "optimize", "emergency_approach_id": null, "cycles": 10, "seed": 42 }` — for emergency mode set `"mode": "emergency"` and `"emergency_approach_id": "n2-e1"` |

## Conventions (from M2's CONTRACT_M3.md)

- Times: ISO 8601 UTC with `Z`, always on a 15-minute step existing in `traffic.csv`.
- `predicted_level` / `congestion_level`: `flowing` (> 0.75 ratio), `moderate` (0.50–0.75), `heavy` (0.25–0.50), `severe` (< 0.25).
- Approach ID = `<node id>-<edge id>` (e.g. `n2-e1`); junction ID = `J-<node id>` (e.g. `J-n2`).
- Current signal timing: 30 s green per approach, 3 s yellow, 2 s all-red; every green clamped to 10–60 s.
- `red_wait_saved_s` is `null` in `optimize` mode; in `emergency` mode it holds the red wait saved for the emergency approach.
- Bad input: HTTP 400 with `{ "detail": "what is wrong" }`. M2 falls back after 3 s.
- Numbers in these files are placeholders showing the shape — real values come from the trained model in Phases 2–3.
