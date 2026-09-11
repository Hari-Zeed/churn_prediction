"""
tests/test_pipeline.py
----------------------
Unit test suite for Churn ML Pipeline:
  - Schema mapping (map_to_ml_schema.py)
  - Data ingestion, stratified splitting, probability bounds, and evaluation metrics (train_model.py)
"""

import os
import sys
import pytest
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

# Add project root and ml_churn_prediction to Python path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_DIR = os.path.join(PROJECT_ROOT, "ml_churn_prediction")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from map_to_ml_schema import map_to_ml_schema
from train_model import (
    load_data,
    split_data,
    evaluate_pipeline,
    FEATURE_COLS,
    TARGET_COL,
)


# ─── Pytest Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def raw_data_path() -> str:
    """Path to the raw Telco customer CSV dataset."""
    path = os.path.join(PROJECT_ROOT, "raw_customer_data.csv")
    if not os.path.exists(path):
        pytest.skip(f"Raw dataset not found at {path}")
    return path


@pytest.fixture(scope="session")
def schema_ready_path() -> str:
    """Path to the pre-processed ML schema CSV dataset."""
    path = os.path.join(ML_DIR, "ml_schema_ready.csv")
    if not os.path.exists(path):
        pytest.skip(f"ML schema ready dataset not found at {path}")
    return path


@pytest.fixture
def mapped_df(raw_data_path: str, tmp_path) -> pd.DataFrame:
    """Executes schema mapping on raw data and outputs to a temporary file."""
    output_path = tmp_path / "test_ml_schema_ready.csv"
    df = map_to_ml_schema(input_path=raw_data_path, output_path=str(output_path), verbose=False)
    return df


@pytest.fixture
def sample_features_and_target(schema_ready_path: str):
    """Loads feature matrix X and target y."""
    return load_data(schema_ready_path)


# ─── Unit Tests ───────────────────────────────────────────────────────────────

def test_schema_mapping_works_correctly(mapped_df: pd.DataFrame):
    """
    Test 1: Schema mapping works correctly.
    Verifies that all target ML schema columns exist, have numeric dtypes,
    and ordinal/engineered features adhere to domain boundaries.
    """
    expected_cols = {
        "tenure_months",
        "monthly_charges",
        "contract_type",
        "payment_method",
        "engagement_score",
        "payment_reliability",
        "churn",
    }
    # 1. Exact columns present
    assert set(mapped_df.columns) == expected_cols, (
        f"Columns mismatch! Missing: {expected_cols - set(mapped_df.columns)}, "
        f"Unexpected: {set(mapped_df.columns) - expected_cols}"
    )

    # 2. All columns are numeric
    for col in expected_cols:
        assert np.issubdtype(mapped_df[col].dtype, np.number), f"Column {col} is not numeric"

    # 3. Categorical encodings within expected ordinal ranges
    assert set(mapped_df["contract_type"].unique()).issubset({0, 1, 2}), (
        "contract_type contains values outside {0, 1, 2}"
    )
    assert set(mapped_df["payment_method"].unique()).issubset({0, 1, 2, 3}), (
        "payment_method contains values outside {0, 1, 2, 3}"
    )

    # 4. Engineered feature boundaries in [0.0, 1.0]
    assert (mapped_df["engagement_score"] >= 0.0).all() and (mapped_df["engagement_score"] <= 1.0).all()
    assert (mapped_df["payment_reliability"] >= 0.0).all() and (mapped_df["payment_reliability"] <= 1.0).all()

    # 5. Target is binary 0 or 1
    assert set(mapped_df["churn"].unique()).issubset({0, 1})


def test_no_nulls_after_transformation(mapped_df: pd.DataFrame):
    """
    Test 2: No nulls after transformation.
    Verifies that all missing values, empty strings, and coercion artifacts
    (e.g., whitespace TotalCharges in raw Telco data) are resolved.
    """
    null_counts = mapped_df.isnull().sum()
    assert null_counts.sum() == 0, f"Found nulls after transformation:\n{null_counts[null_counts > 0]}"
    assert np.isfinite(mapped_df.values).all(), "Dataframe contains NaN or infinite values"


def test_train_test_split_preserves_class_ratio(sample_features_and_target):
    """
    Test 3: Train/test split preserves class ratio.
    Verifies that stratified splitting preserves the churn rate across
    both train and test partitions without data leakage.
    """
    X, y = sample_features_and_target
    X_train, X_test, y_train, y_test = split_data(X, y)

    # 1. Total row count matches
    assert len(X_train) + len(X_test) == len(X)
    assert len(y_train) + len(y_test) == len(y)

    # 2. Split proportion ~ 80/20
    test_ratio = len(X_test) / len(X)
    assert abs(test_ratio - 0.20) < 0.01, f"Expected test ratio ~0.20, got {test_ratio:.3f}"

    # 3. Class balance preserved (stratified)
    train_churn_rate = y_train.mean()
    test_churn_rate = y_test.mean()
    overall_churn_rate = y.mean()

    assert abs(train_churn_rate - overall_churn_rate) < 0.01, (
        f"Train churn rate ({train_churn_rate:.3f}) deviates from overall ({overall_churn_rate:.3f})"
    )
    assert abs(test_churn_rate - overall_churn_rate) < 0.01, (
        f"Test churn rate ({test_churn_rate:.3f}) deviates from overall ({overall_churn_rate:.3f})"
    )

    # 4. No overlapping indices (no data leakage)
    assert set(X_train.index).isdisjoint(set(X_test.index))


def test_model_produces_valid_probabilities(sample_features_and_target):
    """
    Test 4: Model produces valid probabilities (0–1).
    Fits a lightweight model pipeline and validates that predicted probabilities:
      - are bounded in [0.0, 1.0]
      - sum to 1.0 across binary classes
      - contain no NaNs or Infs
    """
    X, y = sample_features_and_target
    # Use a small sample slice for instant test execution
    X_sample, y_sample = X.iloc[:200], y.iloc[:200]
    X_train, X_test, y_train, y_test = split_data(X_sample, y_sample)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(n_estimators=10, max_depth=2, random_state=42, eval_metric="logloss")),
    ])
    pipeline.fit(X_train, y_train)

    probs = pipeline.predict_proba(X_test)

    # 1. Shape matches (samples, 2 classes)
    assert probs.shape == (len(X_test), 2)

    # 2. All probability values in [0.0, 1.0]
    churn_prob = probs[:, 1]
    assert np.all(churn_prob >= 0.0) and np.all(churn_prob <= 1.0), (
        f"Probabilities out of bounds: min={churn_prob.min()}, max={churn_prob.max()}"
    )

    # 3. Probabilities per sample sum to 1.0
    assert np.allclose(probs.sum(axis=1), 1.0, atol=1e-5), "Class probabilities do not sum to 1.0"

    # 4. No NaNs or Infs
    assert not np.isnan(churn_prob).any(), "Probabilities contain NaN values"
    assert not np.isinf(churn_prob).any(), "Probabilities contain Inf values"


def test_evaluation_returns_all_required_metrics(sample_features_and_target):
    """
    Test 5: Evaluation returns all required metrics.
    Verifies that evaluate_pipeline() returns a dictionary containing
    all expected metric keys, within realistic bounds, and with feature importances.
    """
    X, y = sample_features_and_target
    # Compact slice for ultra-fast CV execution (<0.1s)
    X_sample, y_sample = X.iloc[:120].copy(), y.iloc[:120].copy()
    X_train, X_test, y_train, y_test = split_data(X_sample, y_sample)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(n_estimators=10, max_depth=2, random_state=42, eval_metric="logloss")),
    ])
    pipeline.fit(X_train, y_train)

    metrics = evaluate_pipeline(pipeline, X_sample, y_sample, X_train, y_train, X_test, y_test)

    expected_keys = {
        "accuracy",
        "precision",
        "recall",
        "f1_score",
        "roc_auc",
        "cv_f1",
        "test_samples",
        "train_samples",
        "feature_count",
        "trained_at",
        "feature_importance",
    }

    # 1. All required keys exist
    assert expected_keys.issubset(set(metrics.keys())), (
        f"Missing metrics keys: {expected_keys - set(metrics.keys())}"
    )

    # 2. Metric scores are valid numbers in [0.0, 1.0]
    for metric_name in ["accuracy", "precision", "recall", "f1_score", "roc_auc", "cv_f1"]:
        val = metrics[metric_name]
        assert isinstance(val, (float, int)), f"{metric_name} is not float/int"
        assert 0.0 <= val <= 1.0, f"{metric_name} out of bounds: {val}"

    # 3. Sample and feature counts match
    assert metrics["test_samples"] == len(X_test)
    assert metrics["train_samples"] == len(X_train)
    assert metrics["feature_count"] == len(FEATURE_COLS)

    # 4. Feature importances cover all features
    fi = metrics["feature_importance"]
    assert isinstance(fi, dict)
    assert set(fi.keys()) == set(FEATURE_COLS)
    for feat, imp in fi.items():
        assert isinstance(imp, float) and imp >= 0.0
