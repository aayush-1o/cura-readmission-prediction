{{/*
  int_comorbidity_scores.sql
  ─────────────────────────────────────────────────────────────────────
  Intermediate model: Charlson Comorbidity Index (CCI) per patient.

  The CCI is a validated mortality risk score used in clinical research.
  It assigns weights to 19 comorbid conditions and sums them.
  Adjusted CCI includes age component (+1 per decade ≥ 50).

  Standard weights (Charlson 1987, updated Quan 2011):
    Myocardial Infarction    : 1     COPD              : 1
    Congestive Heart Failure : 1     Moderate CKD      : 2
    Peripheral Vascular      : 1     Severe CKD / ESRD : 4
    Cerebrovascular Disease  : 1     Mild Liver Disease : 1
    Dementia                 : 1     Severe Liver      : 3
    Hemiplegia               : 2     Diabetes (no comp): 1
    Peptic Ulcer             : 1     Diabetes w/ comp  : 2
    Any Tumor                : 2     Leukemia          : 2
    Metastatic Tumor         : 6     Lymphoma          : 2
    AIDS/HIV                 : 6

  We approximate from the boolean flags available in stg_patients.

  Materialization: table (joined by ML feature engineering)
*/}}
{{ config(
    materialized='table',
    indexes=[
        {'columns': ['patient_id'], 'unique': true},
    ]
) }}

WITH patients AS (
    SELECT
        patient_id,
        age,
        has_diabetes,
        has_hypertension,
        has_chf,
        has_copd,
        has_ckd,
        has_afib,
        has_obesity,
        has_depression,
        comorbidity_count
    FROM {{ ref('stg_patients') }}
),

cci_raw AS (
    SELECT
        patient_id,
        age,
        comorbidity_count,
        -- CCI component scores (based on available boolean flags)
        -- CHF = weight 1
        (has_chf::INT * 1)                                          AS cci_chf,
        -- COPD maps to "mild" pulmonary = weight 1
        (has_copd::INT * 1)                                         AS cci_copd,
        -- CKD: moderate = 2, severe would be 4; we assume moderate since we don't have stage
        (has_ckd::INT * 2)                                          AS cci_ckd,
        -- Diabetes without complications = weight 1
        (has_diabetes::INT * 1)                                     AS cci_diabetes,
        -- AFib is a proxy for cerebrovascular / peripheral vascular disease = weight 1
        (has_afib::INT * 1)                                         AS cci_afib,
        -- Depression is not directly in CCI but relevant; weight 0 in CCI, kept for record
        0                                                           AS cci_depression,
        -- Hypertension alone is not in CCI (complicates DM: captured in cci_diabetes)
        0                                                           AS cci_hypertension
    FROM patients
),

cci_totals AS (
    SELECT
        *,
        -- Raw CCI (without age)
        (cci_chf + cci_copd + cci_ckd + cci_diabetes + cci_afib)   AS charlson_raw,
        -- Age adjustment: +1 for each decade above 50
        GREATEST(0, (COALESCE(age, 0) - 50) / 10)                  AS age_adjustment
    FROM cci_raw
)

SELECT
    patient_id,
    age,
    comorbidity_count,
    charlson_raw,
    age_adjustment,
    -- Final CCI: raw + age component
    (charlson_raw + age_adjustment)                                  AS charlson_comorbidity_index,
    -- CCI risk tier (standard clinical interpretation)
    CASE
        WHEN (charlson_raw + age_adjustment) = 0 THEN 'None'
        WHEN (charlson_raw + age_adjustment) BETWEEN 1 AND 2 THEN 'Low'
        WHEN (charlson_raw + age_adjustment) BETWEEN 3 AND 4 THEN 'Moderate'
        ELSE 'High'
    END                                                             AS cci_risk_tier,
    -- 10-year survival probability (Charlson formula: ~0.983^(e^(score*0.9)))
    ROUND(
        POWER(0.983, EXP((charlson_raw + age_adjustment)::NUMERIC * 0.9))::NUMERIC, 4
    )                                                               AS estimated_10yr_survival,
    cci_chf,
    cci_copd,
    cci_ckd,
    cci_diabetes,
    cci_afib
FROM cci_totals
