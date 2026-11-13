"""Generate the Phase 0 sample traffic CSV (data/sample/traffic.csv).

Story built into the sample (IST 08:15-09:15 morning rush, 5 x 15-min steps):
- e1 (80 Feet Road): rush-hour ramp flowing -> severe
- e5 (100 Feet Road): rain from step 3 onward
- e7 (1st Block Main Road): incident from step 4 onward, severe drop
- all other segments: mild slowdowns, mixed congestion levels

Reproducible: run `python ml-service/scripts/make_sample_csv.py` from the repo root.
"""
import csv
from pathlib import Path

STEPS_UTC = [
    "2026-11-10T02:45:00Z",  # 08:15 IST
    "2026-11-10T03:00:00Z",  # 08:30 IST
    "2026-11-10T03:15:00Z",  # 08:45 IST
    "2026-11-10T03:30:00Z",  # 09:00 IST
    "2026-11-10T03:45:00Z",  # 09:15 IST
]

# segment_id -> (free_flow_kmph from graph.json, [speed per step])
PROFILES = {
    "e1":  (40, [36, 30, 22, 14, 8]),
    "e2":  (40, [38, 34, 28, 24, 20]),
    "e3":  (30, [27, 24, 18, 14, 11]),
    "e4":  (30, [28, 26, 21, 17, 15]),
    "e5":  (40, [37, 33, 25, 18, 13]),   # rain steps 3-5
    "e6":  (30, [26, 23, 17, 13, 10]),
    "e7":  (25, [22, 19, 15, 8, 3]),     # incident steps 4-5
    "e8":  (30, [28, 25, 20, 16, 13]),
    "e9":  (40, [36, 32, 27, 22, 18]),
    "e10": (25, [23, 20, 15, 11, 9]),
}

RAIN = {("e5", step) for step in STEPS_UTC[2:]}
INCIDENT = {("e7", step) for step in STEPS_UTC[3:]}


def level(ratio: float) -> str:
    if ratio > 0.75:
        return "flowing"
    if ratio >= 0.50:
        return "moderate"
    if ratio >= 0.25:
        return "heavy"
    return "severe"


def main() -> None:
    out_path = Path(__file__).resolve().parents[2] / "data" / "sample" / "traffic.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for step in STEPS_UTC:
        for seg_id, (free_flow, speeds) in PROFILES.items():
            speed = round(float(speeds[STEPS_UTC.index(step)]), 1)
            rows.append({
                "segment_id": seg_id,
                "timestamp_utc": step,
                "speed_kmph": f"{speed:.1f}",
                "free_flow_kmph": free_flow,
                "congestion_level": level(speed / free_flow),
                "rain": 1 if (seg_id, step) in RAIN else 0,
                "incident": 1 if (seg_id, step) in INCIDENT else 0,
                "source": "SIMULATED",
            })

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "segment_id", "timestamp_utc", "speed_kmph", "free_flow_kmph",
            "congestion_level", "rain", "incident", "source",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    main()
