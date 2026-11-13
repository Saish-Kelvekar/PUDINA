"""Generate data/seed/users.json and data/seed/incidents.json for the demo.

Placement: incidents are interpolated along edge polylines from data/graph.json
(guaranteed on real roads, far inside the 30 m tolerance from CONTRACT_M3 §5).
Two near-duplicate pairs (A: accidents on one segment reported ~7 min apart,
B: roadwork reports ~11 min apart) score >= 0.6 on M2's duplicate formula,
so the admin duplicate-detection demo always fires.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def haversine_m(a, b):
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def polyline_point_at(coords, target_m):
    acc = 0.0
    for i in range(len(coords) - 1):
        seg = haversine_m(coords[i], coords[i + 1])
        if acc + seg >= target_m or i == len(coords) - 2:
            f = 0.0 if seg == 0 else (target_m - acc) / seg
            f = max(0.0, min(1.0, f))
            lat = coords[i][0] + f * (coords[i + 1][0] - coords[i][0])
            lng = coords[i][1] + f * (coords[i + 1][1] - coords[i][1])
            return [round(lat, 7), round(lng, 7)]
        acc += seg


def edge_length_m(coords):
    return sum(haversine_m(a, b) for a, b in zip(coords, coords[1:]))


# category, description, edge_id, fraction_of_edge, reported_severity, lanes_blocked,
# is_closure, status, reported_by_email, minutes_ago
SPEC = [
    ("accident", "Car crash near BDA Junction on 80 Feet Road", "e2664", 0.25, "medium", 1, False, "pending", "user@demo.test", 9),   # pair A
    ("accident", "Car accident on 80 Feet Road near BDA Junction", "e2664", 0.75, "medium", 1, False, "pending", "ems@demo.test", 16), # pair A
    ("roadwork", "Roadwork at CMH Road near BDA Junction", "e2984", 0.15, "low", 1, False, "pending", "user@demo.test", 24),            # pair B
    ("roadwork", "Roadwork on CMH Road near BDA Junction", "e2984", 0.55, "low", 1, False, "pending", "ems@demo.test", 35),            # pair B
    ("breakdown", "Broken down truck blocking side of road", "e8", 0.50, "medium", 1, False, "pending", "user@demo.test", 8),
    ("flooding", "Waterlogging on the road after rain", "e42", 0.50, "medium", 1, False, "pending", "user@demo.test", 14),
    ("roadwork", "Road relaying work near 5th Block junction", "e44", 0.50, "low", 1, False, "verified", "user@demo.test", 22),
    ("accident", "Two-wheeler collision near WOK junction", "e684", 0.50, "high", 1, False, "verified", "ems@demo.test", 31),
    ("event", "Religious procession crossing the road", "e799", 0.50, "low", 0, False, "pending", "user@demo.test", 47),
    ("breakdown", "Auto rickshaw breakdown in middle of lane", "e2709", 0.50, "low", 1, False, "verified", "user@demo.test", 73),
    ("closure", "Road closed for utility work", "e3124", 0.50, "high", 2, True, "verified", "admin@demo.test", 105),
    ("accident", "Rear-end collision between two cars", "e2796", 0.50, "medium", 1, False, "pending", "user@demo.test", 134),
    ("other", "Stray cattle on the road", "e905", 0.50, "low", 0, False, "pending", "user@demo.test", 62),
    ("breakdown", "Bus broke down near Sony World junction, causing delays", "e2378", 0.50, "medium", 2, False, "verified", "admin@demo.test", 97),
    ("flooding", "Severe flooding after heavy rain, road submerged", "e906", 0.50, "high", 2, False, "pending", "user@demo.test", 151),
]

USERS = [
    {"name": "Riya Sharma", "email": "user@demo.test", "password": "demo123", "role": "user"},
    {"name": "Admin", "email": "admin@demo.test", "password": "demo123", "role": "admin"},
    {"name": "Ambulance Desk", "email": "ems@demo.test", "password": "demo123", "role": "emergency"},
]


def main() -> None:
    graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in graph["edges"]}

    incidents = []
    for category, desc, edge_id, frac, severity, lanes, is_closure, status, email, minutes in SPEC:
        edge = by_id[edge_id]
        length = edge_length_m(edge["coords"])
        point = polyline_point_at(edge["coords"], length * frac)
        incidents.append({
            "category": category,
            "description": desc,
            "lat": point[0],
            "lng": point[1],
            "reported_severity": severity,
            "lanes_blocked": lanes,
            "is_closure": is_closure,
            "status": status,
            "reported_by_email": email,
            "minutes_ago": minutes,
        })

    seed_dir = ROOT / "data" / "seed"
    seed_dir.mkdir(parents=True, exist_ok=True)
    (seed_dir / "users.json").write_text(json.dumps(USERS, indent=2) + "\n", encoding="utf-8")
    (seed_dir / "incidents.json").write_text(json.dumps(incidents, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {seed_dir / 'users.json'} ({len(USERS)} users)")
    print(f"wrote {seed_dir / 'incidents.json'} ({len(incidents)} incidents)")


if __name__ == "__main__":
    main()
