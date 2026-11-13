"""Phase 4 validation: seed users/incidents + placement + duplicate-score checks.
Run: python ml-service/scripts/validate_phase4.py
"""
import json
import math
import re
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ERRORS = []
CHECKS = 0

ALLOWED_CATEGORIES = {"accident", "breakdown", "roadwork", "flooding", "closure", "event", "other"}
ALLOWED_SEVERITIES = {"low", "medium", "high"}
ALLOWED_STATUS = {"pending", "verified"}
ALLOWED_EMAILS = {"user@demo.test", "admin@demo.test", "ems@demo.test"}


def check(cond, ok, fail):
    global CHECKS
    CHECKS += 1
    if cond:
        print(f"  ok   {ok}")
    else:
        ERRORS.append(fail)
        print(f"  FAIL {fail}")


def haversine_m(a, b):
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def point_to_segment_m(p, a, b):
    ax, ay, bx, by = a[1], a[0], b[1], b[0]
    px, py = p[1], p[0]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return haversine_m(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return haversine_m(p, [cy, cx])


def point_on_edge_m(p, edge):
    coords = edge["coords"]
    d = min(point_to_segment_m(p, coords[i], coords[i + 1])
            for i in range(len(coords) - 1))
    return d


def distance_between_m(a, b):
    return haversine_m([a["lat"], a["lng"]], [b["lat"], b["lng"]])


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def duplicate_score(a, b):
    dist_m = distance_between_m(a, b)
    dist_score = max(0.0, 1.0 - dist_m / 200.0)
    time_score = max(0.0, 1.0 - abs(a["minutes_ago"] - b["minutes_ago"]) / 30.0)
    same_cat = 1.0 if a["category"] == b["category"] else 0.0
    ta, tb = tokens(a["description"]), tokens(b["description"])
    jaccard = (len(ta & tb) / len(ta | tb)) if (ta | tb) else 0.0
    return 0.35 * dist_score + 0.25 * same_cat + 0.25 * time_score + 0.15 * jaccard


print("== data/seed/users.json ==")
users_path = ROOT / "data" / "seed" / "users.json"
users = json.loads(users_path.read_text(encoding="utf-8"))
check([u["email"] for u in users] == ["user@demo.test", "admin@demo.test", "ems@demo.test"],
      "3 users in contract order", "users list differs")
check(all(set(u) == {"name", "email", "password", "role"} for u in users),
      "user keys exactly name/email/password/role", "user keys differ")
check(users[0]["role"] == "user" and users[1]["role"] == "admin" and users[2]["role"] == "emergency",
      "roles user/admin/emergency", "roles wrong")
check(all(u["password"] == "demo123" for u in users), "passwords demo123", "password differs")

print("== data/seed/incidents.json ==")
inc_path = ROOT / "data" / "seed" / "incidents.json"
incidents = json.loads(inc_path.read_text(encoding="utf-8"))
check(len(incidents) == 15, "15 incidents", f"{len(incidents)} incidents")

graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
edges = {e["id"]: e for e in graph["edges"]}

for i, inc in enumerate(incidents):
    check(set(inc) == {"category", "description", "lat", "lng",
                       "reported_severity", "lanes_blocked", "is_closure",
                       "status", "reported_by_email", "minutes_ago"},
          f"incident {i}: keys exactly as contract", f"incident {i} keys wrong")
    check(inc["category"] in ALLOWED_CATEGORIES, f"incident {i} category ok",
          f"incident {i} bad category {inc['category']}")
    check(inc["reported_severity"] in ALLOWED_SEVERITIES, f"incident {i} severity ok",
          f"incident {i} bad severity")
    check(inc["status"] in ALLOWED_STATUS, f"incident {i} status ok", f"incident {i} bad status")
    check(inc["reported_by_email"] in ALLOWED_EMAILS, f"incident {i} reporter ok",
          f"incident {i} bad reporter")
    check(isinstance(inc["minutes_ago"], int) and 0 <= inc["minutes_ago"] <= 240,
          f"incident {i} minutes_ago ok", f"incident {i} bad minutes_ago")

# placement: every incident <= 30 m from some graph edge
bad_placement = []
for i, inc in enumerate(incidents):
    p = [inc["lat"], inc["lng"]]
    d = min(point_on_edge_m(p, e) for e in edges.values())
    if d > 30:
        bad_placement.append((i, inc["description"][:40], round(d, 1)))
check(not bad_placement, "every incident <= 30 m from a real road",
      f"incidents off-road: {bad_placement}")

print("== near-duplicate detection (M2's formula) ==")
pair_idx = list(combinations(range(len(incidents)), 2))
scores = [(i, j, duplicate_score(incidents[i], incidents[j])) for i, j in pair_idx]

designed_pairs = [(0, 1), (2, 3)]
bad_pairs = []
for i, j, s in scores:
    if (i, j) in designed_pairs:
        if s < 0.6:
            bad_pairs.append((i, j, round(s, 3)))
    elif s >= 0.6:
        bad_pairs.append((i, j, round(s, 3)))
check(not bad_pairs, "only the 2 designed near-duplicate pairs score >= 0.6",
      f"unexpected duplicate candidates: {bad_pairs}")
for i, j in designed_pairs:
    a, b = sorted((i, j))
    print(f"    pair ({i},{j}) score = {duplicate_score(incidents[i], incidents[j]):.3f}  "
          f"[{incidents[i]['category']}, {distance_between_m(incidents[i], incidents[j]):.0f} m apart]")

print(f"\n{CHECKS - len(ERRORS)}/{CHECKS} checks passed")
if ERRORS:
    print("PHASE 4 VALIDATION FAILED")
    raise SystemExit(1)
print("PHASE 4 VALIDATION PASSED")
