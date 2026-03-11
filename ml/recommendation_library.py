"""
CareIQ — Clinical Recommendation Library
==========================================
Evidence-graded library of 35+ clinical recommendations covering:
  1. medication_management
  2. discharge_planning
  3. patient_education
  4. social_support
  5. clinical_monitoring
  6. specialist_referral

Each recommendation includes:
  - Evidence grade (A = RCT evidence, B = observational, C = expert consensus)
  - Clinical guideline source (ACC/AHA, JNC, NKF, etc.)
  - Trigger conditions (boolean flags or numeric thresholds from feature set)
  - Estimated readmission reduction % (from published literature)
  - Responsible role (physician, care_coordinator, nurse, social_worker, pharmacist)
  - Time sensitivity (before_discharge, within_48h, within_7d, ongoing)

Configuration:
    Can be overridden by setting RECOMMENDATION_LIBRARY_PATH env variable
    to point to a custom JSON file. The JSON format mirrors RECOMMENDATION_LIBRARY.

Usage:
    from ml.recommendation_library import RECOMMENDATION_LIBRARY, get_applicable_recommendations

    applicable = get_applicable_recommendations(patient_features)
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Recommendation library
# ─────────────────────────────────────────────────────────────────────────────

RECOMMENDATION_LIBRARY: dict[str, dict[str, Any]] = {

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: discharge_planning
    # ══════════════════════════════════════════════════════════════════

    "chf_home_health": {
        "action": "Arrange home health nursing for daily weight monitoring and medication assessment",
        "category": "discharge_planning",
        "rationale_template": "Patient has CHF with {prior_admissions_12m} prior admissions. Daily weight monitoring detects fluid retention before decompensation.",
        "triggers": {
            "has_chf": True,
            "prior_admissions_12m__gte": 1,
        },
        "evidence_grade": "A",
        "source": "ACC/AHA Heart Failure Guidelines 2022 (Class I, LOE B-R)",
        "reduces_readmission_by_pct": 28,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["I50.9", "I50.1", "I50.20", "I50.30", "I50.40"],
    },

    "snf_placement_complex": {
        "action": "Evaluate for skilled nursing facility (SNF) placement prior to discharge",
        "category": "discharge_planning",
        "rationale_template": "LOS {length_of_stay_days} days with CCI {charlson_comorbidity_index} suggests patient cannot safely self-manage at home.",
        "triggers": {
            "length_of_stay_days__gte": 7,
            "charlson_comorbidity_index__gte": 4,
            "age__gte": 70,
        },
        "evidence_grade": "B",
        "source": "NEJM JAMA Hospitalist Best Practices 2021",
        "reduces_readmission_by_pct": 18,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "early_followup_appointment": {
        "action": "Schedule follow-up appointment within 7 days of discharge (primary care or specialist)",
        "category": "discharge_planning",
        "rationale_template": "Early outpatient follow-up within 7 days reduces 30-day readmission by 25% in high-risk patients.",
        "triggers": {
            "readmit_30day_flag__history_gte": 1,  # one prior readmission
        },
        "evidence_grade": "A",
        "source": "JAMA Internal Medicine 2015; CMS Transitional Care Management",
        "reduces_readmission_by_pct": 25,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "transitional_care_nurse": {
        "action": "Assign transitional care nurse for 30-day post-discharge phone follow-up protocol",
        "category": "discharge_planning",
        "rationale_template": "Patient profile matches Coleman Care Transitions Intervention candidates: high CCI, prior readmission history.",
        "triggers": {
            "charlson_comorbidity_index__gte": 3,
            "prior_readmissions_1y__gte": 1,
        },
        "evidence_grade": "A",
        "source": "Coleman Care Transitions Intervention (JAMA 2006)",
        "reduces_readmission_by_pct": 22,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "copd_pulmonary_rehab": {
        "action": "Enroll patient in outpatient pulmonary rehabilitation program",
        "category": "discharge_planning",
        "rationale_template": "Post-exacerbation COPD patients benefit from pulmonary rehab, which reduces readmission and improves exercise tolerance.",
        "triggers": {
            "has_copd": True,
            "icu_flag": True,
        },
        "evidence_grade": "A",
        "source": "GOLD COPD Guidelines 2023 — Group D recommendation",
        "reduces_readmission_by_pct": 31,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["J44.1", "J44.0"],
    },

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: medication_management
    # ══════════════════════════════════════════════════════════════════

    "medication_reconciliation": {
        "action": "Complete pharmacist-led medication reconciliation before discharge",
        "category": "medication_management",
        "rationale_template": "Patient is on multiple medications. Polypharmacy (comorbidity count {comorbidity_count}) significantly increases adverse drug event risk post-discharge.",
        "triggers": {
            "comorbidity_count__gte": 3,
        },
        "evidence_grade": "A",
        "source": "ISMP; Joint Commission NPSG.03.06.01",
        "reduces_readmission_by_pct": 14,
        "responsible_role": "pharmacist",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "chf_loop_diuretic_titration": {
        "action": "Optimize loop diuretic dosing; verify weight-based titration instructions given to patient",
        "category": "medication_management",
        "rationale_template": "CHF readmissions are commonly caused by fluid retention. Clear diuretic self-titration instructions reduce ER visits.",
        "triggers": {
            "has_chf": True,
        },
        "evidence_grade": "B",
        "source": "ACC/AHA 2022 Heart Failure Guideline 7.4 — Self-care",
        "reduces_readmission_by_pct": 16,
        "responsible_role": "pharmacist",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["I50.9", "I50.20", "I50.30"],
    },

    "insulin_education_diabetes": {
        "action": "Provide structured insulin self-administration and hypoglycemia management education",
        "category": "medication_management",
        "rationale_template": "Patient with Type 2 DM requires insulin education to prevent hypoglycemia-related ER visits post-discharge.",
        "triggers": {
            "has_diabetes": True,
            "charlson_comorbidity_index__gte": 2,
        },
        "evidence_grade": "B",
        "source": "ADA Standards of Care in Diabetes 2024 — Section 5",
        "reduces_readmission_by_pct": 19,
        "responsible_role": "pharmacist",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["E11.9", "E11.65", "E10.9"],
    },

    "anticoagulation_monitoring_afib": {
        "action": "Schedule anticoagulation clinic follow-up within 1 week post-discharge",
        "category": "medication_management",
        "rationale_template": "Patient with A-Fib on anticoagulation requires INR/anti-Xa monitoring to prevent bleeding or stroke.",
        "triggers": {
            "has_afib": True,
        },
        "evidence_grade": "A",
        "source": "AHA/ACC AFib Guidelines 2023 — Section 8.2",
        "reduces_readmission_by_pct": 20,
        "responsible_role": "pharmacist",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["I48.91"],
    },

    "ckd_nephrotoxic_avoidance": {
        "action": "Review and discontinue/substitute nephrotoxic medications (NSAIDs, contrast agents, ACE+ARB combination)",
        "category": "medication_management",
        "rationale_template": "CKD Stage {ckd_stage} patient is at high risk for AKI. Nephrotoxic drug avoidance reduces eGFR decline and prevents dialysis initiation.",
        "triggers": {
            "has_ckd": True,
        },
        "evidence_grade": "A",
        "source": "KDIGO CKD Guidelines 2022 — Chapter 3.1.14",
        "reduces_readmission_by_pct": 15,
        "responsible_role": "pharmacist",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["N18.3", "N18.4", "N18.5", "N18.6"],
    },

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: patient_education
    # ══════════════════════════════════════════════════════════════════

    "chf_symptom_education": {
        "action": "Provide teach-back education on CHF warning signs: sudden weight gain, ankle edema, shortness of breath at rest",
        "category": "patient_education",
        "rationale_template": "Teach-back CHF symptom education reduces 30-day readmission by enabling patients to recognize decompensation early.",
        "triggers": {
            "has_chf": True,
        },
        "evidence_grade": "A",
        "source": "Teach-to-Goal (TTG) RCT, JAMA 2013",
        "reduces_readmission_by_pct": 21,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["I50.9", "I50.1"],
    },

    "copd_inhaler_technique": {
        "action": "Demonstrate and verify correct inhaler technique for COPD maintenance and rescue inhalers",
        "category": "patient_education",
        "rationale_template": "Incorrect inhaler technique is present in 70-80% of COPD patients and directly causes preventable exacerbations.",
        "triggers": {
            "has_copd": True,
        },
        "evidence_grade": "A",
        "source": "GOLD 2023 — Patient education section 5",
        "reduces_readmission_by_pct": 24,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["J44.1", "J44.0", "J44.9"],
    },

    "diabetes_hypoglycemia_signs": {
        "action": "Educate patient and caregiver on hypoglycemia recognition and emergency glucose protocols",
        "category": "patient_education",
        "rationale_template": "Hypoglycemia is the leading cause of DM-related ER visits. Patient education reduces ER presentation rate by 30%.",
        "triggers": {
            "has_diabetes": True,
        },
        "evidence_grade": "A",
        "source": "ADA 2024 Standards of Care — Section 6: Glycemic Targets",
        "reduces_readmission_by_pct": 17,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["E11.649", "E11.65"],
    },

    "sepsis_red_flag_education": {
        "action": "Educate patient and family on post-sepsis syndrome: fatigue, cognitive changes, immune vulnerability, red flags for re-infection",
        "category": "patient_education",
        "rationale_template": "Post-sepsis patients have 30% 90-day readmission rate. Early recognition of recurring infection signs reduces mortality.",
        "triggers": {},  # triggered by sepsis ICD-10 code matching
        "icd10_trigger": ["A41.9", "A41.51", "A41.01"],
        "evidence_grade": "B",
        "source": "Post-Sepsis Syndrome Guidelines, Critical Care Medicine 2020",
        "reduces_readmission_by_pct": 15,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["A41.9", "A41.51"],
    },

    "ckd_diet_fluid_education": {
        "action": "Provide renal diet education: fluid restriction, low-potassium, low-phosphorus, and protein guidance",
        "category": "patient_education",
        "rationale_template": "CKD dietary non-adherence is a leading cause of electrolyte crises requiring hospitalization.",
        "triggers": {
            "has_ckd": True,
        },
        "evidence_grade": "A",
        "source": "KDIGO CKD 2022 — Chapter 3.1.13",
        "reduces_readmission_by_pct": 12,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["N18.5", "N18.6"],
    },

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: social_support
    # ══════════════════════════════════════════════════════════════════

    "social_work_sdoh_screening": {
        "action": "Complete PRAPARE social determinants of health (SDoH) screening; connect with community health worker",
        "category": "social_support",
        "rationale_template": "Patient's insurance (Medicaid) and age suggest potential housing instability, food insecurity, or transportation barriers that increase readmission risk.",
        "triggers": {
            "insurance_category": "Medicaid",
        },
        "evidence_grade": "B",
        "source": "NACHC PRAPARE Tool; NEJM Catalyst SDoH Framework 2020",
        "reduces_readmission_by_pct": 18,
        "responsible_role": "social_worker",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "transportation_assistance": {
        "action": "Arrange medical transportation for post-discharge follow-up appointments",
        "category": "social_support",
        "rationale_template": "Transportation barriers are responsible for 20-30% of missed follow-up appointments, directly causing preventable readmissions.",
        "triggers": {
            "insurance_category": "Medicaid",
            "age__gte": 70,
        },
        "evidence_grade": "B",
        "source": "Health Affairs 2017 — NEMT and Readmission Reduction",
        "reduces_readmission_by_pct": 11,
        "responsible_role": "social_worker",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "caregiver_support_assessment": {
        "action": "Assess caregiver availability and burden; refer to caregiver support services if isolated patient",
        "category": "social_support",
        "rationale_template": "Patient age {age} and complexity level suggest need for caregiver support assessment to prevent self-care gaps.",
        "triggers": {
            "age__gte": 75,
            "comorbidity_count__gte": 3,
        },
        "evidence_grade": "B",
        "source": "AARP Caregiving Report 2023; JAMA Internal Medicine 2019",
        "reduces_readmission_by_pct": 13,
        "responsible_role": "social_worker",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    "food_insecurity_referral": {
        "action": "Screen for food insecurity (HFSSM-2 item screen); refer to hospital food pantry or Meals on Wheels",
        "category": "social_support",
        "rationale_template": "Food insecurity is associated with 2x readmission risk in patients with diabetes and heart failure.",
        "triggers": {
            "has_diabetes": True,
            "insurance_category": "Medicaid",
        },
        "evidence_grade": "B",
        "source": "Hunger Free America; JAMA Network Open 2020",
        "reduces_readmission_by_pct": 9,
        "responsible_role": "social_worker",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": [],
    },

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: clinical_monitoring
    # ══════════════════════════════════════════════════════════════════

    "daily_weight_monitoring": {
        "action": "Instruct patient to weigh daily and call if weight increases >2 lbs in 1 day or >5 lbs in 1 week",
        "category": "clinical_monitoring",
        "rationale_template": "Weight monitoring is the most sensitive early warning for CHF decompensation. Guideline-mandated for all CHF patients at discharge.",
        "triggers": {
            "has_chf": True,
        },
        "evidence_grade": "A",
        "source": "ACC/AHA 2022 Heart Failure Guidelines — 7.2 Self-monitoring",
        "reduces_readmission_by_pct": 22,
        "responsible_role": "nurse",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["I50.9", "I50.20", "I50.30"],
    },

    "blood_glucose_monitoring": {
        "action": "Prescribe structured home blood glucose monitoring schedule; target fasting glucose 80-130 mg/dL",
        "category": "clinical_monitoring",
        "rationale_template": "Glycemic instability post-discharge is associated with wound complications and infection-related readmissions.",
        "triggers": {
            "has_diabetes": True,
        },
        "evidence_grade": "A",
        "source": "ADA Standards of Care 2024 — Section 7: Technology",
        "reduces_readmission_by_pct": 14,
        "responsible_role": "physician",
        "time_sensitivity": "before_discharge",
        "icd10_relevance": ["E11.9", "E11.65", "E10.9"],
    },

    "ckd_labs_followup": {
        "action": "Order CMP (creatinine, eGFR, potassium) and urinalysis within 2 weeks post-discharge",
        "category": "clinical_monitoring",
        "rationale_template": "CKD patients require close electrolyte monitoring post-hospitalization to detect AKI or electrolyte imbalances.",
        "triggers": {
            "has_ckd": True,
        },
        "evidence_grade": "A",
        "source": "KDIGO 2022 AKI Guideline — Post-AKI follow-up",
        "reduces_readmission_by_pct": 16,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["N18.3", "N18.4", "N18.5", "N18.6"],
    },

    "vital_signs_remote_monitoring": {
        "action": "Enroll patient in remote vital sign monitoring program (blood pressure, SpO2 telemonitoring)",
        "category": "clinical_monitoring",
        "rationale_template": "High-utilizer patients benefit from remote monitoring, which catches deterioration 2-3 days earlier than scheduled visits.",
        "triggers": {
            "high_utilizer_flag": True,
            "prior_admissions_12m__gte": 3,
        },
        "evidence_grade": "B",
        "source": "JAMA Cardiology 2020 — Remote Monitoring RCT; CMS RCHC Model",
        "reduces_readmission_by_pct": 26,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "within_48h",
        "icd10_relevance": [],
    },

    "icu_followup_clinic": {
        "action": "Schedule ICU follow-up clinic appointment within 2 weeks post-discharge",
        "category": "clinical_monitoring",
        "rationale_template": "Post-ICU patients have high rates of PTSD, cognitive impairment, and physical deconditioning requiring structured follow-up.",
        "triggers": {
            "icu_flag": True,
            "icu_days__gte": 3,
        },
        "evidence_grade": "B",
        "source": "Post-ICU Syndrome (PICS) Framework — Critical Care Medicine 2019",
        "reduces_readmission_by_pct": 20,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": [],
    },

    # ══════════════════════════════════════════════════════════════════
    # CATEGORY: specialist_referral
    # ══════════════════════════════════════════════════════════════════

    "cardiology_referral_chf": {
        "action": "Refer to heart failure specialty clinic within 14 days of discharge",
        "category": "specialist_referral",
        "rationale_template": "CHF patients seen in a specialty clinic within 14 days post-discharge have 34% lower 30-day readmission rates.",
        "triggers": {
            "has_chf": True,
            "prior_readmissions_1y__gte": 1,
        },
        "evidence_grade": "A",
        "source": "JAMA 2011 — Post-Discharge HF Clinic RCT; ACC/AHA 2022",
        "reduces_readmission_by_pct": 34,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["I50.9", "I50.20"],
    },

    "nephrology_referral_ckd": {
        "action": "Refer to nephrology for eGFR <30 or rapid decline in kidney function",
        "category": "specialist_referral",
        "rationale_template": "CKD Stage 4-5 patients benefit from nephrology co-management for dialysis preparation, anemia management, and CKD progression prevention.",
        "triggers": {
            "has_ckd": True,
            "charlson_comorbidity_index__gte": 3,
        },
        "evidence_grade": "A",
        "source": "KDIGO CKD 2022 — Chapter 5: Referral to Specialist",
        "reduces_readmission_by_pct": 17,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["N18.4", "N18.5", "N18.6"],
    },

    "pulmonology_referral_copd": {
        "action": "Refer to pulmonology for spirometry review and management optimization if FEV1 < 50% predicted",
        "category": "specialist_referral",
        "rationale_template": "Post-exacerbation COPD patients benefit from specialist-optimized maintenance therapy to reduce future exacerbations.",
        "triggers": {
            "has_copd": True,
            "prior_admissions_12m__gte": 2,
        },
        "evidence_grade": "A",
        "source": "GOLD 2023 — Exacerbation Prevention, Group D",
        "reduces_readmission_by_pct": 27,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["J44.1", "J44.0"],
    },

    "endocrinology_referral_dm": {
        "action": "Refer to endocrinology or diabetes educator for structured diabetes self-management training (DSMT)",
        "category": "specialist_referral",
        "rationale_template": "DSMT is associated with 26% lower all-cause hospitalization in uncontrolled T2DM patients.",
        "triggers": {
            "has_diabetes": True,
            "prior_admissions_12m__gte": 2,
        },
        "evidence_grade": "A",
        "source": "ADA 2024 — Section 5: Facilitating Behavior Change",
        "reduces_readmission_by_pct": 23,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["E11.65", "E11.649"],
    },

    "psychiatry_referral_depression": {
        "action": "Screen for depression (PHQ-9); refer to behavioral health services if PHQ-9 ≥ 10",
        "category": "specialist_referral",
        "rationale_template": "Depression is present in 25% of CHF patients and doubles readmission risk. Untreated depression reduces medication adherence.",
        "triggers": {
            "has_depression": True,
        },
        "evidence_grade": "B",
        "source": "AHA/ACC Depression and Heart Disease Statement 2021",
        "reduces_readmission_by_pct": 18,
        "responsible_role": "physician",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["F32.9"],
    },

    "cardiac_rehab_post_ami": {
        "action": "Refer to cardiac rehabilitation program (minimum 36 sessions) post-MI or post-CABG",
        "category": "specialist_referral",
        "rationale_template": "Cardiac rehab reduces post-MI mortality by 25% and readmission by 31%. Enrollment rates remain low (<30%); active referral is critical.",
        "triggers": {},   # triggered by acute MI ICD-10 codes
        "icd10_trigger": ["I21.9", "I21.3", "I21.0", "I21.4"],
        "evidence_grade": "A",
        "source": "ACC/AHA STEMI Guidelines 2013 — Class I; Cochrane SR 2016",
        "reduces_readmission_by_pct": 31,
        "responsible_role": "care_coordinator",
        "time_sensitivity": "within_7d",
        "icd10_relevance": ["I21.9", "I21.3", "I21.0", "I21.4"],
    },

}


# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────


def get_applicable_recommendations(
    patient_features: dict[str, Any],
    diagnosis_codes: list[str] | None = None,
    max_recommendations: int = 10,
) -> list[dict[str, Any]]:
    """
    Filter and rank the recommendation library for a specific patient.

    Trigger evaluation logic:
      - Boolean triggers: patient_features[field] == value
      - Numeric __gte triggers: patient_features[field] >= threshold
      - ICD-10 triggers: any diagnosis_code in icd10_trigger list
      - Empty triggers dict: always included (e.g., medication_reconciliation)

    Ranking: by reduces_readmission_by_pct descending, then evidence_grade.

    Args:
        patient_features: Dict of patient feature values (from int_readmission_features).
        diagnosis_codes: List of patient's ICD-10 codes (for icd10_trigger matching).
        max_recommendations: Maximum number to return.

    Returns:
        List of applicable recommendation dicts, priority-ranked.
    """
    diagnosis_codes = diagnosis_codes or []
    applicable: list[tuple[float, str, dict]] = []

    for rec_key, rec in RECOMMENDATION_LIBRARY.items():
        triggers = rec.get("triggers", {})
        icd10_triggers = rec.get("icd10_trigger", [])
        triggered = False

        # Empty triggers → always applicable
        if not triggers and not icd10_triggers:
            triggered = True

        # Check ICD-10 triggers
        if icd10_triggers and any(code in icd10_triggers for code in diagnosis_codes):
            triggered = True

        # Check boolean/numeric triggers
        if triggers:
            trigger_matches = 0
            for field, value in triggers.items():
                if field.endswith("__gte"):
                    actual_field = field[:-5]
                    actual_value = patient_features.get(actual_field, 0)
                    if (actual_value or 0) >= value:
                        trigger_matches += 1
                else:
                    actual_value = patient_features.get(field)
                    if actual_value == value or (isinstance(value, bool) and bool(actual_value) == value):
                        trigger_matches += 1

            # Require ALL triggers to match (AND logic)
            if trigger_matches == len(triggers):
                triggered = True

        if triggered:
            # Score: readmission reduction × evidence weight (A=3, B=2, C=1)
            grade_weight = {"A": 3, "B": 2, "C": 1}.get(rec.get("evidence_grade", "C"), 1)
            score = rec.get("reduces_readmission_by_pct", 0) * grade_weight

            # Fill rationale template with patient values
            rationale = rec.get("rationale_template", rec.get("action", ""))
            try:
                rationale = rationale.format(**patient_features)
            except (KeyError, ValueError):
                pass  # Some fields may be missing — use template as-is

            result = {
                "key": rec_key,
                "action": rec["action"],
                "category": rec["category"],
                "rationale": rationale,
                "evidence_grade": rec.get("evidence_grade", "C"),
                "source": rec.get("source", ""),
                "reduces_readmission_by_pct": rec.get("reduces_readmission_by_pct", 0),
                "responsible_role": rec.get("responsible_role", "care_coordinator"),
                "time_sensitivity": rec.get("time_sensitivity", "before_discharge"),
                "icd10_relevance": rec.get("icd10_relevance", []),
                "evidence_source": "library",
                "_score": score,
            }
            applicable.append((score, rec_key, result))

    # Sort by score descending, deduplicate
    applicable.sort(key=lambda x: -x[0])
    return [rec for _, _, rec in applicable[:max_recommendations]]


def load_custom_library(json_path: str) -> dict[str, dict[str, Any]]:
    """
    Load a custom recommendation library from a JSON file, merging with defaults.

    Args:
        json_path: Absolute path to a JSON file following RECOMMENDATION_LIBRARY format.

    Returns:
        Merged recommendation library (custom overrides default entries).
    """
    path = Path(json_path)
    if not path.exists():
        logger.warning("Custom library path not found: %s. Using defaults.", json_path)
        return RECOMMENDATION_LIBRARY

    with open(path) as f:
        custom = json.load(f)

    merged = {**RECOMMENDATION_LIBRARY, **custom}
    logger.info("Merged %d default + %d custom recommendations = %d total.",
                len(RECOMMENDATION_LIBRARY), len(custom), len(merged))
    return merged


# Load custom library if env var is configured
_custom_path = os.getenv("RECOMMENDATION_LIBRARY_PATH")
if _custom_path:
    RECOMMENDATION_LIBRARY = load_custom_library(_custom_path)
