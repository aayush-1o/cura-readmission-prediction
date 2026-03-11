{{/*
  mart_readmission_dashboard.sql
  ─────────────────────────────────────────────────────────────────────
  Mart model: pre-aggregated metrics for the main BI dashboard.

  Grain: one row per (department × month × diagnosis_category)
  Powers: the dashboard summary tiles, trend charts, and comparison tables.

  Designed to be queried directly by Metabase and the CareIQ API
  /analytics/readmission-trends endpoint.

  Materialization: table (refreshed daily in ETL run)
*/}}
{{ config(
    materialized='table',
    indexes=[
        {'columns': ['period_start', 'department_name']},
        {'columns': ['department_name']},
        {'columns': ['year', 'month']},
    ]
) }}

WITH base AS (
    SELECT
        adm.patient_id,
        adm.admission_id,
        adm.admission_date,
        adm.discharge_date,
        adm.admission_type,
        adm.department,
        adm.length_of_stay_days,
        adm.icu_days,
        adm.icu_flag,
        adm.emergency_flag,
        adm.readmit_30day_flag,
        adm.total_charges,
        adm.insurance_category,
        adm.primary_diagnosis_category,
        pat.age,
        pat.age_group,
        pat.gender,
        pat.race_ethnicity,
        pat.insurance_category           AS patient_insurance_category,
        pat.comorbidity_count,
        cci.charlson_comorbidity_index,
        cci.cci_risk_tier,
        hist.prior_admissions_12m,
        hist.prior_readmissions_1y,
        hist.high_utilizer_flag,
        -- Calendar dimensions
        EXTRACT(YEAR  FROM adm.admission_date)::INT                 AS year,
        EXTRACT(MONTH FROM adm.admission_date)::INT                 AS month,
        TRIM(TO_CHAR(adm.admission_date, 'Month'))                  AS month_name,
        EXTRACT(QUARTER FROM adm.admission_date)::INT               AS quarter,
        DATE_TRUNC('month', adm.admission_date)::DATE               AS period_start
    FROM {{ ref('stg_admissions') }}   adm
    LEFT JOIN {{ ref('stg_patients') }}         pat  ON pat.patient_id  = adm.patient_id
    LEFT JOIN {{ ref('int_comorbidity_scores') }} cci  ON cci.patient_id = adm.patient_id
    LEFT JOIN {{ ref('int_patient_history') }}   hist ON hist.admission_id = adm.admission_id
),

aggregated AS (
    SELECT
        period_start,
        year,
        month,
        month_name,
        quarter,
        COALESCE(department, 'Unknown')                             AS department_name,
        COALESCE(primary_diagnosis_category, 'Unknown')            AS diagnosis_category,
        -- Volume
        COUNT(*)                                                    AS total_admissions,
        COUNT(DISTINCT patient_id)                                  AS unique_patients,
        -- Readmission
        SUM(readmit_30day_flag::INT)                               AS total_readmissions,
        ROUND(AVG(readmit_30day_flag::INT)::NUMERIC * 100, 2)      AS readmission_rate_pct,
        -- LOS
        ROUND(AVG(length_of_stay_days)::NUMERIC, 2)                AS avg_los_days,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY length_of_stay_days
        )                                                           AS median_los_days,
        -- Cost
        ROUND(AVG(total_charges)::NUMERIC, 2)                      AS avg_cost_usd,
        ROUND(SUM(total_charges)::NUMERIC, 2)                      AS total_cost_usd,
        -- ICU
        SUM(icu_days)                                              AS total_icu_days,
        ROUND(AVG(icu_days)::NUMERIC, 2)                           AS avg_icu_days,
        SUM(icu_flag::INT)                                         AS icu_admissions,
        -- Emergency
        SUM(emergency_flag::INT)                                   AS emergency_admissions,
        ROUND(AVG(emergency_flag::INT)::NUMERIC * 100, 2)          AS emergency_rate_pct,
        -- Demographics breakdown
        ROUND(AVG(age)::NUMERIC, 1)                                AS avg_age,
        SUM(CASE WHEN age_group = '76+'  THEN 1 ELSE 0 END)       AS patients_76_plus,
        ROUND(AVG(comorbidity_count)::NUMERIC, 2)                  AS avg_comorbidity_count,
        ROUND(AVG(charlson_comorbidity_index)::NUMERIC, 2)         AS avg_cci_score,
        -- High utilizer context
        SUM(high_utilizer_flag::INT)                               AS high_utilizer_admissions,
        SUM(prior_readmissions_1y)                                 AS total_prior_readmissions_1y
    FROM base
    GROUP BY
        period_start, year, month, month_name, quarter,
        COALESCE(department, 'Unknown'),
        COALESCE(primary_diagnosis_category, 'Unknown')
)

SELECT * FROM aggregated
ORDER BY period_start DESC, total_admissions DESC
