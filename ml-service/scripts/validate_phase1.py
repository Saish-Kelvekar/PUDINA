"""Phase 1 validation: real Koramangala graph + full traffic CSV.
Run: python ml-service/scripts/validate_phase1.py
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ERRORS = []
CHECKS = 0


def check(cond, ok, fail):
    global CHECKS
    CHECKS += 1
    if cond:
        print(f"  ok   {ok}")
    else:
        ERRORS.append(fail)
        print(f"  FAIL {fail}")


def level(ratio):
    if ratio > 0.75:
        return "flowing"
    if ratio >= 0.50:
        return "moderate"
    if ratio >= 0.25:
        return "heavy"
    return "severe"


print("== data/graph.json (real) ==")
graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
nodes = {n["id"]: n for n in graph["nodes"]}
edges = {e["id"]: e for e in graph["edges"]}

check(len(nodes) > 1000, f"{len(nodes)} nodes (expected > 1000)", f"too few nodes: {len(nodes)}")
check(len(edges) > 1000, f"{len(edges)} edges (expected > 1000)", f"too few edges: {len(edges)}")
check(len(graph["nodes"]) == len(nodes) and len(graph["edges"]) == len(edges), "IDs unique", "duplicate IDs")

req_node = {"id", "lat", "lng", "name", "signalised"}
req_edge = {"id", "from", "to", "name", "length_m", "road_type", "lanes",
            "free_flow_kmph", "oneway", "coords"}
check(all(req_node <= set(n) for n in nodes.values()), "node fields complete", "node field missing")
check(all(req_edge <= set(e) for e in edges.values()), "edge fields complete", "edge field missing")
check(all(e["from"] in nodes and e["to"] in nodes for e in edges.values()),
      "all edges resolve", "edge resolves to missing node")
check(all(e["length_m"] >= 1 for e in edges.values()), "length_m >= 1", "length_m < 1")
check(all(e["lanes"] >= 1 for e in edges.values()), "lanes >= 1", "lanes < 1")
check(all(1 <= e["free_flow_kmph"] <= 120 for e in edges.values()), "free_flow within 1-120 km/h",
      "free_flow out of range")
check(all(12.80 < n["lat"] < 13.00 and 77.45 < n["lng"] < 77.75 for n in nodes.values()),
      "coords within Koramangala bounding box", "coord outside bbox")

# endpoints of coords match from/to nodes
ok = all(edges[e]["coords"][0] == [nodes[edges[e]["from"]]["lat"], nodes[edges[e]["from"]]["lng"]]
         and edges[e]["coords"][-1] == [nodes[edges[e]["to"]]["lat"], nodes[edges[e]["to"]]["lng"]]
         for e in edges)
check(ok, "coords run from node to node", "coords endpoints mismatch from/to")

# connected (undirected)
adj = {nid: set() for nid in nodes}
for e in edges.values():
    adj[e["from"]].add(e["to"])
    adj[e["to"]].add(e["from"])
seen, stack = set(), [next(iter(nodes))]
while stack:
    cur = stack.pop()
    if cur not in seen:
        seen.add(cur)
        stack.extend(adj[cur] - seen)
check(seen == set(nodes), "graph is connected", f"graph disconnected ({len(set(nodes) - seen)} unreachable)")

sig = [nid for nid, n in nodes.items() if n["signalised"]]
check(len(sig) == 10 and all(len(adj[nid]) >= 4 for nid in sig),
      f"10 signalised junctions, all with >= 4 roads: {sig}", "signalised junction with < 4 roads")

road_types = {e["road_type"] for e in edges.values()}
check(road_types <= {"primary", "secondary", "tertiary", "residential"},
      f"road_type values in contract classes: {sorted(road_types)}", "unknown road_type")

sys_path = str(Path(__file__).resolve().parents[1])
import sys
sys.path.insert(0, sys_path)
from app.graph_utils import signalised_node_ids, approaches_into

primary = {e["id"]: e for e in edges.values() if e["road_type"] == "primary"}
approach_ids = {ap["edge_id"] for node in signalised_node_ids(graph)
                for ap in approaches_into(graph, node)}
covered = set(primary) | approach_ids

print("== data/traffic.csv (real) ==")
with open(ROOT / "data" / "traffic.csv", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    check(reader.fieldnames == ["segment_id", "timestamp_utc", "speed_kmph", "free_flow_kmph",
                                "congestion_level", "rain", "incident", "source"],
          "header matches contract order", f"bad header: {reader.fieldnames}")
    rows = list(reader)

check(len(rows) == 188 * 4032, f"{len(rows)} rows (188 segments x 4032)",
      f"unexpected row count {len(rows)}")
print(f"  info: {len(rows)} rows, {len(primary)} primary + {len(approach_ids - set(primary))} approach segments")

seg_ids = {r["segment_id"] for r in rows}
check(seg_ids == covered, "all covered segments present (primary + signal approaches)",
      "segment set mismatch")
check(all(r["free_flow_kmph"] == str(edges[r["segment_id"]]["free_flow_kmph"]) for r in rows),
      "free_flow_kmph matches graph for all rows", "free_flow mismatch")
check(all(r["source"] == "SIMULATED" for r in rows), "source always SIMULATED", "source mismatch")
check(all(r["rain"] in "01" and r["incident"] in "01" for r in rows), "rain/incident are 0 or 1",
      "bad rain/incident value")

per_seg = {}
max_step = "2026-11-15T23:45:00Z"
min_step = "2026-10-05T00:00:00Z"
for r in rows:
    per_seg.setdefault(r["segment_id"], []).append(r["timestamp_utc"])
check(all(len(v) == 4032 for v in per_seg.values()), "no missing steps per segment", "missing steps")
check(min(min(v) for v in per_seg.values()) == min_step
      and max(max(v) for v in per_seg.values()) == max_step,
      f"window exact: {min_step} .. {max_step}", "time window off")

bad_levels = [r for r in rows
              if r["congestion_level"] != level(float(r["speed_kmph"]) / float(r["free_flow_kmph"]))]
check(not bad_levels, "congestion_level consistent with speed ratio for every row",
      f"{len(bad_levels)} rows with inconsistent level")

import datetime
steps = sum(1 for _ in set(r["timestamp_utc"] for r in rows))
check(steps == 4032, f"{steps} distinct 15-min steps", f"expected 4032 steps, got {steps}")

print(f"\n{CHECKS - len(ERRORS)}/{CHECKS} checks passed")
if ERRORS:
    print("PHASE 1 VALIDATION FAILED")
    raise SystemExit(1)
print("PHASE 1 VALIDATION PASSED")
