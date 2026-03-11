"""
CareIQ — Real-Time Prediction
===============================
Loads the trained readmission risk model from the registry and generates
predictions for new admissions with SHAP-based explainability.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import shap

logger = logging.getLogger(__name__)

RISK_THRESHOLD_HIGH: float = float(os.getenv("RISK_THRESHOLD_HIGH", "0.65"))
RISK_THRESHOLD_MEDIUM: float = float(os.getenv("RISK_THRESHOLD_MEDIUM", "0.35"))
TOP_N_FEATURES: int = 5


def _load_model(model_path: Path) -> Any:
    """Load the serialized model pipeline from disk."""
    import joblib

    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at: {model_path}")
    return joblib.load(model_path)


def classify_risk_tier(score: float) -> str:
    """
    Convert a probability score to a named risk tier.

    Args:
        score: Probability of 30-day readmission [0.0, 1.0].

    Returns:
        Risk tier string: 'LOW', 'MEDIUM', or 'HIGH'.
    """
    if score >= RISK_THRESHOLD_HIGH:
        return "HIGH"
    if score >= RISK_THRESHOLD_MEDIUM:
        return "MEDIUM"
    return "LOW"


def predict_batch(
    features_df: pd.DataFrame,
    model_path: Path,
    feature_cols: list[str],
) -> pd.DataFrame:
    """
    Run batch inference and SHAP explanation for a set of admissions.

    Args:
        features_df: DataFrame with admission_id and feature columns.
        model_path: Path to the serialized model pipeline.
        feature_cols: Ordered list of feature columns the model was trained on.

    Returns:
        DataFrame with admission_id, risk_score, risk_tier, and top_shap_features.
    """
    model = _load_model(model_path)
    x_data = features_df[feature_cols].values

    scores = model.predict_proba(x_data)[:, 1]

    # SHAP explanations
    explainer = shap.TreeExplainer(model.named_steps["model"])
    scaler = model.named_steps["scaler"]
    x_scaled = scaler.transform(x_data)
    shap_values = explainer.shap_values(x_scaled)

    results = []
    for i, (score, shap_row) in enumerate(zip(scores, shap_values)):
        top_idx = np.argsort(np.abs(shap_row))[-TOP_N_FEATURES:][::-1]
        top_features = {
            feature_cols[j]: round(float(shap_row[j]), 4)
            for j in top_idx
        }
        results.append({
            "admission_id": features_df.iloc[i]["admission_id"],
            "risk_score": round(float(score), 4),
            "risk_tier": classify_risk_tier(float(score)),
            "top_shap_features": top_features,
        })

    return pd.DataFrame(results)
