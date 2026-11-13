# ml-service — Member 3's service

Prediction (`/predict`), model metrics (`/metrics`), health (`/health`) and
adaptive signal optimization (`/signals/optimize`). Plain JSON, no wrapper —
Member 2's backend adds `{ success, data, error }` on top.

## Run

```bash
cd ml-service
python -m venv venv
venv/Scripts/pip install -r requirements.txt
venv/Scripts/uvicorn app.main:app --port 8000
```

Startup loads `data/traffic.csv` and precomputes features once (~70 MB,
~15 s). `GET http://localhost:8000/health` should return
`{"status": "ok", "model_version": "rf-v1", "data_until": "2026-11-15T23:45:00Z"}`.

## Endpoints (contract: docs/CONTRACT_M3.md §4)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{status, model_version, data_until}` |
| POST | `/predict` | body `{"as_of": "2026-11-10T03:30:00Z", "horizon": 15, "segment_ids": ["e2664"]}` — empty/missing `segment_ids` = **all covered segments** (188) |
| GET | `/metrics` | optional `?segment_id=e7&horizon=15` — without it, `series` is `null` |
| POST | `/signals/optimize` | body `{"junction_id": "J-n1005", "as_of": "2026-11-10T03:30:00Z", "mode": "optimize", "cycles": 10, "seed": 42}`; for emergency add `"mode": "emergency", "emergency_approach_id": "n1005-e8"` |

Bad input → HTTP 400 `{ "detail": "..." }`. Member 2 falls back to the
baseline / the fixed 20 s wait after **3 s**, so a slow service never breaks
the site.

- `as_of` must be on a 15-min step that exists in `data/traffic.csv`
  (`:00/:15/:30/:45Z`).
- `horizon` is `15` or `30` only.
- Approach IDs are `<node id>-<edge id>` (e.g. `n1005-e8`); junction IDs are
  `J-<node id>`.
- All responses are `SIMULATED` / `AI_PREDICTED` — never presented as live.

## Files

| Path | What |
| --- | --- |
| `app/main.py` | FastAPI app (endpoints, request validation) |
| `app/features.py` | Feature pipeline (training and serving share it) |
| `app/graph_utils.py` | `graph.json` helpers (signalised nodes, approaches) |
| `app/signals.py` | Signal optimizer + seeded second-by-second simulation |
| `scripts/train_model.py` | Trains rf-v1 (RandomForest, seed 20261113) |
| `scripts/make_sample_csv.py` | Phase 0 stand-in CSV generator (kept) |
| `scripts/validate_phase0.py` … `validate_phase3.py` | Contract/consistency checks |
| `models/` | `rf_15.joblib`, `rf_30.joblib` — gitignored, reproducible via `train_model.py` |
| `metrics.json` | Committed metrics for `/metrics` (baseline comparison included) |

## Testing

```bash
venv/Scripts/python.exe scripts/validate_phase3.py   # live smoke test (starts uvicorn on 8001)
venv/Scripts/python.exe scripts/validate_phase2.py   # model + metrics sanity
```
