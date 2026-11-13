"""Phase 2 validation: metrics.json schema, model artifacts, smoke prediction.
Run: python ml-service/scripts/validate_phase2.py
"""
import json
import subprocess
from pathlib import Path

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
ERRORS = []
CHECKS = 0
FEATURES = 11


def check(cond, ok, fail):
    global CHECKS
    CHECKS += 1
    if cond:
        print(f"  ok   {ok}")
    else:
        ERRORS.append(fail)
        print(f"  FAIL {fail}")


print("== ml-service/metrics.json ==")
metrics_path = ROOT / "ml-service" / "metrics.json"
check(metrics_path.exists(), "metrics.json exists", "metrics.json missing (run train_model.py)")
metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

required = {"model_version", "trained_on", "tested_on", "split", "horizons"}
check(required <= set(metrics), "metrics.json has contract keys", f"missing {required - set(metrics)}")
check(metrics["split"] == "time-based", "split is time-based", "split not time-based")
check(metrics.get("series") is None, "series is null (segment_id not selected)", "series not null")
check(set(metrics["horizons"]) == {"15", "30"}, "horizons 15 and 30 present", "horizon keys wrong")

for horizon, h in metrics["horizons"].items():
    keys = {"mae_model_kmph", "mae_baseline_kmph", "improvement_pct",
            "level_accuracy_model", "level_accuracy_baseline", "test_rows"}
    check(keys <= set(h), f"horizon {horizon}: keys complete", f"horizon {horizon} missing {keys - set(h)}")
    check(h["mae_model_kmph"] < h["mae_baseline_kmph"],
          f"horizon {horizon}: model beats baseline ({h['mae_model_kmph']} < {h['mae_baseline_kmph']})",
          f"horizon {horizon}: model does not beat baseline")
    check(0 < h["improvement_pct"] < 100, f"horizon {horizon}: improvement_pct sane", "improvement_pct out of range")
    check(0.5 <= h["level_accuracy_model"] <= 1.0, f"horizon {horizon}: level accuracy sane", "accuracy odd")
    check(h["test_rows"] == 98490, f"horizon {horizon}: test_rows = 98,490 (week 6)", "test_rows mismatch")

print("== models (gitignored) ==")
for horizon, name in [("15", "rf_15"), ("30", "rf_30")]:
    model_path = ROOT / "ml-service" / "models" / f"{name}.joblib"
    check(model_path.exists(), f"{name}.joblib exists locally", f"{name}.joblib missing — run train_model.py")
    if not model_path.exists():
        continue
    model = joblib.load(model_path)
    check(model.n_features_in_ == FEATURES, f"{name}: {model.n_features_in_} features as expected",
          f"{name}: feature count {model.n_features_in_}")
    check(model.n_estimators == 150, f"{name}: 150 trees", f"{name}: {model.n_estimators} trees")
    sample = np.array([[9.0, 1, 0, 22.0, 24.0, 26.0, 40, 2, 0, 0, 23.0]])
    pred = float(model.predict(sample)[0])
    check(0 < pred < 60, f"{name}: smoke prediction {pred:.1f} km/h in range", f"{name}: smoke prediction out of range")

tracked = subprocess.run(["git", "ls-files", "ml-service/models"],
                         capture_output=True, text=True, cwd=ROOT).stdout.strip()
check(tracked == "", "no model files tracked in git", f"model files committed?!: {tracked}")

print(f"\n{CHECKS - len(ERRORS)}/{CHECKS} checks passed")
if ERRORS:
    print("PHASE 2 VALIDATION FAILED")
    raise SystemExit(1)
print("PHASE 2 VALIDATION PASSED")
