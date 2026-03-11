"""
CareIQ — Feature Engineering Module
=====================================
Builds the feature vector used for readmission risk prediction.

Features generated per patient/admission:
  - Clinical: num_comorbidities, icu_days, los_days, news2_max, primary_dx_category
  - Vitals trends: avg/std/last of BP, HR, RR, SpO2, temp
  - Utilization: prior_admissions_90d, prior_readmissions_1y, total_prior_charges
  - Administrative: age, insurance_type, discharge_disposition, admission_type
  - Lab flags: (stubbed for Phase 2 when lab data is available)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

FEATURE_STORE_PATH: Path = Path(os.getenv("FEATURE_STORE_PATH", "./ml/features"))

VITAL_FEATURE_COLS: list[str] = [
    "systolic_bp", "diastolic_bp", "heart_rate",
    "respiratory_rate", "spo2_pct", "temperature_f",
]

TARGET_COLUMN: str = "readmitted_30_day"


def _aggregate_vitals(vitals_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate vital sign readings into per-admission summary features.

    Args:
        vitals_df: Raw vitals DataFrame with 'admission_id' and vital columns.

    Returns:
        DataFrame indexed by admission_id with mean/std/last features.
    """
    agg_map: dict[str, list[str]] = {col: ["mean", "std", "min", "max"] for col in VITAL_FEATURE_COLS}
    agg_map["news2_score"] = ["mean", "max"]

    aggregated = vitals_df.groupby("admission_id").agg(agg_map)
    aggregated.columns = ["_".join(col) for col in aggregated.columns]
    return aggregated.reset_index()


def _compute_utilization_features(admissions_df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute historical utilization features per patient per admission.

    Looks back 90 days for prior admissions and 1 year for readmissions.

    Args:
        admissions_df: Admissions DataFrame sorted by admission_date.

    Returns:
        Admissions DataFrame with additional utilization feature columns.
    """
    admissions_df = admissions_df.sort_values(["patient_id", "admission_date"])
    admissions_df["admission_date"] = pd.to_datetime(admissions_df["admission_date"])

    prior_90d: list[int] = []
    prior_readmit_1y: list[int] = []

    for idx, row in admissions_df.iterrows():
        patient_history = admissions_df[
            (admissions_df["patient_id"] == row["patient_id"])
            & (admissions_df["admission_date"] < row["admission_date"])
        ]
        cutoff_90d = row["admission_date"] - pd.Timedelta(days=90)
        cutoff_1y = row["admission_date"] - pd.Timedelta(days=365)

        prior_90d.append(len(patient_history[patient_history["admission_date"] >= cutoff_90d]))
        prior_readmit_1y.append(
            int(patient_history[patient_history["admission_date"] >= cutoff_1y]["readmitted_30_day"].sum())
        )

    admissions_df["prior_admissions_90d"] = prior_90d
    admissions_df["prior_readmissions_1y"] = prior_readmit_1y
    return admissions_df


def build_feature_matrix(
    admissions_df: pd.DataFrame,
    patients_df: pd.DataFrame,
    vitals_df: pd.DataFrame,
    diagnoses_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Assemble the full feature matrix for model training or inference.

    Args:
        admissions_df: Admissions with patient_id, readmitted_30_day, etc.
        patients_df: Patient demographics with patient_id.
        vitals_df: Vital sign readings with admission_id.
        diagnoses_df: Diagnosis codes with admission_id.

    Returns:
        Feature matrix DataFrame with TARGET_COLUMN as label column.
    """
    logger.info("Building feature matrix...")

    # Merge patient demographics onto admissions
    features = admissions_df.merge(
        patients_df[["patient_id", "age", "gender", "insurance_type", "num_comorbidities"]],
        on="patient_id",
        how="left",
    )

    # Aggregate vitals
    vitals_agg = _aggregate_vitals(vitals_df)
    features = features.merge(vitals_agg, on="admission_id", how="left")

    # Compute utilization features
    features = _compute_utilization_features(features)

    # Count secondary diagnoses
    dx_counts = diagnoses_df.groupby("admission_id").size().reset_index(name="num_diagnoses")
    features = features.merge(dx_counts, on="admission_id", how="left")

    # One-hot encode categoricals
    cat_cols = ["gender", "insurance_type", "admission_type", "discharge_disposition",
                "primary_diagnosis_category"]
    for col in cat_cols:
        if col in features.columns:
            dummies = pd.get_dummies(features[col], prefix=col, drop_first=True)
            features = pd.concat([features, dummies], axis=1)
            features.drop(columns=[col], inplace=True)

    # Fill remaining nulls with column medians
    numeric_cols = features.select_dtypes(include=[np.number]).columns.tolist()
    features[numeric_cols] = features[numeric_cols].fillna(features[numeric_cols].median())

    logger.info("Feature matrix shape: %s", features.shape)
    return features


def save_feature_matrix(features_df: pd.DataFrame, version: str = "latest") -> Path:
    """
    Persist the feature matrix to the feature store.

    Args:
        features_df: Fully assembled feature DataFrame.
        version: Version string for the feature snapshot.

    Returns:
        Path to the saved Parquet file.
    """
    FEATURE_STORE_PATH.mkdir(parents=True, exist_ok=True)
    output_path = FEATURE_STORE_PATH / f"features_{version}.parquet"
    features_df.to_parquet(output_path, index=False, compression="snappy")
    logger.info("Feature matrix saved: %s (%d rows)", output_path, len(features_df))
    return output_path
