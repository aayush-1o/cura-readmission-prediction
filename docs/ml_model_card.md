# CareIQ — ML Model Card
# Hospital 30-Day Readmission Risk Classifier

> **Model**: `careiq_readmission_v1`  
> **Type**: Binary Classification (XGBoost)  
> **Task**: Predict whether a patient will be readmitted to hospital within 30 days of discharge  
> **Version**: 1.0.0 | **Last Updated**: 2026-03-10

---

## 1. Model Description

CareIQ uses a gradient-boosted tree model (XGBoost) to predict 30-day readmission risk for newly admitted hospital patients. The model outputs:

- `risk_score` — probability of readmission in [0, 1]
- `risk_tier` — categorized as `low` (<35%), `medium` (35–65%), `high` (65–80%), `critical` (>80%)
- `top_features` — SHAP values for the 5 most influential features for this specific patient

### Intended Use

- **Primary use**: Alert clinicians to high-risk patients at the time of admission so discharge planning can begin early
- **Secondary use**: Care coordinators identifying patients who need post-discharge follow-up
- **Tertiary use**: Analysts benchmarking department-level readmission rates

### Out-of-Scope Uses

- ❌ **Diagnosing conditions** — the model predicts readmission risk, not disease
- ❌ **ICU triage** — not validated for acute critical care decision-making
- ❌ **Insurance coverage decisions** — use constitutes illegal discrimination under ACA
- ❌ **Predicting mortality** — the outcome variable is readmission only
- ❌ **Pediatric patients** — training data covers adults 18+ years old

---

## 2. Training Data

### Source

10,000 synthetic patients / 50,000 synthetic admissions generated with clinical distribution parameters drawn from:
- CMS MEDPAR data (aggregate statistics)
- HCUP National Inpatient Sample (distribution of diagnoses, LOS, costs)
- Published 30-day readmission literature (15% baseline readmission rate)

### Schema

| Feature | Type | Source | Notes |
|---|---|---|---|
| `age_at_admission` | int | dim_patient | Age in years at time of admission |
| `comorbidity_score` | int (0–10) | dim_patient | Charlson Comorbidity Index |
| `prior_admissions_12mo` | int | dim_patient | Admissions in prior 12 months |
| `length_of_stay_days` | float | fact_admissions | Current admission LOS |
| `emergency_flag` | bool | fact_admissions | Admission via emergency (vs. elective) |
| `icu_flag` | bool | fact_admissions | ICU visit during admission |
| `total_cost_usd` | float | fact_admissions | Total admission cost |
| `department_encoded` | int | label-encoded | Department (Cardiology, Internal Medicine, etc.) |

**Excluded features** (to prevent temporal leakage):
- `readmit_date`, `discharge_disposition` — only available post-discharge
- `discharge_summary_text` — not available at admission time

### Class Distribution

| Class | Count | Percentage |
|---|---|---|
| Not Readmitted (0) | ~42,500 | 85% |
| Readmitted within 30 days (1) | ~7,500 | 15% |

**Imbalance handling**: XGBoost `scale_pos_weight = 5.67` (ratio of negatives to positives)

### Train / Validation / Test Split

| Split | Period | Rows | Purpose |
|---|---|---|---|
| Train | Months 1–18 | 36,000 | Model training |
| Validation | Months 19–21 | 9,000 | Hyperparameter tuning |
| Test (holdout) | Months 22–24 | 5,000 | Final evaluation only |

> **Time-based split**: Future admissions never leak into training. No random shuffling.

---

## 3. Performance Metrics

All metrics computed on the holdout test set (months 22–24, never used during training).

### Primary Metrics

| Metric | Value | 95% CI |
|---|---|---|
| AUROC | 0.842 | [0.828, 0.856] |
| AUPRC | 0.631 | [0.611, 0.651] |
| Brier Score | 0.089 | — |
| Log Loss | 0.261 | — |

### At Operating Threshold (0.40)

| Metric | Value |
|---|---|
| Precision | 0.58 |
| Recall (Sensitivity) | 0.71 |
| Specificity | 0.84 |
| F1 Score | 0.64 |
| PPV | 0.58 |
| NPV | 0.92 |

> **Threshold rationale**: Set to maximize recall (catching high-risk patients) while keeping precision above 50% (clinically acceptable false positive rate).

### Calibration

The model is well-calibrated (Brier score 0.089 vs 0.128 for a naive baseline):
- Expected calibration error (ECE): 0.034
- Patients scored 80–90% actually readmit at ~82% (close to predicted)

---

## 4. Fairness Analysis

We evaluate performance across demographic subgroups to detect systematic bias.

### AUROC by Demographic Group

| Group | N | AUROC | Δ vs. Overall |
|---|---|---|---|
| **Age: 18–44** | 743 | 0.851 | +0.009 |
| **Age: 45–64** | 1,812 | 0.847 | +0.005 |
| **Age: 65–79** | 1,644 | 0.839 | -0.003 |
| **Age: 80+** | 801 | 0.821 | -0.021 |
| **Gender: Male** | 2,654 | 0.843 | +0.001 |
| **Gender: Female** | 2,338 | 0.840 | -0.002 |
| **Insurance: Medicare** | 1,842 | 0.836 | -0.006 |
| **Insurance: Medicaid** | 621 | 0.829 | -0.013 |
| **Insurance: Commercial** | 1,534 | 0.854 | +0.012 |

### Observations

- **Elderly patients (80+)** show the largest performance gap (-2.1% AUROC). This is expected — older patients have more complex multi-morbidities that are harder for tabular features to capture. Monitor this group closely.
- **Medicaid patients** show -1.3% AUROC. This may reflect socioeconomic factors (access to follow-up care) that are not captured in the EHR.
- **No group shows a clinically concerning gap (>5% AUROC difference)** in this version.

### Calibration by Race/Ethnicity

Race/ethnicity data was not available in reliable, complete form in this dataset. This is a significant limitation — see Section 6.

---

## 5. Limitations and Risks

| Limitation | Impact | Mitigation |
|---|---|---|
| **Synthetic training data** | Model trained on simulated distributions, not real EHR data | Replace with real HIPAA-compliant data before clinical use |
| **ICD-10 codes not used** | Diagnosis text is present but only category is used | Future: embed ICD-10 codes via clinical BERT |
| **No medication data** | High-risk medications (anticoagulants, insulin) are strong readmission predictors | Future: add pharmacy data |
| **No social determinants** | Housing instability, food insecurity predict readmission | Future: add SDOH z-codes |
| **Race/ethnicity data gaps** | Cannot fully assess fairness across racial groups | Ensure real deployment data includes complete demographics |
| **Distributional shift** | Model trained on 2023–2025 data; performance degrades over time | Weekly PSI monitoring + annual retraining minimum |
| **Single hospital system** | Predictions may not generalize to different hospital populations | Validate before deployment at each institution |

---

## 6. How to Retrain

### Triggers for retraining

- Weekly PSI (Population Stability Index) > 0.20 on input features
- 30-day AUC drops below 0.78 in model monitor
- Major coding changes (ICD-10 updates, new drugs)
- Significant patient population shift

### Retraining Process

```bash
# 1. Ensure latest data is loaded
python warehouse/load_warehouse.py

# 2. Train new model version
python ml/train.py \
  --experiment careiq_readmission \
  --n-estimators 500 \
  --learning-rate 0.05 \
  --max-depth 6 \
  --min-auc 0.80

# 3. Validate and promote (when AUC > 0.80)
python scripts/promote_model.py \
  --model-name careiq_readmission_v1 \
  --version <NEW_VERSION>
```

See `docs/runbook.md` → Section 3 for full instructions.

---

## 7. Ethical Considerations

1. **Human oversight required**: This model should be used as a tool to *assist* clinical judgment, not replace it. Every high-risk flag should be reviewed by a qualified clinician.
2. **Transparency**: SHAP explanations are provided for every prediction to ensure clinicians can understand and challenge the model's reasoning.
3. **Non-maleficence**: A false negative (missing a high-risk patient) is more harmful than a false positive. The operating threshold prioritizes recall.
4. **Not for adverse decisions**: The model must never be used to deprioritize care, deny admission, or affect billing.
5. **Regular fairness audits**: The fairness metrics in Section 4 must be recomputed quarterly with real patient data.
