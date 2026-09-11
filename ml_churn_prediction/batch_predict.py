"""
batch_predict.py
----------------
Loads the trained churn_model.pkl, runs batch predictions on ml_schema_ready.csv,
and writes results to predictions.csv AND the Prisma SQLite database.

Dataset:  ml_schema_ready.csv  (6 features + churn label)
Model:    models/churn_model.pkl  (StandardScaler + XGBoost Pipeline)

Outputs:
  predictions.csv       — CSV with customer_id, probabilities, risk tier & features
  dev.db / Customer     — Upserted via INSERT OR REPLACE (idempotent, no duplicates)
  dev.db / ModelMetrics — One row per run recording evaluation metrics

Batch Processing:
  Records are inserted in configurable batches (default: BATCH_SIZE = 500).
  Duplicate protection: INSERT OR REPLACE keyed on Customer.id — re-running is safe.
"""

import os
import csv
import json
import logging
import sqlite3
import sys
import time
from datetime import datetime, timezone
from typing import Iterator

import joblib
import numpy as np
import pandas as pd
import shap
from dotenv import load_dotenv

# ─── Structured Logging ───────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from logger import log_event
except ImportError:
    try:
        from ml_churn_prediction.logger import log_event
    except ImportError:
        def log_event(event: str, data: dict = None, level: str = "INFO"):
            print(json.dumps({"event": event, "timestamp": datetime.now(timezone.utc).isoformat(), "data": data or {}}))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("batch_predict")

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR            = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR         = os.path.dirname(BASE_DIR)

# Load environment configuration
load_dotenv(os.path.join(PROJECT_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_DIR, ".env.local"))

TURSO_DATABASE_URL  = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN    = os.getenv("TURSO_AUTH_TOKEN")

# New Telco schema dataset (produced by map_to_ml_schema.py)
SCHEMA_DATA_PATH    = os.path.join(BASE_DIR, "ml_schema_ready.csv")
# Raw Telco dataset — used only to retrieve original customerID strings
RAW_DATA_PATH       = os.path.join(PROJECT_DIR, "raw_customer_data.csv")

MODEL_PATH          = os.path.join(BASE_DIR, "models", "churn_model.pkl")
METRICS_PATH        = os.path.join(BASE_DIR, "models", "metrics.json")
THRESHOLD_PATH      = os.path.join(BASE_DIR, "models", "threshold.json")
BASELINE_PROBS_PATH = os.path.join(BASE_DIR, "models", "baseline_probabilities.json")
PREDICTIONS_CSV     = os.path.join(BASE_DIR, "predictions.csv")
DB_PATH             = os.path.join(PROJECT_DIR, "dev.db")

# ─── Feature columns (must match train_model.py exactly) ──────────────────────
FEATURE_COLS = [
    "tenure_months",
    "monthly_charges",
    "contract_type",
    "payment_method",
    "engagement_score",
    "payment_reliability",
]
TARGET_COL = "churn"

# ─── Ordinal → human-readable label maps (inverse of map_to_ml_schema.py) ─────
CONTRACT_LABELS = {0: "Month-to-Month", 1: "1-Year", 2: "2-Year"}
PAYMENT_LABELS  = {
    0: "Electronic Check",
    1: "Mailed Check",
    2: "Bank Transfer",
    3: "Credit Card",
}

# ─── Configuration ────────────────────────────────────────────────────────────
BATCH_SIZE        = 500    # rows per SQLite executemany call

# Dynamic threshold loader (cost-benefit business optimized)
def load_optimal_threshold(default_threshold: float = 0.5) -> float:
    """Loads optimal threshold from models/threshold.json with fallback."""
    paths = [
        THRESHOLD_PATH,
        os.path.join(BASE_DIR, "threshold.json"),
        os.path.join(PROJECT_DIR, "ml_churn_prediction", "models", "threshold.json"),
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r") as f:
                    data = json.load(f)
                    val = data.get("optimal_threshold") or data.get("threshold")
                    if val is not None and 0.0 < float(val) < 1.0:
                        return float(val)
            except Exception:
                continue
    return default_threshold

PREDICT_THRESHOLD = load_optimal_threshold(0.5)

# Risk tier thresholds — read from SystemSettings at runtime if available
DEFAULT_HIGH_THRESHOLD   = 0.75
DEFAULT_MEDIUM_THRESHOLD = 0.375


# ─── PSI Drift Detection ─────────────────────────────────────────────────────
def calculate_psi(expected: np.ndarray | list, actual: np.ndarray | list, bins: int = 10) -> float:
    """
    Computes Population Stability Index (PSI) between baseline and production probabilities:
      PSI = sum((actual - expected) * ln(actual / expected))
    Uses 10 uniform buckets across [0.0, 1.0] with Laplace smoothing (eps=1e-4) to prevent log(0).
    """
    exp_arr = np.array(expected, dtype=float)
    act_arr = np.array(actual, dtype=float)

    bin_edges = np.linspace(0.0, 1.0, bins + 1)
    exp_counts, _ = np.histogram(exp_arr, bins=bin_edges)
    act_counts, _ = np.histogram(act_arr, bins=bin_edges)

    eps = 1e-4
    exp_pct = (exp_counts + eps) / (len(exp_arr) + eps * bins)
    act_pct = (act_counts + eps) / (len(act_arr) + eps * bins)

    psi = float(np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct)))
    return round(psi, 4)


def evaluate_drift(actual_probs: np.ndarray | list) -> tuple[float, str]:
    """
    Evaluates drift by comparing actual batch probabilities against baseline training probabilities.
    Returns (psi_score, drift_status) where drift_status is 'DRIFT_DETECTED' if PSI > 0.25 else 'STABLE'.
    """
    expected_probs = None
    if os.path.exists(BASELINE_PROBS_PATH):
        try:
            with open(BASELINE_PROBS_PATH, "r") as f:
                data = json.load(f)
                expected_probs = data.get("baseline_probabilities")
        except Exception as exc:
            logger.warning(f"Could not load baseline probabilities: {exc}")

    if expected_probs is None or len(expected_probs) == 0:
        logger.info("    Baseline probabilities file not found; using actual batch as initial baseline.")
        expected_probs = actual_probs

    psi_score = calculate_psi(expected_probs, actual_probs, bins=10)
    drift_status = "DRIFT_DETECTED" if psi_score > 0.25 else "STABLE"

    log_event("drift_calculation", {
        "psi": psi_score,
        "status": drift_status,
        "threshold": 0.25,
        "expected_count": len(expected_probs),
        "actual_count": len(actual_probs),
    })

    return psi_score, drift_status


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _batched(iterable: list, n: int) -> Iterator[list]:
    """Yields successive n-sized chunks from iterable."""
    for i in range(0, len(iterable), n):
        yield iterable[i : i + n]


def get_db_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    """
    Returns a concurrency-safe database connection configured with:
      - WAL (Write-Ahead Logging) mode to prevent reader-writer lock contention
      - synchronous = NORMAL for high-throughput safe execution
      - busy_timeout = 10,000ms to gracefully wait during concurrent operations
      - timeout = 30.0s
    """
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    return conn


def _read_system_thresholds(db_path: str) -> tuple[float, float]:
    """
    Reads confidenceThreshold from SystemSettings (if the table exists).
    Falls back to defaults so the script is safe before any DB migration.
    """
    high = DEFAULT_HIGH_THRESHOLD
    medium = DEFAULT_MEDIUM_THRESHOLD
    if not os.path.exists(db_path):
        return high, medium
    try:
        conn = get_db_connection(db_path)
        cur  = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='SystemSettings'"
        )
        if cur.fetchone():
            cur.execute(
                "SELECT confidenceThreshold FROM SystemSettings WHERE id='global'"
            )
            row = cur.fetchone()
            if row:
                high   = float(row[0])
                medium = high / 2.0
        conn.close()
    except Exception as exc:
        logger.warning(f"Failed to read SystemSettings: {exc}")
    return high, medium


def _risk_label(prob: float, high_thr: float, med_thr: float) -> str:
    if prob >= high_thr:
        return "High"
    if prob >= med_thr:
        return "Medium"
    return "Low"


def _classify_trend(velocity: float) -> str:
    """Classify churn velocity into a human-readable trend label."""
    if velocity > 0.10:
        return "Rapidly Increasing Risk"
    if velocity > 0.02:
        return "Increasing Risk"
    if velocity < -0.10:
        return "Strongly Improving"
    if velocity < -0.02:
        return "Improving"
    return "Stable"


def _fetch_existing_probabilities(db_path: str) -> dict[str, float]:
    """
    Fetches the current churnProbability for every Customer row.
    Returns a dict of {customer_id: churnProbability}.
    Returns empty dict if the DB or table doesn't exist yet (first run).
    """
    if not os.path.exists(db_path):
        return {}
    try:
        conn = get_db_connection(db_path)
        cur  = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Customer'"
        )
        if not cur.fetchone():
            conn.close()
            return {}
        cur.execute("SELECT id, churnProbability FROM Customer")
        mapping = {row[0]: float(row[1]) for row in cur.fetchall()}
        conn.close()
        logger.info(f"    ✓ Pre-fetched {len(mapping):,} existing churn probabilities for velocity calc.")
        return mapping
    except Exception as exc:
        logger.warning(f"    Failed to fetch existing probabilities: {exc}")
        return {}


def format_factor_label(feat: str, val: float, impact: float) -> str:
    """Formats human-readable factor label with percentage impact."""
    pct = f"+{int(round(impact * 100))}%" if impact > 0 else f"{int(round(impact * 100))}%"
    if feat == "contract_type":
        contract_name = CONTRACT_LABELS.get(int(val), "contract")
        return f"{contract_name} contract ({pct})"
    elif feat == "tenure_months":
        return f"low tenure of {int(val)}mo ({pct})" if impact > 0 else f"high tenure of {int(val)}mo ({pct})"
    elif feat == "monthly_charges":
        return f"high monthly charges ({pct})" if impact > 0 else f"lower monthly charges ({pct})"
    elif feat == "payment_method":
        pay_name = PAYMENT_LABELS.get(int(val), "payment method")
        return f"{pay_name} ({pct})"
    elif feat == "engagement_score":
        return f"low engagement score ({pct})" if impact > 0 else f"strong engagement ({pct})"
    elif feat == "payment_reliability":
        return f"low payment reliability ({pct})" if impact > 0 else f"high payment reliability ({pct})"
    return f"{feat.replace('_', ' ')} ({pct})"


def compute_shap_explanations(
    pipeline: object,
    X_df: pd.DataFrame,
    churn_probs: np.ndarray,
) -> tuple[list[str], list[list[dict]], list[str]]:
    """
    Replaces all hardcoded if/else logic with dynamic TreeExplainer SHAP attributions.
    Extracts top 2-3 positive SHAP contributors per prediction and maps them
    to human-readable sentences and structured topFactors.
    """
    logger.info("    Computing SHAP TreeExplainer feature attributions for batch...")
    xgb_model = pipeline.named_steps.get("model") if hasattr(pipeline, "named_steps") else pipeline
    scaler = pipeline.named_steps.get("scaler") if hasattr(pipeline, "named_steps") else None

    X_scaled = scaler.transform(X_df) if scaler is not None else X_df.values

    explainer = shap.TreeExplainer(xgb_model)
    shap_vals = explainer.shap_values(X_scaled)

    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1]

    churn_reasons: list[str] = []
    top_factors_list: list[list[dict]] = []
    retention_actions: list[str] = []

    for i in range(len(X_df)):
        sv = shap_vals[i]
        tot = float(np.sum(np.abs(sv)))
        row = X_df.iloc[i]
        prob = float(churn_probs[i])

        factors = []
        for feat, raw in zip(FEATURE_COLS, sv):
            imp = round(float(raw) / tot, 2) if tot > 0 else 0.0
            factors.append({
                "feature": feat,
                "impact": imp,
                "raw": float(raw),
                "val": row[feat],
            })

        sorted_by_abs = sorted(factors, key=lambda x: abs(x["raw"]), reverse=True)
        top_3 = [{"feature": x["feature"], "impact": x["impact"]} for x in sorted_by_abs[:3]]
        top_factors_list.append(top_3)

        if prob >= 0.75:
            risk_prefix = "High churn risk"
        elif prob >= 0.375:
            risk_prefix = "Moderate churn risk"
        else:
            risk_prefix = "Low churn risk"

        # Filter for positive contributors (factors elevating churn risk)
        pos_factors = [x for x in sorted_by_abs if x["impact"] > 0]

        if pos_factors:
            chosen = pos_factors[:2]
            labels = [format_factor_label(x["feature"], x["val"], x["impact"]) for x in chosen]
            if len(labels) == 1:
                reason = f"{risk_prefix} driven by {labels[0]}."
            else:
                reason = f"{risk_prefix} driven by {labels[0]} and {labels[1]}."
            primary_driver = chosen[0]["feature"]
        else:
            # Low churn risk: supported by top protective features (negative SHAP)
            chosen = sorted_by_abs[:2]
            labels = [format_factor_label(x["feature"], x["val"], x["impact"]) for x in chosen]
            reason = f"{risk_prefix} supported by {labels[0]} and {labels[1]}."
            primary_driver = None

        churn_reasons.append(reason)

        # Dynamic retention action mapped to primary risk factor
        if prob >= 0.375 and primary_driver:
            if primary_driver == "contract_type":
                action = "Offer multi-month incentive to lock in long-term contract"
            elif primary_driver == "tenure_months":
                action = "Initiate high-touch onboarding check-in to secure early adoption"
            elif primary_driver == "monthly_charges":
                action = "Provide customized plan tier optimization or temporary discount"
            elif primary_driver in ("payment_method", "payment_reliability"):
                action = "Incentivize migration to automated card/bank payment schedule"
            elif primary_driver == "engagement_score":
                action = "Deploy targeted product feature walkthrough and re-engagement campaign"
            else:
                action = "Schedule proactive account review with retention specialist"
        else:
            action = "Maintain standard engagement and monitor activity"

        retention_actions.append(action)

    return churn_reasons, top_factors_list, retention_actions



# ─── Step 1: Load Model & Data ────────────────────────────────────────────────
def load_inputs() -> tuple[object, pd.DataFrame, pd.DataFrame]:
    """
    Returns (pipeline, schema_df, raw_df).
    schema_df — the 6-feature ML-ready dataset used for inference.
    raw_df    — the original Telco CSV used only for customerID strings.
    """
    logger.info("[1/5] Loading model and datasets...")

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model not found: {MODEL_PATH}\n"
            "Run train_model.py first to generate churn_model.pkl."
        )
    pipeline = joblib.load(MODEL_PATH)
    logger.info(f"    ✓ Model loaded: {MODEL_PATH}")

    if not os.path.exists(SCHEMA_DATA_PATH):
        raise FileNotFoundError(
            f"Dataset not found: {SCHEMA_DATA_PATH}\n"
            "Run map_to_ml_schema.py first to generate ml_schema_ready.csv."
        )
    schema_df = pd.read_csv(SCHEMA_DATA_PATH)
    logger.info(f"    ✓ Schema dataset loaded: {len(schema_df):,} rows")

    # Load raw dataset for customer IDs (index-aligned with schema_df)
    raw_df = None
    if os.path.exists(RAW_DATA_PATH):
        raw_df = pd.read_csv(RAW_DATA_PATH)[["customerID"]].reset_index(drop=True)
        if len(raw_df) != len(schema_df):
            logger.warning(
                f"Row count mismatch — raw: {len(raw_df)}, schema: {len(schema_df)}. "
                "Synthetic IDs will be generated."
            )
            raw_df = None
    else:
        logger.warning(f"Raw dataset not found at {RAW_DATA_PATH}. Using synthetic IDs.")

    return pipeline, schema_df, raw_df


# ─── Step 2: Predict ──────────────────────────────────────────────────────────
def generate_predictions(
    pipeline: object,
    schema_df: pd.DataFrame,
    raw_df: pd.DataFrame | None,
    high_thr: float,
    med_thr: float,
    existing_probs: dict[str, float] | None = None,
) -> pd.DataFrame:
    """
    Runs model inference on FEATURE_COLS and attaches:
      customer_id         — from raw_df or synthetic TELCO-{i:05d}
      churn_probability   — raw model probability [0, 1]
      predicted_churn     — binary 0/1 at PREDICT_THRESHOLD
      risk_level          — High / Medium / Low
      predicted_rev_loss  — monthly_charges × churn_probability
      contract_type_label — human-readable contract string
      payment_method_label— human-readable payment string
    """
    logger.info("[2/5] Running batch inference...")

    X = schema_df[FEATURE_COLS].copy()

    predict_threshold = load_optimal_threshold(PREDICT_THRESHOLD)
    churn_probs   = pipeline.predict_proba(X)[:, 1]
    predicted     = (churn_probs >= predict_threshold).astype(int)

    logger.info(f"    Inference complete on {len(X):,} records using threshold={predict_threshold:.2f}.")

    result = schema_df.copy()

    # Customer IDs
    if raw_df is not None:
        result["customer_id"] = raw_df["customerID"].values
    else:
        result["customer_id"] = [f"TELCO-{i:05d}" for i in range(len(result))]

    churn_reasons, top_factors_list, retention_actions = compute_shap_explanations(pipeline, X, churn_probs)

    result["churn_probability"]    = np.round(churn_probs, 6)
    result["predicted_churn"]      = predicted
    result["risk_level"]           = [_risk_label(p, high_thr, med_thr) for p in churn_probs]
    result["churn_reason"]         = churn_reasons
    result["top_factors"]          = [json.dumps(tf) for tf in top_factors_list]
    customer_values = result["monthly_charges"] * result["tenure_months"]
    result["customer_value"]       = customer_values
    result["retention_action"]     = retention_actions
    result["predicted_rev_loss"]   = np.round(result["monthly_charges"] * churn_probs, 4)
    result["contract_type_label"]  = result["contract_type"].map(CONTRACT_LABELS)
    result["payment_method_label"] = result["payment_method"].map(PAYMENT_LABELS)

    # ── Churn Velocity ───────────────────────────────────────────────────────
    prev_probs: list[float | None] = []
    velocities: list[float]        = []
    trends: list[str]              = []

    ep = existing_probs or {}
    for cid, new_prob in zip(result["customer_id"], churn_probs):
        prev = ep.get(str(cid))        # None on first run
        prev_probs.append(prev)
        velocity = round(float(new_prob) - float(prev), 6) if prev is not None else 0.0
        velocities.append(velocity)
        trends.append(_classify_trend(velocity))

    result["previous_churn_probability"] = prev_probs
    result["churn_velocity"]             = velocities
    result["churn_trend"]                = trends

    n_increasing = sum(1 for t in trends if "Increasing" in t)
    n_improving  = sum(1 for t in trends if "Improving" in t)
    n_stable     = sum(1 for t in trends if t == "Stable")
    logger.info(
        f"    Velocity — Increasing: {n_increasing:,} | "
        f"Stable: {n_stable:,} | Improving: {n_improving:,}"
    )

    # Stats
    n_high   = (result["risk_level"] == "High").sum()
    n_medium = (result["risk_level"] == "Medium").sum()
    n_low    = (result["risk_level"] == "Low").sum()
    logger.info(f"    Risk tiers  — High: {n_high:,} | Medium: {n_medium:,} | Low: {n_low:,}")
    logger.info(f"    Avg churn probability : {churn_probs.mean():.2%}")
    logger.info(f"    Predicted churners    : {predicted.sum():,} / {len(predicted):,} "
                f"({predicted.mean():.1%}) at optimal threshold={predict_threshold:.2f}")

    return result


# ─── Step 3: Save predictions.csv ─────────────────────────────────────────────
def save_predictions_csv(result: pd.DataFrame) -> None:
    """Writes the full prediction output to predictions.csv."""
    logger.info("[3/5] Writing predictions.csv...")

    export_cols = [
        "customer_id",
        "tenure_months",
        "monthly_charges",
        "contract_type",
        "contract_type_label",
        "payment_method",
        "payment_method_label",
        "engagement_score",
        "payment_reliability",
        "churn_probability",
        "predicted_churn",
        "risk_level",
        "churn_reason",
        "retention_action",
        "top_factors",
        "predicted_rev_loss",
        "churn",
    ]

    result[export_cols].to_csv(PREDICTIONS_CSV, index=False)
    logger.info(f"    ✓ Saved → {PREDICTIONS_CSV}")


# ─── Step 4: Upsert into SQLite DB ────────────────────────────────────────────
def upsert_to_database(result: pd.DataFrame) -> dict:
    """
    Inserts/updates Customer rows in the Prisma SQLite database in batches.

    Strategy:
      - INSERT OR REPLACE keyed on Customer.id (= customerID string)
      - Re-running this script is fully idempotent — no duplicate rows.
      - Legacy NOT NULL columns that don't exist in the Telco schema
        (orderFreqMonth, discountUsagePct, avgRating, paymentFailures,
         supportCalls, competitorOffers, avgDeliveryTime, lateDeliveries)
        are filled with 0 / 0.0. The Prisma schema enforces NOT NULL with no
        default for these columns, so we must supply a value.

    Batch size: BATCH_SIZE rows per executemany call.
    """
    logger.info("[4/5] Upserting predictions into SQLite database...")

    stats = {"inserted": 0, "skipped": 0, "errors": 0, "batches": 0}

    if not os.path.exists(DB_PATH):
        logger.warning(
            f"Database not found at {DB_PATH}. "
            "Run 'npx prisma migrate dev' to create it. Skipping DB write."
        )
        return stats

    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_db_connection(DB_PATH)
    cur  = conn.cursor()

    # Guard: ensure Customer table exists
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='Customer'"
    )
    if not cur.fetchone():
        logger.warning(
            "Customer table not found. Run 'npx prisma migrate dev' first."
        )
        conn.close()
        return stats

    # Check for existing IDs to log new-vs-updated breakdown
    cur.execute("SELECT id FROM Customer")
    existing_ids = {row[0] for row in cur.fetchall()}
    logger.info(f"    DB currently holds {len(existing_ids):,} Customer rows.")

    # ── Prediction History Tracking ──────────────────────────────────────────
    # Ensure CustomerPredictionHistory table exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS CustomerPredictionHistory (
            id TEXT NOT NULL PRIMARY KEY,
            customerId TEXT NOT NULL,
            churnProbability REAL NOT NULL,
            predictedChurn INTEGER NOT NULL DEFAULT 0,
            churnVelocity REAL NOT NULL DEFAULT 0,
            churnTrend TEXT NOT NULL DEFAULT 'Stable',
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customerId) REFERENCES Customer (id) ON DELETE CASCADE ON UPDATE CASCADE
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS CustomerPredictionHistory_customerId_idx 
        ON CustomerPredictionHistory(customerId)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS CustomerPredictionHistory_customerId_createdAt_idx 
        ON CustomerPredictionHistory(customerId, createdAt DESC)
    """)

    # BEFORE updating Customer: snapshot previous predictions into history table
    if existing_ids:
        cur.execute("""
            INSERT INTO CustomerPredictionHistory (
                id, customerId, churnProbability, predictedChurn, churnVelocity, churnTrend, createdAt
            )
            SELECT 
                'cph_' || id || '_' || hex(randomblob(6)),
                id,
                churnProbability,
                predictedChurn,
                churnVelocity,
                churnTrend,
                COALESCE(predictedAt, CURRENT_TIMESTAMP)
            FROM Customer
            WHERE churnProbability IS NOT NULL
        """)
        archived_count = cur.rowcount
        conn.commit()
        logger.info(f"    ✓ Archived {archived_count:,} previous customer predictions to CustomerPredictionHistory.")

    # Build row tuples
    rows: list[tuple] = []
    bad_ids: list[str] = []


    for _, row in result.iterrows():
        try:
            prev_prob = row.get("previous_churn_probability")
            prev_prob_val = None if (prev_prob is None or (isinstance(prev_prob, float) and np.isnan(prev_prob))) else float(round(prev_prob, 6))

            rows.append((
                # ── Identity ──────────────────────────────────────
                str(row["customer_id"]),

                # ── Core features (tenure_months → tenure) ────────
                int(row["tenure_months"]),

                # ── Legacy NOT NULL fields — Telco dataset doesn't have these;
                #    fill with 0 / 0.0 so the DB constraint is satisfied.
                0.0,   # orderFreqMonth
                0.0,   # discountUsagePct
                0.0,   # avgRating
                0,     # paymentFailures
                0,     # supportCalls
                0,     # competitorOffers
                0.0,   # avgDeliveryTime
                0,     # lateDeliveries

                # ── Prediction outputs ────────────────────────────
                float(round(row["churn_probability"],  6)),
                str(row["risk_level"]),
                int(row["predicted_churn"]),
                str(row["churn_reason"]),
                str(row["retention_action"]),
                str(row.get("top_factors", "[]")),

                # ── Velocity tracking ─────────────────────────────
                prev_prob_val,                              # previousChurnProbability (NULL on first run)
                float(round(row["churn_velocity"], 6)),    # churnVelocity
                str(row["churn_trend"]),                   # churnTrend

                # ── Enterprise fields ─────────────────────────────
                float(row["monthly_charges"]),
                str(row["contract_type_label"]),
                str(row["payment_method_label"]),
                float(round(row["predicted_rev_loss"], 4)),

                # ── Engineered features ───────────────────────────
                0.0,   # lifetimeValue  (not applicable in new schema)
                0.0,   # discountDependency (not applicable in new schema)
                float(round(row["engagement_score"],    6)),
                float(round(row["payment_reliability"], 6)),
                0.0,   # orderFreqTrend (not applicable in new schema)
                0.0,   # competitorExposure (not applicable in new schema)

                # ── Timestamps ────────────────────────────────────
                now_iso,   # predictedAt
                now_iso,   # createdAt
            ))
        except Exception as exc:
            bad_ids.append(str(row.get("customer_id", "UNKNOWN")))
            if len(bad_ids) <= 5:
                logger.error(f"    Row build error ({row.get('customer_id')}): {exc}")

    # Batch upsert
    upsert_sql = """
        INSERT OR REPLACE INTO Customer (
            id, tenure,
            orderFreqMonth, discountUsagePct, avgRating,
            paymentFailures, supportCalls, competitorOffers,
            avgDeliveryTime, lateDeliveries,
            churnProbability, riskLevel, predictedChurn, churnReason, retentionAction, topFactors,
            previousChurnProbability, churnVelocity, churnTrend,
            monthlyCharges, contractType, paymentMethod, predictedRevLoss,
            lifetimeValue, discountDependency,
            engagementScore, paymentReliability,
            orderFreqTrend, competitorExposure,
            predictedAt, createdAt
        ) VALUES (
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?
        )
    """

    for batch_num, batch in enumerate(_batched(rows, BATCH_SIZE), start=1):
        try:
            cur.executemany(upsert_sql, batch)
            conn.commit()
            stats["inserted"] += len(batch)
            stats["batches"]  += 1
            logger.info(
                f"    Batch {batch_num:>3} — upserted {len(batch):>4} rows "
                f"| cumulative: {stats['inserted']:,}"
            )
        except sqlite3.Error as exc:
            logger.error(f"    Batch {batch_num} failed: {exc}")
            stats["errors"] += len(batch)

    stats["skipped"] = len(bad_ids)

    # Report new vs. updated
    cur.execute("SELECT id FROM Customer")
    final_ids = {row[0] for row in cur.fetchall()}
    new_count = len(final_ids - existing_ids)
    upd_count = stats["inserted"] - new_count

    conn.close()

    logger.info(f"    ✓ Upsert complete — {new_count:,} inserted | {upd_count:,} updated | {stats['skipped']} skipped")
    if bad_ids:
        logger.warning(f"    {len(bad_ids)} rows skipped due to errors. First 5: {bad_ids[:5]}")

    return stats


# ─── Step 5: Write ModelMetrics ───────────────────────────────────────────────
def save_model_metrics(drift_score: float = 0.0, drift_status: str = "STABLE") -> None:
    """
    Appends a new ModelMetrics row to the database from models/metrics.json,
    including Population Stability Index (PSI) drift score and status.
    This is displayed on the Model Performance dashboard page.
    """
    logger.info(f"[5/5] Writing ModelMetrics to database (PSI={drift_score:.4f}, Status={drift_status})...")

    if not os.path.exists(DB_PATH) or not os.path.exists(METRICS_PATH):
        logger.warning("    Skipping — DB or metrics.json not found.")
        return

    try:
        with open(METRICS_PATH) as f:
            m = json.load(f)
    except (json.JSONDecodeError, IOError) as exc:
        logger.error(f"    Failed to read metrics.json: {exc}")
        return

    conn = get_db_connection(DB_PATH)
    cur  = conn.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ModelMetrics'"
    )
    if not cur.fetchone():
        logger.warning("    ModelMetrics table not found. Skipping.")
        conn.close()
        return

    # Ensure schema columns driftScore and driftStatus exist
    cur.execute("PRAGMA table_info(ModelMetrics)")
    cols = {row[1] for row in cur.fetchall()}
    if "driftScore" not in cols:
        try:
            cur.execute("ALTER TABLE ModelMetrics ADD COLUMN driftScore REAL DEFAULT 0")
        except Exception:
            pass
    if "driftStatus" not in cols:
        try:
            cur.execute("ALTER TABLE ModelMetrics ADD COLUMN driftStatus TEXT DEFAULT 'STABLE'")
        except Exception:
            pass

    run_id  = f"metrics_{int(time.time())}"
    version = m.get("trained_at", datetime.now(timezone.utc).isoformat())

    cur.execute("""
        INSERT INTO ModelMetrics (
            id, version, accuracy, precision, recall, f1Score, rocAuc,
            driftScore, driftStatus, trainedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        run_id,
        version,
        float(m.get("accuracy",  0)),
        float(m.get("precision", 0)),
        float(m.get("recall",    0)),
        float(m.get("f1_score",  0)),
        float(m.get("roc_auc",   0)),
        float(drift_score),
        str(drift_status),
        m.get("trained_at", datetime.now(timezone.utc).isoformat()),
    ))
    conn.commit()
    conn.close()
    logger.info(f"    ✓ ModelMetrics row inserted (id={run_id}, driftScore={drift_score}, driftStatus={drift_status})")


# ─── Orchestrator ─────────────────────────────────────────────────────────────
def main() -> None:
    start_time = time.time()
    border = "=" * 56

    # Emit structured batch start event
    log_event("batch_start", {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "batch_size": BATCH_SIZE,
        "dataset": SCHEMA_DATA_PATH,
        "configured_threshold": PREDICT_THRESHOLD,
    })

    logger.info(border)
    logger.info("  CHURN PREDICTION — BATCH INFERENCE PIPELINE")
    logger.info(border)

    try:
        # Read risk thresholds from DB SystemSettings
        high_thr, med_thr = _read_system_thresholds(DB_PATH)
        logger.info(f"[0/5] Risk thresholds — High ≥ {high_thr:.2f} | Medium ≥ {med_thr:.2f}")

        # 1. Load
        pipeline, schema_df, raw_df = load_inputs()

        # 1b. Pre-fetch existing churn probabilities for velocity tracking
        existing_probs = _fetch_existing_probabilities(DB_PATH)

        # 2. Predict
        result = generate_predictions(pipeline, schema_df, raw_df, high_thr, med_thr, existing_probs)

        # 2b. Drift Detection (Population Stability Index - PSI)
        actual_probs = result["churn_probability"].values
        psi_score, drift_status = evaluate_drift(actual_probs)
        logger.info(f"    ✓ Drift Monitoring: PSI={psi_score:.4f} | Status={drift_status}")

        # 3. CSV
        save_predictions_csv(result)

        # 4. DB upsert
        db_stats = upsert_to_database(result)
        log_event("db_upsert", {
            "inserted": db_stats["inserted"],
            "batches": db_stats["batches"],
            "skipped": db_stats["skipped"],
            "errors": db_stats["errors"],
        })

        # 5. Model metrics with drift results
        save_model_metrics(drift_score=psi_score, drift_status=drift_status)

        # ── Summary ───────────────────────────────────────────────────────────
        elapsed = time.time() - start_time
        n_high   = int((result["risk_level"] == "High").sum())
        n_medium = int((result["risk_level"] == "Medium").sum())
        n_low    = int((result["risk_level"] == "Low").sum())
        n_predicted_churn = int(result["predicted_churn"].sum())

        # Emit structured batch end event
        log_event("batch_end", {
            "elapsed_seconds": round(elapsed, 2),
            "total_customers": len(result),
            "predicted_churners": n_predicted_churn,
            "high_risk": n_high,
            "medium_risk": n_medium,
            "low_risk": n_low,
            "psi": psi_score,
            "drift_status": drift_status,
            "decision_threshold": PREDICT_THRESHOLD,
        })

        print()
        print(border)
        print(f"  ✓ Batch prediction complete — {len(result):,} customers ({elapsed:.1f}s)")
        print(f"  ✓ High Risk   : {n_high:,}  ({n_high/len(result):.1%})")
        print(f"  ✓ Medium Risk : {n_medium:,}  ({n_medium/len(result):.1%})")
        print(f"  ✓ Low Risk    : {n_low:,}  ({n_low/len(result):.1%})")
        print(f"  ✓ Model Drift : PSI = {psi_score:.4f} [{drift_status}]")
        print(f"  ✓ DB upserted : {db_stats['inserted']:,} rows in {db_stats['batches']} batches")
        print(f"  ✓ Output CSV  : {PREDICTIONS_CSV}")
        print(border)

    except Exception as exc:
        log_event("batch_error", {
            "error": str(exc),
            "type": type(exc).__name__,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, level="ERROR")
        logger.exception(f"Batch prediction pipeline execution failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
