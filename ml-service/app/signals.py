"""Adaptive signal optimization (contract §4.4) — pure simulation core.

Demand model (from the CSV at as_of, documented in docs/DATA_SOURCES.md as
SIMULATED heuristics, never as live data):

  ratio            = speed / free_flow
  load             = 1 - ratio
  arrivals_per_min = max(0.5, lanes x 6 x load^1.5)   (~1 car/min free-flow .. ~6 gridlock)
  queue_now        = round(lanes x load x 6)          (cars queued now, initial state)
  demand_weight    = lanes x (1.5 - ratio)            (share of usable cycle time)

Current timing: 30 s green per approach + 3 s yellow + 2 s all-red.
Cycle length = 35 s x n approaches (140 s for a 4-phase junction).
Optimized: the same cycle length, usable green distributed by demand weight,
green clamped to 10-60 s, residual re-spread proportionally (water-filling).

Simulation: second-by-second, fixed number of cycles, seeded RNG (both runs use
the same seed). Green phase discharges ~1 car per 2 s. Every waiting car
accumulates 1 s of delay per second it waits; avg_wait_s = total waiting of all
cars that completed the junction / cars completed. Queues start at the demand
model's queue_now (observed-at-as_of estimate), not at zero.
"""
import numpy as np
import pandas as pd

GREEN_CURRENT_S, YELLOW_S, ALL_RED_S = 30, 3, 2
MIN_GREEN_S, MAX_GREEN_S = 10, 60
SATURATION_PER_LANE = 6.0       # veh/min/lane at gridlock (documented heuristic)
DISCHARGE_EVERY_S = 2           # 1 car leaves per 2 s while green (per approach)
EMERGENCY_MIN_GREEN_S = 30


def demand_from_rows(rows: dict[str, pd.Series], graph: dict, approaches: list[dict]) -> list[dict]:
    lanes_by_id = {e["id"]: e["lanes"] for e in graph["edges"]}
    nodes = {n["id"]: n for n in graph["nodes"]}
    out = []
    for ap in approaches:
        row = rows[ap["edge_id"]]
        ratio = float(row["speed_kmph"]) / float(row["free_flow_kmph"])
        load = max(0.0, 1.0 - ratio)
        lanes = int(lanes_by_id[ap["edge_id"]])
        arrivals = round(max(0.5, lanes * SATURATION_PER_LANE * load ** 1.5), 1)
        out.append({
            "approach_id": ap["approach_id"],
            "from_node": ap["from_node"],
            "label": ap.get("label", ap["edge_id"]),
            "node_name": nodes.get(ap["from_node"], {}).get("name", ap["from_node"]),
            "queue_now": int(round(lanes * load * 6)),
            "arrivals_per_min": arrivals,
            "ratio": round(ratio, 3),
            "lanes": lanes,
            "demand": lanes * (1.5 - ratio),
        })
    return out


def optimized_greens(demand: list[float], usable_s: float) -> list[int]:
    greens = [min(max(float(MIN_GREEN_S), g), float(MAX_GREEN_S))
              for g in (d / sum(demand) * usable_s for d in demand)]
    for _ in range(10):
        reminder = usable_s - sum(greens)
        if abs(reminder) < 0.5:
            break
        free_idx = [i for i, g in enumerate(greens) if MIN_GREEN_S < g < MAX_GREEN_S]
        if not free_idx:
            break
        weight = sum(demand[i] for i in free_idx)
        for i in free_idx:
            greens[i] = min(max(float(MIN_GREEN_S),
                                greens[i] + reminder * demand[i] / weight),
                            float(MAX_GREEN_S))
    return [int(round(g)) for g in greens]


def simulate(greens: list[int], queues: list[dict], cycles: int, seed: int) -> dict:
    """Seeded second-by-second simulation. Both runs (current vs optimized) use
    the same seed so the comparison is fair."""
    rng = np.random.default_rng(seed)
    n = len(greens)
    lam = np.array([q["arrivals_per_min"] for q in queues]) / 60.0
    active: list[list[float]] = [[0.0] * q["queue_now"] for q in queues]
    completed: list[float] = []
    per_approach_completed = [[] for _ in range(n)]
    best_queue = [len(a) for a in active]

    def tick():
        for j in range(n):
            for k in range(len(active[j])):
                active[j][k] += 1.0
            a = rng.poisson(lam[j])
            if a:
                active[j].extend([0.0] * a)
            if len(active[j]) > best_queue[j]:
                best_queue[j] = len(active[j])

    def discharge(i):
        if active[i]:
            car_wait = active[i].pop(0)
            completed.append(car_wait)
            per_approach_completed[i].append(car_wait)

    for _ in range(cycles):
        for i, green_s in enumerate(greens):
            for s in range(green_s):
                tick()
                if s % DISCHARGE_EVERY_S == 0:
                    discharge(i)
            for _ in range(YELLOW_S):
                tick()
            for _ in range(ALL_RED_S):
                tick()

    avg_wait = float(np.mean(completed)) if completed else 0.0
    max_queue = int(max(best_queue)) if best_queue else 0
    per_approach_avg = [float(np.mean(w)) if w else 0.0 for w in per_approach_completed]
    return {
        "avg_wait_s": round(avg_wait, 1),
        "max_queue": max_queue,
        "throughput": len(completed),
        "per_approach_avg_wait_s": [round(w, 1) for w in per_approach_avg],
    }


def phases_for(approach_ids: list[str], greens: list[int]) -> list[dict]:
    return [{"approach_id": a, "green_s": g, "yellow_s": YELLOW_S, "all_red_s": ALL_RED_S}
            for a, g in zip(approach_ids, greens)]


def optimize_junction(node_id: str, junction_id: str, approaches: list[dict],
                      rows: dict[str, pd.Series], graph: dict,
                      mode: str, emergency_approach_id: str | None,
                      cycles: int, seed: int, as_of: pd.Timestamp) -> dict:
    approach_ids = [ap["approach_id"] for ap in approaches]
    queues = demand_from_rows(rows, graph, approaches)
    n = len(approach_ids)
    usable = float(GREEN_CURRENT_S * n)
    cycle_s = GREEN_CURRENT_S * n + (YELLOW_S + ALL_RED_S) * n

    cur_greens = [GREEN_CURRENT_S] * n
    dem = [q["demand"] for q in queues]
    opt_greens = optimized_greens(dem, float(usable))

    if mode == "emergency":
        e_idx = approach_ids.index(emergency_approach_id)
        other = MIN_GREEN_S * (n - 1)
        opt_greens = [MIN_GREEN_S] * n
        opt_greens[e_idx] = int(min(max(EMERGENCY_MIN_GREEN_S, usable - other), 90))

    cur = simulate(cur_greens, queues, cycles, seed)
    opt = simulate(opt_greens, queues, cycles, seed)

    saved = cur["avg_wait_s"] - opt["avg_wait_s"]
    wait_change = round(-saved / cur["avg_wait_s"] * 100, 1) if cur["avg_wait_s"] else 0.0
    thr_change = (round((opt["throughput"] - cur["throughput"]) / cur["throughput"] * 100, 1)
                  if cur["throughput"] else 0.0)

    if mode == "emergency":
        e_idx = approach_ids.index(emergency_approach_id)
        red_wait_saved = round(cur["per_approach_avg_wait_s"][e_idx], 1)
    else:
        red_wait_saved = None

    reasons = _reasons(queues, cur_greens, opt_greens, mode, emergency_approach_id)

    return {
        "junction_id": junction_id,
        "mode": mode,
        "cycles": cycles,
        "seed": seed,
        "queues": [{"approach_id": q["approach_id"],
                    "queue_now": q["queue_now"],
                    "arrivals_per_min": q["arrivals_per_min"]} for q in queues],
        "current": {
            "cycle_s": cycle_s,
            "phases": phases_for(approach_ids, cur_greens),
            "avg_wait_s": cur["avg_wait_s"],
            "max_queue": cur["max_queue"],
            "throughput": cur["throughput"],
        },
        "optimized": {
            "cycle_s": cycle_s,
            "phases": phases_for(approach_ids, opt_greens),
            "avg_wait_s": opt["avg_wait_s"],
            "max_queue": opt["max_queue"],
            "throughput": opt["throughput"],
        },
        "improvement": {
            "avg_wait_saved_s": round(saved, 1),
            "avg_wait_change_pct": wait_change,
            "throughput_change_pct": thr_change,
        },
        "reasons": reasons,
        "red_wait_saved_s": red_wait_saved,
        "source": "SIMULATED",
    }


def _reasons(queues: list[dict], cur_greens: list[int], opt_greens: list[int],
             mode: str, emergency_approach_id: str | None) -> list[dict]:
    total = sum(q["arrivals_per_min"] for q in queues)
    reasons = []
    for q, cur, opt in zip(queues, cur_greens, opt_greens):
        share = (q["arrivals_per_min"] / total * 100) if total else 0.0
        if mode == "emergency" and q["approach_id"] == emergency_approach_id:
            text = (f"Emergency priority: full green {opt}s on this approach — "
                    f"{q['arrivals_per_min']} cars/min, queue {q['queue_now']}.")
        elif opt > cur:
            text = (f"Green longer ({cur}s -> {opt}s): demand is {share:.0f}% of junction "
                    f"arrivals ({q['arrivals_per_min']} cars/min, queue {q['queue_now']}).")
        elif opt < cur:
            text = (f"Green shorter ({cur}s -> {opt}s): demand is {share:.0f}% of junction "
                    f"arrivals ({q['arrivals_per_min']} cars/min, queue {q['queue_now']}).")
        else:
            text = (f"Green unchanged ({cur}s): demand is {share:.0f}% of junction "
                    f"arrivals ({q['arrivals_per_min']} cars/min, queue {q['queue_now']}).")
        reasons.append({"approach_id": q["approach_id"], "text": text})
    return reasons
