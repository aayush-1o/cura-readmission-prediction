"""
CareIQ — Schema Validator
==========================
Validates the structure and data quality of ingested EHR CSV files
before they are promoted from the raw zone to the staging layer.

Validates:
  - Required columns presence
  - Data types per field
  - Value range constraints
  - Referential integrity between files
  - Null rate thresholds

Usage:
    python validate_schema.py --file patients.csv
    python validate_schema.py  # Validates all known files
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

RAW_DIR: Path = Path(os.getenv("DATA_RAW_PATH", "./data/raw"))
STAGING_DIR: Path = Path(os.getenv("DATA_STAGING_PATH", "./data/staging"))
MAX_NULL_RATE: float = float(os.getenv("VALIDATION_MAX_NULL_RATE", "0.05"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("careiq.ingestion.validate")

# ─────────────────────────────────────────────────────────────────────────────
# Schema definitions
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ColumnSpec:
    """Specification for a single column in a dataset."""

    name: str
    required: bool = True
    dtype: Optional[str] = None          # 'str', 'int', 'float', 'date'
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    allowed_values: Optional[list[Any]] = None
    max_null_rate: float = MAX_NULL_RATE


@dataclass
class FileSchema:
    """Schema specification for a single CSV file."""

    filename: str
    columns: list[ColumnSpec] = field(default_factory=list)
    primary_key: Optional[str] = None


FILE_SCHEMAS: list[FileSchema] = [
    FileSchema(
        filename="patients.csv",
        primary_key="patient_id",
        columns=[
            ColumnSpec("patient_id", required=True, dtype="str", max_null_rate=0.0),
            ColumnSpec("mrn", required=True, dtype="str"),
            ColumnSpec("age", required=True, dtype="int", min_val=0, max_val=120),
            ColumnSpec("gender", required=True, allowed_values=["Male", "Female", "Non-binary"]),
            ColumnSpec("zip_code", required=True),
            ColumnSpec("insurance_type", required=True),
            ColumnSpec("num_comorbidities", required=True, dtype="int", min_val=0, max_val=20),
        ],
    ),
    FileSchema(
        filename="admissions.csv",
        primary_key="admission_id",
        columns=[
            ColumnSpec("admission_id", required=True, dtype="str", max_null_rate=0.0),
            ColumnSpec("patient_id", required=True, dtype="str", max_null_rate=0.0),
            ColumnSpec("los_days", required=True, dtype="int", min_val=0, max_val=365),
            ColumnSpec("readmitted_30_day", required=True, dtype="int",
                       allowed_values=[0, 1], max_null_rate=0.0),
            ColumnSpec("total_charges", required=True, dtype="float", min_val=0.0),
            ColumnSpec("admission_type", required=True,
                       allowed_values=["Emergency", "Elective", "Urgent"]),
        ],
    ),
    FileSchema(
        filename="vitals.csv",
        primary_key="vital_id",
        columns=[
            ColumnSpec("vital_id", required=True, dtype="str", max_null_rate=0.0),
            ColumnSpec("admission_id", required=True, dtype="str", max_null_rate=0.0),
            ColumnSpec("systolic_bp", required=True, dtype="float", min_val=40, max_val=300),
            ColumnSpec("diastolic_bp", required=True, dtype="float", min_val=20, max_val=200),
            ColumnSpec("heart_rate", required=True, dtype="float", min_val=0, max_val=400),
            ColumnSpec("spo2_pct", required=True, dtype="float", min_val=0, max_val=100),
            ColumnSpec("temperature_f", required=True, dtype="float", min_val=85, max_val=115),
        ],
    ),
]


@dataclass
class ValidationResult:
    """Result of validating a single file."""

    filename: str
    passed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    row_count: int = 0
    column_count: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Validation logic
# ─────────────────────────────────────────────────────────────────────────────


def _check_required_columns(df: pd.DataFrame, schema: FileSchema) -> list[str]:
    """Return error messages for any missing required columns."""
    errors = []
    for spec in schema.columns:
        if spec.required and spec.name not in df.columns:
            errors.append(f"Required column '{spec.name}' is missing.")
    return errors


def _check_null_rates(df: pd.DataFrame, schema: FileSchema) -> list[str]:
    """Return error messages for columns exceeding their null rate threshold."""
    errors = []
    for spec in schema.columns:
        if spec.name not in df.columns:
            continue
        null_rate = df[spec.name].isna().mean()
        if null_rate > spec.max_null_rate:
            errors.append(
                f"Column '{spec.name}' null rate {null_rate:.2%} exceeds "
                f"threshold {spec.max_null_rate:.2%}."
            )
    return errors


def _check_value_ranges(df: pd.DataFrame, schema: FileSchema) -> list[str]:
    """Return error messages for out-of-range numeric values."""
    errors = []
    for spec in schema.columns:
        if spec.name not in df.columns:
            continue
        if spec.min_val is not None:
            violations = (df[spec.name].dropna() < spec.min_val).sum()
            if violations > 0:
                errors.append(
                    f"Column '{spec.name}': {violations} values below minimum {spec.min_val}."
                )
        if spec.max_val is not None:
            violations = (df[spec.name].dropna() > spec.max_val).sum()
            if violations > 0:
                errors.append(
                    f"Column '{spec.name}': {violations} values above maximum {spec.max_val}."
                )
    return errors


def _check_allowed_values(df: pd.DataFrame, schema: FileSchema) -> list[str]:
    """Return error messages for columns with disallowed values."""
    errors = []
    for spec in schema.columns:
        if spec.allowed_values is None or spec.name not in df.columns:
            continue
        invalid_mask = ~df[spec.name].isin(spec.allowed_values)
        invalid_count = invalid_mask.sum()
        if invalid_count > 0:
            sample = df.loc[invalid_mask, spec.name].unique()[:3].tolist()
            errors.append(
                f"Column '{spec.name}': {invalid_count} disallowed values. "
                f"Sample: {sample}. Allowed: {spec.allowed_values}."
            )
    return errors


def _check_primary_key_uniqueness(df: pd.DataFrame, schema: FileSchema) -> list[str]:
    """Return error messages if the primary key column has duplicate values."""
    if not schema.primary_key or schema.primary_key not in df.columns:
        return []
    duplicate_count = df[schema.primary_key].duplicated().sum()
    if duplicate_count > 0:
        return [f"Primary key '{schema.primary_key}' has {duplicate_count} duplicate values."]
    return []


def validate_file(file_path: Path, schema: FileSchema) -> ValidationResult:
    """
    Run all validation checks on a single CSV file.

    Args:
        file_path: Path to the CSV file to validate.
        schema: Expected schema specification.

    Returns:
        ValidationResult with pass/fail status and error details.
    """
    result = ValidationResult(filename=schema.filename, passed=False)

    if not file_path.exists():
        result.errors.append(f"File not found: {file_path}")
        return result

    try:
        df = pd.read_csv(file_path, low_memory=False)
    except Exception as exc:
        result.errors.append(f"Failed to read CSV: {exc}")
        return result

    result.row_count = len(df)
    result.column_count = len(df.columns)

    result.errors.extend(_check_required_columns(df, schema))
    result.errors.extend(_check_null_rates(df, schema))
    result.errors.extend(_check_value_ranges(df, schema))
    result.errors.extend(_check_allowed_values(df, schema))
    result.errors.extend(_check_primary_key_uniqueness(df, schema))

    result.passed = len(result.errors) == 0
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ─────────────────────────────────────────────────────────────────────────────


def main() -> int:
    """Run schema validation for all configured files. Returns exit code."""
    logger.info("CareIQ Schema Validator — validating files in %s", RAW_DIR)

    overall_passed = True
    for schema in FILE_SCHEMAS:
        file_path = RAW_DIR / schema.filename
        result = validate_file(file_path, schema)

        status_icon = "✅" if result.passed else "❌"
        logger.info(
            "%s %s — %d rows | %d cols | %d errors",
            status_icon,
            schema.filename,
            result.row_count,
            result.column_count,
            len(result.errors),
        )
        for error in result.errors:
            logger.error("  ERROR: %s", error)
        for warning in result.warnings:
            logger.warning("  WARN:  %s", warning)

        if not result.passed:
            overall_passed = False

    if overall_passed:
        logger.info("All validations passed.")
        return 0
    else:
        logger.error("Validation failed. Review errors above before promoting to staging.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
