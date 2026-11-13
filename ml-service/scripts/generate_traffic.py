"""Generate data/traffic.csv — 6 weeks of 15-minute speeds.

Coverage: all PRIMARY segments (147) + every approach edge of the 10 signalised
junctions (secondary/tertiary/residential, 41 more → 188 segments, ~40 MB,
under GitHub's 100 MB file limit). Approach coverage is required by the signal
optimizer, which must derive queues/arrival rates from this file (contract §4.4).

Window: 2026-10-05T00:00:00Z .. 2026-11-15T23:45:00Z (42 days, 4032 steps).
Week 6 (2026-11-09..15) is reserved as the model's test week.

Model (seeded, reproducible):
  speed = free_flow × hour_factor(IST) × rain_factor × incident_factor × (1 + noise)
  hour_factor: rush-hour dips (morning ~09:00 IST, evening ~18:30 IST,
                mild midday dip); weekends get 40% of the dips
  rain: ~6 random rain days (15% chance per day), each raining for 2-6 h in one
        window; rain knocks speeds to 0.78x
  incidents: on ~60% of days, 1-3 incidents on random primary segments,
             1-4 steps each; speeds drop to 45-70%
  noise: N(0, 0.045)
Every row: source=SIMULATED; timestamps UTC on :00/:15/:30/:45.
"""
import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.graph_utils import approaches_into, load_graph, signalised_node_ids

ROOT = Path(__file__).resolve().parents[2]
GRAPH = ROOT / "data" / "graph.json"
OUT = ROOT / "data" / "traffic.csv"

SEED = 20261113
START = datetime(2026, 10, 5, tzinfo=timezone.utc)
END = datetime(2026, 11, 16, tzinfo=timezone.utc)  # exclusive
STEP = timedelta(minutes=15)

MORNING_PEAK, EVENING_PEAK = 9.0, 18.5
RAIN_FACTOR = 0.78
INCIDENT_FACTOR_RANGE = (0.45, 0.70)
INCIDENT_DAY_CHANCE = 0.6


def hour_factor(h_ist: float, weekend: bool) -> float:
    """Speed multiplier from congestion demand. 1.0 = free-flow cruise."""
    f = (1.0
         - 0.70 * math.exp(-((h_ist - MORNING_PEAK) / 1.05) ** 2)
         - 0.64 * math.exp(-((h_ist - EVENING_PEAK) / 1.25) ** 2)
         - 0.16 * math.exp(-((h_ist - 13.0) / 2.2) ** 2))
    if weekend:
        f = 1.0 - (1.0 - f) * 0.4
    return max(0.15, min(1.0, f))


def level(ratio: float) -> str:
    if ratio > 0.75:
        return "flowing"
    if ratio >= 0.50:
        return "moderate"
    if ratio >= 0.25:
        return "heavy"
    return "severe"


def steps():
    t = START
    while t < END:
        yield t
        t += STEP


def main() -> None:
    rng = np.random.default_rng(SEED)
    graph = load_graph()
    edges = {e["id"]: e for e in graph["edges"]}
    primary = [e for e in graph["edges"] if e["road_type"] == "primary"]
    approach_ids = {ap["edge_id"] for node in signalised_node_ids(graph)
                    for ap in approaches_into(graph, node)}
    covered = [e for e in primary] + [e for e in graph["edges"]
                                      if e["id"] in approach_ids and e["road_type"] != "primary"]
    print(f"covered segments: {len(covered)} "
          f"({len(primary)} primary + {len(covered) - len(primary)} signal-approach non-primary)")

    # seeded rain schedule: pick rain days, each gets one window
    days = [START + timedelta(days=i) for i in range(42)]
    rain_targets = sorted(rng.choice(len(days), size=int(round(len(days) * 0.15)), replace=False))
    rain_schedule = {}
    for d in rain_targets:
        start_hour = float(rng.uniform(5.0, 19.0))
        duration = float(rng.uniform(2.0, 6.0))
        rain_schedule[days[d].date()] = (start_hour, start_hour + duration)
    print(f"rain days: {sorted(str(d) for d in rain_schedule)}")

    # seeded incident schedule: {(date, segment_id): [(start_utc_hour, dur_steps, factor)]}
    incidents = {}
    for day in days:
        if rng.random() < INCIDENT_DAY_CHANCE:
            n_events = 1 + (1 if rng.random() < 0.5 else 0) + (1 if rng.random() < 0.15 else 0)
            for _ in range(n_events):
                seg = primary[int(rng.integers(0, len(primary)))]["id"]
                start_ist = float(rng.uniform(7.0, 21.0))
                start_utc = max(0.0, start_ist - 5.5)
                dur = int(rng.integers(1, 5))
                factor = float(rng.uniform(*INCIDENT_FACTOR_RANGE))
                incidents.setdefault((day.date(), seg), []).append((start_utc, dur, factor))
    print(f"incident events: {sum(len(v) for v in incidents.values())}")

    day_steps = list(steps())

    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = 0
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["segment_id", "timestamp_utc", "speed_kmph", "free_flow_kmph",
                         "congestion_level", "rain", "incident", "source"])

        for step in day_steps:
            ts = step.strftime("%Y-%m-%dT%H:%M:00Z")
            date = step.date()
            h_utc = step.hour + step.minute / 60.0
            h_ist = (h_utc + 5.5) % 24
            weekend = step.weekday() >= 5
            f_hour = hour_factor(h_ist, weekend)

            rain_window = rain_schedule.get(date)
            raining = int(rain_window is not None and rain_window[0] <= h_ist < rain_window[1])

            for seg_id, free_flow in ((e["id"], e["free_flow_kmph"]) for e in covered):
                incident_factor, incident_flag = 1.0, 0
                for start_utc, dur, factor in incidents.get((date, seg_id), []):
                    if start_utc <= h_utc < start_utc + dur * 0.25:
                        incident_factor, incident_flag = factor, 1
                        break

                rain_f = RAIN_FACTOR if raining else 1.0
                noise = float(rng.normal(0.0, 0.045))
                speed = free_flow * f_hour * rain_f * incident_factor * (1 + noise)
                speed = max(1.0, min(float(free_flow), speed))
                speed = round(speed, 1)
                ratio = speed / free_flow
                writer.writerow([seg_id, ts, f"{speed:.1f}", free_flow,
                                 level(ratio), raining, incident_flag, "SIMULATED"])
                rows += 1

    print(f"wrote {rows} rows -> {OUT} ({OUT.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
