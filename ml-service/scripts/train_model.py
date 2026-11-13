"""Phase 2: train the congestion-prediction models (15- and 30-minute horizons).

Weeks 1-5 (2026-10-05..2026-11-08) train, week 6 (2026-11-09..15) test.
Never a random split. Seeded and reproducible.

Outputs:
  ml-service/models/rf_15.joblib   (gitignored)
  ml-service/models/rf_30.joblib   (gitignored)
  ml-service/metrics.json          (committed)

Confidence (used by the FastAPI service in Phase 3) = spread of the tree
ensemble: conf = 1 - min(1, std_of_tree_predictions / free_flow). The script
prints a sample distribution; the formula lives in docs/DATA_SOURCES.md.
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sys
from sklearn.ensemble import RandomForestRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.features import FEATURES, add_features, level
from app.graph_utils import load_graph

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "data" / "traffic.csv"
MODEL_DIR = ROOT / "ml-service" / "models"
METRICS = ROOT / "ml-service" / "metrics.json"

TRAIN_END = pd.Timestamp("2026-11-09T00:00:00Z")


def main() -> None:
    graph = load_graph()
    df = pd.read_csv(CSV, parse_dates=["timestamp_utc"])
    df = add_features(df, graph)

    grp = df.groupby("segment_id")
    df["speed_t15"] = grp["speed_kmph"].shift(-1)
    df["speed_t30"] = grp["speed_kmph"].shift(-2)

    df = df.dropna(subset=["speed_lag15", "speed_lag30", "speed_t15", "speed_t30"]).reset_index(drop=True)
    print(f"training rows after lag drop: {len(df)}")

    train = df[df["timestamp_utc"] < TRAIN_END]
    test = df[df["timestamp_utc"] >= TRAIN_END]
    print(f"train: {len(train)} rows ({train['timestamp_utc'].min()} .. {train['timestamp_utc'].max()})")
    print(f"test : {len(test)} rows ({test['timestamp_utc'].min()} .. {test['timestamp_utc'].max()})")

    X_train, X_test = train[FEATURES].values, test[FEATURES].values

    horizons = {}
    for horizon, col, model_name in [("15", "speed_t15", "rf_15"), ("30", "speed_t30", "rf_30")]:
        y_train, y_test = train[col].values, test[col].values

        mae_baseline = float(np.mean(np.abs(test["speed_now"].values - y_test)))

        rf = RandomForestRegressor(n_estimators=150, max_depth=18,
                                   min_samples_leaf=5, n_jobs=-1,
                                   random_state=20261113)
        rf.fit(X_train, y_train)
        y_pred = rf.predict(X_test)
        mae_model = float(np.mean(np.abs(y_pred - y_test)))

        ff = test["free_flow_kmph"].values
        truth_level = level(y_test / ff)
        pred_level = level(y_pred / ff)
        base_level = level(test["speed_now"].values / ff)
        acc_model = float(np.mean(pred_level == truth_level))
        acc_base = float(np.mean(base_level == truth_level))

        improvement = (mae_baseline - mae_model) / mae_baseline * 100 if mae_baseline else 0.0

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(rf, MODEL_DIR / f"{model_name}.joblib")

        horizons[horizon] = {
            "mae_model_kmph": round(mae_model, 1),
            "mae_baseline_kmph": round(mae_baseline, 1),
            "improvement_pct": round(improvement, 1),
            "level_accuracy_model": round(acc_model, 2),
            "level_accuracy_baseline": round(acc_base, 2),
            "test_rows": int(len(test)),
        }
        print(f"h={horizon}: baseline MAE {mae_baseline:.2f} km/h | rf MAE {mae_model:.2f} km/h "
              f"(+{improvement:.1f}%) | level acc model {acc_model:.2f} vs baseline {acc_base:.2f}")

    metrics = {
        "model_version": "rf-v1",
        "trained_on": "2026-10-05 to 2026-11-08",
        "tested_on": "2026-11-09 to 2026-11-15",
        "split": "time-based",
        "horizons": horizons,
        "series": None,
    }
    METRICS.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\nmodels -> {MODEL_DIR} (gitignored)\nmetrics -> {METRICS}")


if __name__ == "__main__":
    main()
