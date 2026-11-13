"""Phase 0 validation: checks sample graph, sample traffic CSV and ML example
files against M2's CONTRACT_M3.md and api.md. Run before merging to main:

    python ml-service/scripts/validate_phase0.py
"""
import csv
import json
import re
from datetime import datetime, timezone
from math import cos, radians, sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ERRORS = []
CHECKS = 0


def check(condition: bool, ok_msg: str, fail_msg: str) -> None:
    global CHECKS
    CHECKS += 1
    if not condition:
        ERRORS.append(fail_msg)
        print(f"  FAIL {fail_msg}")
    else:
        print(f"  ok   {ok_msg}")


def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def haversine_m(a, b) -> float:
    lat1, lng1, lat2, lng2 = a[0], a[1], b[0], b[1]
    # approx at Bengaluru latitude is fine for the sample's 1 km scale
    dx = (lng2 - lng1) * 111320.0 * cos(radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * 110570.0
    return sqrt(dx * dx + dy * dy)


def level(ratio: float) -> str:
    if ratio > 0.75:
        return "flowing"
    if ratio >= 0.50:
        return "moderate"
    if ratio >= 0.25:
        return "heavy"
    return "severe"


def ts_valid(value: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:(00|15|30|45):00Z", value))


print("== graph.json ==")
graph = load_json(ROOT / "data" / "sample" / "graph.json")
nodes = {n["id"]: n for n in graph["nodes"]}
edges = {e["id"]: e for e in graph["edges"]}

check(len(nodes) == 8, "8 nodes", f"expected 8 nodes, got {len(nodes)}")
check(len(edges) == 10, "10 edges", f"expected 10 edges, got {len(edges)}")
check(graph["nodes"][0]["id"] == "n1" and graph["edges"][0]["id"] == "e1",
      "IDs start at n1 / e1 (never renumbered)", "IDs do not start at n1 / e1")

required_node_keys = {"id", "lat", "lng", "name", "signalised"}
check(all(required_node_keys <= set(n) for n in nodes.values()),
      "all node fields present", "node missing required fields")
check(all(isinstance(n["lat"], float) and isinstance(n["lng"], float) for n in nodes.values()),
      "lat/lng are floats", "lat/lng not floats")
check(all(12.0 < n["lat"] < 14.0 and 77.0 < n["lng"] < 78.5 for n in nodes.values()),
      "coords are in Bengaluru range", "node coords outside Bengaluru range")

required_edge_keys = {"id", "from", "to", "name", "length_m", "road_type", "lanes",
                      "free_flow_kmph", "oneway", "coords"}
check(all(required_edge_keys <= set(e) for e in edges.values()),
      "all edge fields present", "edge missing required fields")
check(all(e["from"] in nodes and e["to"] in nodes for e in edges.values()),
      "every edge's from/to resolves to a node", "edge references unknown node")
check(all(e["lanes"] >= 1 for e in edges.values()), "lanes >= 1", "lanes < 1")
check(all(e["free_flow_kmph"] in (40, 30, 25) for e in edges.values()),
      "free_flow_kmph uses contract defaults (40/30/25)", "free_flow_kmph not a contract value")
check(len(edges["e3"]["coords"]) >= 3 and len(edges["e5"]["coords"]) >= 4,
      "polylines have bends", "polylines missing bends")
check(all(abs(c[0] - 12.93) < 0.05 and abs(c[1] - 77.56) < 0.05
          for e in edges.values() for c in e["coords"]),
      "all edge coords near the mapped area", "edge coord far outside map area")

# coords endpoints match from/to nodes, in [lat, lng] order
ok_endpoints = all(edges[e]["coords"][0] == [nodes[edges[e]["from"]]["lat"], nodes[edges[e]["from"]]["lng"]]
                   and edges[e]["coords"][-1] == [nodes[edges[e]["to"]]["lat"], nodes[edges[e]["to"]]["lng"]]
                   for e in edges)
check(ok_endpoints, "coords run from -> to including both endpoints", "coords endpoints mismatch from/to")

# length_m plausible vs coords
max_err = max(abs(edges[e]["length_m"] - haversine_m(edges[e]["coords"][0], edges[e]["coords"][-1]))
              for e in edges)
check(max_err < 60, f"length_m within 60 m of coord distance (max err {max_err:.0f} m)",
      f"length_m off by {max_err:.0f} m from coords")

# connected (undirected, ignoring oneway for reachability)
adj = {nid: set() for nid in nodes}
for e in edges.values():
    adj[e["from"]].add(e["to"])
    adj[e["to"]].add(e["from"])
seen, stack = set(), ["n1"]
while stack:
    cur = stack.pop()
    if cur in seen:
        continue
    seen.add(cur)
    stack.extend(adj[cur] - seen)
check(seen == set(nodes), "graph is connected", f"graph disconnected, unreachable: {set(nodes) - seen}")

signalised = [nid for nid, n in nodes.items() if n["signalised"]]
check(len(signalised) == 3 and all(len(adj[nid]) >= 4 for nid in signalised),
      f"3 signalised junctions, each with >= 4 touching edges: {signalised}",
      "signalised junction without >= 4 touching edges")

oneway = [e["id"] for e in edges.values() if e["oneway"]]
check(set(oneway) == {"e3", "e6"}, f"one-way couplet e3/e6 kept (got {oneway})", "oneway flags unexpected")

print("== traffic.csv ==")
with open(ROOT / "data" / "sample" / "traffic.csv", newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    header = next(reader)
    rows = list(reader)

expected_header = ["segment_id", "timestamp_utc", "speed_kmph", "free_flow_kmph",
                   "congestion_level", "rain", "incident", "source"]
check(header == expected_header, "header matches contract column order", f"bad header: {header}")
check(len(rows) == 50, f"50 data rows (got {len(rows)})", f"expected 50 rows, got {len(rows)}")

seg_ids = {r[0] for r in rows}
check(seg_ids == set(edges), "every segment_id is an edge id, all covered", "segment_id / edge id mismatch")

ff_ok = all(int(r[3]) == edges[r[0]]["free_flow_kmph"] for r in rows)
check(ff_ok, "free_flow_kmph matches graph.json for every row", "free_flow_kmph mismatch vs graph")

ts_ok = all(ts_valid(r[1]) for r in rows)
check(ts_ok, "timestamps on :00/:15/:30/:45 UTC with Z", "bad timestamp format")

speed_ok = all(re.fullmatch(r"\d+\.\d", r[2]) for r in rows)
check(speed_ok, "speed_kmph has one decimal", "speed_kmph not 1-decimal")

levels_ok = all(r[4] == level(float(r[2]) / int(r[3])) for r in rows)
check(levels_ok, "congestion_level consistent with speed ratio thresholds", "congestion_level mismatch")

flag_ok = all(r[5] in ("0", "1") and r[6] in ("0", "1") for r in rows)
check(flag_ok, "rain / incident are 0 or 1", "bad rain/incident value")

check(all(r[7] == "SIMULATED" for r in rows), "source is always SIMULATED", "source not SIMULATED")

per_seg = {}
for r in rows:
    per_seg.setdefault(r[0], set()).add(r[1])
check(all(len(v) == len(rows) / len(per_seg) for v in per_seg.values()),
      "no missing steps per segment", "a segment has missing steps")

check(any(r[6] == "1" for r in rows), "at least one incident row", "no incident row")
check(any(r[5] == "1" for r in rows), "at least one rain row", "no rain row")
check({level(float(r[2]) / int(r[3])) for r in rows} == {"flowing", "moderate", "heavy", "severe"},
      "all 4 congestion levels represented", "not all congestion levels present")

print("== ml-service/examples ==")
examples = {
    "health.json": {"status", "model_version", "data_until"},
    "predict.json": {"model_version", "horizon_min", "made_at_utc", "predictions"},
    "metrics.json": {"model_version", "trained_on", "tested_on", "split", "horizons", "series"},
    "signals_optimize.json": {"junction_id", "mode", "cycles", "seed", "queues", "current",
                              "optimized", "improvement", "reasons", "red_wait_saved_s", "source"},
}
for fname, keys in examples.items():
    data = load_json(ROOT / "ml-service" / "examples" / fname)
    check(keys <= set(data), f"{fname} has all contract keys", f"{fname} missing keys: {keys - set(data)}")

pred = load_json(ROOT / "ml-service" / "examples" / "predict.json")
pred_keys = {"segment_id", "current_speed_kmph", "predicted_speed_kmph", "predicted_level",
             "confidence", "target_time_utc", "source"}
check(all(pred_keys <= set(p) for p in pred["predictions"]),
      "predict.json: prediction items match contract", "prediction item keys wrong")
check(all(p["predicted_level"] == level(p["predicted_speed_kmph"] / dict(
        (e["id"], e["free_flow_kmph"]) for e in edges.values())[p["segment_id"]])
        for p in pred["predictions"]),
      "predict.json: predicted_level consistent with predicted speed", "predicted_level inconsistent")

sig = load_json(ROOT / "ml-service" / "examples" / "signals_optimize.json")
phases_cur = [ph["approach_id"] for ph in sig["current"]["phases"]]
phases_opt = [ph["approach_id"] for ph in sig["optimized"]["phases"]]
q_ids = [q["approach_id"] for q in sig["queues"]]
r_ids = [r["approach_id"] for r in sig["reasons"]]
check(phases_cur == phases_opt == q_ids == r_ids,
      "same approach order in queues / current / optimized / reasons", "approach order mismatch")
check(all(10 <= ph["green_s"] <= 60 for ph in sig["current"]["phases"] + sig["optimized"]["phases"]),
      "every green_s within 10-60 s", "green_s outside 10-60 s")
check(all(ph["yellow_s"] == 3 and ph["all_red_s"] == 2
          for ph in sig["current"]["phases"] + sig["optimized"]["phases"]),
      "yellow 3 s and all-red 2 s everywhere", "yellow/all-red wrong")
check(sum(ph["green_s"] for ph in sig["current"]["phases"])
      == sum(ph["green_s"] for ph in sig["optimized"]["phases"]),
      "total green time equal in current vs optimized (same cycle)", "green totals differ")
check(sig["red_wait_saved_s"] is None, "red_wait_saved_s null in optimize mode", "red_wait_saved_s not null")
check(sig["source"] == "SIMULATED", "signals response source is SIMULATED", "signals source wrong")

met = load_json(ROOT / "ml-service" / "examples" / "metrics.json")
for h, m in met["horizons"].items():
    imp = round((m["mae_baseline_kmph"] - m["mae_model_kmph"]) / m["mae_baseline_kmph"] * 100, 1)
    check(abs(imp - m["improvement_pct"]) < 0.15,
          f"horizon {h}: improvement_pct = (baseline - model) / baseline", f"horizon {h}: improvement_pct wrong")

print(f"\n{CHECKS - len(ERRORS)}/{CHECKS} checks passed")
if ERRORS:
    print("VALIDATION FAILED")
    raise SystemExit(1)
print("PHASE 0 VALIDATION PASSED")
