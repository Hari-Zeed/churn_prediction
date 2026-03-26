"""
batch_predict.py
----------------
Loads the trained churn_model.pkl, runs predictions on the full customer
dataset, and writes results to predictions.csv AND the Prisma SQLite DB.

Outputs:
  predictions.csv   - CSV with customer_id, churn_probability, risk_level + features
  dev.db            - Prisma SQLite DB updated with Customer rows
"""

import os
import csv
import json
import sqlite3
import joblib  # type: ignore
import numpy as np  # type: ignore
import pandas as pd  # type: ignore
from datetime import datetime, timezone

# ─── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR   = os.path.dirname(BASE_DIR)
DATA_PATH     = os.path.join(BASE_DIR, "customer_data.csv")
MODEL_PATH    = os.path.join(BASE_DIR, "models", "churn_model.pkl")
METRICS_PATH  = os.path.join(BASE_DIR, "models", "metrics.json")
PREDICTIONS_CSV = os.path.join(BASE_DIR, "predictions.csv")
DB_PATH       = os.path.join(PROJECT_DIR, "dev.db")

# ─── Feature column names (must match train_model.py) ─────────────────────
FEATURE_COLS = [
    "Tenure_Months", "Order_Freq_Month", "Discount_Usage_Pct",
    "Avg_Rating", "Payment_Failures", "Support_Calls",
    "Competitor_Offers_Clicked", "Avg_Delivery_Time", "Late_Deliveries",
    "Monthly_Charges",
    "lifetime_value", "discount_dependency", "engagement_score",
    "payment_reliability", "order_freq_trend", "competitor_exposure",
    "Contract_Type", "Payment_Method"
]

# ─── Load System Settings ────────────────────────────────────────────────────
confidence_threshold = 0.75 # Default
medium_risk_threshold = 0.35 # Default

if os.path.exists(DB_PATH):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='SystemSettings'")
        if cur.fetchone():
            cur.execute("SELECT confidenceThreshold FROM SystemSettings WHERE id='global'")
            row = cur.fetchone()
            if row:
                confidence_threshold = float(row[0])
                medium_risk_threshold = confidence_threshold / 2.0
        conn.close()
    except Exception as e:
        print(f"    WARNING: Failed to read from SystemSettings: {e}")

print(f"[0/5] Using Risk Confidence Threshold: {confidence_threshold:.2f} (Medium > {medium_risk_threshold:.2f})")

def get_risk_level(prob: float) -> str:
    if prob >= confidence_threshold:
        return "High"
    elif prob >= medium_risk_threshold:
        return "Medium"
    return "Low"

# ─── Load Data ───────────────────────────────────────────────────────────────
print("[1/5] Loading dataset and model...")
df = pd.read_csv(DATA_PATH)
df.columns = [
    "CustomerID", "Tenure_Months", "Order_Freq_Month",
    "Discount_Usage_Pct", "Avg_Rating", "Payment_Failures",
    "Support_Calls", "Competitor_Offers_Clicked", "Avg_Delivery_Time",
    "Late_Deliveries", "Monthly_Charges", "Contract_Type", "Payment_Method", "Churn"
]

pipeline = joblib.load(MODEL_PATH)
print(f"    Loaded {len(df):,} customers and trained model.")

# ─── Feature Engineering (same as train_model.py) ────────────────────────────
print("[2/5] Engineering features...")

df["lifetime_value"]       = (df["Tenure_Months"] * df["Order_Freq_Month"]) / 12.0
df["discount_dependency"]  = df["Discount_Usage_Pct"] / 100.0
df["engagement_score"]     = (
    (df["Avg_Rating"] * df["Order_Freq_Month"])
    / (1 + df["Support_Calls"] + df["Late_Deliveries"])
)
max_failures = df["Payment_Failures"].max() + 1
df["payment_reliability"]  = 1.0 - (df["Payment_Failures"] / max_failures)
df["order_freq_trend"]     = df["Order_Freq_Month"] / df["Order_Freq_Month"].max()
df["competitor_exposure"]  = df["Competitor_Offers_Clicked"] / df["Competitor_Offers_Clicked"].max()

X = df[FEATURE_COLS]

# ─── Generate Predictions ─────────────────────────────────────────────────────
print("[3/5] Generating predictions for all customers...")

probs       = pipeline.predict_proba(X)[:, 1]
predictions = pipeline.predict(X)

df["churn_probability"] = np.round(probs, 4)
df["risk_level"]        = [get_risk_level(p) for p in probs]
df["predicted_churn"]   = predictions
df["predicted_rev_loss"] = df["Monthly_Charges"] * df["churn_probability"]

risk_levels: list = df["risk_level"].tolist()
high_risk:   int  = risk_levels.count("High")
medium_risk: int  = risk_levels.count("Medium")
low_risk:    int  = risk_levels.count("Low")

print(f"    High Risk   : {high_risk:,} customers ({high_risk/len(df):.1%})")
print(f"    Medium Risk : {medium_risk:,} customers ({medium_risk/len(df):.1%})")
print(f"    Low Risk    : {low_risk:,} customers ({low_risk/len(df):.1%})")
print(f"    Avg Churn Probability: {probs.mean():.2%}")

# ─── Save predictions.csv ────────────────────────────────────────────────────
print("[4/5] Saving predictions.csv...")

output_cols = [
    "CustomerID", "Tenure_Months", "Order_Freq_Month", "Discount_Usage_Pct",
    "Avg_Rating", "Payment_Failures", "Support_Calls", "Competitor_Offers_Clicked",
    "Avg_Delivery_Time", "Late_Deliveries", "Monthly_Charges", "Contract_Type", "Payment_Method",
    "lifetime_value", "discount_dependency", "engagement_score",
    "payment_reliability", "order_freq_trend", "competitor_exposure",
    "churn_probability", "risk_level", "predicted_churn", "predicted_rev_loss"
]

df[output_cols].to_csv(PREDICTIONS_CSV, index=False)
print(f"    Saved → {PREDICTIONS_CSV}")

# ─── Write to Prisma SQLite DB ────────────────────────────────────────────────
print("[5/5] Writing predictions to SQLite database...")

if not os.path.exists(DB_PATH):
    print(f"    WARNING: Database not found at {DB_PATH}")
    print("    Please run 'npx prisma migrate dev' first to create the database.")
    print("    Skipping DB write — predictions.csv was saved successfully.")
else:
    now_iso = datetime.now(timezone.utc).isoformat()
    
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    
    # Check if Customer table exists (migration may not have run yet)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Customer'")
    if not cur.fetchone():
        print("    WARNING: 'Customer' table not found in DB.")
        print("    Please run 'npx prisma migrate dev' and then re-run this script.")
        conn.close()
    else:
        good_rows: list = []
        bad_rows:  list = []

        for _, row in df.iterrows():
            try:
                good_rows.append((
                    str(row["CustomerID"]),
                    int(row["Tenure_Months"]),
                    float(row["Order_Freq_Month"]),
                    float(row["Discount_Usage_Pct"]),
                    float(row["Avg_Rating"]),
                    int(row["Payment_Failures"]),
                    int(row["Support_Calls"]),
                    int(row["Competitor_Offers_Clicked"]),
                    float(row["Avg_Delivery_Time"]),
                    int(row["Late_Deliveries"]),
                    float(row["churn_probability"]),
                    str(row["risk_level"]),
                    int(row["predicted_churn"]),
                    float(row["Monthly_Charges"]),
                    str(row["Contract_Type"]),
                    str(row["Payment_Method"]),
                    float(round(row["predicted_rev_loss"], 4)),
                    float(round(row["lifetime_value"], 4)),
                    float(round(row["discount_dependency"], 4)),
                    float(round(row["engagement_score"], 4)),
                    float(round(row["payment_reliability"], 4)),
                    now_iso,
                    now_iso,
                ))
            except Exception as e:
                bad_rows.append(str(row["CustomerID"]))
                if len(bad_rows) <= 3:
                    print(f"    Error building row {row['CustomerID']}: {e}")

        cur.executemany("""
            INSERT OR REPLACE INTO Customer (
                id, tenure, orderFreqMonth, discountUsagePct,
                avgRating, paymentFailures, supportCalls, competitorOffers,
                avgDeliveryTime, lateDeliveries,
                churnProbability, riskLevel, predictedChurn,
                monthlyCharges, contractType, paymentMethod, predictedRevLoss,
                lifetimeValue, discountDependency, engagementScore, paymentReliability,
                predictedAt, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, good_rows)

        upserted: int = len(good_rows)
        errors:   int = len(bad_rows)
        
        conn.commit()
        conn.close()
        
        print(f"    Upserted {upserted:,} customers into DB  ({errors} errors)")
    
    # Also write ModelMetrics if table exists
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ModelMetrics'")
    if cur.fetchone() and os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            m = json.load(f)
        
        import time
        cur.execute("""
            INSERT INTO ModelMetrics (id, version, accuracy, precision, recall, f1Score, rocAuc, trainedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            f"metrics_{int(time.time())}",
            f"v{int(time.time())}",
            m["accuracy"],
            m["precision"],
            m["recall"],
            m["f1_score"],
            m["roc_auc"],
            m["trained_at"]
        ))
        conn.commit()
        print(f"    Saved ModelMetrics to DB")
    conn.close()

print()
print("=" * 50)
print(f"  ✓ Batch prediction complete for {len(df):,} customers")
print(f"  ✓ High Risk: {high_risk} | Medium: {medium_risk} | Low: {low_risk}")
print(f"  ✓ Output: {PREDICTIONS_CSV}")
print("=" * 50)
