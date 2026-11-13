"""Export the real Bengaluru (Koramangala) road graph to data/graph.json.

- osmnx: drivable roads, ~1.5 km radius, largest connected component only
- osmnx gives directed edges for two-way roads; we keep one edge per road and
  set oneway: false. A road that only exists in one direction stays oneway: true
  (divided roads on the same nodes collapse to one bidirectional edge)
- IDs are reassigned deterministically (n1..nN, e1..eM)
- top ~10 junctions by edge degree (>= 4 roads) are marked signalised
- free_flow_kmph: OSM maxspeed if present, else primary 40 / secondary 30 /
  tertiary 30 / residential 25 (residential default for everything else)

The raw download is cached to data/cache/koramangala.graphml so the graph can
be rebuilt offline (--from-cache).
"""
import json
import sys
from math import ceil
from pathlib import Path

import networkx as nx
import osmnx as ox

LAT, LNG = 12.9345, 77.5640  # Koramangala centre (5th Block / 80 Feet Rd area)
DIST_M = 1500

OVERPASS_URLS = [
    "https://overpass-api.de/api",
    "https://lz4.overpass-api.de/api",
]
USER_AGENT = "TrafficVisionAI/0.1 (hackathon project; local demo build)"

ROAD_TYPE = {
    "motorway": "primary", "trunk": "primary", "primary": "primary", "primary_link": "primary",
    "motorway_link": "primary", "trunk_link": "primary",
    "secondary": "secondary", "secondary_link": "secondary",
    "tertiary": "tertiary", "tertiary_link": "tertiary",
    "unclassified": "residential", "residential": "residential",
    "living_street": "residential", "service": "residential",
}
FREE_FLOW = {"primary": 40, "secondary": 30, "tertiary": 30, "residential": 25}

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache" / "koramangala.graphml"
OUT = ROOT / "data" / "graph.json"


def fetch_graph() -> nx.MultiDiGraph:
    if "--from-cache" in sys.argv:
        print(f"reading cached graph from {CACHE}")
        return ox.load_graphml(CACHE)

    last_err = None
    for url in OVERPASS_URLS:
        for attempt in (1, 2):
            try:
                print(f"downloading Koramangala drive network from {url} (attempt {attempt})")
                ox.settings.overpass_url = url
                ox.settings.http_user_agent = USER_AGENT
                ox.settings.requests_timeout = 240
                g = ox.graph_from_point((LAT, LNG), dist=DIST_M, network_type="drive", simplify=True)
                CACHE.parent.mkdir(parents=True, exist_ok=True)
                ox.save_graphml(g, CACHE)
                print(f"cached -> {CACHE}")
                return g
            except Exception as err:  # noqa: BLE001 - try the next mirror
                print(f"  failed: {err}")
                last_err = err
    raise SystemExit(f"could not download the graph from any mirror: {last_err}")


def first(value, default=None):
    if value is None:
        return default
    if isinstance(value, (list, tuple)):
        value = value[0] if value else default
    return value


def parse_lanes(value) -> int:
    raw = first(value)
    try:
        lanes = int(str(raw).replace(";", ",").split(",")[0])
        return max(1, lanes)
    except (TypeError, ValueError):
        return 1


def parse_maxspeed(value) -> int | None:
    raw = str(first(value, "")).lower().strip()
    if not raw:
        return None
    token = raw.replace("km/h", "").replace("kmh", "").replace("kmph", "").strip()
    if "mph" in token:
        try:
            return max(1, int(round(float(token.replace("mph", "").strip()) * 1.60934)))
        except ValueError:
            return None
    try:
        return max(1, int(round(float(token.split(",")[0]))))
    except ValueError:
        return None


def coords_of(data, n1, n2):
    geom = data.get("geometry")
    if geom is not None:
        pts = [(y, x) for x, y in geom.coords]
        if pts:
            pts[0], pts[-1] = n1, n2
            return [[round(lat, 7), round(lng, 7)] for lat, lng in pts]
    return [[round(n1[0], 7), round(n1[1], 7)], [round(n2[0], 7), round(n2[1], 7)]]


def main() -> None:
    graph = fetch_graph()

    # largest connected component (undirected weak connectivity)
    components = nx.weakly_connected_components(graph)
    main_comp = max(components, key=len)
    graph = graph.subgraph(main_comp).copy()
    print(f"largest connected component: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} directed edges")

    # deterministic node order
    osm_nodes = sorted(graph.nodes(data=True), key=lambda kv: (kv[1]["y"], kv[1]["x"]))
    node_id = {osm_id: f"n{i + 1}" for i, (osm_id, _) in enumerate(osm_nodes)}

    # collect directed edges
    directed = []
    for u, v, key, data in graph.edges(keys=True, data=True):
        directed.append((u, v, key, data))

    # collapse two-way roads: if both (u,v) and (v,u) exist keep one bidirectional edge
    used, edges = set(), []
    for u, v, key, data in sorted(directed, key=lambda e: (e[0], e[1], e[2])):
        if (u, v) in used:
            continue
        reverse_exists = graph.has_edge(v, u)
        used.add((u, v))
        if reverse_exists:
            used.add((v, u))
        edges.append((u, v, key, data, reverse_exists))

    print(f"kept {len(edges)} edges after merging two-way pairs")

    road_levels = {}
    out_edges = []
    for i, (u, v, key, data, two_way) in enumerate(sorted(edges, key=lambda e: (node_id[e[0]], node_id[e[1]], e[2]))):
        road = first(data.get("highway"), "residential")
        road_type = ROAD_TYPE.get(str(road).lower(), "residential")
        ff = parse_maxspeed(data.get("maxspeed")) or FREE_FLOW[road_type]
        n1 = (graph.nodes[u]["y"], graph.nodes[u]["x"])
        n2 = (graph.nodes[v]["y"], graph.nodes[v]["x"])
        name = first(data.get("name"))
        out_edges.append({
            "id": f"e{i + 1}",
            "from": node_id[u],
            "to": node_id[v],
            "name": None if name in (None, "", "nan") else str(name),
            "length_m": max(1, int(round(float(data.get("length", 0))))),
            "road_type": road_type,
            "lanes": parse_lanes(data.get("lanes")),
            "free_flow_kmph": ff,
            "oneway": not two_way,
            "coords": coords_of(data, n1, n2),
        })
        road_levels[road_type] = road_levels.get(road_type, 0) + 1

    # signalised: top ~10 highest-degree junctions (>= 4 roads)
    degree = {}
    for e in out_edges:
        degree[e["from"]] = degree.get(e["from"], 0) + 1
        degree[e["to"]] = degree.get(e["to"], 0) + 1
    signalised = {n for n, d in sorted(degree.items(), key=lambda kv: (-kv[1], kv[0]))[:10] if d >= 4}

    nodes_out = [
        {
            "id": node_id[osm_id],
            "lat": round(graph.nodes[osm_id]["y"], 7),
            "lng": round(graph.nodes[osm_id]["x"], 7),
            "name": f"Junction {node_id[osm_id]}",
            "signalised": node_id[osm_id] in signalised,
        }
        for osm_id in [n for n, _ in osm_nodes]
    ]

    payload = {"nodes": nodes_out, "edges": out_edges}
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"wrote {len(nodes_out)} nodes, {len(out_edges)} edges -> {OUT}")
    print(f"edge types: {road_levels}")
    print(f"one-way edges: {sum(1 for e in out_edges if e['oneway'])}")
    print(f"signalised junctions ({len(signalised)}): {sorted(signalised)}")
    lengths = [e["length_m"] for e in out_edges]
    print(f"edge length m: min {min(lengths)}, mean {ceil(sum(lengths) / len(lengths))}, max {max(lengths)}")


if __name__ == "__main__":
    main()
