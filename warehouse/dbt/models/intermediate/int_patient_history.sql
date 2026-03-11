{{/*
  int_patient_history.sql
  ─────────────────────────────────────────────────────────────────────
  Intermediate model: rolling 12-month admission history per patient.

  For each admission, computes the patient's prior utilization history
  looking back 12 months. Used as input features for the ML model.

  Key features computed:
    - prior_admissions_12m:  # admissions in prior 12 months
    - prior_admissions_90d:  # admissions in prior 90 days (strong readmit signal)
    - prior_readmissions_1y: # times readmitted in prior year
    - prior_icu_stays:       # ICU admissions in prior 12 months
    - prior_los_avg_days:    Average LOS of prior admissions
    - days_since_last_discharge: Recency of most recent prior visit
    - high_utilizer_flag:    TRUE if >= 3 admissions in prior 12 months

  Materialization: table (window functions are expensive, pre-compute once)
*/}}
{{ config(
    materialized='table',
    indexes=[
        {'columns': ['patient_id'], 'type': 'btree'},
        {'columns': ['admission_id'], 'unique': true},
    ]
) }}

WITH admissions AS (
    SELECT
        admission_id,
        patient_id,
        admission_date,
        discharge_date,
        length_of_stay_days,
        icu_flag,
        readmit_30day_flag,
        emergency_flag
    FROM {{ ref('stg_admissions') }}
),

-- Self-join: for each admission, look up all prior admissions for the same patient
history AS (
    SELECT
        current_adm.admission_id,
        current_adm.patient_id,
        current_adm.admission_date,
        -- Count admissions in prior 12 months (before this visit)
        COUNT(prior_adm.admission_id) FILTER (
            WHERE prior_adm.admission_date >= current_adm.admission_date - INTERVAL '12 months'
              AND prior_adm.admission_date <  current_adm.admission_date
        )                                                           AS prior_admissions_12m,
        -- Count admissions in prior 90 days
        COUNT(prior_adm.admission_id) FILTER (
            WHERE prior_adm.admission_date >= current_adm.admission_date - INTERVAL '90 days'
              AND prior_adm.admission_date <  current_adm.admission_date
        )                                                           AS prior_admissions_90d,
        -- Count readmissions (patient was readmitted within 30d) in prior year
        SUM(prior_adm.readmit_30day_flag::INT) FILTER (
            WHERE prior_adm.admission_date >= current_adm.admission_date - INTERVAL '12 months'
              AND prior_adm.admission_date <  current_adm.admission_date
        )                                                           AS prior_readmissions_1y,
        -- ICU stays in prior 12 months
        COUNT(prior_adm.admission_id) FILTER (
            WHERE prior_adm.icu_flag = TRUE
              AND prior_adm.admission_date >= current_adm.admission_date - INTERVAL '12 months'
              AND prior_adm.admission_date <  current_adm.admission_date
        )                                                           AS prior_icu_stays,
        -- Average LOS of prior 12-month admissions
        AVG(prior_adm.length_of_stay_days) FILTER (
            WHERE prior_adm.admission_date >= current_adm.admission_date - INTERVAL '12 months'
              AND prior_adm.admission_date <  current_adm.admission_date
        )                                                           AS prior_los_avg_days,
        -- Most recent prior discharge date
        MAX(prior_adm.discharge_date) FILTER (
            WHERE prior_adm.admission_date < current_adm.admission_date
        )                                                           AS last_discharge_date
    FROM admissions        AS current_adm
    LEFT JOIN admissions   AS prior_adm
        ON prior_adm.patient_id = current_adm.patient_id
    GROUP BY
        current_adm.admission_id,
        current_adm.patient_id,
        current_adm.admission_date
)

SELECT
    admission_id,
    patient_id,
    admission_date,
    COALESCE(prior_admissions_12m, 0)                               AS prior_admissions_12m,
    COALESCE(prior_admissions_90d, 0)                               AS prior_admissions_90d,
    COALESCE(prior_readmissions_1y, 0)                              AS prior_readmissions_1y,
    COALESCE(prior_icu_stays, 0)                                    AS prior_icu_stays,
    ROUND(COALESCE(prior_los_avg_days, 0)::NUMERIC, 2)             AS prior_los_avg_days,
    last_discharge_date,
    -- Days since last discharge (recency feature)
    CASE
        WHEN last_discharge_date IS NULL THEN NULL
        ELSE (admission_date - last_discharge_date)::INT
    END                                                             AS days_since_last_discharge,
    -- High utilizer flag: >= 3 admissions in 12 months
    (COALESCE(prior_admissions_12m, 0) >= 3)                       AS high_utilizer_flag
FROM history
