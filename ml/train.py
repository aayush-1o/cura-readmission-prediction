"""
CareIQ — Model Training
=========================
Trains the readmission risk prediction model using XGBoost and LightGBM.
Logs experiments to MLflow and saves the best model to the registry.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

MLFLOW_TRACKING_URI: str = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
MODEL_REGISTRY_PATH: Path = Path(os.getenv("MODEL_REGISTRY_PATH", "./ml/models"))
EXPERIMENT_NAME: str = "careiq_readmission_risk"
TARGET_COLUMN: str = "readmitted_30_day"
NUM_CV_FOLDS: int = 5
RANDOM_SEED: int = 42

NON_FEATURE_COLS: list[str] = [
    TARGET_COLUMN, "admission_id", "patient_id", "admission_date",
    "discharge_date", "mrn",
]


def _get_feature_columns(df: pd.DataFrame) -> list[str]:
    """Return model-ready feature columns from the DataFrame."""
    return [col for col in df.columns if col not in NON_FEATURE_COLS]


def _build_xgb_pipeline(params: dict[str, Any]) -> Pipeline:
    """Construct an XGBoost training pipeline with feature scaling."""
    from xgboost import XGBClassifier

    return Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(
            random_state=RANDOM_SEED,
            eval_metric="auc",
            use_label_encoder=False,
            **params,
        )),
    ])


def train_model(features_path: Path) -> None:
    """
    Train readmission risk model and log to MLflow.

    Args:
        features_path: Path to the feature Parquet file.
    """
    logger.info("Loading features from %s", features_path)
    df = pd.read_parquet(features_path)

    feature_cols = _get_feature_columns(df)
    x_data = df[feature_cols].values
    y_data = df[TARGET_COLUMN].values

    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(EXPERIMENT_NAME)

    xgb_params: dict[str, Any] = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "scale_pos_weight": (y_data == 0).sum() / (y_data == 1).sum(),
    }

    with mlflow.start_run(run_name="xgboost_baseline"):
        mlflow.log_params(xgb_params)
        mlflow.log_param("num_features", len(feature_cols))
        mlflow.log_param("num_samples", len(df))
        mlflow.log_param("positive_rate", float(y_data.mean()))

        pipeline = _build_xgb_pipeline(xgb_params)
        cv = StratifiedKFold(n_splits=NUM_CV_FOLDS, shuffle=True, random_state=RANDOM_SEED)
        cv_scores = cross_val_score(pipeline, x_data, y_data, cv=cv, scoring="roc_auc")

        mlflow.log_metric("cv_auc_mean", float(cv_scores.mean()))
        mlflow.log_metric("cv_auc_std", float(cv_scores.std()))
        logger.info("CV AUC: %.4f ± %.4f", cv_scores.mean(), cv_scores.std())

        pipeline.fit(x_data, y_data)
        mlflow.sklearn.log_model(pipeline, artifact_path="model")

    logger.info("Training complete. Model logged to MLflow.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    feature_file = Path(os.getenv("FEATURE_STORE_PATH", "./ml/features")) / "features_latest.parquet"
    train_model(feature_file)
