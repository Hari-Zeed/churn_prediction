"""
train_model.py
--------------
Loads customer_data.csv, performs feature engineering, trains an XGBoost
churn prediction model, and saves the trained pipeline + evaluation metrics.

Outputs:
  models/churn_model.pkl   - Full trained sklearn pipeline (scaler + model)
  models/scaler.pkl        - Standalone scaler (for backward compat)
  models/metrics.json      - Model evaluation metrics (accuracy, F1, ROC-AUC, etc.)
  models/model_version.json - Model versioning metadata
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, classification_report
)
from xgboost import XGBClassifier

# ─── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(BASE_DIR, "customer_data.csv")
MODEL_DIR  = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "churn_model.pkl")
SCALER_PATH= os.path.join(MODEL_DIR, "scaler.pkl")
METRICS_PATH   = os.path.join(MODEL_DIR, "metrics.json")
VERSION_PATH   = os.path.join(MODEL_DIR, "model_version.json")

os.makedirs(MODEL_DIR, exist_ok=True)

# ─── Load Data ───────────────────────────────────────────────────────────────
print("[1/6] Loading dataset...")
df = pd.read_csv(DATA_PATH)

# Rename columns for convenience
df.columns = [
    "CustomerID", "Tenure_Months", "Order_Freq_Month",
    "Discount_Usage_Pct", "Avg_Rating", "Payment_Failures",
    "Support_Calls", "Competitor_Offers_Clicked", "Avg_Delivery_Time",
    "Late_Deliveries", "Monthly_Charges", "Contract_Type", "Payment_Method", "Churn"
]

print(f"    Loaded {len(df):,} records. Churn rate: {df['Churn'].mean():.2%}")

# ─── Feature Engineering ─────────────────────────────────────────────────────
print("[2/6] Engineering features...")

# Customer Lifetime Value: higher tenure + higher order freq = better LTV
df["lifetime_value"] = (df["Tenure_Months"] * df["Order_Freq_Month"]) / 12.0

# Discount Dependency: high discount usage indicates price sensitivity (churn risk)
df["discount_dependency"] = df["Discount_Usage_Pct"] / 100.0

# Engagement Score: (rating × order_freq) penalised by support calls & late deliveries
df["engagement_score"] = (
    (df["Avg_Rating"] * df["Order_Freq_Month"])
    / (1 + df["Support_Calls"] + df["Late_Deliveries"])
)

# Payment Reliability: fewer failures = more reliable
max_failures = df["Payment_Failures"].max() + 1
df["payment_reliability"] = 1.0 - (df["Payment_Failures"] / max_failures)

# Order Frequency Trend: normalised order frequency
df["order_freq_trend"] = df["Order_Freq_Month"] / df["Order_Freq_Month"].max()

# Competitor Exposure: how many competitor offers clicked (risk if high)
df["competitor_exposure"] = df["Competitor_Offers_Clicked"] / df["Competitor_Offers_Clicked"].max()

NUMERIC_COLS = [
    "Tenure_Months", "Order_Freq_Month", "Discount_Usage_Pct",
    "Avg_Rating", "Payment_Failures", "Support_Calls",
    "Competitor_Offers_Clicked", "Avg_Delivery_Time", "Late_Deliveries",
    "Monthly_Charges",
    "lifetime_value", "discount_dependency", "engagement_score",
    "payment_reliability", "order_freq_trend", "competitor_exposure"
]

CATEGORICAL_COLS = [
    "Contract_Type", "Payment_Method"
]

FEATURE_COLS = NUMERIC_COLS + CATEGORICAL_COLS

X = df[FEATURE_COLS]
y = df["Churn"]

# ─── Train / Test Split ───────────────────────────────────────────────────────
print("[3/6] Splitting data (80/20 stratified)...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
print(f"    Train: {len(X_train):,}  |  Test: {len(X_test):,}")

# ─── Build Pipeline ──────────────────────────────────────────────────────────
print("[4/6] Training XGBoost model...")

scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

preprocessor = ColumnTransformer(
    transformers=[
        ("num", StandardScaler(), NUMERIC_COLS),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLS)
    ]
)

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("model", XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,  # handle class imbalance
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1
    ))
])

pipeline.fit(X_train, y_train)
print("    Training complete.")

# ─── Evaluate ────────────────────────────────────────────────────────────────
print("[5/6] Evaluating model...")

y_pred      = pipeline.predict(X_test)
y_prob      = pipeline.predict_proba(X_test)[:, 1]

accuracy  = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, zero_division=0)
recall    = recall_score(y_test, y_pred, zero_division=0)
f1        = f1_score(y_test, y_pred, zero_division=0)
roc_auc   = roc_auc_score(y_test, y_prob)

# Cross-validation F1 on full dataset
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_f1 = cross_val_score(pipeline, X, y, cv=cv, scoring="f1").mean()

print(f"    Accuracy : {accuracy:.4f}")
print(f"    Precision: {precision:.4f}")
print(f"    Recall   : {recall:.4f}")
print(f"    F1 Score : {f1:.4f}")
print(f"    ROC-AUC  : {roc_auc:.4f}")
print(f"    CV-F1    : {cv_f1:.4f}")
print()
print(classification_report(y_test, y_pred))

metrics = {
    "accuracy":  round(float(accuracy),  4),
    "precision": round(float(precision), 4),
    "recall":    round(float(recall),    4),
    "f1_score":  round(float(f1),        4),
    "roc_auc":   round(float(roc_auc),   4),
    "cv_f1":     round(float(cv_f1),     4),
    "test_samples": int(len(X_test)),
    "train_samples": int(len(X_train)),
    "feature_count": int(len(FEATURE_COLS)),
    "trained_at": datetime.now(timezone.utc).isoformat()
}

# Feature importances
ohe = pipeline.named_steps["preprocessor"].named_transformers_["cat"]
cat_features = list(ohe.get_feature_names_out(CATEGORICAL_COLS))
all_features = NUMERIC_COLS + cat_features

feature_importance = dict(zip(
    all_features,
    [round(float(v), 6) for v in pipeline.named_steps["model"].feature_importances_]
))
metrics["feature_importance"] = feature_importance

# ─── Save Artifacts ──────────────────────────────────────────────────────────
print("[6/6] Saving model artifacts...")

joblib.dump(pipeline, MODEL_PATH)
print(f"    Saved pipeline → {MODEL_PATH}")

# Save standalone preprocessor for backward compatibility
preprocessor = pipeline.named_steps["preprocessor"]
joblib.dump(preprocessor, SCALER_PATH)
print(f"    Saved preprocessor   → {SCALER_PATH}")

with open(METRICS_PATH, "w") as f:
    json.dump(metrics, f, indent=2)
print(f"    Saved metrics  → {METRICS_PATH}")

# Model versioning
try:
    with open(VERSION_PATH, "r") as f:
        version_data = json.load(f)
    version_num = version_data.get("version", 0) + 1
except FileNotFoundError:
    version_num = 1

version_data = {
    "version": version_num,
    "version_tag": f"v{version_num}.0",
    "model_type": "XGBoost",
    "feature_cols": FEATURE_COLS,
    "trained_at": datetime.now(timezone.utc).isoformat(),
    "metrics_summary": {
        "accuracy": metrics["accuracy"],
        "f1_score": metrics["f1_score"],
        "roc_auc": metrics["roc_auc"]
    }
}

with open(VERSION_PATH, "w") as f:
    json.dump(version_data, f, indent=2)
print(f"    Saved version  → {VERSION_PATH}  (Model: v{version_num}.0)")

print()
print("=" * 50)
print(f"  ✓ Model training complete — v{version_num}.0")
print(f"  ✓ Accuracy: {accuracy:.2%}  |  F1: {f1:.4f}  |  ROC-AUC: {roc_auc:.4f}")
print("=" * 50)
