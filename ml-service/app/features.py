"""Feature pipeline shared by train_model.py (training) and app/main.py (serving).
The model must see exactly the same features in both — one definition.
"""
import numpy as np
import pandas as pd

from app.graph_utils import approaches_into, signalised_node_ids

FEATURES = ["hour_ist", "dow", "weekend", "speed_now", "speed_lag15",
            "speed_lag30", "free_flow_kmph", "lanes", "rain", "incident",
            "neighbour_speed_now"]


def level(ratio) -> np.ndarray:
    return np.select(
        [ratio > 0.75, ratio >= 0.50, ratio >= 0.25],
        ["flowing", "moderate", "heavy"],
        default="severe",
    )


def covered_edges(graph: dict) -> list[dict]:
    primary = [e for e in graph["edges"] if e["road_type"] == "primary"]
    approach_ids = {ap["edge_id"] for node in signalised_node_ids(graph)
                    for ap in approaches_into(graph, node)}
    return [e for e in primary] + [e for e in graph["edges"]
                                   if e["id"] in approach_ids and e["road_type"] != "primary"]


def neighbour_map(covered: list[dict]) -> dict[str, list[str]]:
    return {e["id"]: [o["id"] for o in covered
                      if o["id"] != e["id"]
                      and ({e["from"], e["to"]} & {o["from"], o["to"]})]
            for e in covered}


def add_features(df: pd.DataFrame, graph: dict) -> pd.DataFrame:
    """df must have: segment_id, timestamp_utc (datetime tz-aware), speed_kmph,
    free_flow_kmph, rain, incident. Adds FEATURES columns in place."""
    covered = covered_edges(graph)
    lanes = {e["id"]: e["lanes"] for e in covered}
    neigh = neighbour_map(covered)

    pivot = df.pivot(index="timestamp_utc", columns="segment_id", values="speed_kmph")
    neigh_means = {seg_id: (pivot[list(neigh[seg_id])].mean(axis=1)
                           if neigh.get(seg_id)
                           else pd.Series(0.0, index=pivot.index))
                   for seg_id in pivot.columns}
    df = df.sort_values(["segment_id", "timestamp_utc"]).reset_index(drop=True)
    grp = df.groupby("segment_id")
    df["speed_lag15"] = grp["speed_kmph"].shift(1)
    df["speed_lag30"] = grp["speed_kmph"].shift(2)
    df["speed_now"] = df["speed_kmph"]
    df["lanes"] = df["segment_id"].map(lanes)
    df["hour_ist"] = ((df["timestamp_utc"].dt.hour
                       + df["timestamp_utc"].dt.minute / 60 + 5.5) % 24).round(2)
    df["dow"] = df["timestamp_utc"].dt.day_of_week
    df["weekend"] = (df["dow"] >= 5).astype(int)
    df["neighbour_speed_now"] = 0.0
    for seg_id, series in neigh_means.items():
        mask = df["segment_id"] == seg_id
        df.loc[mask, "neighbour_speed_now"] = series.reindex(
            df.loc[mask, "timestamp_utc"]).values
    return df
