{{/*
  int_readmission_features.sql
  ─────────────────────────────────────────────────────────────────────
  Intermediate model: denormalized feature set for ML model training.

  This is the "feature store" output — one row per admission, all
  features an ML model needs, ready for direct ingestion by ml/features.py.

  Sources joined:
    - stg_admissions        (admission-level measures)
    - stg_patients          (demographic features)
    - int_patient_history   (utilization history)
    - int_comorbidity_scores (CCI and comorbidity weights)

  Target column: readmit_30day_flag (binary, 0/1)

  Materialization: table with incremental support.
  Indexes: admission_id (unique), patient_id
*/}}
{{ config(
    materialized='incremental',
    unique_key='admission_id',
    on_schema_change='sync_all_columns',
    indexes=[
        {'columns': ['admission_id'], 'unique': true},
        {'columns': ['patient_id']},
        {'columns': ['admission_date']},
    ]
) }}

WITH admissions AS (
    SELECT * FROM {{ ref('stg_admissions') }}
    {% if is_incremental() %}
    -- Only process new admissions since last model run
    WHERE admission_date > (SELECT MAX(admission_date) FROM {{ this }})
    {% endif %}
),

patients AS (
    SELECT * FROM {{ ref('stg_patients') }}
),

history AS (
    SELECT * FROM {{ ref('int_patient_history') }}
),

cci AS (
    SELECT * FROM {{ ref('int_comorbidity_scores') }}
),

joined AS (
    SELECT
        -- ── Identifiers (not features — excluded before model training)
        adm.admission_id,
        adm.patient_id,
        adm.admission_date,
        adm.discharge_date,

        -- ── Target label
        adm.readmit_30day_flag::INT                                 AS readmit_30day_flag,

        -- ── Administrative / demographic features
        COALESCE(pat.age, 0)                                        AS age,
        CASE pat.age_group
            WHEN '18-30' THEN 0  WHEN '31-45' THEN 1
            WHEN '46-60' THEN 2  WHEN '61-75' THEN 3
            ELSE 4
        END                                                         AS age_group_encoded,
        CASE pat.gender
            WHEN 'Male' THEN 0  WHEN 'Female' THEN 1  ELSE 2
        END                                                         AS gender_encoded,
        CASE pat.insurance_category
            WHEN 'Medicare'    THEN 0  WHEN 'Medicaid'   THEN 1
            WHEN 'Commercial'  THEN 2  ELSE 3
        END                                                         AS insurance_encoded,

        -- ── Comorbidity features
        COALESCE(pat.comorbidity_count, 0)                          AS comorbidity_count,
        COALESCE(cci.charlson_comorbidity_index, 0)                 AS charlson_comorbidity_index,
        pat.has_diabetes::INT                                       AS has_diabetes,
        pat.has_hypertension::INT                                   AS has_hypertension,
        pat.has_chf::INT                                            AS has_chf,
        pat.has_copd::INT                                           AS has_copd,
        pat.has_ckd::INT                                            AS has_ckd,
        pat.has_afib::INT                                           AS has_afib,
        pat.has_obesity::INT                                        AS has_obesity,
        pat.has_depression::INT                                     AS has_depression,

        -- ── Admission-level features
        COALESCE(adm.length_of_stay_days, 0)                        AS length_of_stay_days,
        COALESCE(adm.icu_days, 0)                                   AS icu_days,
        adm.icu_flag::INT                                           AS icu_flag,
        adm.emergency_flag::INT                                     AS emergency_flag,
        COALESCE(adm.total_charges, 0)                              AS total_charges,
        CASE adm.admission_type
            WHEN 'Emergency' THEN 2  WHEN 'Urgent' THEN 1  ELSE 0
        END                                                         AS admission_type_encoded,
        -- Day of week of admission (weekend admissions have lower staffing)
        EXTRACT(ISODOW FROM adm.admission_date)::INT                AS admit_day_of_week,
        CASE WHEN EXTRACT(ISODOW FROM adm.admission_date) IN (6,7) THEN 1 ELSE 0 END
                                                                    AS admitted_on_weekend,
        -- Month of admission (seasonal patterns)
        EXTRACT(MONTH FROM adm.admission_date)::INT                 AS admit_month,

        -- ── Utilization history features (strongest readmission predictors)
        COALESCE(hist.prior_admissions_12m,  0)                    AS prior_admissions_12m,
        COALESCE(hist.prior_admissions_90d,  0)                    AS prior_admissions_90d,
        COALESCE(hist.prior_readmissions_1y, 0)                    AS prior_readmissions_1y,
        COALESCE(hist.prior_icu_stays,       0)                    AS prior_icu_stays,
        COALESCE(hist.prior_los_avg_days,    0)                    AS prior_los_avg_days,
        hist.high_utilizer_flag::INT                               AS high_utilizer_flag,
        -- Days-since-last-discharge: NULL → patient is new (encode as -1)
        COALESCE(hist.days_since_last_discharge, -1)               AS days_since_last_discharge

    FROM admissions adm
    LEFT JOIN patients pat ON pat.patient_id  = adm.patient_id
    LEFT JOIN history  hist ON hist.admission_id = adm.admission_id
    LEFT JOIN cci       ON cci.patient_id     = adm.patient_id
)

SELECT * FROM joined
