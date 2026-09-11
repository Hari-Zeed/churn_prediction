"""
map_to_ml_schema.py
===================
Maps the cleaned Telco Customer Churn dataset to the project's production ML schema.

Columns Mapped:
  tenure                 → tenure_months
  MonthlyCharges         → monthly_charges
  TotalCharges           → total_charges  (used in engineering, then dropped)
  Contract               → contract_type  (ordinal encoded)
  PaymentMethod          → payment_method (ordinal encoded)
  InternetService        → internet_service (used in engagement_score, then dropped)
  Churn                  → churn (binary 0/1)

Engineered Features:
  engagement_score       → captures how deeply a customer is embedded in services
  payment_reliability    → captures likelihood of on-time, stable payment behavior
"""

import re
import sys
import logging
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("SchemaMapper")


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _to_snake(text: str) -> str:
    """Converts arbitrary string to clean snake_case."""
    s = re.sub(r"[\s\-\(\)\/\\\[\]<>]+", "_", str(text).strip())
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    return re.sub(r"_+", "_", s).strip("_").lower()


# ─── Ordinal Encodings ────────────────────────────────────────────────────────
# Contract type is ordered by commitment level:
#   Month-to-month → lowest retention signal (riskiest)
#   Two year       → highest retention signal (safest)
CONTRACT_ORDINAL: dict[str, int] = {
    "month-to-month": 0,
    "one year":       1,
    "two year":       2,
}

# Payment method reliability ranking:
#   Electronic check → highest churn correlation (manual, friction-prone)
#   Mailed check     → manual but lower observed churn
#   Bank transfer    → automatic, passive, lower churn
#   Credit card      → automatic, highest engagement signal
PAYMENT_ORDINAL: dict[str, int] = {
    "electronic check":          0,
    "mailed check":              1,
    "bank transfer (automatic)": 2,
    "credit card (automatic)":   3,
}

# Internet service mapped to a service tier weight:
#   No service → 0  (no digital dependency)
#   DSL        → 1  (moderate engagement)
#   Fiber optic→ 2  (high engagement, also higher churn risk due to higher cost)
INTERNET_WEIGHT: dict[str, float] = {
    "no":          0.0,
    "dsl":         1.0,
    "fiber optic": 2.0,
}

# Boolean-like columns expected to be YES/NO strings in raw data
BOOL_COLS = [
    "PhoneService", "MultipleLines", "OnlineSecurity", "OnlineBackup",
    "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
    "Partner", "Dependents", "PaperlessBilling",
]


def _bool_to_int(series: pd.Series) -> pd.Series:
    """Maps 'Yes'/'No' (and variants like 'No phone service') → 1/0."""
    return (
        series.astype(str)
        .str.strip()
        .str.lower()
        .map(lambda v: 1 if v == "yes" else 0)
    )


# ─── Feature Engineering ──────────────────────────────────────────────────────
def build_engagement_score(df: pd.DataFrame) -> pd.Series:
    """
    Engagement Score — how deeply embedded a customer is in the product ecosystem.

    Rationale:
    - A customer with multiple active services has higher switching cost and
      is therefore less likely to churn despite being more visible as a risk.
    - Customers with security, backup, device protection and tech support have
      a higher "stickiness" — they depend on the provider for core functionality.
    - Streaming services indicate active daily usage, raising exit friction.
    - The internet service tier amplifies the score: fiber-optic customers
      are heavier users even if they churn more due to cost sensitivity.

    Formula (additive service count, weighted by internet tier):
      raw_score = Σ(active services) × (1 + internet_weight × 0.5)
    Score is then MinMax-normalized to [0, 1] per cohort.
    """
    service_cols = [
        "PhoneService", "MultipleLines", "OnlineSecurity", "OnlineBackup",
        "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
    ]
    # Sum of active services (1 per active service)
    active_service_count = sum(_bool_to_int(df[c]) for c in service_cols if c in df.columns)

    # Internet tier multiplier: fiber = 2, DSL = 1, None = 0
    internet_weight = (
        df["InternetService"]
        .astype(str).str.lower().str.strip()
        .map(INTERNET_WEIGHT)
        .fillna(0.0)
    )

    raw_score = active_service_count * (1.0 + internet_weight * 0.5)

    # MinMax normalize to [0.0 – 1.0]
    scaler = MinMaxScaler()
    normalized = scaler.fit_transform(raw_score.values.reshape(-1, 1)).flatten()
    return pd.Series(normalized, index=df.index, name="engagement_score")


def build_payment_reliability(df: pd.DataFrame) -> pd.Series:
    """
    Payment Reliability — probability the customer pays consistently and on time.

    Rationale:
    - Automatic payment methods (bank transfer, credit card) are strongly
      correlated with lower churn because they reduce friction and missed payments.
    - Electronic check requires customer-initiated action each cycle → higher risk.
    - Long-tenure customers have demonstrated financial commitment → reliability ↑.
    - High monthly charges relative to total charges (i.e. short tenure for charge
      level) indicate early-stage, unproven payment behavior → reliability ↓.
    - Paperless billing correlates with digital engagement and lower churn.

    Formula:
      payment_reliability = w1 × payment_ordinal_norm
                          + w2 × tenure_norm
                          + w3 × paperless_billing
                          - w4 × monthly_charge_ratio_penalty

    All sub-scores are normalized to [0, 1] before weighting.
    Final score is clamped and normalized to [0, 1].
    """
    # 1. Payment method ordinal (higher = more reliable automatic method)
    payment_ord = (
        df["PaymentMethod"]
        .astype(str).str.lower().str.strip()
        .map(PAYMENT_ORDINAL)
        .fillna(0)
        .astype(float)
    )
    payment_norm = payment_ord / PAYMENT_ORDINAL["credit card (automatic)"]  # → [0, 1]

    # 2. Tenure normalized (longer tenure → more proven payer)
    tenure = pd.to_numeric(df["tenure"], errors="coerce").fillna(0)
    tenure_norm = (tenure - tenure.min()) / (tenure.max() - tenure.min() + 1e-9)

    # 3. Paperless billing flag (1 = digital / engaged)
    paperless = _bool_to_int(df["PaperlessBilling"]) if "PaperlessBilling" in df.columns else pd.Series(0, index=df.index)

    # 4. Monthly-charge-to-total-charge ratio penalty
    #    If total_charges ≈ monthly_charges → customer is very new → reliability unknown → penalty
    total_charges = pd.to_numeric(df["TotalCharges"].astype(str).str.strip(), errors="coerce").fillna(0.0)
    monthly_charges = pd.to_numeric(df["MonthlyCharges"], errors="coerce").fillna(0.0)
    # Ratio: how much of their total spend is "this month alone" — high ratio = very new customer
    ratio = monthly_charges / (total_charges + 1e-9)
    ratio_penalty = ratio.clip(0, 1)  # bounded [0,1] → new customer = 1.0 penalty

    # Weighted composite score
    raw = (
        0.40 * payment_norm
        + 0.30 * tenure_norm
        + 0.15 * paperless
        - 0.15 * ratio_penalty
    )

    # Final normalization to [0, 1]
    scaler = MinMaxScaler()
    normalized = scaler.fit_transform(raw.values.reshape(-1, 1)).flatten()
    return pd.Series(normalized, index=df.index, name="payment_reliability")


# ─── Schema Mapping ───────────────────────────────────────────────────────────
def map_to_ml_schema(
    input_path: str,
    output_path: str = "ml_schema_ready.csv",
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Loads raw Telco churn CSV, maps columns to the project's ML schema,
    engineers engagement_score and payment_reliability, then outputs
    a clean, model-ready dataframe.

    Target Schema:
        tenure_months       - int    (direct map from tenure)
        monthly_charges     - float  (direct map from MonthlyCharges)
        contract_type       - int    (ordinal: 0=M2M, 1=1Yr, 2=2Yr)
        payment_method      - int    (ordinal: 0=e-check, ... 3=credit card auto)
        engagement_score    - float  (engineered: [0.0, 1.0])
        payment_reliability - float  (engineered: [0.0, 1.0])
        churn               - int    (binary target: 0=No, 1=Yes)

    Returns: pd.DataFrame with schema above.
    """
    # ── Load ──────────────────────────────────────────────────────────────────
    logger.info(f"Loading raw dataset: {input_path}")
    raw = pd.read_csv(input_path)
    logger.info(f"Raw shape: {raw.shape[0]:,} rows × {raw.shape[1]} columns")

    # Standardize column names to snake_case for internal processing
    raw.columns = [_to_snake(c) for c in raw.columns]
    logger.info("Standardized all column names to snake_case.")

    # ── Fix TotalCharges dtype (whitespace-encoded NaN in Telco dataset) ──────
    raw["total_charges"] = pd.to_numeric(
        raw["total_charges"].astype(str).str.strip(), errors="coerce"
    )
    nulls_fixed = raw["total_charges"].isna().sum()
    if nulls_fixed:
        median_tc = raw["total_charges"].median()
        raw["total_charges"].fillna(median_tc, inplace=True)
        logger.info(f"Imputed {nulls_fixed} missing TotalCharges values with median ({median_tc:.2f}).")

    # Reconstruct original-case column names needed for feature builders
    # (our feature functions rely on PascalCase names from the raw dataset)
    col_map_reverse = {_to_snake(c): c for c in [
        "tenure", "MonthlyCharges", "TotalCharges", "Contract", "PaymentMethod",
        "InternetService", "Churn", "PhoneService", "MultipleLines", "OnlineSecurity",
        "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV",
        "StreamingMovies", "Partner", "Dependents", "PaperlessBilling",
    ]}
    # Rename snake_case back to PascalCase for feature builders
    raw_pascal = raw.rename(columns={k: v for k, v in col_map_reverse.items() if k in raw.columns})

    # ── Build Engineered Features ─────────────────────────────────────────────
    logger.info("Engineering feature: engagement_score")
    engagement_score = build_engagement_score(raw_pascal)

    logger.info("Engineering feature: payment_reliability")
    payment_reliability = build_payment_reliability(raw_pascal)

    # ── Map Schema ────────────────────────────────────────────────────────────
    out = pd.DataFrame(index=raw.index)

    # 1. tenure → tenure_months
    out["tenure_months"] = pd.to_numeric(raw_pascal["tenure"], errors="coerce").fillna(0).astype(int)

    # 2. MonthlyCharges → monthly_charges
    out["monthly_charges"] = pd.to_numeric(raw_pascal["MonthlyCharges"], errors="coerce").fillna(0.0).round(4)

    # 3. Contract → contract_type (ordinal encoded)
    out["contract_type"] = (
        raw_pascal["Contract"]
        .astype(str).str.lower().str.strip()
        .map(CONTRACT_ORDINAL)
        .fillna(0)
        .astype(int)
    )

    # 4. PaymentMethod → payment_method (ordinal encoded)
    out["payment_method"] = (
        raw_pascal["PaymentMethod"]
        .astype(str).str.lower().str.strip()
        .map(PAYMENT_ORDINAL)
        .fillna(0)
        .astype(int)
    )

    # 5. Engineered features
    out["engagement_score"]    = engagement_score.round(6)
    out["payment_reliability"] = payment_reliability.round(6)

    # 6. Churn → binary target
    out["churn"] = (
        raw_pascal["Churn"]
        .astype(str).str.strip().str.lower()
        .map({"yes": 1, "no": 0, "1": 1, "0": 0})
        .fillna(0)
        .astype(int)
    )

    # ── Validate ──────────────────────────────────────────────────────────────
    assert out.isnull().sum().sum() == 0, "Schema-mapped dataframe contains unexpected nulls!"
    assert set(out.dtypes.apply(str)) <= {"int64", "int32", "float64", "float32"}, \
        "Non-numeric column detected in output!"

    # ── Save ──────────────────────────────────────────────────────────────────
    out.to_csv(output_path, index=False)
    logger.info(f"Schema-mapped dataframe saved → {output_path}")

    # ── Summary ───────────────────────────────────────────────────────────────
    if verbose:
        _print_summary(raw_pascal, out)

    return out


def _print_summary(raw: pd.DataFrame, out: pd.DataFrame) -> None:
    divider = "─" * 72
    border  = "═" * 72

    print(f"\n{border}")
    print("  SCHEMA MAPPING & FEATURE ENGINEERING SUMMARY")
    print(border)

    print(f"\n COLUMN MAPPING ({raw.shape[1]} raw → {out.shape[1]} schema columns):")
    print(f"  {'Raw Column':<28} {'→'} {'ML Schema Column':<25} {'Type'}")
    print(f"  {divider}")
    mappings = [
        ("tenure",           "tenure_months",       "int   (direct rename)"),
        ("MonthlyCharges",   "monthly_charges",     "float (direct rename)"),
        ("Contract",         "contract_type",       "int   (ordinal: 0-2)"),
        ("PaymentMethod",    "payment_method",      "int   (ordinal: 0-3)"),
        ("[7 service cols]", "engagement_score",    "float [0,1] engineered"),
        ("[tenure+payment]", "payment_reliability", "float [0,1] engineered"),
        ("Churn",            "churn",               "int   (binary 0/1 target)"),
    ]
    for raw_col, schema_col, dtype in mappings:
        print(f"  {raw_col:<28} {'→'} {schema_col:<25} {dtype}")

    print(f"\n COLUMNS DROPPED (not in ML schema):")
    retained_raw = {"tenure", "MonthlyCharges", "TotalCharges", "Contract",
                    "PaymentMethod", "InternetService", "Churn",
                    "PhoneService", "MultipleLines", "OnlineSecurity",
                    "OnlineBackup", "DeviceProtection", "TechSupport",
                    "StreamingTV", "StreamingMovies", "PaperlessBilling",
                    "Partner", "Dependents"}
    dropped = [c for c in raw.columns if c not in retained_raw]
    for col in dropped:
        print(f"   ✗ {col}")
    print(f"   (Also dropped after feature engineering: TotalCharges, InternetService, + 14 service signal cols)")

    print(f"\n ENGINEERED FEATURE DETAIL:")
    print(f"\n  engagement_score [0, 1]:")
    print(f"  Formula:  active_services_count × (1 + internet_weight × 0.5), MinMax normalized")
    print(f"  Inputs:   PhoneService, MultipleLines, OnlineSecurity, OnlineBackup,")
    print(f"            DeviceProtection, TechSupport, StreamingTV, StreamingMovies,")
    print(f"            InternetService (tier weight: No=0, DSL=1, Fiber=2)")
    print(f"  Logic:    More services → higher embedding → harder to churn.")
    print(f"            Fiber optic multiplies engagement (higher daily use).")

    print(f"\n  payment_reliability [0, 1]:")
    print(f"  Formula:  0.40×payment_ordinal_norm + 0.30×tenure_norm")
    print(f"            + 0.15×paperless_billing - 0.15×monthly_charge_ratio_penalty")
    print(f"  Inputs:   PaymentMethod, tenure, PaperlessBilling, MonthlyCharges, TotalCharges")
    print(f"  Logic:    Auto-pay methods → more reliable. Long-tenure proves payment track record.")
    print(f"            Very new customers (TotalCharges ≈ MonthlyCharges) have unproven reliability.")

    print(f"\n FINAL SCHEMA STATISTICS:")
    print(f"  {'Column':<25} {'Min':>8} {'Max':>8} {'Mean':>10} {'Std':>10}")
    print(f"  {divider}")
    for col in out.columns:
        s = out[col]
        print(f"  {col:<25} {s.min():>8.3f} {s.max():>8.3f} {s.mean():>10.4f} {s.std():>10.4f}")

    print(f"\n TARGET CLASS DISTRIBUTION:")
    dist = out["churn"].value_counts()
    total = len(out)
    print(f"  Class 0 (Retained) : {dist[0]:,}  ({dist[0]/total*100:.1f}%)")
    print(f"  Class 1 (Churned)  : {dist[1]:,}  ({dist[1]/total*100:.1f}%)")

    print(f"\n{'═'*72}")
    print(f"  Output shape: {out.shape[0]:,} rows × {out.shape[1]} columns — model-ready ✓")
    print(f"{'═'*72}\n")


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Map Telco Churn dataset to production ML schema.")
    parser.add_argument("--input",  "-i", type=str, default="raw_customer_data.csv")
    parser.add_argument("--output", "-o", type=str, default="ml_schema_ready.csv")
    args = parser.parse_args()

    final_df = map_to_ml_schema(args.input, args.output, verbose=True)
    print(f"  Sample rows:\n{final_df.head(5).to_string()}\n")
