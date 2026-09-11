"""
train_model.py
--------------
Trains an XGBoost churn prediction model on the pre-mapped Telco ML schema.

Dataset:  ml_schema_ready.csv
Features:
  tenure_months       - int    Customer lifetime in months
  monthly_charges     - float  Current monthly bill amount
  contract_type       - int    Ordinal: 0=Month-to-Month, 1=1-Year, 2=2-Year
  payment_method      - int    Ordinal: 0=e-check, 1=Mailed, 2=Bank Transfer, 3=Credit Card
  engagement_score    - float  [0,1] Service embedding depth (engineered)
  payment_reliability - float  [0,1] Payment track record (engineered)
Target:
  churn               - int    Binary: 0=Retained, 1=Churned

Outputs:
  models/churn_model.pkl    - Trained sklearn Pipeline (StandardScaler + XGBoost)
  models/scaler.pkl         - Standalone scaler (backward compat for batch_predict.py)
  models/metrics.json       - Full evaluation metrics + feature importances
  models/model_version.json - Auto-incremented version record
"""

import os
import json
import logging
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("train_model")

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR            = os.path.dirname(os.path.abspath(__file__))
DATA_PATH           = os.path.join(BASE_DIR, "ml_schema_ready.csv")
MODEL_DIR           = os.path.join(BASE_DIR, "models")
MODEL_PATH          = os.path.join(MODEL_DIR, "churn_model.pkl")
SCALER_PATH         = os.path.join(MODEL_DIR, "scaler.pkl")
METRICS_PATH        = os.path.join(MODEL_DIR, "metrics.json")
VERSION_PATH        = os.path.join(MODEL_DIR, "model_version.json")
THRESHOLD_PATH      = os.path.join(MODEL_DIR, "threshold.json")
BASELINE_PROBS_PATH = os.path.join(MODEL_DIR, "baseline_probabilities.json")

os.makedirs(MODEL_DIR, exist_ok=True)

# ─── Schema ───────────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "tenure_months",
    "monthly_charges",
    "contract_type",
    "payment_method",
    "engagement_score",
    "payment_reliability",
]
TARGET_COL = "churn"

# ─── Hyperparameters ─────────────────────────────────────────────────────────
XGB_PARAMS = {
    "n_estimators":     300,
    "max_depth":        5,
    "learning_rate":    0.05,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "gamma":            0.1,
    "reg_alpha":        0.05,
    "reg_lambda":       1.0,
    "eval_metric":      "logloss",
    "random_state":     42,
    "n_jobs":           -1,
}

TEST_SIZE     = 0.20
RANDOM_STATE  = 42
CV_FOLDS      = 5


# ─── Step 1: Load ─────────────────────────────────────────────────────────────
def load_data(path: str) -> tuple[pd.DataFrame, pd.Series]:
    """Loads ml_schema_ready.csv and returns feature matrix X and target y."""
    logger.info(f"[1/6] Loading dataset: {path}")

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Dataset not found at: {path}\n"
            "Run map_to_ml_schema.py first to generate ml_schema_ready.csv."
        )

    df = pd.read_csv(path)
    logger.info(f"    Loaded {len(df):,} records  |  Churn rate: {df[TARGET_COL].mean():.2%}")

    missing = df[FEATURE_COLS + [TARGET_COL]].isnull().sum()
    if missing.any():
        logger.warning(f"    Missing values detected:\n{missing[missing > 0]}")

    X = df[FEATURE_COLS].copy()
    y = df[TARGET_COL].astype(int)
    return X, y


# ─── Step 2: Train / Test Split ───────────────────────────────────────────────
def split_data(
    X: pd.DataFrame, y: pd.Series
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Stratified 80/20 split preserving class distribution in both sets."""
    logger.info(f"[2/6] Splitting data (stratified 80/20, seed={RANDOM_STATE})...")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )
    logger.info(f"    Train: {len(X_train):,}  |  Test: {len(X_test):,}")
    logger.info(f"    Train churn rate: {y_train.mean():.2%}  |  Test churn rate: {y_test.mean():.2%}")
    return X_train, X_test, y_train, y_test


# ─── Step 3: Build Pipeline ───────────────────────────────────────────────────
def build_pipeline(scale_pos_weight: float) -> Pipeline:
    """
    Constructs a two-step sklearn Pipeline:
      1. StandardScaler  — normalises all 6 numeric features to zero mean / unit variance.
                           Required because tenure_months (0-72) and engagement_score
                           (0-1) are on very different scales; XGBoost handles this
                           natively via tree splits, but scaling improves convergence
                           when future downstream models (LR, SVM) consume the same pipe.
      2. XGBClassifier   — gradient boosted trees with:
                           scale_pos_weight: compensates for 73/27 class imbalance so
                           the minority churn class is not systematically under-predicted.
    """
    logger.info(f"[3/6] Building pipeline (scale_pos_weight={scale_pos_weight:.4f})...")

    model = XGBClassifier(
        scale_pos_weight=scale_pos_weight,
        **XGB_PARAMS,
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model",  model),
    ])

    return pipeline


# ─── Step 4: Train ────────────────────────────────────────────────────────────
def train_pipeline(
    pipeline: Pipeline,
    X_train: pd.DataFrame,
    y_train: pd.Series,
) -> Pipeline:
    """Fits the pipeline on training data."""
    logger.info("[4/6] Training XGBoost model...")
    pipeline.fit(X_train, y_train)
    logger.info("    Training complete.")
    return pipeline


# ─── Step 4b: Threshold Optimization ──────────────────────────────────────────
def find_optimal_threshold(
    y_true: pd.Series | np.ndarray,
    y_probs: pd.Series | np.ndarray,
    fn_cost: float = 5000.0,
    fp_cost: float = 200.0,
) -> float:
    """
    Computes optimal classification threshold based on asymmetric business costs:
      - False Negative (missed churner): ₹5,000 revenue loss
      - False Positive (unnecessary retention offer): ₹200 cost
      - Business value formula: (TP * 5000) - (FP * 200)

    Iterates thresholds from 0.1 to 0.9 (step 0.01) and selects threshold maximizing value.
    Returns a float subclass instance that can also be unpacked as (threshold, details).
    """
    y_true_arr = np.array(y_true).astype(int)
    y_probs_arr = np.array(y_probs).astype(float)

    thresholds = np.arange(0.10, 0.91, 0.01)
    best_threshold = 0.5
    best_value = -float("inf")
    best_details = {}

    for thresh in thresholds:
        thresh = round(float(thresh), 2)
        y_pred = (y_probs_arr >= thresh).astype(int)

        cm = confusion_matrix(y_true_arr, y_pred, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

        # Business value = (TP * 5000) - (FP * 200)
        value = float((tp * fn_cost) - (fp * fp_cost))

        if value > best_value:
            best_value = value
            best_threshold = thresh
            prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
            rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
            f1 = float(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
            best_details = {
                "optimal_threshold": thresh,
                "business_value": value,
                "fn_cost": fn_cost,
                "fp_cost": fp_cost,
                "tp": int(tp),
                "fp": int(fp),
                "tn": int(tn),
                "fn": int(fn),
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1_score": round(f1, 4),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

    class ThresholdResult(float):
        def __new__(cls, val, details):
            obj = super().__new__(cls, val)
            obj.details = details
            return obj

        def __iter__(self):
            yield float(self)
            yield self.details

    return ThresholdResult(best_threshold, best_details)


# ─── Step 5: Evaluate ─────────────────────────────────────────────────────────
def evaluate_pipeline(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    threshold: float = 0.5,
) -> dict:
    """
    Computes Accuracy, Precision, Recall, F1, ROC-AUC on hold-out test set
    and CV-F1 across the full dataset via Stratified K-Fold.
    Uses decision threshold (defaults to 0.5 for test compatibility, or optimal threshold).
    """
    logger.info(f"[5/6] Evaluating model (decision threshold={threshold:.2f})...")

    y_prob = pipeline.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)

    accuracy  = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall    = recall_score(y_test, y_pred, zero_division=0)
    f1        = f1_score(y_test, y_pred, zero_division=0)
    roc_auc   = roc_auc_score(y_test, y_prob)

    # Cross-validated F1 on full dataset (prevents over-optimism from single split)
    logger.info(f"    Running {CV_FOLDS}-fold stratified cross-validation (scoring=f1)...")
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    cv_f1 = float(cross_val_score(pipeline, X, y, cv=cv, scoring="f1").mean())

    # Per-class report
    report = classification_report(y_test, y_pred, target_names=["Retained", "Churned"])

    # ── Console output ────────────────────────────────────────────────────────
    border = "=" * 52
    print(f"\n{border}")
    print(f"  EVALUATION RESULTS (Threshold: {threshold:.2f})")
    print(border)
    print(f"  Accuracy  : {accuracy:.4f}  ({accuracy:.2%})")
    print(f"  Precision : {precision:.4f}")
    print(f"  Recall    : {recall:.4f}")
    print(f"  F1 Score  : {f1:.4f}")
    print(f"  ROC-AUC   : {roc_auc:.4f}")
    print(f"  CV-F1 ({CV_FOLDS}k): {cv_f1:.4f}")
    print(border)
    print(f"\n{report}")

    # ── Feature importances ───────────────────────────────────────────────────
    xgb_model = pipeline.named_steps["model"]
    feature_importance = {
        col: round(float(imp), 6)
        for col, imp in zip(FEATURE_COLS, xgb_model.feature_importances_)
    }

    top_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    print("  Feature Importances:")
    for feat, imp in top_features:
        bar = "█" * int(imp * 50)
        print(f"    {feat:<25} {imp:.4f}  {bar}")
    print()

    metrics = {
        "accuracy":           round(float(accuracy),  4),
        "precision":          round(float(precision), 4),
        "recall":             round(float(recall),    4),
        "f1_score":           round(float(f1),        4),
        "roc_auc":            round(float(roc_auc),   4),
        "cv_f1":              round(cv_f1,            4),
        "threshold":          round(float(threshold), 4),
        "test_samples":       int(len(X_test)),
        "train_samples":      int(len(X_train)),
        "feature_count":      int(len(FEATURE_COLS)),
        "trained_at":         datetime.now(timezone.utc).isoformat(),
        "feature_importance": feature_importance,
    }

    return metrics


# ─── Step 6: Save Artifacts ───────────────────────────────────────────────────
def save_artifacts(
    pipeline: Pipeline,
    metrics: dict,
    threshold_details: dict | None = None,
    baseline_probs: list | None = None,
) -> int:
    """
    Saves:
      churn_model.pkl             — Full pipeline (scaler + XGBoost) used by batch_predict.py
      scaler.pkl                  — Standalone scaler (backward compat for legacy callers)
      metrics.json                — Evaluation metrics + feature importances (read by dashboard)
      threshold.json              — Business cost-optimized threshold configuration
      baseline_probabilities.json — Reference probability distribution for PSI drift detection
      model_version.json          — Auto-incremented version metadata (read by model-eval page)
    """
    logger.info("[6/6] Saving model artifacts...")

    # 1. Full pipeline
    joblib.dump(pipeline, MODEL_PATH)
    logger.info(f"    ✓ Pipeline  → {MODEL_PATH}")

    # 2. Standalone scaler (batch_predict.py may load this independently)
    joblib.dump(pipeline.named_steps["scaler"], SCALER_PATH)
    logger.info(f"    ✓ Scaler    → {SCALER_PATH}")

    # 3. Metrics JSON
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info(f"    ✓ Metrics   → {METRICS_PATH}")

    # 4. Optimal Threshold JSON
    if threshold_details is not None:
        with open(THRESHOLD_PATH, "w") as f:
            json.dump(threshold_details, f, indent=2)
        logger.info(f"    ✓ Threshold → {THRESHOLD_PATH} (optimal={threshold_details.get('optimal_threshold')})")

    # 5. Baseline probabilities for PSI drift detection
    if baseline_probs is not None:
        with open(BASELINE_PROBS_PATH, "w") as f:
            json.dump({
                "baseline_probabilities": [round(float(p), 6) for p in baseline_probs],
                "sample_count": len(baseline_probs),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }, f, indent=2)
        logger.info(f"    ✓ Baseline  → {BASELINE_PROBS_PATH} ({len(baseline_probs):,} probabilities)")

    # 6. Auto-increment version
    try:
        with open(VERSION_PATH, "r") as f:
            prev = json.load(f)
        version_num = prev.get("version", 0) + 1
    except (FileNotFoundError, json.JSONDecodeError):
        version_num = 1

    version_data = {
        "version":     version_num,
        "version_tag": f"v{version_num}.0",
        "model_type":  "XGBoost",
        "dataset":     "ml_schema_ready.csv",
        "feature_cols": FEATURE_COLS,
        "trained_at":  metrics["trained_at"],
        "threshold":   threshold_details.get("optimal_threshold") if threshold_details else 0.5,
        "metrics_summary": {
            "accuracy": metrics["accuracy"],
            "f1_score": metrics["f1_score"],
            "roc_auc":  metrics["roc_auc"],
        },
    }

    with open(VERSION_PATH, "w") as f:
        json.dump(version_data, f, indent=2)
    logger.info(f"    ✓ Version   → {VERSION_PATH}  (Model: v{version_num}.0)")

    return version_num


# ─── Main Orchestrator ────────────────────────────────────────────────────────
def main() -> None:
    logger.info("=" * 52)
    logger.info("  CHURN PREDICTION — MODEL TRAINING PIPELINE")
    logger.info("=" * 52)

    # 1. Load
    X, y = load_data(DATA_PATH)

    # 2. Split
    X_train, X_test, y_train, y_test = split_data(X, y)

    # 3. Class imbalance ratio for scale_pos_weight
    scale_pos_weight = float((y_train == 0).sum()) / float((y_train == 1).sum())

    # 4. Build pipeline
    pipeline = build_pipeline(scale_pos_weight)

    # 5. Train
    train_pipeline(pipeline, X_train, y_train)

    # 5b. Find Optimal Threshold using business costs:
    #     False Negative (missed churn) = ₹5,000 loss
    #     False Positive (unnecessary retention) = ₹200 cost
    y_train_probs = pipeline.predict_proba(X_train)[:, 1]
    optimal_thresh, thresh_details = find_optimal_threshold(y_train, y_train_probs)
    logger.info(
        f"    ✓ Optimal threshold calculated: {optimal_thresh:.2f} | "
        f"Net Business Value: ₹{thresh_details['business_value']:,.0f} "
        f"(TP={thresh_details['tp']:,}, FP={thresh_details['fp']:,})"
    )

    # 6. Evaluate
    metrics = evaluate_pipeline(pipeline, X, y, X_train, y_train, X_test, y_test, threshold=optimal_thresh)

    # 7. Save artifacts
    all_dataset_probs = pipeline.predict_proba(X)[:, 1].tolist()
    version_num = save_artifacts(pipeline, metrics, thresh_details, all_dataset_probs)

    # ── Final summary ─────────────────────────────────────────────────────────
    border = "=" * 52
    print(border)
    print(f"  ✓ Training complete — v{version_num}.0")
    print(f"  ✓ Optimal Threshold : {optimal_thresh:.2f}")
    print(f"  ✓ Business Value    : ₹{thresh_details['business_value']:,.0f}")
    print(f"  ✓ Accuracy : {metrics['accuracy']:.2%}")
    print(f"  ✓ F1 Score : {metrics['f1_score']:.4f}")
    print(f"  ✓ ROC-AUC  : {metrics['roc_auc']:.4f}")
    print(f"  ✓ CV-F1    : {metrics['cv_f1']:.4f}")
    print(border)


if __name__ == "__main__":
    main()
