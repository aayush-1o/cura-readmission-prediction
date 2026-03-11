{{/*
  mart_patient_risk_cohorts.sql
  ─────────────────────────────────────────────────────────────────────
  Mart model: patient risk cohort assignments for dashboard segmentation
  and care management program targeting.

  Segments patients into clinically meaningful cohorts based on:
    - ML risk tier (when available)
    - Charlson Comorbidity Index tier
    - Utilization history
    - High-utilizer flag

  Grain: one row per patient (current state, most recent admission)
  Powers: Risk Stratification dashboard panel, care coordinator worklist.

  Materialization: table
*/}}
{{ config(
    materialized='table',
    indexes=[
        {'columns': ['patient_id'], 'unique': true},
        {'columns': ['risk_cohort']},
        {'columns': ['cci_risk_tier']},
    ]
) }}

WITH latest_admission AS (
    -- Most recent admission per patient
    SELECT DISTINCT ON (patient_id)
        patient_id,
        admission_id,
        admission_date,
        department,
        length_of_stay_days,
        icu_flag,
        readmit_30day_flag,
        total_charges
    FROM {{ ref('stg_admissions') }}
    ORDER BY patient_id, admission_date DESC
),

with_features AS (
    SELECT
        la.patient_id,
        la.admission_id              AS latest_admission_id,
        la.admission_date            AS latest_admission_date,
        la.department                AS latest_department,
        la.length_of_stay_days       AS latest_los_days,
        la.icu_flag,
        la.readmit_30day_flag        AS latest_readmit_flag,
        la.total_charges             AS latest_charges,
        pat.age,
        pat.age_group,
        pat.gender,
        pat.race_ethnicity,
        pat.insurance_category,
        pat.comorbidity_count,
        cci.charlson_comorbidity_index,
        cci.cci_risk_tier,
        cci.estimated_10yr_survival,
        hist.prior_admissions_12m,
        hist.prior_admissions_90d,
        hist.prior_readmissions_1y,
        hist.high_utilizer_flag,
        hist.prior_icu_stays,
        hist.prior_los_avg_days,
        hist.days_since_last_discharge
    FROM latest_admission la
    LEFT JOIN {{ ref('stg_patients') }}          pat  ON pat.patient_id   = la.patient_id
    LEFT JOIN {{ ref('int_comorbidity_scores') }} cci  ON cci.patient_id  = la.patient_id
    LEFT JOIN {{ ref('int_patient_history') }}   hist ON hist.admission_id = la.admission_id
),

cohort_assignment AS (
    SELECT
        *,
        -- Risk Cohort assignment based on clinically-validated criteria
        CASE
            -- Tier 1: Catastrophic risk — highest intervention priority
            WHEN charlson_comorbidity_index >= 6
              OR prior_readmissions_1y >= 3
              OR (icu_flag = TRUE AND prior_admissions_90d >= 2)
            THEN 'T1_CatastrophicRisk'

            -- Tier 2: High risk — care management program eligible
            WHEN charlson_comorbidity_index BETWEEN 3 AND 5
              OR prior_readmissions_1y = 2
              OR high_utilizer_flag = TRUE
            THEN 'T2_HighRisk'

            -- Tier 3: Moderate risk — care transitions support
            WHEN charlson_comorbidity_index BETWEEN 1 AND 2
              OR prior_admissions_12m >= 2
            THEN 'T3_ModerateRisk'

            -- Tier 4: Low risk — standard follow-up
            ELSE 'T4_LowRisk'
        END                                                         AS risk_cohort,

        -- Social determinants proxy risk flag
        -- Based on insurance type (Medicaid → lower SDoH access)
        (insurance_category = 'Medicaid')                           AS sdoh_risk_flag

    FROM with_features
)

SELECT
    patient_id,
    latest_admission_id,
    latest_admission_date,
    latest_department,
    latest_los_days,
    icu_flag,
    latest_readmit_flag,
    latest_charges,
    age,
    age_group,
    gender,
    race_ethnicity,
    insurance_category,
    comorbidity_count,
    charlson_comorbidity_index,
    cci_risk_tier,
    estimated_10yr_survival,
    prior_admissions_12m,
    prior_admissions_90d,
    prior_readmissions_1y,
    prior_icu_stays,
    prior_los_avg_days,
    high_utilizer_flag,
    days_since_last_discharge,
    risk_cohort,
    sdoh_risk_flag,
    -- Numeric cohort rank (1=highest risk) for sorting
    CASE risk_cohort
        WHEN 'T1_CatastrophicRisk' THEN 1
        WHEN 'T2_HighRisk'         THEN 2
        WHEN 'T3_ModerateRisk'     THEN 3
        ELSE 4
    END                                                             AS risk_cohort_rank
FROM cohort_assignment
ORDER BY risk_cohort_rank ASC, charlson_comorbidity_index DESC
