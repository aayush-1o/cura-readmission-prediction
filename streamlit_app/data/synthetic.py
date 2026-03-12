"""
Synthetic data generator — mirrors the CareIQ ingestion pipeline output
but runs in-process so no DB / Redis / MLflow is needed for the Streamlit demo.
All data is seeded for reproducibility.
"""
from __future__ import annotations

import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, date

# ── Constants (mirrors ingestion/generate_synthetic_data.py) ──────────────────
DEPARTMENTS = [
    "Cardiology", "Internal Medicine", "Pulmonology", "Neurology",
    "Orthopedics", "Nephrology", "Oncology", "Endocrinology",
    "Gastroenterology", "General Surgery",
]
INSURANCE_TYPES = [
    "Medicare", "Medicaid", "Commercial PPO", "Commercial HMO",
    "Uninsured", "Tricare", "Other Government",
]
DISCHARGE_DISPOSITIONS = [
    "Home", "Home with Home Health", "Skilled Nursing Facility",
    "Inpatient Rehab", "Long-term Care Hospital", "Against Medical Advice",
]
PRIMARY_DIAGNOSES = {
    "Heart Failure": ["I50.9", "I50.1", "I50.20"],
    "COPD": ["J44.1", "J44.0", "J44.9"],
    "Pneumonia": ["J18.9", "J18.1", "J15.9"],
    "Sepsis": ["A41.9", "A41.51"],
    "Diabetes": ["E11.9", "E11.65", "E10.9"],
    "Acute MI": ["I21.9", "I21.3"],
    "Stroke": ["I63.9", "I63.50"],
    "Kidney Disease": ["N18.5", "N18.6"],
    "Hip Fracture": ["S72.001A", "S72.002A"],
    "UTI": ["N39.0", "N10"],
}
COMORBIDITIES = [
    "Hypertension", "Diabetes Type 2", "COPD", "Heart Failure",
    "CKD Stage 3", "Atrial Fibrillation", "Obesity", "Depression",
    "Anemia", "Hypothyroidism",
]
RISK_COHORTS = [
    "T1_CatastrophicRisk", "T2_HighRisk", "T3_ModerateRisk", "T4_LowRisk"
]
CLUSTER_NAMES = [
    "Complex Elderly MultiMorbid", "Young Surgical Recovery",
    "Chronic Respiratory", "Cardiac High-Utilizer",
    "Low-Acuity Short-Stay", "Oncology Complex",
]
ALERT_TYPES = [
    "high_risk_new_admission", "score_spike", "data_quality_alert",
    "pipeline_failure", "model_drift", "missed_followup",
]
GENDERS = ["Male", "Female", "Non-binary"]
RACES = ["White", "Black or African American", "Hispanic/Latino", "Asian", "Other"]

CARE_INTERVENTIONS = {
    "specialist_referral": {
        "label": "Specialist Referral", "icon": "🩺",
        "actions": [
            "Refer to heart failure specialty clinic within 14 days of discharge",
            "Pulmonology follow-up within 7 days for COPD exacerbation",
            "Nephrology consult for CKD Stage 4 management",
            "Endocrinology referral for uncontrolled diabetes (A1c > 9)",
            "Cardiology follow-up post-ACS event within 14 days",
        ],
        "rationale": "Specialty follow-up within 14 days reduces 30-day readmission by 34%.",
        "evidence_grade": "A", "reduces_by": 34,
    },
    "discharge_planning": {
        "label": "Discharge Planning", "icon": "🏠",
        "actions": [
            "Arrange home health nursing for daily weight monitoring",
            "Coordinate skilled nursing facility placement",
            "Schedule transitional care nurse 30-day phone follow-up",
            "Arrange durable medical equipment: O2, nebulizer, walker",
            "Complete social work assessment for community support resources",
        ],
        "rationale": "Structured discharge planning reduces readmission rate by 22–28%.",
        "evidence_grade": "A", "reduces_by": 28,
    },
    "medication_management": {
        "label": "Medication Management", "icon": "💊",
        "actions": [
            "Complete pharmacist-led medication reconciliation before discharge",
            "Educate patient on anticoagulation monitoring and bleeding signs",
            "Simplify medication regimen to improve polypharmacy adherence",
            "Prescribe heart failure evidence-based medications (ARNI, SGLT2i)",
            "Review and optimize diuretic dosing for volume management",
        ],
        "rationale": "Pharmacist-led med reconciliation reduces adverse drug events by 14%.",
        "evidence_grade": "A", "reduces_by": 14,
    },
    "patient_education": {
        "label": "Patient Education", "icon": "📋",
        "actions": [
            "Teach-back education on CHF warning signs: weight gain, edema, dyspnea",
            "Provide written COPD action plan for exacerbation self-management",
            "Diabetes self-management education: glucose monitoring, diet, foot care",
            "Educate on when to seek emergency care vs. call the care team",
            "Involve family/caregiver in discharge education session",
        ],
        "rationale": "Teach-back education prevents 21% of CHF readmissions.",
        "evidence_grade": "A", "reduces_by": 21,
    },
    "follow_up_scheduling": {
        "label": "Follow-up Scheduling", "icon": "📅",
        "actions": [
            "Schedule primary care follow-up within 7 days post-discharge",
            "Arrange telehealth check-in at 48 hours post-discharge",
            "Book cardiac rehab enrollment within 2 weeks",
            "Schedule repeat labs: BMP, CBC within 1 week",
            "Set automated 30-day readmission risk review reminder",
        ],
        "rationale": "Primary care follow-up within 7 days reduces readmission by 19%.",
        "evidence_grade": "B", "reduces_by": 19,
    },
    "social_services": {
        "label": "Social Services", "icon": "🤝",
        "actions": [
            "Screen for social determinants: housing, food insecurity, transportation",
            "Connect with community health worker for longitudinal support",
            "Apply for Medicaid/Medicare Savings Program if eligible",
            "Arrange Meals on Wheels or community meal program",
            "Assess caregiver burden and provide respite care information",
        ],
        "rationale": "SDOH interventions reduce avoidable readmissions by 18%.",
        "evidence_grade": "B", "reduces_by": 18,
    },
}


# ── Core generators ────────────────────────────────────────────────────────────

def _rng(seed: int = 42) -> np.random.Generator:
    return np.random.default_rng(seed)


def generate_patients(n: int = 500, seed: int = 42) -> pd.DataFrame:
    rng = _rng(seed)
    random.seed(seed)
    ages = rng.integers(18, 95, size=n)
    records = []
    for i in range(n):
        age = int(ages[i])
        # Insurance weights by age
        if age >= 65:
            ins_weights = [0.70, 0.05, 0.10, 0.05, 0.05, 0.03, 0.02]
        elif age < 19:
            ins_weights = [0.0, 0.35, 0.30, 0.15, 0.10, 0.05, 0.05]
        else:
            ins_weights = [0.0, 0.15, 0.40, 0.20, 0.15, 0.05, 0.05]

        n_comorbidities = max(0, int(rng.poisson(max(0.01, 0.1 + (age - 40) * 0.04))))
        n_comorbidities = min(n_comorbidities, len(COMORBIDITIES))
        cci = round(min(12, n_comorbidities * 1.4 + rng.random() * 1.5), 1)
        prior_admissions = max(0, int(rng.poisson(0.8 + n_comorbidities * 0.3)))
        prior_readmissions = max(0, int(rng.binomial(prior_admissions, 0.18)))
        high_utilizer = prior_admissions >= 3 or prior_readmissions >= 2

        if age < 30:
            ag = "18-30"
        elif age < 46:
            ag = "31-45"
        elif age < 61:
            ag = "46-60"
        elif age < 76:
            ag = "61-75"
        else:
            ag = "76+"

        # Risk cohort based on CCI + prior readmissions
        if cci >= 8 or prior_readmissions >= 3:
            cohort = "T1_CatastrophicRisk"
        elif cci >= 5 or prior_readmissions >= 2:
            cohort = "T2_HighRisk"
        elif cci >= 2 or prior_admissions >= 2:
            cohort = "T3_ModerateRisk"
        else:
            cohort = "T4_LowRisk"

        records.append({
            "patient_id": f"PAT-{10000 + i:06d}",
            "age": age,
            "age_group": ag,
            "gender": rng.choice(GENDERS, p=[0.49, 0.49, 0.02]),
            "race_ethnicity": rng.choice(RACES, p=[0.60, 0.15, 0.15, 0.07, 0.03]),
            "insurance_category": rng.choice(INSURANCE_TYPES, p=ins_weights),
            "comorbidity_count": n_comorbidities,
            "charlson_comorbidity_index": cci,
            "risk_cohort": cohort,
            "cluster_name": rng.choice(CLUSTER_NAMES),
            "prior_admissions_12m": prior_admissions,
            "prior_readmissions_1y": prior_readmissions,
            "high_utilizer_flag": high_utilizer,
            "department": rng.choice(DEPARTMENTS),
            "top_diagnoses": list(rng.choice(list(PRIMARY_DIAGNOSES.keys()), size=min(3, len(PRIMARY_DIAGNOSES)), replace=False)),
        })
    return pd.DataFrame(records)


def generate_admissions(patients_df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    rng = _rng(seed)
    records = []
    sim_start = datetime(2023, 1, 1)
    sim_end = datetime(2025, 3, 1)
    delta_days = (sim_end - sim_start).days

    for _, pat in patients_df.iterrows():
        n_admits = max(1, pat["prior_admissions_12m"] + int(rng.integers(0, 2)))
        for j in range(n_admits):
            admit_offset = int(rng.integers(0, delta_days))
            admit_date = sim_start + timedelta(days=admit_offset)
            los = max(1, int(rng.gamma(2.5, 2.2)))
            discharge_date = admit_date + timedelta(days=los)
            dept = pat["department"]
            icu = bool(rng.random() < 0.15)
            emergency = bool(rng.random() < 0.45)
            # readmission probability based on risk factors
            base_p = (
                0.08
                + pat["charlson_comorbidity_index"] * 0.025
                + pat["prior_readmissions_1y"] * 0.055
                + (0.08 if icu else 0)
                + (0.04 if pat["high_utilizer_flag"] else 0)
            )
            readmit = bool(rng.random() < min(0.92, base_p))

            dx_category = rng.choice(list(PRIMARY_DIAGNOSES.keys()))
            charges = round(float(rng.gamma(3.0, 4500)) + los * 800, 2)

            records.append({
                "admission_id": f"ADM-{len(records)+20000:06d}",
                "patient_id": pat["patient_id"],
                "admission_date": admit_date.date(),
                "discharge_date": discharge_date.date(),
                "department": dept,
                "admission_type": rng.choice(["Emergency", "Elective", "Urgent"], p=[0.45, 0.35, 0.20]),
                "length_of_stay_days": los,
                "icu_flag": icu,
                "emergency_flag": emergency,
                "readmit_30day_flag": readmit,
                "total_charges": charges,
                "insurance_category": pat["insurance_category"],
                "primary_diagnosis_category": dx_category,
                "discharge_disposition": rng.choice(DISCHARGE_DISPOSITIONS),
            })

    df = pd.DataFrame(records)
    df["admission_date"] = pd.to_datetime(df["admission_date"])
    df["discharge_date"] = pd.to_datetime(df["discharge_date"])
    return df.sort_values("admission_date").reset_index(drop=True)


def _compute_risk_score(row: dict, prior_readmissions: int, cci: float, high_utilizer: bool) -> float:
    score = (
        0.10
        + cci * 0.038
        + prior_readmissions * 0.11
        + (0.12 if row.get("icu_flag") else 0)
        + (0.07 if row.get("emergency_flag") else 0)
        + (0.08 if high_utilizer else 0)
        + min(row.get("length_of_stay_days", 3), 14) * 0.012
        + np.random.default_rng(hash(row["admission_id"]) % (2**32)).normal(0, 0.10)
    )
    return round(float(np.clip(score, 0.03, 0.97)), 4)


def _score_to_tier(score: float) -> str:
    if score >= 0.80:
        return "critical"
    if score >= 0.65:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def generate_predictions(admissions_df: pd.DataFrame, patients_df: pd.DataFrame) -> pd.DataFrame:
    pat_lookup = patients_df.set_index("patient_id")[
        ["charlson_comorbidity_index", "prior_readmissions_1y", "high_utilizer_flag"]
    ].to_dict("index")

    records = []
    for _, row in admissions_df.iterrows():
        pid = row["patient_id"]
        pat = pat_lookup.get(pid, {"charlson_comorbidity_index": 2, "prior_readmissions_1y": 0, "high_utilizer_flag": False})
        score = _compute_risk_score(
            row.to_dict(),
            int(pat["prior_readmissions_1y"]),
            float(pat["charlson_comorbidity_index"]),
            bool(pat["high_utilizer_flag"]),
        )
        tier = _score_to_tier(score)
        records.append({
            "admission_id": row["admission_id"],
            "patient_id": pid,
            "risk_score": score,
            "risk_tier": tier,
        })
    return pd.DataFrame(records)


def generate_trends(n_months: int = 12, seed: int = 42) -> pd.DataFrame:
    rng = _rng(seed)
    records = []
    base_date = datetime(2024, 4, 1)
    for i in range(n_months):
        month_start = base_date + timedelta(days=30 * i)
        for dept in DEPARTMENTS[:5]:
            total = int(rng.integers(80, 180))
            rate = float(rng.uniform(8, 24))
            readmits = int(total * rate / 100)
            records.append({
                "period_start": month_start.strftime("%Y-%m-%d"),
                "department_name": dept,
                "total_admissions": total,
                "total_readmissions": readmits,
                "readmission_rate_pct": round(rate, 2),
                "avg_los_days": round(float(rng.uniform(3.5, 9)), 1),
                "avg_cost_usd": round(float(rng.uniform(5500, 14000)), 0),
                "cms_benchmark_pct": 15.0,
            })
    return pd.DataFrame(records)


def generate_department_performance(seed: int = 42) -> list[dict]:
    rng = _rng(seed)
    rows = []
    for dept in DEPARTMENTS:
        rate = round(float(rng.uniform(6, 24)), 1)
        bench = 15.0
        delta = round(rate - bench, 1)
        if delta <= -2:
            label = "Above Benchmark"
            stars = 5
        elif delta <= 0:
            label = "On Target"
            stars = 4
        elif delta <= 3:
            label = "Below Benchmark"
            stars = 2
        else:
            label = "Needs Improvement"
            stars = 1
        rows.append({
            "department_name": dept,
            "readmission_rate": rate,
            "benchmark_readmission_rate": bench,
            "vs_benchmark_delta": delta,
            "cms_star_rating": stars,
            "performance_label": label,
            "avg_los_days": round(float(rng.uniform(3, 9)), 1),
            "avg_cost_usd": int(rng.integers(6000, 15000)),
            "rolling_3m_avg": round(rate + rng.uniform(-1, 1), 1),
            "mom_readmission_delta": round(float(rng.uniform(-1.5, 1.5)), 1),
        })
    return rows


def generate_alerts(n: int = 20, seed: int = 42) -> list[dict]:
    rng = _rng(seed)
    random.seed(seed)
    now = datetime.utcnow()
    alerts = []
    severities = ["critical", "high", "warning", "info"]
    for i in range(n):
        alert_type = rng.choice(ALERT_TYPES)
        severity = rng.choice(severities, p=[0.15, 0.30, 0.35, 0.20])
        created_ago = timedelta(minutes=int(rng.integers(0, 480)))
        pat_id = f"PAT-{10000 + int(rng.integers(0, 500)):06d}"

        titles = {
            "high_risk_new_admission": f"New high-risk admission — {pat_id}",
            "score_spike": f"Risk score spike detected — {pat_id}",
            "data_quality_alert": "Data quality issue: missing vitals",
            "pipeline_failure": "ETL pipeline delayed > 15 min",
            "model_drift": "Model drift detected — PSI 0.28 (threshold 0.25)",
            "missed_followup": f"Missed 7-day follow-up — {pat_id}",
        }
        descriptions = {
            "high_risk_new_admission": f"Patient admitted with risk score ≥ 0.80. Immediate care plan review recommended.",
            "score_spike": f"Risk score increased from 0.44 → 0.79 in the last 4 hours.",
            "data_quality_alert": "30% of vitals records for Cardiology missing SpO2 readings.",
            "pipeline_failure": "Airflow DAG `careiq_daily_etl` has been running for 18 minutes.",
            "model_drift": "Population Stability Index exceeded threshold. Model retraining may be required.",
            "missed_followup": "Patient was discharged 8 days ago with no documented follow-up contact.",
        }
        alerts.append({
            "alert_id": f"ALT-{i:04d}",
            "alert_type": alert_type,
            "severity": severity,
            "title": titles[alert_type],
            "description": descriptions[alert_type],
            "created_at": (now - created_ago).strftime("%Y-%m-%d %H:%M:%S"),
            "acknowledged": bool(i >= 10),
            "related_patient_id": pat_id if "patient" in alert_type or "admission" in alert_type or "followup" in alert_type else None,
        })
    return sorted(alerts, key=lambda x: x["created_at"], reverse=True)


def generate_care_plan(patient: dict, admission: dict) -> dict:
    """Generate a mock care plan for a patient + admission."""
    cci = patient.get("charlson_comorbidity_index", 3)
    prior_r = patient.get("prior_readmissions_1y", 0)
    icu = admission.get("icu_flag", False)
    high_u = patient.get("high_utilizer_flag", False)
    los = admission.get("length_of_stay_days", 4)

    risk_score = round(
        min(0.97, 0.10 + cci * 0.028 + prior_r * 0.075 + (0.09 if icu else 0) + (0.06 if high_u else 0)),
        3,
    )
    risk_tier = _score_to_tier(risk_score)

    # SHAP-like risk factors
    factors = []
    if prior_r > 0:
        factors.append({"feature": "prior_readmissions_1y", "display_label": "Prior readmissions (1yr)",
                        "value": prior_r, "shap_value": round(prior_r * 0.075, 3), "direction": "increases_risk"})
    if cci > 0:
        factors.append({"feature": "charlson_comorbidity_index", "display_label": "Charlson CCI",
                        "value": cci, "shap_value": round(cci * 0.028, 3), "direction": "increases_risk"})
    if icu:
        factors.append({"feature": "icu_flag", "display_label": "ICU this admission",
                        "value": 1, "shap_value": 0.09, "direction": "increases_risk"})
    if high_u:
        factors.append({"feature": "high_utilizer_flag", "display_label": "High utilizer",
                        "value": 1, "shap_value": 0.06, "direction": "increases_risk"})
    if los > 5:
        factors.append({"feature": "length_of_stay_days", "display_label": "Length of stay",
                        "value": los, "shap_value": round(los * 0.008, 3), "direction": "increases_risk"})
    factors.append({"feature": "base_rate", "display_label": "Base population rate",
                    "value": None, "shap_value": 0.10, "direction": "increases_risk"})
    factors = sorted(factors, key=lambda x: x["shap_value"], reverse=True)[:6]

    # Generate recommendations
    rng = np.random.default_rng(42)
    rec_categories = list(CARE_INTERVENTIONS.items())
    rng.shuffle(rec_categories)
    recs = []
    for priority, (cat_key, cat_data) in enumerate(rec_categories[:4], start=1):
        action_idx = int(rng.integers(0, len(cat_data["actions"])))
        recs.append({
            "priority": priority,
            "category": cat_key,
            "category_label": cat_data["label"],
            "category_icon": cat_data["icon"],
            "action": cat_data["actions"][action_idx],
            "rationale": cat_data["rationale"],
            "evidence_grade": cat_data["evidence_grade"],
            "reduces_readmission_by_pct": cat_data["reduces_by"],
        })

    return {
        "patient_id": patient["patient_id"],
        "admission_id": admission["admission_id"],
        "generated_at": datetime.utcnow().isoformat(),
        "risk_score": risk_score,
        "risk_tier": risk_tier,
        "risk_factors": factors,
        "recommendations": recs,
        "cohort_name": patient.get("cluster_name", "N/A"),
        "cohort_average_risk": round(min(0.9, risk_score * 0.87), 3),
        "similar_patient_outcomes": [
            {"patient_id": f"PAT-{9000+i:06d}", "age": patient["age"] + random.randint(-4, 4),
             "charlson_cci": round(cci + random.uniform(-0.5, 0.5), 1),
             "length_of_stay_days": los + random.randint(-2, 2),
             "similarity": round(0.95 - i * 0.03, 2), "outcome": "No readmission"}
            for i in range(3)
        ],
    }


# ── Session-level data bundle ──────────────────────────────────────────────────

def get_session_data(seed: int = 42) -> dict:
    """Build and cache all synthetic data as a single dict."""
    patients = generate_patients(500, seed)
    admissions = generate_admissions(patients, seed)
    predictions = generate_predictions(admissions, patients)
    trends = generate_trends(12, seed)
    dept_perf = generate_department_performance(seed)
    alerts = generate_alerts(20, seed)

    # Merge predictions onto admissions
    adm_pred = admissions.merge(predictions[["admission_id", "risk_score", "risk_tier"]], on="admission_id", how="left")
    adm_pred = adm_pred.merge(patients[["patient_id", "age", "gender", "charlson_comorbidity_index",
                                         "risk_cohort", "cluster_name", "prior_readmissions_1y",
                                         "high_utilizer_flag"]], on="patient_id", how="left")

    # Recent 30-day admissions
    cutoff = adm_pred["admission_date"].max() - timedelta(days=30)
    recent = adm_pred[adm_pred["admission_date"] >= cutoff]

    # Dashboard summary
    dashboard = {
        "total_patients": len(patients),
        "total_admissions_30d": len(recent),
        "total_readmissions_30d": int(recent["readmit_30day_flag"].sum()),
        "avg_readmission_rate_pct": round(float(recent["readmit_30day_flag"].mean()) * 100, 1),
        "avg_los_days": round(float(recent["length_of_stay_days"].mean()), 1),
        "high_risk_patients_today": int((predictions["risk_tier"].isin(["high", "critical"])).sum()),
        "avg_risk_score": round(float(predictions["risk_score"].mean()), 3),
        "total_cost_30d": int(recent["total_charges"].sum()),
        "department_count": len(DEPARTMENTS),
        "as_of": datetime.utcnow().isoformat() + "Z",
    }

    # High-risk queue
    high_risk = adm_pred[adm_pred["risk_tier"].isin(["critical", "high"])].copy()
    high_risk = high_risk.sort_values("risk_score", ascending=False).head(50)

    # Risk distribution
    risk_dist = predictions["risk_tier"].value_counts().reset_index()
    risk_dist.columns = ["risk_tier", "patient_count"]

    return {
        "dashboard": dashboard,
        "patients": patients,
        "admissions": adm_pred,
        "predictions": predictions,
        "high_risk": high_risk,
        "trends": trends,
        "dept_performance": dept_perf,
        "alerts": alerts,
        "risk_distribution": risk_dist,
    }
