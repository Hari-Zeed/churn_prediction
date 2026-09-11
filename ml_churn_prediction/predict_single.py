#!/usr/bin/env python3
"""
predict_single.py
-----------------
Loads model.pkl (trained XGBoost pipeline) and performs real-time single-instance inference.
Accepts JSON input via sys.argv[1] or stdin.
Outputs JSON with churnProbability, predictedChurn, and riskLevel.
"""

import sys
import os
import json
import joblib
import pandas as pd
import numpy as np
import shap

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

# Possible model file locations in order of preference
MODEL_PATHS = [
    os.path.join(BASE_DIR, "models", "churn_model.pkl"),
    os.path.join(BASE_DIR, "models", "model.pkl"),
    os.path.join(BASE_DIR, "model.pkl"),
    os.path.join(PROJECT_DIR, "model.pkl"),
]

CONTRACT_MAP = {
    "month-to-month": 0,
    "month to month": 0,
    "month_to_month": 0,
    "one year": 1,
    "1-year": 1,
    "1 year": 1,
    "one_year": 1,
    "two year": 2,
    "2-year": 2,
    "2 year": 2,
    "two_year": 2,
}

PAYMENT_MAP = {
    "electronic check": 0,
    "electronic_check": 0,
    "e-check": 0,
    "mailed check": 1,
    "mailed_check": 1,
    "bank transfer (automatic)": 2,
    "bank transfer": 2,
    "bank_transfer": 2,
    "credit card (automatic)": 3,
    "credit card": 3,
    "credit_card": 3,
}

_model_cache = None
_explainer_cache = {}

def load_model():
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    for path in MODEL_PATHS:
        # Security: only load models within trusted BASE_DIR
        resolved = os.path.realpath(path)
        if not resolved.startswith(os.path.realpath(BASE_DIR)) and not resolved.startswith(os.path.realpath(PROJECT_DIR)):
            continue
        if os.path.exists(resolved):
            try:
                _model_cache = joblib.load(resolved)
                return _model_cache
            except Exception:
                continue
    raise FileNotFoundError("Could not find or load a valid model in trusted paths.")

THRESHOLD_PATHS = [
    os.path.join(BASE_DIR, "models", "threshold.json"),
    os.path.join(BASE_DIR, "threshold.json"),
    os.path.join(PROJECT_DIR, "ml_churn_prediction", "models", "threshold.json"),
]

def load_optimal_threshold(default_threshold: float = 0.5) -> float:
    """Loads optimal threshold from models/threshold.json with fallback."""
    for p in THRESHOLD_PATHS:
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

def extract_model_and_scaler(pipeline):
    """
    Extracts the underlying XGBClassifier and StandardScaler from the sklearn Pipeline.
    Supports pipeline.named_steps, positional steps, or standalone models.
    """
    if hasattr(pipeline, "named_steps"):
        xgb_model = pipeline.named_steps.get("model") or pipeline.named_steps.get("xgbclassifier")
        scaler = pipeline.named_steps.get("scaler")
        if xgb_model is None and hasattr(pipeline, "steps") and len(pipeline.steps) > 0:
            xgb_model = pipeline.steps[-1][1]
            scaler = pipeline.steps[0][1] if len(pipeline.steps) > 1 else None
        return xgb_model, scaler
    return pipeline, None

def get_tree_explainer(xgb_model):
    """Caches TreeExplainer for the model instance to minimize inference latency."""
    model_id = id(xgb_model)
    if model_id not in _explainer_cache:
        _explainer_cache[model_id] = shap.TreeExplainer(xgb_model)
    return _explainer_cache[model_id]

def compute_shap_factors(pipeline, feature_df):
    """
    Computes feature contributions using SHAP TreeExplainer.
    1. Extracts underlying XGBoost model and scaler from sklearn pipeline.
    2. Scales the input feature vector using the pipeline's scaler.
    3. Computes SHAP contributions for the single instance.
    4. Normalizes impact values relative to the total absolute contribution.
    5. Returns top 3 factors sorted by absolute impact.
    """
    xgb_model, scaler = extract_model_and_scaler(pipeline)

    # Preprocess / scale feature input identically to the pipeline
    if scaler is not None:
        X_transformed = scaler.transform(feature_df)
    else:
        X_transformed = feature_df.values

    # Compute SHAP values via TreeExplainer
    explainer = get_tree_explainer(xgb_model)
    shap_vals = explainer.shap_values(X_transformed)

    # Handle binary classification output formats across shap versions
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1]
    shap_arr = np.array(shap_vals)
    if shap_arr.ndim > 1:
        shap_arr = shap_arr[0]

    feature_names = list(feature_df.columns)
    total_abs_shap = float(np.sum(np.abs(shap_arr)))

    factors = []
    for feat, raw_val in zip(feature_names, shap_arr):
        val_float = float(raw_val)
        abs_val = abs(val_float)
        # Normalize impact to readable values (preserving sign: + increases churn, - reduces churn)
        norm_impact = round(val_float / total_abs_shap, 2) if total_abs_shap > 0 else 0.0
        factors.append({
            "feature": feat,
            "impact": norm_impact,
            "abs_impact": abs_val,
        })

    # Sort features by absolute SHAP value descending
    factors.sort(key=lambda x: x["abs_impact"], reverse=True)

    # Return top 3 only
    return [{"feature": item["feature"], "impact": item["impact"]} for item in factors[:3]]

def parse_contract_type(val):
    if isinstance(val, (int, float)):
        int_val = int(val)
        if int_val in (0, 1, 2):
            return int_val
    elif isinstance(val, str):
        cleaned = val.strip().lower()
        if cleaned.isdigit():
            int_val = int(cleaned)
            if int_val in (0, 1, 2):
                return int_val
        if cleaned in CONTRACT_MAP:
            return CONTRACT_MAP[cleaned]
    raise ValueError(f"Invalid contractType: '{val}'. Expected Month-to-Month (0), 1-Year (1), or 2-Year (2).")

# ─── Input Schema Validation ─────────────────────────────────────────────────
# These bounds are derived from the training data distribution.
# Any input outside these ranges is rejected before reaching the model.
INPUT_BOUNDS: dict = {
    "tenure_months":       (0.0, 120.0),
    "monthly_charges":     (0.0, 1000.0),
    "contract_type":       (0, 2),
    "payment_method":      (0, 3),
    "engagement_score":    (0.0, 1.0),
    "payment_reliability": (0.0, 1.0),
}

EXPECTED_FEATURES = list(INPUT_BOUNDS.keys())

def validate_input_schema(feature_df: "pd.DataFrame") -> None:
    """
    Validates feature DataFrame shape, column names, numeric types, and value bounds
    before the data reaches the model. Raises ValueError on any violation.
    """
    # Shape check
    if feature_df.shape[1] != len(EXPECTED_FEATURES):
        raise ValueError(
            f"Input shape mismatch: expected {len(EXPECTED_FEATURES)} features, "
            f"got {feature_df.shape[1]}."
        )
    # Column presence check
    missing = [f for f in EXPECTED_FEATURES if f not in feature_df.columns]
    if missing:
        raise ValueError(f"Missing required features: {missing}")

    # Per-feature bounds validation
    for feat, (lo, hi) in INPUT_BOUNDS.items():
        val = feature_df.iloc[0][feat]
        # Type check
        if not isinstance(val, (int, float)) or not np.isfinite(float(val)):
            raise ValueError(f"Feature '{feat}' must be a finite number, got: {repr(val)}")
        # Range check
        if not (lo <= float(val) <= hi):
            raise ValueError(
                f"Feature '{feat}' value {val} is out of allowed range [{lo}, {hi}]."
            )

def predict(input_data):
    pipeline = load_model()

    tenure_months = float(input_data.get("tenureMonths", input_data.get("tenure_months", input_data.get("tenure", 0))))
    monthly_charges = float(input_data.get("monthlyCharges", input_data.get("monthly_charges", 0)))
    contract_type = parse_contract_type(input_data.get("contractType", input_data.get("contract_type")))
    payment_method = parse_payment_method(input_data.get("paymentMethod", input_data.get("payment_method")))
    engagement_score = float(input_data.get("engagementScore", input_data.get("engagement_score", 0)))
    payment_reliability = float(input_data.get("paymentReliability", input_data.get("payment_reliability", 0)))

    feature_df = pd.DataFrame([{
        "tenure_months": tenure_months,
        "monthly_charges": monthly_charges,
        "contract_type": contract_type,
        "payment_method": payment_method,
        "engagement_score": engagement_score,
        "payment_reliability": payment_reliability,
    }])

    # ── Security: validate shape + bounds before touching the model ────────────
    validate_input_schema(feature_df)

    # Predict probability for churn class (index 1)
    proba = float(pipeline.predict_proba(feature_df)[0][1])
    churn_prob = round(proba, 4)

    # Dynamic threshold from threshold.json (cost-benefit optimized)
    threshold = load_optimal_threshold(0.5)
    predicted_churn = 1 if churn_prob >= threshold else 0

    # Risk level classification
    if churn_prob >= 0.75:
        risk_level = "High"
    elif churn_prob >= 0.375:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    # SHAP Explainability (TreeExplainer feature contributions)
    top_factors = compute_shap_factors(pipeline, feature_df)

    # Risk level prefix
    if churn_prob >= 0.75:
        risk_prefix = "High churn risk"
    elif churn_prob >= 0.375:
        risk_prefix = "Moderate churn risk"
    else:
        risk_prefix = "Low churn risk"

    # Human-readable SHAP Factor Formatter
    def format_factor_label(feat: str, val: float, impact: float) -> str:
        pct = f"+{int(round(impact * 100))}%" if impact > 0 else f"{int(round(impact * 100))}%"
        if feat == "contract_type":
            contract_name = {0: "Month-to-Month", 1: "1-Year", 2: "2-Year"}.get(int(val), "contract")
            return f"{contract_name} contract ({pct})"
        elif feat == "tenure_months":
            return f"low tenure of {int(val)}mo ({pct})" if impact > 0 else f"high tenure of {int(val)}mo ({pct})"
        elif feat == "monthly_charges":
            return f"high monthly charges ({pct})" if impact > 0 else f"lower monthly charges ({pct})"
        elif feat == "payment_method":
            pay_name = {0: "Electronic Check", 1: "Mailed Check", 2: "Bank Transfer", 3: "Credit Card"}.get(int(val), "payment method")
            return f"{pay_name} ({pct})"
        elif feat == "engagement_score":
            return f"low engagement score ({pct})" if impact > 0 else f"strong engagement ({pct})"
        elif feat == "payment_reliability":
            return f"low payment reliability ({pct})" if impact > 0 else f"high payment reliability ({pct})"
        return f"{feat.replace('_', ' ')} ({pct})"

    # Positive contributors (risk drivers)
    pos_factors = [x for x in top_factors if x["impact"] > 0]

    if pos_factors:
        chosen = pos_factors[:2]
        labels = [format_factor_label(x["feature"], feature_df.iloc[0][x["feature"]], x["impact"]) for x in chosen]
        if len(labels) == 1:
            churn_reason = f"{risk_prefix} driven by {labels[0]}."
        else:
            churn_reason = f"{risk_prefix} driven by {labels[0]} and {labels[1]}."
        primary_driver = chosen[0]["feature"]
    else:
        chosen = top_factors[:2]
        labels = [format_factor_label(x["feature"], feature_df.iloc[0][x["feature"]], x["impact"]) for x in chosen]
        churn_reason = f"{risk_prefix} supported by {labels[0]} and {labels[1]}."
        primary_driver = None

    # Targeted retention action
    if churn_prob >= 0.375 and primary_driver:
        if primary_driver == "contract_type":
            retention_action = "Offer multi-month incentive to lock in long-term contract"
        elif primary_driver == "tenure_months":
            retention_action = "Initiate high-touch onboarding check-in to secure early adoption"
        elif primary_driver == "monthly_charges":
            retention_action = "Provide customized plan tier optimization or temporary discount"
        elif primary_driver in ("payment_method", "payment_reliability"):
            retention_action = "Incentivize migration to automated card/bank payment schedule"
        elif primary_driver == "engagement_score":
            retention_action = "Deploy targeted product feature walkthrough and re-engagement campaign"
        else:
            retention_action = "Schedule proactive account review with retention specialist"
    else:
        retention_action = "Maintain standard engagement and monitor activity"

    return {
        "churnProbability": churn_prob,
        "predictedChurn": predicted_churn,
        "threshold": threshold,
        "topFactors": top_factors,
        "riskLevel": risk_level,
        "churnReason": churn_reason,
        "reason": churn_reason,
        "retentionAction": retention_action,
        "explanation": {
            "reason": churn_reason,
            "topFactors": top_factors,
        },
    }

def main():
    try:
        if len(sys.argv) > 1:
            raw_input = sys.argv[1]
        else:
            raw_input = sys.stdin.read()

        if not raw_input or not raw_input.strip():
            print(json.dumps({"error": "No input provided"}), file=sys.stderr)
            sys.exit(1)

        # Guard: input must be valid JSON and a dict (not array/string injection)
        try:
            data = json.loads(raw_input)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON input"}), file=sys.stderr)
            sys.exit(1)

        if not isinstance(data, dict):
            print(json.dumps({"error": "Input must be a JSON object"}), file=sys.stderr)
            sys.exit(1)

        result = predict(data)
        print(json.dumps(result))
        sys.exit(0)
    except ValueError as e:
        # Validation errors are safe to surface (no internal paths/state)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # All other exceptions: log class name only, never expose message/stack
        print(json.dumps({"error": "Internal inference error"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
