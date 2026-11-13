"""Shared helpers for reading data/graph.json (used by the generator, the
FastAPI service and the validation scripts).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = ROOT / "data" / "graph.json"


def load_graph() -> dict:
    return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))


def signalised_node_ids(graph: dict) -> list[str]:
    return [n["id"] for n in graph["nodes"] if n.get("signalised")]


def approaches_into(graph: dict, node_id: str) -> list[dict]:
    """Every edge drivable into `node_id` (one approach per entry edge).

    Approach ID = `<node id>-<edge id>` (e.g. `n271-e2984`).
    `from_node` is the endpoint other than the junction itself.
    """
    approaches = []
    for edge in graph["edges"]:
        if edge["to"] == node_id:
            approach_from = edge["from"]
        elif edge["from"] == node_id and not edge["oneway"]:
            approach_from = edge["to"]  # two-way: driven into the junction
        else:
            continue
        approaches.append({
            "approach_id": f"{node_id}-{edge['id']}",
            "edge_id": edge["id"],
            "from_node": approach_from,
            "label": edge.get("name") or edge["id"],
            "edge": edge,
        })
    return approaches


def junction_id(node_id: str) -> str:
    return f"J-{node_id}"
