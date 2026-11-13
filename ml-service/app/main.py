"""TrafficVision ML service (port 8000) — contract: docs/CONTRACT_M3.md §4.4.
Plain JSON only; M2 adds the { success, data, error } wrapper. On bad input,
HTTP 400 with { "detail": "what is wrong" }.

Startup precomputes the full feature matrix once (~70 MB in RAM) so /predict
is a lookup + a single RF.predict call (<100 ms).
"""
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml-service"))
from app.features import FEATURES, add_features, covered_edges, level
from app.graph_utils import junction_id, approaches_into, load_graph, signalised_node_ids
from app.signals import optimize_junction

CSV = ROOT / "data" / "traffic.csv"
METRICS_PATH = ROOT / "ml-service" / "metrics.json"
MODEL_DIR = ROOT / "ml-service" / "models"
MODEL_VERSION = "rf-v1"
TEST_WEEK_FIRST_STEP = "2026-11-09T00:00:00Z"

STATE: dict[str, Any] = {}


def _fmt_ts(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


@asynccontextmanager
async def lifespan(app: FastAPI):
    graph = load_graph()
    covered = covered_edges(graph)
    covered_ids = [e["id"] for e in covered]

    df = pd.read_csv(CSV, parse_dates=["timestamp_utc"])
    df = add_features(df, graph)
    df["speed_lag15"] = df["speed_lag15"].fillna(df["speed_now"])
    df["speed_lag30"] = df["speed_lag30"].fillna(df["speed_now"])

    STATE["graph"] = graph
    STATE["covered_ids"] = covered_ids
    STATE["df"] = df
    STATE["lookup"] = {(row.timestamp_utc, row.segment_id): i
                       for i, row in enumerate(df.itertuples())}
    STATE["steps"] = set(df["timestamp_utc"])
    STATE["data_until"] = _fmt_ts(df["timestamp_utc"].max())
    STATE["models"] = {15: joblib.load(MODEL_DIR / "rf_15.joblib"),
                       30: joblib.load(MODEL_DIR / "rf_30.joblib")}
    STATE["metrics"] = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    STATE["series_cache"] = {}
    print(f"ml-service ready: {len(df)} rows, {len(covered_ids)} segments, "
          f"models rf-v1, data_until {STATE['data_until']}")
    yield
    STATE.clear()


app = FastAPI(title="TrafficVision ML", version="0.1.0", lifespan=lifespan)


class PredictRequest(BaseModel):
    as_of: str
    horizon: int
    segment_ids: Optional[list[str]] = None


class SignalsRequest(BaseModel):
    junction_id: str
    node_id: Optional[str] = None
    as_of: Optional[str] = None
    mode: str = "optimize"
    emergency_approach_id: Optional[str] = None
    cycles: int = 10
    seed: int = 42


def _parse_as_of(value: str) -> pd.Timestamp:
    try:
        ts = pd.to_datetime(value, utc=True)
    except Exception:
        raise HTTPException(400, f"as_of is not a valid ISO-8601 UTC timestamp: {value!r}")
    if ts.second != 0 or ts.minute not in (0, 15, 30, 45):
        raise HTTPException(400, "as_of must be on a 15-minute step (:00/:15/:30/:45)")
    if ts not in STATE["steps"]:
        raise HTTPException(400, f"as_of {value!r} is outside the dataset window")
    return ts


def _validate_segments(segment_ids: Optional[list[str]]) -> list[str]:
    known = STATE["covered_ids"]
    if not segment_ids:  # empty or missing -> ALL covered segments
        return known
    unknown = [s for s in segment_ids if s not in set(known)]
    if unknown:
        raise HTTPException(400, f"unknown segment_ids: {unknown}")
    seen, out = set(), []
    for s in segment_ids:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _predict_at(ts: pd.Timestamp, horizon: int, segment_ids: list[str]) -> list[dict]:
    df = STATE["df"]
    lookup = STATE["lookup"]
    model = STATE["models"][horizon]
    indices = []
    ordered = []
    for s in segment_ids:
        i = lookup.get((ts, s))
        if i is None:
            raise HTTPException(400, f"no measurement for segment {s} at {ts}")
        indices.append(i)
        ordered.append(s)
    rows = df.iloc[indices]
    X = rows[FEATURES].values
    y = model.predict(X)
    tree_preds = np.stack([est.predict(X) for est in model.estimators_])
    sigma = tree_preds.std(axis=0)

    out = []
    for seg_id, pred, sd, (_, row) in zip(ordered, y, sigma, rows.iterrows()):
        ratio = pred / row["free_flow_kmph"]
        confidence = round(float(1 - min(1.0, sd / row["free_flow_kmph"])), 2)
        out.append({
            "segment_id": seg_id,
            "current_speed_kmph": round(float(row["speed_now"]), 1),
            "predicted_speed_kmph": round(float(pred), 1),
            "predicted_level": str(level(np.array([ratio]))[0]),
            "confidence": confidence,
            "target_time_utc": _fmt_ts(ts + pd.Timedelta(minutes=horizon)),
            "source": "AI_PREDICTED",
        })
    return out


@app.get("/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION, "data_until": STATE["data_until"]}


@app.post("/predict")
def predict(req: PredictRequest):
    if req.horizon not in (15, 30):
        raise HTTPException(400, "horizon must be 15 or 30")
    ts = _parse_as_of(req.as_of)
    segments = _validate_segments(req.segment_ids)
    return {
        "model_version": MODEL_VERSION,
        "horizon_min": req.horizon,
        "made_at_utc": _fmt_ts(ts),
        "predictions": _predict_at(ts, req.horizon, segments),
    }


@app.get("/metrics")
def metrics(segment_id: Optional[str] = Query(default=None),
            horizon: Optional[int] = Query(default=None)):
    payload = dict(STATE["metrics"])
    payload["series"] = None
    if segment_id is None and horizon is None:
        return payload
    if segment_id is None or horizon not in (15, 30):
        raise HTTPException(400, "segment_id and horizon (15 or 30) must be given together")
    if segment_id not in STATE["covered_ids"]:
        raise HTTPException(400, f"unknown segment_id: {segment_id}")
    cache_key = (segment_id, horizon)
    if cache_key not in STATE["series_cache"]:
        STATE["series_cache"][cache_key] = _build_series(segment_id, horizon)
    payload["series"] = STATE["series_cache"][cache_key]
    return payload


def _build_series(segment_id: str, horizon: int) -> dict:
    df = STATE["df"]
    model = STATE["models"][horizon]
    week6 = df[df["timestamp_utc"] >= pd.Timestamp(TEST_WEEK_FIRST_STEP, tz="UTC")]
    seg_rows = week6[week6["segment_id"] == segment_id].sort_values("timestamp_utc").head(48)
    lookup = STATE["lookup"]
    points = []
    for _, row in seg_rows.iterrows():
        t_src = row["timestamp_utc"] - pd.Timedelta(minutes=horizon)
        i = lookup.get((t_src, segment_id))
        if i is None:
            continue
        src = df.iloc[i]
        X = src[FEATURES].values.reshape(1, -1)
        points.append({
            "timestamp_utc": _fmt_ts(row["timestamp_utc"]),
            "actual_kmph": round(float(row["speed_now"]), 1),
            "predicted_kmph": round(float(model.predict(X)[0]), 1),
            "baseline_kmph": round(float(src["speed_now"]), 1),
        })
    return {"segment_id": segment_id, "horizon_min": horizon, "points": points}


@app.post("/signals/optimize")
def signals_optimize(req: SignalsRequest):
    graph = STATE["graph"]
    junction_ids = {junction_id(nid): nid for nid in signalised_node_ids(graph)}
    if req.junction_id not in junction_ids:
        raise HTTPException(400, f"unknown junction_id: {req.junction_id!r} "
                                 f"(expected one of {sorted(junction_ids)})")
    node_id = req.node_id or junction_ids[req.junction_id]
    if node_id not in {n["id"] for n in graph["nodes"]}:
        raise HTTPException(400, f"unknown node_id: {node_id!r}")
    if req.mode not in ("optimize", "emergency"):
        raise HTTPException(400, "mode must be 'optimize' or 'emergency'")

    as_of = _parse_as_of(req.as_of) if req.as_of else pd.Timestamp(STATE["data_until"].replace("Z", "+00:00"))
    approaches = approaches_into(graph, node_id)
    approach_ids = [ap["approach_id"] for ap in approaches]

    rows = _rows_at(as_of, [ap["edge_id"] for ap in approaches])
    if req.mode == "emergency" and (not req.emergency_approach_id
                                    or req.emergency_approach_id not in approach_ids):
        raise HTTPException(400, f"emergency mode requires emergency_approach_id in {approach_ids}")
    if not (1 <= req.cycles <= 100):
        raise HTTPException(400, "cycles must be between 1 and 100")

    return optimize_junction(node_id, req.junction_id, approaches, rows, graph,
                             req.mode, req.emergency_approach_id,
                             req.cycles, req.seed, as_of)


def _rows_at(ts: pd.Timestamp, edge_ids: list[str]) -> dict[str, pd.Series]:
    df = STATE["df"]
    lookup = STATE["lookup"]
    out = {}
    for e in edge_ids:
        i = lookup.get((ts, e))
        if i is None:
            raise HTTPException(400, f"no measurement for segment {e} at {ts}")
        out[e] = df.iloc[i]
    return out
