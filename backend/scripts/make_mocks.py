"""Builds backend/mocks/*.json — one example response per endpoint, for Member 1.

Reads Member 3's real files, so every mock matches them:
  data/sample/graph.json, data/sample/traffic.csv, ml-service/examples/*.json

Every number is calculated with the same rules the backend will use
(see backend/docs/API.md). Nothing is typed in by hand except the demo
incidents and the route weights.

Run from the repo root:  python backend/scripts/make_mocks.py
"""
import csv, heapq, json, math
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOCKS = ROOT / "backend" / "mocks"
GRAPH = ROOT / "data" / "sample" / "graph.json"
TRAFFIC = ROOT / "data" / "sample" / "traffic.csv"
ML_EX = ROOT / "ml-service" / "examples"

SIM_TIME = "2026-11-10T03:30:00Z"   # 09:00 IST, Tuesday — a step that exists in traffic.csv
NOW = "2026-11-10T03:31:12Z"        # wall-clock "generated at" time for the mocks
SIGNAL_WAIT_S = 20                  # fixed stand-in until M3's /signals/optimize is connected
DEMO_FROM, DEMO_TO = "n5", "n7"     # Jyothi Nivas College Junction -> St. John's Junction


def env(data):
    return {"success": True, "data": data, "error": None}


def save(name, obj):
    with open(MOCKS / name, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def level(ratio):
    if ratio is None: return "no_data"
    if ratio > 0.75: return "flowing"
    if ratio >= 0.5: return "moderate"
    if ratio >= 0.25: return "heavy"
    return "severe"


MOCKS.mkdir(parents=True, exist_ok=True)

# ---------------- M3's files ----------------
graph = load(GRAPH)
N = {n["id"]: n for n in graph["nodes"]}
E = {e["id"]: e for e in graph["edges"]}

rows = list(csv.DictReader(open(TRAFFIC, encoding="utf-8")))
by_time = {}
for r in rows:
    by_time.setdefault(r["timestamp_utc"], {})[r["segment_id"]] = r
assert SIM_TIME in by_time, f"{SIM_TIME} not in traffic.csv"
now_rows = by_time[SIM_TIME]
speed_now = {sid: float(r["speed_kmph"]) for sid, r in now_rows.items()}

# ---------------- auth ----------------
user = {"id": 1, "name": "Riya Sharma", "email": "user@demo.test", "role": "user",
        "created_at": "2026-11-09T10:00:00Z"}
admin = {"id": 2, "name": "Admin", "email": "admin@demo.test", "role": "admin",
         "created_at": "2026-11-09T10:00:00Z"}
token = "eyJhbGciOiJIUzI1NiJ9.MOCK.TOKEN"
save("auth_login.json", env({"token": token, "user": user}))
save("auth_register.json", env({"token": token, "user": user}))
save("auth_me.json", env({"user": user}))
save("error_example.json", {"success": False, "data": None,
     "error": {"code": "VALIDATION_ERROR", "message": "destination is required",
               "details": [{"field": "destination", "issue": "required"}]}})

# ---------------- map + traffic ----------------
save("map_graph.json", env({**graph, "node_count": len(N), "edge_count": len(E),
     "source": "HISTORICAL", "source_note": "Road network based on OpenStreetMap (sample)",
     "generated_at": "2026-11-10T00:00:00Z"}))

flow = []
for eid, e in E.items():
    r = now_rows.get(eid)
    if r is None:
        flow.append({"segment_id": eid, "speed_kmph": None, "free_flow_kmph": e["free_flow_kmph"],
                     "speed_ratio": None, "congestion_level": "no_data", "rain": None,
                     "source": "SIMULATED", "timestamp_utc": None})
        continue
    s = float(r["speed_kmph"])
    flow.append({"segment_id": eid, "speed_kmph": s, "free_flow_kmph": e["free_flow_kmph"],
                 "speed_ratio": round(s / e["free_flow_kmph"], 2), "congestion_level": r["congestion_level"],
                 "rain": r["rain"] == "1", "source": r["source"], "timestamp_utc": r["timestamp_utc"]})
save("traffic_flow.json", env({"sim_time_utc": SIM_TIME, "source": "SIMULATED",
                               "last_updated": NOW, "segments": flow}))

# ---------------- demo incidents (placed on M3's roads) ----------------
def on_edge(eid, t=0.5):
    """Point part-way along an edge (between its first and last coordinate)."""
    a, b = E[eid]["coords"][0], E[eid]["coords"][-1]
    return round(a[0] + (b[0] - a[0]) * t, 5), round(a[1] + (b[1] - a[1]) * t, 5)


def ratio_of(eid):
    return round(speed_now[eid] / E[eid]["free_flow_kmph"], 2)


def severity(category, lanes_blocked, is_closure, eid, reported):
    """Points: category + lanes + current congestion + reported. Same rule the backend uses."""
    pts, ev = 0, []
    cat_pts = {"accident": 2, "flooding": 2, "closure": 3, "roadwork": 1, "breakdown": 1}.get(category, 0)
    if cat_pts: pts += cat_pts; ev.append(f"Category {category} (+{cat_pts})")
    if is_closure: pts += 3; ev.append("Road closed (+3)")
    elif lanes_blocked:
        lp = 2 if lanes_blocked >= E[eid]["lanes"] else 1
        pts += lp; ev.append(f"{lanes_blocked} of {E[eid]['lanes']} lanes blocked (+{lp})")
    r = ratio_of(eid)
    if r < 0.5: pts += 1; ev.append(f"Segment already {level(r)}: speed ratio {r} (+1)")
    rp = {"low": 0, "medium": 1, "high": 2}[reported]
    if rp: pts += rp; ev.append(f"Reported as {reported} (+{rp})")
    lvl = "high" if pts >= 5 else "medium" if pts >= 3 else "low"
    conf = round(min(0.95, 0.5 + 0.08 * len(ev)), 2)
    return {"level": lvl, "confidence": conf, "evidence": ev}


def incident(id_, cat, desc, eid, t, reported, lanes, closure, status, by, src, created, verified=None):
    lat, lng = on_edge(eid, t)
    return {"id": id_, "category": cat, "description": desc, "lat": lat, "lng": lng, "segment_id": eid,
            "reported_severity": reported,
            "estimated_severity": severity(cat, lanes, closure, eid, reported),
            "lanes_blocked": lanes, "is_closure": closure, "status": status, "merged_into": None,
            "reported_by": by, "source": src, "created_at": created,
            "updated_at": verified or created, "verified_at": verified, "resolved_at": None}


who_user = {"id": 1, "name": "Riya Sharma"}
who_user2 = {"id": 4, "name": "Karan Rao"}
who_admin = {"id": 2, "name": "Admin"}
incidents = [
    incident(101, "accident", "Bike and car collision on 1st Block Main Road, one lane blocked",
             "e7", 0.50, "medium", 1, False, "verified", who_user, "USER_REPORTED",
             "2026-11-10T03:12:40Z", "2026-11-10T03:20:05Z"),
    incident(102, "accident", "Car crash on 1st Block Main Road, traffic very slow",
             "e7", 0.55, "high", 0, False, "pending", who_user2, "USER_REPORTED",
             "2026-11-10T03:21:10Z"),
    incident(103, "roadwork", "Drain work, BDA Complex Road closed till evening",
             "e10", 0.50, "high", 1, True, "verified", who_admin, "SIMULATED",
             "2026-11-10T01:00:00Z", "2026-11-10T01:05:00Z"),
]
INC = {i["id"]: i for i in incidents}
inc_by_edge = {}
for i in incidents:
    if i["status"] == "verified":
        inc_by_edge.setdefault(i["segment_id"], []).append(i)

# ---------------- routing (same rules as the backend) ----------------
ADJ = {}
for e in E.values():
    ADJ.setdefault(e["from"], []).append((e["to"], e["id"]))
    if not e["oneway"]:
        ADJ.setdefault(e["to"], []).append((e["from"], e["id"]))


def travel_s(eid, speeds):
    return E[eid]["length_m"] / (max(speeds[eid], 1) / 3.6)


def incident_penalty_s(eid, inc_map):
    p = 0
    for i in inc_map.get(eid, []):
        if i["is_closure"]: return math.inf
        p += {"low": 60, "medium": 180, "high": 300}[i["estimated_severity"]["level"]]
    return p


def edge_cost(eid, kind, speeds, mult, inc_map):
    pen = incident_penalty_s(eid, inc_map)
    if pen == math.inf: return math.inf
    t = travel_s(eid, speeds)
    ratio = speeds[eid] / E[eid]["free_flow_kmph"]
    if kind == "fastest": c = t + pen
    elif kind == "shortest": c = E[eid]["length_m"]
    elif kind == "least_congested": c = t * (1 + 3 * (1 - ratio)) + pen
    elif kind == "safest": c = t + 5 * pen + 120 * len(inc_map.get(eid, []))
    elif kind == "eco": c = E[eid]["length_m"] * 0.07 * (1 + 0.5 * (1 - ratio)) + pen / 10
    return c * mult.get(eid, 1)


def dijkstra(src, dst, kind, speeds, mult=None, inc_map=None, banned=()):
    mult, inc_map = mult or {}, inc_by_edge if inc_map is None else inc_map
    dist, prev, pq = {src: 0}, {}, [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst: break
        if d > dist.get(u, math.inf): continue
        for v, eid in ADJ.get(u, []):
            if eid in banned: continue
            c = edge_cost(eid, kind, speeds, mult, inc_map)
            if c == math.inf: continue
            if d + c < dist.get(v, math.inf):
                dist[v], prev[v] = d + c, (u, eid)
                heapq.heappush(pq, (d + c, v))
    if dst not in prev: return None
    pn, pe, cur = [dst], [], dst
    while cur != src:
        u, eid = prev[cur]; pe.append(eid); pn.append(u); cur = u
    return pn[::-1], pe[::-1]


def coords_for(pn, pe):
    out = []
    for i, eid in enumerate(pe):
        c = E[eid]["coords"]
        seg = c if E[eid]["from"] == pn[i] else c[::-1]
        out.extend(seg if not out else seg[1:])
    return out


def route_stats(pn, pe, speeds, signal_wait=SIGNAL_WAIT_S, inc_map=None):
    inc_map = inc_by_edge if inc_map is None else inc_map
    dist_m = sum(E[e]["length_m"] for e in pe)
    drive_s = sum(travel_s(e, speeds) for e in pe)
    signals = [n for n in pn[1:-1] if N[n]["signalised"]]
    eta_s = drive_s + signal_wait * len(signals) + sum(incident_penalty_s(e, inc_map) for e in pe)
    heavy_m = sum(E[e]["length_m"] for e in pe if speeds[e] / E[e]["free_flow_kmph"] < 0.5)
    cong = sum(E[e]["length_m"] * (1 - speeds[e] / E[e]["free_flow_kmph"]) for e in pe) / dist_m
    incs = [i for e in pe for i in inc_map.get(e, [])]
    return {"distance_km": round(dist_m / 1000, 2), "eta_min": round(eta_s / 60, 1), "eta_s": round(eta_s),
            "congestion_pct": round(cong * 100), "signals_on_route": len(signals),
            "incident_ids": [i["id"] for i in incs], "incident_count": len(incs),
            "fuel_litres": round((dist_m / 1000) * 0.07 * (1 + 0.5 * cong), 3),
            "reliability": round(max(0, 100 - 10 * len(incs) - 30 * heavy_m / dist_m))}


LABELS = {"fastest": "Fastest", "shortest": "Shortest", "least_congested": "Least congested",
          "safest": "Fewest incidents", "eco": "Eco (least fuel)"}
WEIGHTS = {"time": 0.35, "distance": 0.15, "congestion": 0.2, "incidents": 0.15, "fuel": 0.05, "reliability": 0.1}
WORDS = {"time": "lowest travel time", "distance": "short distance", "congestion": "light traffic",
         "incidents": "few incidents", "fuel": "low fuel use", "reliability": "high reliability"}
FACTOR_KEY = {"time": "eta_s", "distance": "distance_km", "congestion": "congestion_pct",
              "incidents": "incident_count", "fuel": "fuel_litres", "reliability": "reliability"}


def compare(src, dst, speeds):
    routes, seen = [], []
    for kind in LABELS:
        mult, alt, tries = {}, False, 0
        res = dijkstra(src, dst, kind, speeds, mult)
        while res and res[1] in seen and tries < 10:
            for e in res[1]: mult[e] = mult.get(e, 1) * 1.5
            res = dijkstra(src, dst, kind, speeds, mult); alt = True; tries += 1
        if not res: continue
        same_as = None
        if res[1] in seen:  # no new path exists: keep the plain answer and point at its twin
            res, alt = dijkstra(src, dst, kind, speeds), False
            same_as = routes[seen.index(res[1])]["route_id"]
        seen.append(res[1])
        routes.append({"route_id": f"r{len(routes)+1}", "type": kind, "label": LABELS[kind],
                       "is_alternative": alt, "same_path_as": same_as, "node_ids": res[0],
                       "edge_ids": res[1], "coords": coords_for(*res), **route_stats(*res, speeds)})
    good = {}
    for f, key in FACTOR_KEY.items():
        vals = [r[key] for r in routes]; lo, hi = min(vals), max(vals)
        for r in routes:
            x = 0.5 if hi == lo else (r[key] - lo) / (hi - lo)
            good.setdefault(r["route_id"], {})[f] = x if f == "reliability" else 1 - x
    total_w = sum(WEIGHTS.values())
    for r in routes:
        contrib = {f: WEIGHTS[f] * good[r["route_id"]][f] for f in WEIGHTS}
        r["score"] = round(100 * sum(contrib.values()) / total_w, 1)
        r["score_breakdown"] = {f: round(100 * v / total_w, 1) for f, v in contrib.items()}
        r["_top"] = sorted(contrib, key=contrib.get, reverse=True)[:2]
    routes.sort(key=lambda r: -r["score"])
    closures = [i for i in incidents if i["is_closure"] and i["status"] == "verified"]
    for k, r in enumerate(routes):
        r["rank"], r["recommended"] = k + 1, k == 0
        r["explanation"] = ("Recommended: " if k == 0 else "") + f"{WORDS[r['_top'][0]]} and {WORDS[r['_top'][1]]}."
        r["closure_warnings"] = [f"{E[i['segment_id']]['name']} is closed (incident #{i['id']})" for i in closures]
        del r["_top"]
    return routes


def point(nid):
    return {"node_id": nid, "name": N[nid]["name"], "lat": N[nid]["lat"], "lng": N[nid]["lng"], "snapped_m": 0}


routes = compare(DEMO_FROM, DEMO_TO, speed_now)
save("routes_compare.json", env({"comparison_id": 501, "sim_time_utc": SIM_TIME,
     "source": point(DEMO_FROM), "destination": point(DEMO_TO), "weights": WEIGHTS,
     "recommended_route_id": routes[0]["route_id"], "traffic_source": "SIMULATED",
     "signal_wait_assumption_s": SIGNAL_WAIT_S, "routes": routes}))

# ---------------- incidents ----------------
save("incidents_list.json", env({"count": len(incidents), "incidents": incidents}))
save("incident_get.json", env({"incident": INC[101], "logs": [
    {"id": 9001, "action": "created", "by": who_user, "details": {}, "created_at": INC[101]["created_at"]},
    {"id": 9002, "action": "verified", "by": who_admin, "details": {}, "created_at": INC[101]["verified_at"]}]}))
save("incident_create.json", env({"incident": INC[102], "possible_duplicates": 1}))
verified = dict(INC[102], status="verified", verified_at=NOW, updated_at=NOW)
save("incident_action.json", env({"incident": verified,
     "log": {"id": 9010, "action": "verified", "by": who_admin, "details": {}, "created_at": NOW}}))
merged = dict(INC[102], status="merged", merged_into=101, updated_at=NOW)
save("incident_merge.json", env({"incident": merged, "merged_into": INC[101],
     "log": {"id": 9011, "action": "merged", "by": who_admin, "details": {"into_id": 101}, "created_at": NOW}}))

# duplicate score 102 vs 101 (real calculation)
a, b = INC[102], INC[101]
d_m = round(hav([a["lat"], a["lng"]], [b["lat"], b["lng"]]))
mins = 8.5  # 03:12:40 -> 03:21:10
tok = lambda s: set(w.strip(",.").lower() for w in s.split())
jac = round(len(tok(a["description"]) & tok(b["description"])) / len(tok(a["description"]) | tok(b["description"])), 2)
dist_score = round(max(0, 1 - d_m / 200), 2)
time_score = round(max(0, 1 - mins / 30), 2)
DW = {"distance": 0.35, "category": 0.25, "time": 0.25, "text": 0.15}
score = round(DW["distance"] * dist_score + DW["category"] * 1 + DW["time"] * time_score + DW["text"] * jac, 2)
save("incident_duplicates.json", env({"incident_id": 102, "threshold": 0.6, "candidates": [
    {"incident": INC[101], "score": score,
     "checks": {"distance_m": d_m, "distance_score": dist_score, "same_category": True, "category_score": 1,
                "minutes_apart": mins, "time_score": time_score, "text_jaccard": jac},
     "weights": DW, "status": "pending"}]}))

# ---------------- network impact of incident 101 (lane blockage on e7) ----------------
HOP_FACTOR = {0: 0.5, 1: 0.85, 2: 0.93, 3: 0.97}
src_e = INC[101]["segment_id"]
hops, q = {src_e: 0}, deque([src_e])
while q:  # breadth-first search over roads that share a junction
    cur = q.popleft()
    if hops[cur] == 3: continue
    ends = {E[cur]["from"], E[cur]["to"]}
    for e in E.values():
        if e["id"] not in hops and ends & {e["from"], e["to"]}:
            hops[e["id"]] = hops[cur] + 1; q.append(e["id"])
after = dict(speed_now)
affected = []
for eid, h in sorted(hops.items(), key=lambda x: (x[1], int(x[0][1:]))):
    after[eid] = round(speed_now[eid] * HOP_FACTOR[h], 1)
    affected.append({"segment_id": eid, "hops": h, "speed_before_kmph": speed_now[eid],
                     "speed_after_kmph": after[eid],
                     "extra_delay_s": round(travel_s(eid, after) - travel_s(eid, speed_now)),
                     "congestion_level_after": level(after[eid] / E[eid]["free_flow_kmph"])})
u, v = E[src_e]["from"], E[src_e]["to"]
no_inc = {}
base = dijkstra(u, v, "fastest", speed_now, inc_map=no_inc)
div = dijkstra(u, v, "fastest", after, inc_map=no_inc, banned={src_e})
bs = route_stats(*base, speed_now, inc_map=no_inc)
blocked_eta = route_stats(*base, after, inc_map=no_inc)
ds = route_stats(*div, after, inc_map=no_inc)
save("incident_impact.json", env({"incident_id": 101, "mode": "lane_blockage", "speed_factor": 0.5,
     "max_hops": 3, "hop_factors": HOP_FACTOR, "affected_segments": affected,
     "total_extra_delay_min": round(sum(x["extra_delay_s"] for x in affected) / 60, 1),
     "detour_minutes": round(ds["eta_min"] - bs["eta_min"], 1),
     "diversion_route": {"from_node": u, "to_node": v, "node_ids": div[0], "edge_ids": div[1],
                         "coords": coords_for(*div), "distance_km": ds["distance_km"], "eta_min": ds["eta_min"]},
     "blocked_route": {"node_ids": base[0], "edge_ids": base[1],
                       "eta_min_before": bs["eta_min"], "eta_min_after": blocked_eta["eta_min"]},
     "source": "SIMULATED", "computed_at": NOW}))

# ---------------- predictions ----------------
# Until M3's service is up, the backend returns the honest baseline: speed later = speed now.
def baseline(h):
    tgt = "2026-11-10T03:45:00Z" if h == 15 else "2026-11-10T04:00:00Z"
    return env({"horizon_min": h, "model_version": "baseline", "made_at_utc": SIM_TIME, "generated_at": NOW,
                "predictions": [{"segment_id": eid, "current_speed_kmph": speed_now[eid],
                                 "predicted_speed_kmph": speed_now[eid],
                                 "predicted_level": level(speed_now[eid] / E[eid]["free_flow_kmph"]),
                                 "confidence": None, "target_time_utc": tgt, "source": "AI_PREDICTED"}
                                for eid in E]})
save("predictions_15.json", baseline(15))
save("predictions_30.json", baseline(30))
pm = load(ML_EX / "predict.json")
save("predictions_model_example.json", env({**pm, "generated_at": NOW}))
save("predictions_metrics.json", env({**load(ML_EX / "metrics.json"), "source": "AI_PREDICTED"}))

# ---------------- signals ----------------
def approaches(nid):
    out = []
    for e in E.values():
        if nid not in (e["from"], e["to"]): continue
        if e["oneway"] and e["to"] != nid: continue  # one-way road leaving the junction: not an approach
        other = e["from"] if e["to"] == nid else e["to"]
        out.append({"approach_id": f"{nid}-{e['id']}", "edge_id": e["id"], "from_node": other,
                    "label": f"from {N[other]['name']} ({e['name']})"})
    return out


junctions = []
for n in N.values():
    if not n["signalised"]: continue
    ap = approaches(n["id"])
    junctions.append({"junction_id": f"J-{n['id']}", "node_id": n["id"], "name": n["name"],
                      "lat": n["lat"], "lng": n["lng"], "approaches": ap,
                      "current_timing": {"cycle_s": len(ap) * (30 + 3 + 2), "green_s_each": 30,
                                         "yellow_s": 3, "all_red_s": 2}, "source": "SIMULATED"})
save("signals_junctions.json", env({"junctions": junctions}))
so = load(ML_EX / "signals_optimize.json")
save("signals_simulate.json", env({"simulation_id": 701, **so, "created_at": NOW}))

# ---------------- emergency ----------------
# normal = current speeds + red waits; emergency = 15-min predicted speeds (baseline for now), no red waits
pred15 = dict(speed_now)
normal = dijkstra(DEMO_FROM, DEMO_TO, "fastest", speed_now)
emerg = dijkstra(DEMO_FROM, DEMO_TO, "fastest", pred15)
ns = route_stats(*normal, speed_now)
es = route_stats(*emerg, pred15, signal_wait=0)
saved_min = round((ns["eta_s"] - es["eta_s"]) / 60, 1)
save("emergency_routes.json", env({"session_id": 801, "vehicle_type": "ambulance", "simulation": True,
     "source": "SIMULATED",
     "from": point(DEMO_FROM), "to": point(DEMO_TO),
     "normal_route": {"node_ids": normal[0], "edge_ids": normal[1], "coords": coords_for(*normal),
                      "distance_km": ns["distance_km"], "eta_min": ns["eta_min"],
                      "signals_on_route": ns["signals_on_route"], "speed_basis": "current (SIMULATED)"},
     "emergency_route": {"node_ids": emerg[0], "edge_ids": emerg[1], "coords": coords_for(*emerg),
                         "distance_km": es["distance_km"], "eta_min": es["eta_min"],
                         "signals_on_route": es["signals_on_route"],
                         "signal_wait_saved_s": SIGNAL_WAIT_S * es["signals_on_route"],
                         "speed_basis": "15-min prediction (baseline model until ML service is connected)"},
     "time_saved_min": saved_min, "signal_wait_source": "ASSUMED_FIXED_20S",
     "assumptions": [f"Each red light costs {SIGNAL_WAIT_S} s without priority (fixed assumption until the signal optimizer is connected)",
                     "Emergency route avoids verified incidents and closed roads",
                     "Emergency route uses 15-minute predicted speeds"],
     "created_at": NOW}))

# ---------------- admin ----------------
counts = {s: sum(1 for i in incidents if i["status"] == s) for s in ["pending", "verified", "rejected", "merged", "resolved"]}
save("admin_overview.json", env({"counts": {"incidents_total": len(incidents), **counts,
     "active_closures": sum(1 for i in incidents if i["is_closure"] and i["status"] == "verified"),
     "duplicate_candidates": 1, "users": 5},
     "recent_actions": [{"id": 9002, "incident_id": 101, "action": "verified", "by": who_admin,
                         "created_at": INC[101]["verified_at"]}],
     "ml_service": {"status": "down", "model_version": "baseline"}, "sim_time_utc": SIM_TIME}))

# congestion by IST hour, calculated from traffic.csv
hour = {}
for r in rows:
    hh, mm = int(r["timestamp_utc"][11:13]), int(r["timestamp_utc"][14:16])
    h_ist = ((hh * 60 + mm + 330) // 60) % 24
    ratio = float(r["speed_kmph"]) / float(r["free_flow_kmph"])
    hour.setdefault(h_ist, []).append(ratio)
cats = {}
for i in incidents: cats[i["category"]] = cats.get(i["category"], 0) + 1
met = load(ML_EX / "metrics.json")
sig_name = {j["junction_id"]: j["name"] for j in junctions}
save("admin_analytics.json", env({
    "congestion_by_hour": [{"hour_ist": h, "avg_speed_ratio": round(sum(v) / len(v), 2),
                            "heavy_or_severe_share": round(sum(1 for x in v if x < 0.5) / len(v), 2),
                            "samples": len(v)} for h, v in sorted(hour.items())],
    "incidents_by_type": [{"category": c, "count": n} for c, n in sorted(cats.items())],
    "prediction_error": {h: {"mae_model_kmph": met["horizons"][h]["mae_model_kmph"],
                             "mae_baseline_kmph": met["horizons"][h]["mae_baseline_kmph"]} for h in ("15", "30")},
    "signal_improvement": [{"junction_id": so["junction_id"], "name": sig_name.get(so["junction_id"]),
                            "avg_wait_before_s": so["current"]["avg_wait_s"],
                            "avg_wait_after_s": so["optimized"]["avg_wait_s"]}],
    "emergency_time_saved": {"sessions": 1, "avg_saved_min": saved_min, "total_saved_min": saved_min},
    "source_note": "Traffic is SIMULATED. Prediction and signal numbers are M3's example placeholders until their service is live.",
    "generated_at": NOW}))

save("socket_events.json", {"incident:new": {"incident": INC[102]}, "incident:verified": {"incident": verified}})

# ---------------- summary ----------------
print(f"mocks written to {MOCKS.relative_to(ROOT)}: {len(list(MOCKS.glob('*.json')))} files")
for r in routes:
    print(f"  {r['route_id']} {r['type']:<16} {'-'.join(r['node_ids']):<22} eta {r['eta_min']:>5} min  "
          f"{r['distance_km']} km  score {r['score']}  same_as={r['same_path_as']}")
print("  emergency: normal", ns["eta_min"], "-> emergency", es["eta_min"], "saved", saved_min, "min")
print("  impact: detour", round(ds["eta_min"] - bs["eta_min"], 1), "min via", div[0], "| dup score", score, f"({d_m} m, jaccard {jac})")
print("  severities:", {i["id"]: i["estimated_severity"]["level"] for i in incidents})
