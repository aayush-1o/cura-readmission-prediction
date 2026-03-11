"""
CareIQ — Synthetic EHR Data Generator
======================================
Generates realistic fake Electronic Health Record (EHR) data for development
and testing of the CareIQ platform. NO real patient data is used or referenced.

Output files (written to DATA_SYNTHETIC_PATH):
    patients.csv    — Patient demographics (10,000 records)
    admissions.csv  — Hospital admissions (50,000 records)
    diagnoses.csv   — ICD-10 diagnoses per admission (~3 per admission)
    procedures.csv  — Procedures per admission (~2 per admission)
    vitals.csv      — Vitals recorded per admission (~8 readings each)
    medications.csv — Medication orders per admission (~5 per admission)

Usage:
    python generate_synthetic_data.py
    SYNTHETIC_NUM_PATIENTS=500 python generate_synthetic_data.py  # override via env
"""

from __future__ import annotations

import logging
import os
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from faker import Faker

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — all values from environment variables with defaults
# ─────────────────────────────────────────────────────────────────────────────

NUM_PATIENTS: int = int(os.getenv("SYNTHETIC_NUM_PATIENTS", "10000"))
NUM_ADMISSIONS: int = int(os.getenv("SYNTHETIC_NUM_ADMISSIONS", "50000"))
READMISSION_RATE: float = float(os.getenv("SYNTHETIC_READMISSION_RATE", "0.15"))
RANDOM_SEED: int = int(os.getenv("SYNTHETIC_SEED", "42"))
OUTPUT_DIR: Path = Path(os.getenv("DATA_SYNTHETIC_PATH", "./data/synthetic"))

# Simulation window: 3 years of admissions
SIM_START_DATE: datetime = datetime(2022, 1, 1)
SIM_END_DATE: datetime = datetime(2024, 12, 31)
THIRTY_DAY_WINDOW: int = 30

# ICD-10 code pools by clinical category
PRIMARY_DIAGNOSES: dict[str, list[str]] = {
    "Heart Failure": ["I50.9", "I50.1", "I50.20", "I50.30", "I50.40"],
    "COPD": ["J44.1", "J44.0", "J44.9"],
    "Pneumonia": ["J18.9", "J18.1", "J15.9", "J15.1"],
    "Sepsis": ["A41.9", "A41.51", "A41.01", "A40.0"],
    "Diabetes": ["E11.9", "E11.65", "E11.649", "E10.9"],
    "Acute MI": ["I21.9", "I21.3", "I21.0", "I21.4"],
    "Stroke": ["I63.9", "I63.50", "I63.40", "I63.30"],
    "Kidney Disease": ["N18.5", "N18.6", "N18.4", "N18.3"],
    "Hip Fracture": ["S72.001A", "S72.002A", "S72.009A"],
    "UTI": ["N39.0", "N10", "N30.00"],
}

COMORBIDITY_ICD10: dict[str, str] = {
    "Hypertension": "I10",
    "Diabetes Type 2": "E11.9",
    "COPD": "J44.9",
    "Heart Failure": "I50.9",
    "CKD Stage 3": "N18.3",
    "Atrial Fibrillation": "I48.91",
    "Obesity": "E66.9",
    "Depression": "F32.9",
    "Anemia": "D64.9",
    "Hypothyroidism": "E03.9",
}

PROCEDURE_CODES: list[str] = [
    "99232", "99233",  # Hospital inpatient E&M
    "93306", "93307",  # Echocardiography
    "71046",           # Chest X-ray 2 views
    "80053",           # Comprehensive metabolic panel
    "85025",           # CBC with differential
    "36415",           # Blood draw
    "93000",           # EKG
    "99291",           # Critical care, first hour
    "31500",           # Intubation
    "36561",           # Central line insertion
    "92953",           # Mechanical ventilation
    "43239",           # EGD with biopsy
]

MEDICATION_NAMES: list[str] = [
    "Metformin 500mg", "Lisinopril 10mg", "Atorvastatin 40mg",
    "Amlodipine 5mg", "Metoprolol 25mg", "Furosemide 40mg",
    "Aspirin 81mg", "Warfarin 5mg", "Insulin Glargine 20u",
    "Potassium Chloride 20mEq", "Pantoprazole 40mg", "Ondansetron 4mg",
    "Morphine 2mg IV", "Heparin 5000u SC", "Ceftriaxone 1g IV",
    "Vancomycin 1g IV", "Piperacillin-Tazobactam 3.375g IV",
]

DEPARTMENTS: list[str] = [
    "Cardiology", "Internal Medicine", "Pulmonology", "Neurology",
    "Orthopedics", "Nephrology", "Oncology", "Endocrinology",
    "Gastroenterology", "General Surgery",
]

INSURANCE_TYPES: list[str] = [
    "Medicare", "Medicaid", "Commercial PPO", "Commercial HMO",
    "Uninsured", "Tricare", "Other Government",
]

DISCHARGE_DISPOSITIONS: list[str] = [
    "Home", "Home with Home Health", "Skilled Nursing Facility",
    "Inpatient Rehab", "Long-term Care Hospital", "Against Medical Advice",
    "Expired",
]

# ─────────────────────────────────────────────────────────────────────────────
# Logging setup
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("careiq.ingestion.synthetic")

# ─────────────────────────────────────────────────────────────────────────────
# Generator helpers
# ─────────────────────────────────────────────────────────────────────────────


def _random_date(start: datetime, end: datetime, rng: np.random.Generator) -> datetime:
    """Return a uniformly random datetime between start and end."""
    delta_seconds = int((end - start).total_seconds())
    offset = int(rng.integers(0, delta_seconds))
    return start + timedelta(seconds=offset)


def _sample_comorbidities(
    rng: np.random.Generator, age: int
) -> list[str]:
    """
    Sample a realistic set of comorbidities weighted by patient age.

    Older patients accumulate more comorbidities on average. Returns
    a list of comorbidity names (keys from COMORBIDITY_ICD10).
    """
    base_probability = 0.1 + (age - 40) * 0.005  # increases with age
    base_probability = max(0.05, min(0.8, base_probability))
    return [
        name
        for name in COMORBIDITY_ICD10
        if rng.random() < base_probability
    ]


def _sample_insurance(rng: np.random.Generator, age: int) -> str:
    """Sample insurance type with age-based Medicare weighting."""
    if age >= 65:
        weights = [0.70, 0.05, 0.10, 0.05, 0.05, 0.03, 0.02]
    elif age < 19:
        weights = [0.0, 0.35, 0.30, 0.15, 0.10, 0.05, 0.05]
    else:
        weights = [0.0, 0.15, 0.40, 0.20, 0.15, 0.05, 0.05]
    return rng.choice(INSURANCE_TYPES, p=weights)  # type: ignore[return-value]


# ─────────────────────────────────────────────────────────────────────────────
# Patient generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_patients(
    num_patients: int,
    fake: Faker,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate synthetic patient demographics.

    Args:
        num_patients: Number of patient records to generate.
        fake: Configured Faker instance.
        rng: NumPy random Generator for reproducibility.

    Returns:
        DataFrame with patient demographic records.
    """
    logger.info("Generating %d patient records...", num_patients)

    ages = rng.normal(loc=62, scale=18, size=num_patients).clip(18, 100).astype(int)
    genders = rng.choice(["Male", "Female", "Non-binary"], size=num_patients, p=[0.48, 0.50, 0.02])
    ethnicities = rng.choice(
        ["White", "Black", "Hispanic", "Asian", "Other"],
        size=num_patients,
        p=[0.60, 0.13, 0.18, 0.06, 0.03],
    )

    records = []
    for i in range(num_patients):
        age = int(ages[i])
        gender = str(genders[i])
        comorbidities = _sample_comorbidities(rng, age)
        patient_id = f"PAT-{str(uuid.uuid4()).upper()[:12]}"

        # Date of birth from age
        dob = SIM_START_DATE - timedelta(days=age * 365.25 + float(rng.integers(0, 365)))

        records.append(
            {
                "patient_id": patient_id,
                "mrn": f"MRN{1000000 + i:07d}",
                "age": age,
                "date_of_birth": dob.strftime("%Y-%m-%d"),
                "gender": gender,
                "ethnicity": str(ethnicities[i]),
                "zip_code": fake.zipcode(),
                "state": fake.state_abbr(),
                "insurance_type": _sample_insurance(rng, age),
                "primary_language": rng.choice(
                    ["English", "Spanish", "Mandarin", "Vietnamese", "Other"],
                    p=[0.72, 0.16, 0.04, 0.03, 0.05],
                ),
                "num_comorbidities": len(comorbidities),
                "comorbidities": "|".join(comorbidities),
            }
        )

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Admission generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_admissions(
    patients_df: pd.DataFrame,
    num_admissions: int,
    readmission_rate: float,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate synthetic hospital admissions linked to patients.

    Readmissions are modeled by scheduling a subset of patients for a
    follow-up admission within 30 days of discharge.

    Args:
        patients_df: Patient DataFrame (must contain 'patient_id', 'num_comorbidities').
        num_admissions: Total admission records to generate.
        readmission_rate: Fraction of admissions resulting in 30-day readmission.
        rng: NumPy random Generator.

    Returns:
        DataFrame with admission records including readmission flags.
    """
    logger.info("Generating %d admission records (readmission rate=%.0f%%)...",
                num_admissions, readmission_rate * 100)

    patient_ids = patients_df["patient_id"].values
    comorbidity_counts = patients_df["num_comorbidities"].values

    primary_dx_categories = list(PRIMARY_DIAGNOSES.keys())
    records = []

    for _ in range(num_admissions):
        # Patients with more comorbidities admitted more often
        weights = 1 + comorbidity_counts.astype(float)
        weights /= weights.sum()
        patient_idx = int(rng.choice(len(patient_ids), p=weights))

        patient_id = str(patient_ids[patient_idx])
        dx_category = str(rng.choice(primary_dx_categories))
        admission_date = _random_date(SIM_START_DATE, SIM_END_DATE, rng)

        # LOS: log-normal distribution centered around 4 days
        los_days = max(1, int(rng.lognormal(mean=1.4, sigma=0.7)))
        discharge_date = admission_date + timedelta(days=los_days)

        is_readmission = rng.random() < readmission_rate
        admission_id = f"ADM-{str(uuid.uuid4()).upper()[:12]}"

        records.append(
            {
                "admission_id": admission_id,
                "patient_id": patient_id,
                "admission_date": admission_date.strftime("%Y-%m-%d"),
                "discharge_date": discharge_date.strftime("%Y-%m-%d"),
                "los_days": los_days,
                "department": str(rng.choice(DEPARTMENTS)),
                "primary_diagnosis_category": dx_category,
                "admission_type": str(rng.choice(
                    ["Emergency", "Elective", "Urgent"],
                    p=[0.55, 0.25, 0.20],
                )),
                "discharge_disposition": str(rng.choice(
                    DISCHARGE_DISPOSITIONS,
                    p=[0.45, 0.20, 0.15, 0.08, 0.05, 0.04, 0.03],
                )),
                "readmitted_30_day": int(is_readmission),
                "icu_days": max(0, int(rng.poisson(1.5)) if is_readmission else int(rng.poisson(0.5))),
                "drg_code": f"{rng.integers(1, 999):03d}",
                "total_charges": round(float(rng.lognormal(mean=10.5, sigma=0.8)), 2),
            }
        )

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Diagnoses generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_diagnoses(
    admissions_df: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate ICD-10 diagnosis codes for each admission.

    Each admission receives 1 primary + 0-5 secondary diagnoses.

    Args:
        admissions_df: Admissions DataFrame.
        rng: NumPy random Generator.

    Returns:
        DataFrame with one row per diagnosis code.
    """
    logger.info("Generating diagnoses for %d admissions...", len(admissions_df))

    all_icd10_codes = [code for codes in PRIMARY_DIAGNOSES.values() for code in codes]
    comorbidity_codes = list(COMORBIDITY_ICD10.values())

    records = []
    for _, row in admissions_df.iterrows():
        admission_id = row["admission_id"]
        category = row["primary_diagnosis_category"]

        # Primary diagnosis from the admission's primary category
        primary_code = str(rng.choice(PRIMARY_DIAGNOSES[category]))
        records.append({
            "diagnosis_id": f"DX-{str(uuid.uuid4()).upper()[:10]}",
            "admission_id": admission_id,
            "icd10_code": primary_code,
            "description": category,
            "diagnosis_type": "Primary",
            "sequence": 1,
        })

        # Secondary diagnoses (comorbidities)
        num_secondary = int(rng.integers(0, 6))
        secondary_codes = rng.choice(comorbidity_codes, size=num_secondary, replace=False)
        for seq, code in enumerate(secondary_codes, start=2):
            code_str = str(code)
            desc = next(
                (k for k, v in COMORBIDITY_ICD10.items() if v == code_str),
                code_str,
            )
            records.append({
                "diagnosis_id": f"DX-{str(uuid.uuid4()).upper()[:10]}",
                "admission_id": admission_id,
                "icd10_code": code_str,
                "description": desc,
                "diagnosis_type": "Secondary",
                "sequence": seq,
            })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Procedures generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_procedures(
    admissions_df: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate CPT procedure codes for each admission.

    Args:
        admissions_df: Admissions DataFrame.
        rng: NumPy random Generator.

    Returns:
        DataFrame with one row per procedure performed.
    """
    logger.info("Generating procedures for %d admissions...", len(admissions_df))

    records = []
    for _, row in admissions_df.iterrows():
        num_procedures = int(rng.integers(1, 6))
        procedure_codes = rng.choice(PROCEDURE_CODES, size=num_procedures, replace=False)
        admission_date = datetime.strptime(str(row["admission_date"]), "%Y-%m-%d")

        for code in procedure_codes:
            procedure_date = admission_date + timedelta(days=int(rng.integers(0, row["los_days"] + 1)))
            records.append({
                "procedure_id": f"PROC-{str(uuid.uuid4()).upper()[:10]}",
                "admission_id": row["admission_id"],
                "cpt_code": str(code),
                "procedure_date": procedure_date.strftime("%Y-%m-%d"),
                "performing_department": str(rng.choice(DEPARTMENTS)),
                "charge_amount": round(float(rng.lognormal(mean=7.0, sigma=0.9)), 2),
            })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Vitals generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_vitals(
    admissions_df: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate vital signs time series for each admission.

    Generates 6-12 vital sign readings per admission day, simulating
    realistic clinical deterioration patterns for readmission cases.

    Args:
        admissions_df: Admissions DataFrame.
        rng: NumPy random Generator.

    Returns:
        DataFrame with time-series vital signs.
    """
    logger.info("Generating vitals for %d admissions...", len(admissions_df))

    records = []
    for _, row in admissions_df.iterrows():
        admission_date = datetime.strptime(str(row["admission_date"]), "%Y-%m-%d")
        los = max(1, int(row["los_days"]))
        is_readmission = bool(row["readmitted_30_day"])

        num_readings = int(rng.integers(6, 13)) * los
        for i in range(num_readings):
            offset_hours = float(rng.uniform(0, los * 24))
            reading_time = admission_date + timedelta(hours=offset_hours)

            # Readmission patients tend to have more abnormal vitals
            severity = 1.5 if is_readmission else 1.0

            sbp = float(rng.normal(130 * severity, 20))
            dbp = sbp * float(rng.uniform(0.55, 0.65))
            hr = float(rng.normal(85 * severity, 18))
            rr = float(rng.normal(18 * severity, 4))
            temp_f = float(rng.normal(98.8 * (1.0 + 0.02 * (severity - 1)), 1.2))
            spo2 = float(rng.normal(96 - 2 * (severity - 1), 2)).clip(70, 100)

            records.append({
                "vital_id": f"VIT-{str(uuid.uuid4()).upper()[:10]}",
                "admission_id": row["admission_id"],
                "recorded_at": reading_time.strftime("%Y-%m-%d %H:%M:%S"),
                "systolic_bp": round(sbp, 1),
                "diastolic_bp": round(dbp, 1),
                "heart_rate": round(hr, 1),
                "respiratory_rate": round(rr, 1),
                "temperature_f": round(temp_f, 1),
                "spo2_pct": round(spo2, 1),
                "weight_kg": round(float(rng.normal(82, 20)), 1),
                "news2_score": int(rng.integers(0, 20)) if is_readmission else int(rng.integers(0, 7)),
            })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Medications generation
# ─────────────────────────────────────────────────────────────────────────────


def generate_medications(
    admissions_df: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    Generate medication orders for each admission.

    Args:
        admissions_df: Admissions DataFrame.
        rng: NumPy random Generator.

    Returns:
        DataFrame with medication order records.
    """
    logger.info("Generating medication orders for %d admissions...", len(admissions_df))

    routes = ["PO", "IV", "SC", "IM", "SL", "PR"]
    frequencies = ["QD", "BID", "TID", "QID", "Q4H", "Q6H", "QHS", "PRN"]
    statuses = ["Active", "Discontinued", "Completed", "Hold"]

    records = []
    for _, row in admissions_df.iterrows():
        num_meds = int(rng.integers(2, 10))
        selected_meds = rng.choice(MEDICATION_NAMES, size=num_meds, replace=False)
        admission_date = datetime.strptime(str(row["admission_date"]), "%Y-%m-%d")

        for med in selected_meds:
            order_date = admission_date + timedelta(days=int(rng.integers(0, max(1, row["los_days"]))))
            records.append({
                "medication_id": f"MED-{str(uuid.uuid4()).upper()[:10]}",
                "admission_id": row["admission_id"],
                "medication_name": str(med),
                "route": str(rng.choice(routes)),
                "frequency": str(rng.choice(frequencies)),
                "order_date": order_date.strftime("%Y-%m-%d"),
                "status": str(rng.choice(statuses, p=[0.50, 0.25, 0.20, 0.05])),
                "prescribing_provider": f"NPI{rng.integers(1000000000, 9999999999):010d}",
            })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Save utilities
# ─────────────────────────────────────────────────────────────────────────────


def save_dataframe(df: pd.DataFrame, filename: str, output_dir: Path) -> None:
    """
    Save a DataFrame to CSV in the output directory.

    Args:
        df: DataFrame to save.
        filename: Target filename (e.g. 'patients.csv').
        output_dir: Directory to write the file to.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    filepath = output_dir / filename
    df.to_csv(filepath, index=False)
    logger.info("  Saved %s → %d rows, %d cols", filepath, len(df), len(df.columns))


# ─────────────────────────────────────────────────────────────────────────────
# Main entrypoint
# ─────────────────────────────────────────────────────────────────────────────


def main() -> None:
    """Orchestrate synthetic EHR data generation and save all output files."""
    logger.info("=" * 60)
    logger.info("CareIQ Synthetic EHR Data Generator")
    logger.info("  Patients:    %d", NUM_PATIENTS)
    logger.info("  Admissions:  %d", NUM_ADMISSIONS)
    logger.info("  Readm. rate: %.0f%%", READMISSION_RATE * 100)
    logger.info("  Random seed: %d", RANDOM_SEED)
    logger.info("  Output dir:  %s", OUTPUT_DIR)
    logger.info("=" * 60)

    # Seed everything for reproducibility
    random.seed(RANDOM_SEED)
    rng = np.random.default_rng(RANDOM_SEED)
    fake = Faker("en_US")
    Faker.seed(RANDOM_SEED)

    # Generate datasets in dependency order
    patients_df = generate_patients(NUM_PATIENTS, fake, rng)
    save_dataframe(patients_df, "patients.csv", OUTPUT_DIR)

    admissions_df = generate_admissions(patients_df, NUM_ADMISSIONS, READMISSION_RATE, rng)
    save_dataframe(admissions_df, "admissions.csv", OUTPUT_DIR)

    diagnoses_df = generate_diagnoses(admissions_df, rng)
    save_dataframe(diagnoses_df, "diagnoses.csv", OUTPUT_DIR)

    procedures_df = generate_procedures(admissions_df, rng)
    save_dataframe(procedures_df, "procedures.csv", OUTPUT_DIR)

    vitals_df = generate_vitals(admissions_df, rng)
    save_dataframe(vitals_df, "vitals.csv", OUTPUT_DIR)

    medications_df = generate_medications(admissions_df, rng)
    save_dataframe(medications_df, "medications.csv", OUTPUT_DIR)

    # Print summary statistics
    readmission_actual = admissions_df["readmitted_30_day"].mean()
    logger.info("=" * 60)
    logger.info("Generation complete.")
    logger.info("  Actual readmission rate: %.2f%%", readmission_actual * 100)
    logger.info("  Total diagnosis codes:   %d", len(diagnoses_df))
    logger.info("  Total procedures:        %d", len(procedures_df))
    logger.info("  Total vital readings:    %d", len(vitals_df))
    logger.info("  Total medication orders: %d", len(medications_df))
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
