"""
CareIQ — Model Evaluation
===========================
Evaluates trained model performance across risk tiers and subgroups.
Generates calibration curves, ROC/PR curves, and fairness metrics.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    classification_report,
    roc_auc_score,
    roc_curve,
)

logger = logging.getLogger(__name__)

PROTECTED_ATTRIBUTES: list[str] = ["gender", "ethnicity", "insurance_type"]


def evaluate_model(
    y_true: np.ndarray,
    y_scores: np.ndarray,
    threshold: float = 0.5,
) -> dict[str, float]:
    """
    Compute core binary classification metrics.

    Args:
        y_true: Ground truth labels (0 or 1).
        y_scores: Predicted probability scores [0, 1].
        threshold: Decision threshold for classification.

    Returns:
        Dictionary of metric names to float values.
    """
    y_pred = (y_scores >= threshold).astype(int)
    return {
        "roc_auc": round(float(roc_auc_score(y_true, y_scores)), 4),
        "average_precision": round(float(average_precision_score(y_true, y_scores)), 4),
        "brier_score": round(float(brier_score_loss(y_true, y_scores)), 4),
    }


def evaluate_subgroups(
    df: pd.DataFrame,
    y_score_col: str,
    y_true_col: str,
) -> pd.DataFrame:
    """
    Evaluate model performance across protected demographic subgroups.

    Generates per-subgroup AUC to detect disparate model performance.

    Args:
        df: DataFrame containing scores, labels, and demographic columns.
        y_score_col: Name of the predicted score column.
        y_true_col: Name of the ground truth label column.

    Returns:
        DataFrame with AUC per subgroup for each protected attribute.
    """
    results = []
    for attribute in PROTECTED_ATTRIBUTES:
        if attribute not in df.columns:
            continue
        for group_value in df[attribute].unique():
            subset = df[df[attribute] == group_value]
            if len(subset[y_true_col].unique()) < 2:
                continue
            auc = roc_auc_score(subset[y_true_col], subset[y_score_col])
            results.append({
                "attribute": attribute,
                "group": group_value,
                "n_samples": len(subset),
                "positive_rate": round(float(subset[y_true_col].mean()), 4),
                "roc_auc": round(float(auc), 4),
            })
    return pd.DataFrame(results)


def print_evaluation_report(metrics: dict[str, float]) -> None:
    """Print a formatted evaluation summary to the logger."""
    logger.info("=" * 50)
    logger.info("Model Evaluation Report")
    logger.info("=" * 50)
    for metric, value in metrics.items():
        logger.info("  %-25s %.4f", metric, value)
    logger.info("=" * 50)
