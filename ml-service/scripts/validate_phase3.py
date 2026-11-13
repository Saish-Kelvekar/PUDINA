"""Phase 3 end-to-end smoke test: boots the real service on port 8001 and
checks every endpoint against the contract (docs/CONTRACT_M3.md §4).
Run: python ml-service/scripts/validate_phase3.py
"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 8001
BASE = f"http://localhost:{PORT}"
ERRORS = []
CHECKS = 0
ALL_SEGMENTS = []  # filled from CSV after load


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, json.loads(r.read())


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=120) as r:
        return r.status, json.loads(r.read())


def post_expect_400(path, body):
    try:
        post(path, body)
        return False
    except urllib.error.HTTPError as e:
        return e.code == 400


def get_expect_400(path):
    try:
        get(path)
        return False
    except urllib.error.HTTPError as e:
        return e.code == 400


def check(cond, ok, fail):
    global CHECKS
    CHECKS += 1
    if cond:
        print(f"  ok   {ok}")
    else:
        ERRORS.append(fail)
        print(f"  FAIL {fail}")


graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
CSV = ROOT / "data" / "traffic.csv"
covered = sorted({r for r in pd.read_csv(CSV, usecols=["segment_id"]).segment_id})
print(f"covered segments: {len(covered)}")

server = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
    cwd=str(ROOT / "ml-service"),
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(180):
        time.sleep(1)
        try:
            code, _ = get("/health")
            break
        except Exception:
            pass
    else:
        print("service did not start in time")
        raise SystemExit(1)

    print("== /health ==")
    code, health = get("/health")
    check(health["status"] == "ok", "status ok", "status not ok")
    check(health["model_version"] == "rf-v1", "model_version rf-v1", "model_version wrong")
    check(health["data_until"] == "2026-11-15T23:45:00Z", "data_until matches CSV max step",
          f"data_until {health.get('data_until')}")

    print("== /predict ==")
    code, all_pred = post("/predict", {"as_of": "2026-11-10T03:30:00Z", "horizon": 15})
    check(len(all_pred["predictions"]) == len(covered),
          f"missing segment_ids -> all {len(covered)} predictions",
          f"got {len(all_pred['predictions'])}")
    check(all_pred["model_version"] == "rf-v1" and all_pred["made_at_utc"] == "2026-11-10T03:30:00Z",
          "response envelope keys correct", "envelope keys wrong")
    sample = all_pred["predictions"][0]
    for k in ["segment_id", "current_speed_kmph", "predicted_speed_kmph", "predicted_level",
              "confidence", "target_time_utc", "source"]:
        check(k in sample, f"prediction has {k}", f"missing {k}")
    check(all(0.0 <= p["confidence"] <= 1.0 for p in all_pred["predictions"]),
          "confidence in [0,1]", "confidence out of range")
    check(all(p["source"] == "AI_PREDICTED" for p in all_pred["predictions"]),
          "source AI_PREDICTED", "source wrong")
    check(all(p["predicted_level"] in {"flowing", "moderate", "heavy", "severe"}
              for p in all_pred["predictions"]),
          "predicted_level uses contract words", "level words wrong")

    code, subset = post("/predict", {"as_of": "2026-11-10T03:30:00Z", "horizon": 30,
                                     "segment_ids": ["e2664", "e8"]})
    check([p["segment_id"] for p in subset["predictions"]] == ["e2664", "e8"],
          "requested order preserved", "order not preserved")
    check(subset["predictions"][0]["target_time_utc"] == "2026-11-10T04:00:00Z",
          "target_time_utc = as_of + 30 min", "target time wrong")

    check(post_expect_400("/predict", {"as_of": "2026-11-10T03:30:00Z", "horizon": 20}),
          "horizon 20 -> 400", "horizon 20 not rejected")
    check(post_expect_400("/predict", {"as_of": "2026-11-10T03:31:00Z", "horizon": 15}),
          "off-step as_of -> 400", "off-step as_of accepted")
    check(post_expect_400("/predict", {"as_of": "2026-11-20T03:30:00Z", "horizon": 15}),
          "as_of outside window -> 400", "out-of-window as_of accepted")
    check(post_expect_400("/predict", {"as_of": "2026-11-10T03:30:00Z", "horizon": 15,
                                       "segment_ids": ["e999999"]}),
          "unknown segment -> 400", "unknown segment accepted")

    print("== /metrics ==")
    code, m = get("/metrics")
    check(m["split"] == "time-based" and m["series"] is None and "horizons" in m,
          "default: horizons present, series null", "default metrics wrong")
    try:
        post("/metrics", {})
        check(False, "no POST for /metrics", "metrics accepted POST")
    except urllib.error.HTTPError as e:
        check(e.code == 405, "POST /metrics -> 405", f"POST /metrics -> {e.code}")

    try:
        code, m2 = get("/metrics?segment_id=e2664&horizon=15")
        s = m2["series"]
        check(s is not None and len(s["points"]) == 48, "series present, 48 points",
              f"series wrong: {s if s is None else len(s.get('points', []))}")
        check(all(set(p) == {"timestamp_utc", "actual_kmph", "predicted_kmph", "baseline_kmph"}
                  for p in s["points"]),
              "series points have all fields", "series point fields wrong")
    except Exception as e:
        check(False, "series request works", f"series failed: {e}")
    check(get_expect_400("/metrics?segment_id=e2664&horizon=45"),
          "horizon 45 -> 400", "horizon 45 accepted")

    print("== /signals/optimize ==")
    body = {"junction_id": "J-n1005", "as_of": "2026-11-10T03:30:00Z",
            "mode": "optimize", "cycles": 10, "seed": 42}
    code, sig = post("/signals/optimize", body)
    for k in ["junction_id", "mode", "cycles", "seed", "queues", "current",
              "optimized", "improvement", "reasons", "red_wait_saved_s", "source"]:
        check(k in sig, f"response has {k}", f"missing {k}")
    n_app = len(sig["queues"])
    check(all(10 <= ph["green_s"] <= 60 for run in ("current", "optimized") for ph in sig[run]["phases"]),
          "every green_s in [10, 60]", "green out of range")
    check(all(ph["yellow_s"] == 3 and ph["all_red_s"] == 2
              for run in ("current", "optimized") for ph in sig[run]["phases"]),
          "yellow 3 s, all-red 2 s", "yellow/all-red wrong")
    check([a["approach_id"] for a in sig["queues"]]
          == [ph["approach_id"] for ph in sig["current"]["phases"]]
          == [ph["approach_id"] for ph in sig["optimized"]["phases"]]
          == [r["approach_id"] for r in sig["reasons"]],
          "same approach order in queues/current/optimized/reasons", "approach order mismatch")
    check(sig["red_wait_saved_s"] is None, "red_wait_saved_s null in optimize mode",
          "red_wait_saved_s not null")
    check(sig["source"] == "SIMULATED", "source SIMULATED", "source wrong")
    check(sum(ph["green_s"] for ph in sig["current"]["phases"]) + 5 * n_app == sig["current"]["cycle_s"] == sig["optimized"]["cycle_s"],
          "cycle_s = greens + 5 s/phase, same in both runs", "cycle_s inconsistent")

    code2, sig2 = post("/signals/optimize", body)
    check(sig2 == sig, "seed 42 -> identical response on repeat", "non-deterministic with fixed seed")

    em_body = {"junction_id": "J-n271", "as_of": "2026-11-10T03:30:00Z",
               "mode": "emergency", "emergency_approach_id": "n271-e2984",
               "cycles": 10, "seed": 42}
    code, em = post("/signals/optimize", em_body)
    greens = [ph["green_s"] for ph in em["optimized"]["phases"]]
    e_idx = [a["approach_id"] for a in em["queues"]].index("n271-e2984")
    check(em["red_wait_saved_s"] is not None and em["red_wait_saved_s"] > 0,
          "emergency mode returns red_wait_saved_s > 0", "red_wait_saved_s wrong")
    check(greens[e_idx] >= 30 and all(g >= 10 for g in greens),
          "emergency green >= 30 s, others >= 10 s", "emergency greens wrong")
    check(post_expect_400("/signals/optimize", {"junction_id": "J-does-not-exist",
                                                 "mode": "optimize"}),
          "unknown junction -> 400", "unknown junction accepted")
    check(post_expect_400("/signals/optimize", {"junction_id": "J-n271", "mode": "emergency"}),
          "emergency mode without approach id -> 400", "emergency mode accepted incomplete body")
    check(post_expect_400("/signals/optimize", {"junction_id": "J-n271", "mode": "bogus"}),
          "bogus mode -> 400", "bogus mode accepted")

    print(f"\n{CHECKS - len(ERRORS)}/{CHECKS} checks passed")
    if ERRORS:
        print("PHASE 3 VALIDATION FAILED")
        raise SystemExit(1)
    print("PHASE 3 VALIDATION PASSED")
finally:
    server.terminate()
    try:
        server.wait(timeout=20)
    except subprocess.TimeoutExpired:
        server.kill()
