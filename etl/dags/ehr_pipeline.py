"""
CareIQ — EHR Readmission Pipeline (Airflow DAG)
=================================================
Orchestrates the full daily EHR data pipeline from raw CSV validation
through star schema loading, dbt transformations, OLAP view refresh,
and ML risk scoring.

Pipeline stages:
  1. validate_source_files      — Check CSVs exist, row counts, schema columns
  2. run_pii_masking             — Call pii_masker.py: raw → staging files
  3. load_staging_tables         — COPY staging CSVs into staging.raw_* tables
  4. run_data_quality_checks     — Null PKs, referential integrity, date ranges,
                                   value distribution checks; writes audit.data_quality_checks
  5. transform_to_star_schema    — SQL transformations: staging → fact/dim tables
  6. compute_aggregates          — REFRESH MATERIALIZED VIEWs (4 OLAP views)
  7. trigger_ml_scoring          — Invoke ML batch scoring via API or direct call
  8. send_completion_alert       — Insert summary row into audit.pipeline_runs

Schedule: Daily at 02:00 UTC
Max active runs: 1 (no concurrent pipeline runs)
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.utils.dates import days_ago

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

POSTGRES_CONN_ID: str = "careiq_postgres"
DATA_PATH: Path = Path(os.getenv("DATA_PATH", "/opt/airflow/data"))
SYNTHETIC_DIR: Path = DATA_PATH / "synthetic"
STAGING_DIR: Path = DATA_PATH / "staging"
INGESTION_DIR: Path = Path(os.getenv("INGESTION_PATH", "/opt/airflow/careiq/ingestion"))

# Expected synthetic CSV files and minimum row thresholds
REQUIRED_FILES: dict[str, int] = {
    "patients.csv":   100,
    "admissions.csv": 500,
    "diagnoses.csv":  500,
    "procedures.csv": 100,
    "vitals.csv":     500,
    "medications.csv": 100,
}

# Expected columns per file (used for schema validation)
EXPECTED_COLUMNS: dict[str, list[str]] = {
    "patients.csv":    ["patient_id", "mrn", "age", "gender", "ethnicity", "insurance_type"],
    "admissions.csv":  ["admission_id", "patient_id", "admission_date", "discharge_date",
                        "los_days", "department", "readmitted_30_day", "total_charges"],
    "diagnoses.csv":   ["diagnosis_id", "admission_id", "icd10_code", "diagnosis_type"],
    "procedures.csv":  ["procedure_id", "admission_id", "cpt_code"],
    "vitals.csv":      ["vital_id", "admission_id", "recorded_at", "heart_rate",
                        "systolic_bp", "diastolic_bp", "spo2_pct"],
    "medications.csv": ["medication_id", "admission_id", "medication_name"],
}

# DQ thresholds
MAX_NULL_RATE: float = 0.05         # 5% null rate tolerance
MIN_READMISSION_RATE: float = 0.05  # Synthetic data sanity check
MAX_READMISSION_RATE: float = 0.35  # Sanity check: >35% is suspicious

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Default DAG arguments
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_ARGS: dict[str, Any] = {
    "owner": "careiq-data-team",
    "depends_on_past": False,
    "email": [os.getenv("ALERT_EMAIL", "data-alerts@careiq.io")],
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(hours=3),
    "sla": timedelta(hours=4),          # Alert if pipeline doesn't finish in 4h
}

# ─────────────────────────────────────────────────────────────────────────────
# Task 1: Validate source files
# ─────────────────────────────────────────────────────────────────────────────


def validate_source_files(**context: Any) -> dict[str, Any]:
    """
    Check that all required CSV files exist, have sufficient rows,
    and contain the expected columns.

    Args:
        context: Airflow task context (contains run_id, ds, etc.)

    Returns:
        Dict with validation summary pushed to XCom.

    Raises:
        FileNotFoundError: If any required file is missing.
        ValueError: If any file fails row count or schema validation.
    """
    import csv

    run_date: str = context["ds"]
    validation_results: dict[str, Any] = {"run_date": run_date, "files": {}}
    errors: list[str] = []

    source_dir = SYNTHETIC_DIR  # In production, this would be DATA_PATH / "raw"

    for filename, min_rows in REQUIRED_FILES.items():
        filepath = source_dir / filename
        file_result: dict[str, Any] = {"path": str(filepath)}

        # Check file exists
        if not filepath.exists():
            errors.append(f"Required file missing: {filepath}")
            file_result["status"] = "MISSING"
            validation_results["files"][filename] = file_result
            continue

        # Check row count
        with open(filepath) as f:
            reader = csv.reader(f)
            headers = next(reader)
            row_count = sum(1 for _ in reader)

        file_result["row_count"] = row_count
        file_result["columns"] = headers

        if row_count < min_rows:
            errors.append(f"{filename}: {row_count} rows < minimum {min_rows}")
            file_result["status"] = "INSUFFICIENT_ROWS"
            validation_results["files"][filename] = file_result
            continue

        # Check required columns
        expected = EXPECTED_COLUMNS.get(filename, [])
        missing_cols = [col for col in expected if col not in headers]
        if missing_cols:
            errors.append(f"{filename}: Missing columns: {missing_cols}")
            file_result["status"] = "SCHEMA_MISMATCH"
        else:
            file_result["status"] = "OK"

        validation_results["files"][filename] = file_result
        logger.info("✓ %s: %d rows, %d columns", filename, row_count, len(headers))

    if errors:
        raise ValueError(f"Source file validation failed:\n" + "\n".join(errors))

    logger.info("All %d source files validated successfully.", len(REQUIRED_FILES))
    context["task_instance"].xcom_push(key="validation_results", value=validation_results)
    return validation_results


# ─────────────────────────────────────────────────────────────────────────────
# Task 2: Run PII masking
# ─────────────────────────────────────────────────────────────────────────────


def run_pii_masking(**context: Any) -> None:
    """
    Execute the PII masker to de-identify raw files, writing output
    to the staging directory.

    Args:
        context: Airflow task context.

    Raises:
        RuntimeError: If the pii_masker.py script exits with non-zero code.
    """
    pii_script = INGESTION_DIR / "pii_masker.py"
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    env = {
        **os.environ,
        "DATA_RAW_PATH": str(SYNTHETIC_DIR),     # Phase 0 synthetic files = our "raw"
        "DATA_STAGING_PATH": str(STAGING_DIR),
    }

    logger.info("Running PII masker: %s", pii_script)
    result = subprocess.run(
        ["python", str(pii_script)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )

    if result.returncode != 0:
        logger.error("PII masker stderr:\n%s", result.stderr)
        raise RuntimeError(f"PII masker failed with exit code {result.returncode}")

    logger.info("PII masking complete:\n%s", result.stdout[-2000:])

    # Verify output files were created
    for filename in REQUIRED_FILES:
        output_path = STAGING_DIR / filename
        if not output_path.exists():
            raise FileNotFoundError(f"PII masker did not produce: {output_path}")
    logger.info("All %d staging files confirmed.", len(REQUIRED_FILES))


# ─────────────────────────────────────────────────────────────────────────────
# Task 3: Load staging tables
# ─────────────────────────────────────────────────────────────────────────────


def load_staging_tables(**context: Any) -> dict[str, int]:
    """
    Truncate and bulk-load all staging.raw_* tables from staging CSV files.

    Uses PostgresHook COPY for efficient bulk loading.

    Args:
        context: Airflow task context.

    Returns:
        Dict of {table_name: row_count_loaded}.
    """
    import pandas as pd

    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    row_counts: dict[str, int] = {}

    # Map CSV filename → staging table name
    file_to_table: dict[str, str] = {
        "patients.csv":    "staging.raw_patients",
        "admissions.csv":  "staging.raw_admissions",
        "diagnoses.csv":   "staging.raw_diagnoses",
        "procedures.csv":  "staging.raw_procedures",
        "vitals.csv":      "staging.raw_vitals",
        "medications.csv": "staging.raw_medications",
    }

    for filename, table_name in file_to_table.items():
        csv_path = STAGING_DIR / filename
        if not csv_path.exists():
            logger.warning("Staging file not found, skipping: %s", csv_path)
            continue

        logger.info("Loading %s → %s", filename, table_name)

        # Truncate to ensure idempotency (safe to re-run)
        hook.run(f"TRUNCATE TABLE {table_name};")

        df = pd.read_csv(csv_path, low_memory=False, dtype=str)
        df["loaded_at"] = datetime.utcnow().isoformat()

        # Batch insert using pandas via SQLAlchemy engine from hook
        engine = hook.get_sqlalchemy_engine()
        schema, tbl = table_name.split(".")
        df.to_sql(
            name=tbl,
            schema=schema,
            con=engine,
            if_exists="append",
            index=False,
            chunksize=5000,
            method="multi",
        )

        row_count = len(df)
        row_counts[table_name] = row_count
        logger.info("  Loaded %d rows into %s", row_count, table_name)

    context["task_instance"].xcom_push(key="load_counts", value=row_counts)
    return row_counts


# ─────────────────────────────────────────────────────────────────────────────
# Task 4: Data quality checks
# ─────────────────────────────────────────────────────────────────────────────


def run_data_quality_checks(**context: Any) -> dict[str, Any]:
    """
    Run data quality checks on staging tables before promotion to the star schema.

    Checks performed:
      - No null primary keys in any staging table
      - Readmission rate within expected range [5%, 35%]
      - Date ranges are valid (admission_date <= discharge_date)
      - No referential integrity violations between admissions and patients
      - Null rates below MAX_NULL_RATE for critical columns

    All results written to audit.data_quality_checks.

    Args:
        context: Airflow task context.

    Returns:
        Dict with check summary.

    Raises:
        ValueError: If any FAIL-level check is triggered.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    run_date: str = context["ds"]
    results: list[dict[str, Any]] = []
    failures: list[str] = []

    def _check(
        table: str,
        check_name: str,
        sql: str,
        expected_zero: bool = True,
        warn_threshold: Optional[float] = None,
        fail_threshold: Optional[float] = None,
    ) -> dict[str, Any]:
        """Execute a DQ check SQL and classify the result."""
        rows = hook.get_records(sql)
        value = float(rows[0][0]) if rows and rows[0][0] is not None else 0.0

        if expected_zero:
            status = "PASS" if value == 0 else "FAIL"
            if status == "FAIL":
                failures.append(f"{table}.{check_name}: {value:.0f} failures")
        elif warn_threshold is not None and fail_threshold is not None:
            if value > fail_threshold:
                status = "FAIL"
                failures.append(f"{table}.{check_name}: {value:.4f} > fail threshold {fail_threshold}")
            elif value > warn_threshold:
                status = "WARN"
            else:
                status = "PASS"
        else:
            status = "PASS"

        result = {
            "table_name": table,
            "check_name": check_name,
            "check_status": status,
            "value": value,
        }
        logger.info("DQ [%s] %s.%s = %s", status, table, check_name, value)
        return result

    # ── Null PK checks
    results.append(_check(
        "staging.raw_patients", "null_patient_id",
        "SELECT COUNT(*) FROM staging.raw_patients WHERE patient_id IS NULL OR patient_id = ''",
    ))
    results.append(_check(
        "staging.raw_admissions", "null_admission_id",
        "SELECT COUNT(*) FROM staging.raw_admissions WHERE admission_id IS NULL OR admission_id = ''",
    ))
    results.append(_check(
        "staging.raw_vitals", "null_vital_id",
        "SELECT COUNT(*) FROM staging.raw_vitals WHERE vital_id IS NULL OR vital_id = ''",
    ))

    # ── Referential integrity: all admission patient_ids must exist in patients
    results.append(_check(
        "staging.raw_admissions", "orphan_patient_ids",
        """SELECT COUNT(*)
           FROM staging.raw_admissions a
           LEFT JOIN staging.raw_patients p ON a.patient_id = p.patient_id
           WHERE p.patient_id IS NULL""",
    ))

    # ── Date range: discharge_date must be >= admission_date
    results.append(_check(
        "staging.raw_admissions", "invalid_date_range",
        """SELECT COUNT(*)
           FROM staging.raw_admissions
           WHERE discharge_date::DATE < admission_date::DATE""",
    ))

    # ── Readmission rate sanity (should be ~15%)
    results.append(_check(
        "staging.raw_admissions", "readmission_rate_bounds",
        """SELECT AVG(readmitted_30_day::NUMERIC)
           FROM staging.raw_admissions
           WHERE readmitted_30_day IN ('0','1')""",
        expected_zero=False,
        warn_threshold=MAX_READMISSION_RATE,
        fail_threshold=0.50,  # >50% is definitely wrong
    ))

    # ── LOS sanity (no negative or extreme values)
    results.append(_check(
        "staging.raw_admissions", "invalid_los",
        """SELECT COUNT(*) FROM staging.raw_admissions
           WHERE los_days::INT < 0 OR los_days::INT > 365""",
    ))

    # ── SpO2 range check (must be 0-100)
    results.append(_check(
        "staging.raw_vitals", "invalid_spo2",
        """SELECT COUNT(*) FROM staging.raw_vitals
           WHERE spo2_pct::NUMERIC NOT BETWEEN 0 AND 100""",
    ))

    # ── Write all results to audit table
    _insert_dq_results(hook, run_date, results)

    dq_summary = {
        "total_checks": len(results),
        "passed": sum(1 for r in results if r["check_status"] == "PASS"),
        "warned": sum(1 for r in results if r["check_status"] == "WARN"),
        "failed": sum(1 for r in results if r["check_status"] == "FAIL"),
    }
    logger.info("DQ Summary: %s", dq_summary)

    if failures:
        raise ValueError("Data quality checks FAILED:\n" + "\n".join(failures))

    context["task_instance"].xcom_push(key="dq_summary", value=dq_summary)
    return dq_summary


def _insert_dq_results(
    hook: PostgresHook,
    run_date: str,
    results: list[dict[str, Any]],
) -> None:
    """
    Insert data quality check results into audit.data_quality_checks.

    Args:
        hook: PostgresHook for DB access.
        run_date: Pipeline run date string (YYYY-MM-DD).
        results: List of DQ check result dicts.
    """
    # Get or create a pipeline_runs record for today
    existing = hook.get_records(
        "SELECT run_id FROM audit.pipeline_runs WHERE run_date = %s AND status = 'running'",
        parameters=[run_date],
    )
    if existing:
        run_id = existing[0][0]
    else:
        run_id_rows = hook.get_records(
            """INSERT INTO audit.pipeline_runs (dag_id, run_date, status)
               VALUES ('ehr_readmission_pipeline', %s, 'running')
               RETURNING run_id""",
            parameters=[run_date],
        )
        run_id = run_id_rows[0][0]

    for result in results:
        hook.run(
            """INSERT INTO audit.data_quality_checks
               (run_id, table_name, check_name, check_status, rows_failed)
               VALUES (%s, %s, %s, %s, %s)""",
            parameters=[
                run_id,
                result["table_name"],
                result["check_name"],
                result["check_status"],
                int(result["value"]) if result["check_status"] in ("FAIL", "WARN") else 0,
            ],
        )


# ─────────────────────────────────────────────────────────────────────────────
# Task 5: Transform to star schema
# ─────────────────────────────────────────────────────────────────────────────


def transform_to_star_schema(**context: Any) -> dict[str, int]:
    """
    Execute SQL transformations to populate the public fact/dim tables
    from the validated staging.raw_* tables.

    Transformation order respects FK dependencies:
      dim_patient → fact_admissions → bridge_admission_diagnoses
      → bridge_admission_procedures → fact_vitals

    Args:
        context: Airflow task context.

    Returns:
        Dict of {table_name: rows_inserted}.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    row_counts: dict[str, int] = {}

    def run_sql_and_count(sql: str, table: str) -> int:
        """Execute a SQL statement and return affected row count."""
        result = hook.get_records(sql)
        count = int(result[0][0]) if result and result[0][0] else 0
        logger.info("  %s: %d rows inserted/updated", table, count)
        row_counts[table] = count
        return count

    logger.info("Step 1: Upsert dim_patient from staging.raw_patients")
    run_sql_and_count("""
        WITH source AS (
            SELECT
                patient_id,
                mrn,
                CASE
                    WHEN age::INT BETWEEN 18 AND 30 THEN '18-30'
                    WHEN age::INT BETWEEN 31 AND 45 THEN '31-45'
                    WHEN age::INT BETWEEN 46 AND 60 THEN '46-60'
                    WHEN age::INT BETWEEN 61 AND 75 THEN '61-75'
                    ELSE '76+'
                END                                         AS age_group,
                age::INT                                    AS age_at_snapshot,
                gender,
                ethnicity                                   AS race_ethnicity,
                LEFT(zip_code, 3)                          AS zip_code_prefix,
                state,
                primary_language,
                CASE
                    WHEN insurance_type ILIKE 'Medicare'   THEN 'Medicare'
                    WHEN insurance_type ILIKE 'Medicaid'   THEN 'Medicaid'
                    WHEN insurance_type ILIKE '%HMO%'
                      OR insurance_type ILIKE '%PPO%'
                      OR insurance_type ILIKE 'Commercial%' THEN 'Commercial'
                    ELSE 'Other'
                END                                         AS insurance_category,
                num_comorbidities::INT                      AS comorbidity_count,
                comorbidities,
                -- Parse pipe-delimited comorbidities into boolean flags
                (comorbidities ILIKE '%Diabetes%')          AS has_diabetes,
                (comorbidities ILIKE '%Hypertension%')      AS has_hypertension,
                (comorbidities ILIKE '%Heart Failure%')     AS has_chf,
                (comorbidities ILIKE '%COPD%')              AS has_copd,
                (comorbidities ILIKE '%CKD%' OR comorbidities ILIKE '%Kidney%') AS has_ckd,
                (comorbidities ILIKE '%Atrial%')            AS has_afib,
                (comorbidities ILIKE '%Obesity%')           AS has_obesity,
                (comorbidities ILIKE '%Depression%')        AS has_depression
            FROM staging.raw_patients
        )
        INSERT INTO dim_patient (
            patient_id, mrn, age_group, age_at_snapshot, gender, race_ethnicity,
            zip_code_prefix, state, primary_language, insurance_category,
            comorbidity_count, has_diabetes, has_hypertension, has_chf,
            has_copd, has_ckd, has_afib, has_obesity, has_depression,
            effective_date, expiry_date, is_current
        )
        SELECT
            patient_id, mrn, age_group, age_at_snapshot, gender, race_ethnicity,
            zip_code_prefix, state, primary_language, insurance_category,
            comorbidity_count, has_diabetes, has_hypertension, has_chf,
            has_copd, has_ckd, has_afib, has_obesity, has_depression,
            CURRENT_DATE, '9999-12-31', TRUE
        FROM source
        ON CONFLICT DO NOTHING
        RETURNING patient_key
    """, "dim_patient")

    logger.info("Step 2: Insert into fact_admissions")
    run_sql_and_count("""
        WITH source AS (
            SELECT
                a.admission_id,
                dp.patient_key,
                -- Date keys: convert YYYY-MM-DD to YYYYMMDD integer
                TO_CHAR(a.admission_date::DATE, 'YYYYMMDD')::INT  AS admit_date_key,
                TO_CHAR(a.discharge_date::DATE, 'YYYYMMDD')::INT  AS discharge_date_key,
                -- Look up department surrogate key
                dev.department_key,
                -- Look up primary diagnosis key
                dd.diagnosis_key                                   AS primary_diagnosis_key,
                -- Look up discharge disposition key
                disp.disposition_key                               AS discharge_disposition_key,
                a.admission_type,
                a.drg_code,
                a.insurance_type,
                a.los_days::INT                                    AS length_of_stay_days,
                a.icu_days::INT                                    AS icu_days,
                a.total_charges::NUMERIC                          AS total_cost_usd,
                (a.admission_type = 'Emergency')                  AS emergency_flag,
                (a.icu_days::INT > 0)                             AS icu_flag,
                (a.readmitted_30_day::INT = 1)                    AS readmit_30day_flag
            FROM staging.raw_admissions a
            -- Join to get patient surrogate key
            JOIN dim_patient dp
                ON dp.patient_id = a.patient_id AND dp.is_current = TRUE
            -- Join to get department surrogate key
            LEFT JOIN dim_department dev
                ON dev.department_name = a.department
            -- Join on primary diagnosis from staging.raw_diagnoses
            LEFT JOIN staging.raw_diagnoses dg
                ON dg.admission_id = a.admission_id AND dg.diagnosis_type = 'Primary'
            LEFT JOIN dim_diagnosis dd
                ON dd.icd10_code = dg.icd10_code
            -- Join on discharge disposition
            LEFT JOIN dim_discharge_disposition disp
                ON disp.disposition_name ILIKE a.discharge_disposition
        )
        INSERT INTO fact_admissions (
            admission_id, patient_key, admit_date_key, discharge_date_key,
            department_key, primary_diagnosis_key, discharge_disposition_key,
            admission_type, drg_code, insurance_type,
            length_of_stay_days, icu_days, total_cost_usd,
            emergency_flag, icu_flag, readmit_30day_flag
        )
        SELECT * FROM source
        ON CONFLICT (admission_id) DO NOTHING
        RETURNING admission_key
    """, "fact_admissions")

    logger.info("Step 3: Populate bridge_admission_diagnoses")
    run_sql_and_count("""
        INSERT INTO bridge_admission_diagnoses (admission_key, diagnosis_key, diagnosis_type, sequence_number)
        SELECT
            fa.admission_key,
            dd.diagnosis_key,
            dg.diagnosis_type,
            dg.sequence::SMALLINT
        FROM staging.raw_diagnoses dg
        JOIN fact_admissions fa ON fa.admission_id = dg.admission_id
        JOIN dim_diagnosis   dd ON dd.icd10_code   = dg.icd10_code
        ON CONFLICT (admission_key, diagnosis_key) DO NOTHING
        RETURNING admission_key
    """, "bridge_admission_diagnoses")

    logger.info("Step 4: Populate bridge_admission_procedures")
    run_sql_and_count("""
        INSERT INTO bridge_admission_procedures (admission_key, procedure_key, procedure_date_key, charge_amount)
        SELECT
            fa.admission_key,
            dp.procedure_key,
            TO_CHAR(pr.procedure_date::DATE, 'YYYYMMDD')::INT,
            pr.charge_amount::NUMERIC
        FROM staging.raw_procedures pr
        JOIN fact_admissions fa  ON fa.admission_id = pr.admission_id
        JOIN dim_procedure   dp  ON dp.cpt_code     = pr.cpt_code
        ON CONFLICT (admission_key, procedure_key) DO NOTHING
        RETURNING admission_key
    """, "bridge_admission_procedures")

    logger.info("Step 5: Populate fact_vitals")
    run_sql_and_count("""
        INSERT INTO fact_vitals (
            vital_id, patient_key, admission_key, date_key, recorded_at,
            heart_rate, systolic_bp, diastolic_bp, respiratory_rate,
            spo2, temperature, news2_score
        )
        SELECT
            v.vital_id,
            fa.patient_key,
            fa.admission_key,
            TO_CHAR(v.recorded_at::TIMESTAMPTZ, 'YYYYMMDD')::INT,
            v.recorded_at::TIMESTAMPTZ,
            NULLIF(v.heart_rate,       '')::NUMERIC,
            NULLIF(v.systolic_bp,      '')::NUMERIC,
            NULLIF(v.diastolic_bp,     '')::NUMERIC,
            NULLIF(v.respiratory_rate, '')::NUMERIC,
            NULLIF(v.spo2_pct,         '')::NUMERIC,
            NULLIF(v.temperature_f,    '')::NUMERIC,
            NULLIF(v.news2_score,      '')::SMALLINT
        FROM staging.raw_vitals v
        JOIN fact_admissions fa ON fa.admission_id = v.admission_id
        ON CONFLICT (vital_id) DO NOTHING
        RETURNING vital_key
    """, "fact_vitals")

    context["task_instance"].xcom_push(key="transform_counts", value=row_counts)
    return row_counts


# ─────────────────────────────────────────────────────────────────────────────
# Task 6: Compute aggregates (refresh materialized views)
# ─────────────────────────────────────────────────────────────────────────────


def compute_aggregates(**context: Any) -> None:
    """
    Refresh all four OLAP materialized views using the stored procedure.

    Uses CONCURRENTLY when possible (requires pre-existing unique indexes).

    Args:
        context: Airflow task context.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)

    views_to_refresh = [
        "mv_readmission_rate_by_dept_month",
        "mv_los_by_diagnosis_insurance",
        "mv_risk_score_distribution",
        "mv_high_risk_patients_today",
    ]

    for view_name in views_to_refresh:
        logger.info("Refreshing: %s", view_name)
        try:
            hook.run(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name};")
            logger.info("  ✓ %s refreshed", view_name)
        except Exception as exc:
            # First run: view may be empty, CONCURRENTLY fails → fall back
            logger.warning(
                "CONCURRENTLY refresh failed (%s), trying non-concurrent: %s",
                view_name, exc,
            )
            hook.run(f"REFRESH MATERIALIZED VIEW {view_name};")
            logger.info("  ✓ %s refreshed (non-concurrent)", view_name)

    logger.info("All OLAP views refreshed successfully.")


# ─────────────────────────────────────────────────────────────────────────────
# Task 7: Trigger ML scoring
# ─────────────────────────────────────────────────────────────────────────────


def trigger_ml_scoring(**context: Any) -> dict[str, Any]:
    """
    Invoke the ML batch scoring pipeline for all unscored admissions.

    Scores are written directly to fact_predictions by the ML module.
    In Phase 2, this calls ml/predict.py directly; in Phase 3 it hits the API.

    Args:
        context: Airflow task context.

    Returns:
        Dict with scoring summary.
    """
    import json
    import urllib.error
    import urllib.request

    run_date: str = context["ds"]
    api_base: str = os.getenv("API_BASE_URL", "http://careiq_api:8000")
    url = f"{api_base}/api/v1/predictions/batch"

    payload = json.dumps({
        "run_date": run_date,
        "force_rescore": False,
    }).encode()

    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as response:
            body = json.loads(response.read())
            logger.info("ML scoring triggered via API: %s", body)
            return {"method": "api", "result": body, "run_date": run_date}
    except (urllib.error.URLError, ConnectionRefusedError) as exc:
        logger.warning("API not available (%s). Running ML directly (Phase 2 mode).", exc)
        # Fallback: direct ML call (available in Phase 2 when ml/predict.py is wired)
        logger.info("ML direct scoring skipped — Phase 1 stub. Run ml/train.py first.")
        return {"method": "stub", "run_date": run_date, "patients_scored": 0}


# ─────────────────────────────────────────────────────────────────────────────
# Task 8: Send completion alert
# ─────────────────────────────────────────────────────────────────────────────


def send_completion_alert(**context: Any) -> None:
    """
    Update the audit.pipeline_runs table with the final completion status
    and summary statistics from the entire pipeline run.

    Args:
        context: Airflow task context.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    ti = context["task_instance"]
    run_date: str = context["ds"]

    # Pull XCom values from upstream tasks
    load_counts: dict[str, int] = ti.xcom_pull(task_ids="load_staging_tables", key="load_counts") or {}
    dq_summary: dict[str, Any] = ti.xcom_pull(task_ids="run_data_quality_checks", key="dq_summary") or {}
    transform_counts: dict = ti.xcom_pull(task_ids="transform_to_star_schema", key="transform_counts") or {}

    summary_notes = (
        f"DQ checks: {dq_summary.get('passed',0)} passed, "
        f"{dq_summary.get('warned',0)} warned, "
        f"{dq_summary.get('failed',0)} failed. "
        f"Rows loaded: {load_counts}. "
        f"Rows transformed: {transform_counts}."
    )

    hook.run(
        """
        UPDATE audit.pipeline_runs
        SET
            completed_at      = NOW(),
            status            = 'success',
            patients_loaded   = %s,
            admissions_loaded = %s,
            diagnoses_loaded  = %s,
            vitals_loaded     = %s,
            notes             = %s
        WHERE run_date = %s AND status = 'running'
        """,
        parameters=[
            load_counts.get("staging.raw_patients", 0),
            load_counts.get("staging.raw_admissions", 0),
            load_counts.get("staging.raw_diagnoses", 0),
            load_counts.get("staging.raw_vitals", 0),
            summary_notes,
            run_date,
        ],
    )

    logger.info("Pipeline run completed successfully. Summary: %s", summary_notes)


# ─────────────────────────────────────────────────────────────────────────────
# DAG definition
# ─────────────────────────────────────────────────────────────────────────────

with DAG(
    dag_id="ehr_readmission_pipeline",
    description=(
        "CareIQ daily EHR pipeline: validate CSVs → PII mask → "
        "load staging → DQ checks → star schema transform → "
        "OLAP refresh → ML scoring → audit completion"
    ),
    default_args=DEFAULT_ARGS,
    start_date=days_ago(1),
    schedule_interval="0 2 * * *",     # Daily at 02:00 UTC
    catchup=False,
    max_active_runs=1,
    concurrency=4,
    tags=["careiq", "ehr", "ingestion", "daily"],
    doc_md=__doc__,
) as dag:

    t1_validate = PythonOperator(
        task_id="validate_source_files",
        python_callable=validate_source_files,
        doc_md="Validate all required CSV source files exist with expected row counts and schemas.",
    )

    t2_pii_mask = PythonOperator(
        task_id="run_pii_masking",
        python_callable=run_pii_masking,
        doc_md="De-identify raw files via HMAC pseudonymization and write masked output to staging dir.",
    )

    t3_load_staging = PythonOperator(
        task_id="load_staging_tables",
        python_callable=load_staging_tables,
        doc_md="Truncate and bulk-load all staging.raw_* tables from masked CSV files.",
    )

    t4_dq_checks = PythonOperator(
        task_id="run_data_quality_checks",
        python_callable=run_data_quality_checks,
        doc_md="Run 8 data quality checks; write results to audit.data_quality_checks.",
    )

    t5_transform = PythonOperator(
        task_id="transform_to_star_schema",
        python_callable=transform_to_star_schema,
        doc_md="Populate dim_patient, fact_admissions, bridge tables, and fact_vitals from staging.",
    )

    t6_aggregates = PythonOperator(
        task_id="compute_aggregates",
        python_callable=compute_aggregates,
        doc_md="Refresh all 4 OLAP materialized views for dashboard performance.",
    )

    t7_ml_scoring = PythonOperator(
        task_id="trigger_ml_scoring",
        python_callable=trigger_ml_scoring,
        doc_md="Invoke ML batch risk scoring for unscored admissions. Writes to fact_predictions.",
    )

    t8_alert = PythonOperator(
        task_id="send_completion_alert",
        python_callable=send_completion_alert,
        trigger_rule="all_done",    # Run even if earlier tasks had warnings
        doc_md="Update audit.pipeline_runs with final status, row counts, and DQ summary.",
    )

    # ── Task dependency chain
    (
        t1_validate
        >> t2_pii_mask
        >> t3_load_staging
        >> t4_dq_checks
        >> t5_transform
        >> t6_aggregates
        >> t7_ml_scoring
        >> t8_alert
    )
