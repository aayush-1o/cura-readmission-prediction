-- ═══════════════════════════════════════════════════════════════════════════
-- CareIQ — OLAP Materialized Views
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These views are pre-aggregated for dashboard query performance.
-- Refresh strategy: CONCURRENTLY (no read lock) after each ETL run.
--
-- Refresh command (run in ETL pipeline after fact table loads):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_readmission_rate_by_dept_month;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_los_by_diagnosis_insurance;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_risk_score_distribution;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_high_risk_patients_today;
--
-- Note: CONCURRENTLY requires a unique index on the view.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- mv_readmission_rate_by_dept_month
--
-- Business purpose: Department managers monitor their rolling readmission
-- rate monthly. Used in the Department Performance dashboard tile.
--
-- Grain: one row per (department × calendar month × year)
-- Key metrics: readmission_rate, total_admissions, avg_los_days
-- ─────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_readmission_rate_by_dept_month AS
WITH monthly_admissions AS (
    SELECT
        dpt.department_key,
        dpt.department_name,
        dpt.service_line,
        dpt.benchmark_readmission_rate,
        dd.year,
        dd.month,
        dd.month_name,
        -- Aggregate admission metrics
        COUNT(fa.admission_key)                                 AS total_admissions,
        SUM(fa.readmit_30day_flag::INT)                        AS total_readmissions,
        ROUND(AVG(fa.readmit_30day_flag::INT)::NUMERIC, 4)    AS readmission_rate,
        ROUND(AVG(fa.length_of_stay_days)::NUMERIC, 2)        AS avg_los_days,
        ROUND(AVG(fa.total_cost_usd)::NUMERIC, 2)             AS avg_cost_usd,
        SUM(fa.total_cost_usd)                                 AS total_cost_usd,
        SUM(fa.icu_days)                                       AS total_icu_days,
        SUM(fa.emergency_flag::INT)                            AS emergency_admissions
    FROM fact_admissions fa
    JOIN dim_department dpt ON fa.department_key    = dpt.department_key
    JOIN dim_date       dd  ON fa.admit_date_key    = dd.date_key
    GROUP BY
        dpt.department_key,
        dpt.department_name,
        dpt.service_line,
        dpt.benchmark_readmission_rate,
        dd.year,
        dd.month,
        dd.month_name
)
SELECT
    department_key,
    department_name,
    service_line,
    year,
    month,
    month_name,
    -- Make a sortable period label
    TO_DATE(year::TEXT || '-' || LPAD(month::TEXT, 2, '0') || '-01', 'YYYY-MM-DD') AS period_start,
    total_admissions,
    total_readmissions,
    readmission_rate,
    benchmark_readmission_rate,
    -- Performance vs benchmark: positive = above benchmark (bad), negative = below (good)
    ROUND((readmission_rate - benchmark_readmission_rate)::NUMERIC, 4) AS vs_benchmark,
    avg_los_days,
    avg_cost_usd,
    total_cost_usd,
    total_icu_days,
    emergency_admissions,
    NOW()                                                       AS last_refreshed_at
FROM monthly_admissions
WITH DATA;

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_readmit_dept_month
    ON mv_readmission_rate_by_dept_month (department_key, year, month);

CREATE INDEX IF NOT EXISTS idx_mv_readmit_dept_name
    ON mv_readmission_rate_by_dept_month (department_name);

CREATE INDEX IF NOT EXISTS idx_mv_readmit_period
    ON mv_readmission_rate_by_dept_month (year DESC, month DESC);

-- ─────────────────────────────────────────────────────────────────────
-- mv_los_by_diagnosis_insurance
--
-- Business purpose: Finance and quality teams compare length of stay
-- across diagnosis categories and insurance types to identify outliers
-- and opportunities for cost reduction.
--
-- Grain: one row per (diagnosis_category × insurance_type × year × quarter)
-- ─────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_los_by_diagnosis_insurance AS
SELECT
    dx.category                                                 AS diagnosis_category,
    dx.chronic_flag,
    dx.high_readmission_risk_flag,
    fa.insurance_type,
    dd.year,
    dd.quarter,
    COUNT(fa.admission_key)                                     AS total_admissions,
    ROUND(AVG(fa.length_of_stay_days)::NUMERIC, 2)            AS avg_los_days,
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY fa.length_of_stay_days) AS median_los_days,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fa.length_of_stay_days) AS p90_los_days,
    ROUND(STDDEV(fa.length_of_stay_days)::NUMERIC, 2)         AS stddev_los_days,
    ROUND(AVG(fa.total_cost_usd)::NUMERIC, 2)                 AS avg_cost_usd,
    ROUND(AVG(fa.icu_days)::NUMERIC, 2)                       AS avg_icu_days,
    SUM(fa.readmit_30day_flag::INT)                            AS readmissions,
    ROUND(AVG(fa.readmit_30day_flag::INT)::NUMERIC, 4)        AS readmission_rate,
    NOW()                                                       AS last_refreshed_at
FROM fact_admissions fa
JOIN dim_diagnosis dx ON fa.primary_diagnosis_key = dx.diagnosis_key
JOIN dim_date      dd ON fa.admit_date_key         = dd.date_key
WHERE fa.insurance_type IS NOT NULL
  AND dx.category IS NOT NULL
GROUP BY
    dx.category,
    dx.chronic_flag,
    dx.high_readmission_risk_flag,
    fa.insurance_type,
    dd.year,
    dd.quarter
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_los_diag_ins
    ON mv_los_by_diagnosis_insurance (diagnosis_category, insurance_type, year, quarter);

CREATE INDEX IF NOT EXISTS idx_mv_los_category
    ON mv_los_by_diagnosis_insurance (diagnosis_category);

CREATE INDEX IF NOT EXISTS idx_mv_los_insurance
    ON mv_los_by_diagnosis_insurance (insurance_type);

-- ─────────────────────────────────────────────────────────────────────
-- mv_risk_score_distribution
--
-- Business purpose: Quality and data science teams monitor the daily
-- distribution of model risk scores — detects model drift (e.g. if
-- suddenly 40% of patients score HIGH that's a data quality red flag).
--
-- Grain: one row per (calendar_date × risk_tier)
-- ─────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_risk_score_distribution AS
SELECT
    DATE(fp.predicted_at)                                       AS score_date,
    fp.model_name,
    fp.model_version,
    fp.risk_tier,
    COUNT(*)                                                    AS patient_count,
    ROUND(AVG(fp.readmission_risk_score)::NUMERIC, 4)         AS avg_risk_score,
    ROUND(MIN(fp.readmission_risk_score)::NUMERIC, 4)         AS min_risk_score,
    ROUND(MAX(fp.readmission_risk_score)::NUMERIC, 4)         AS max_risk_score,
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY fp.readmission_risk_score) AS median_risk_score,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.readmission_risk_score) AS p90_risk_score,
    -- Clinician engagement rate
    ROUND(AVG(fp.clinician_reviewed::INT)::NUMERIC, 4)        AS clinician_review_rate,
    -- Outcome accuracy (for scored + outcome-available records)
    COUNT(fp.actual_outcome)                                    AS outcomes_available,
    SUM(CASE WHEN fp.actual_outcome = TRUE THEN 1 ELSE 0 END) AS true_positives,
    NOW()                                                       AS last_refreshed_at
FROM fact_predictions fp
GROUP BY
    DATE(fp.predicted_at),
    fp.model_name,
    fp.model_version,
    fp.risk_tier
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_risk_dist
    ON mv_risk_score_distribution (score_date, model_name, model_version, risk_tier);

CREATE INDEX IF NOT EXISTS idx_mv_risk_dist_date
    ON mv_risk_score_distribution (score_date DESC);

CREATE INDEX IF NOT EXISTS idx_mv_risk_dist_model
    ON mv_risk_score_distribution (model_name, model_version);

-- ─────────────────────────────────────────────────────────────────────
-- mv_high_risk_patients_today
--
-- Business purpose: Care coordinators see a "hot list" on login —
-- patients currently admitted whose model scores HIGH/CRITICAL risk.
-- Refreshed every 4 hours during business hours.
--
-- Grain: one row per currently-admitted high-risk patient
-- ─────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_high_risk_patients_today AS
WITH latest_predictions AS (
    -- Use DISTINCT ON to get only the latest prediction per admission
    SELECT DISTINCT ON (fp.admission_key)
        fp.admission_key,
        fp.patient_key,
        fp.readmission_risk_score,
        fp.risk_tier,
        fp.top_features,
        fp.recommended_actions,
        fp.predicted_at,
        fp.clinician_reviewed,
        fp.model_version
    FROM fact_predictions fp
    WHERE fp.risk_tier IN ('high', 'critical')
    ORDER BY fp.admission_key, fp.predicted_at DESC
),
recent_admissions AS (
    -- Patients admitted in the last 7 days (still likely inpatient)
    SELECT
        fa.admission_key,
        fa.patient_key,
        fa.admission_id,
        fa.length_of_stay_days,
        fa.icu_flag,
        fa.emergency_flag,
        fa.total_cost_usd,
        fa.drg_code,
        dd_admit.full_date  AS admit_date,
        dpt.department_name,
        dpt.service_line,
        dx.icd10_code,
        dx.icd10_description AS primary_diagnosis,
        dx.category         AS diagnosis_category,
        disp.disposition_name AS discharge_disposition
    FROM fact_admissions fa
    JOIN dim_date dd_admit ON fa.admit_date_key = dd_admit.date_key
    LEFT JOIN dim_department dpt ON fa.department_key = dpt.department_key
    LEFT JOIN dim_diagnosis  dx  ON fa.primary_diagnosis_key = dx.diagnosis_key
    LEFT JOIN dim_discharge_disposition disp ON fa.discharge_disposition_key = disp.disposition_key
    WHERE dd_admit.full_date >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT
    ra.admission_id,
    ra.admission_key,
    dp.patient_id,
    dp.age_group,
    dp.gender,
    dp.race_ethnicity,
    dp.insurance_category,
    dp.comorbidity_count,
    dp.charlson_comorbidity_index,
    dp.has_chf,
    dp.has_copd,
    dp.has_ckd,
    ra.admit_date,
    ra.length_of_stay_days,
    ra.department_name,
    ra.service_line,
    ra.icd10_code,
    ra.primary_diagnosis,
    ra.diagnosis_category,
    ra.icu_flag,
    ra.discharge_disposition,
    lp.readmission_risk_score,
    lp.risk_tier,
    lp.top_features,
    lp.recommended_actions,
    lp.predicted_at,
    lp.clinician_reviewed,
    lp.model_version,
    NOW()                   AS last_refreshed_at
FROM latest_predictions lp
JOIN recent_admissions  ra ON lp.admission_key = ra.admission_key
JOIN dim_patient        dp ON lp.patient_key   = dp.patient_key
WHERE dp.is_current = TRUE
ORDER BY lp.readmission_risk_score DESC
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mv_high_risk_today
    ON mv_high_risk_patients_today (admission_key);

CREATE INDEX IF NOT EXISTS idx_mv_high_risk_risk_score
    ON mv_high_risk_patients_today (readmission_risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_mv_high_risk_dept
    ON mv_high_risk_patients_today (department_name);

CREATE INDEX IF NOT EXISTS idx_mv_high_risk_clinician
    ON mv_high_risk_patients_today (clinician_reviewed)
    WHERE clinician_reviewed = FALSE;

-- ─────────────────────────────────────────────────────────────────────
-- Helper function: refresh all materialized views
-- Call this at the end of every ETL run.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE refresh_all_olap_views()
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE NOTICE 'Refreshing OLAP materialized views at %', NOW();

    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_readmission_rate_by_dept_month;
    RAISE NOTICE '  ✓ mv_readmission_rate_by_dept_month';

    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_los_by_diagnosis_insurance;
    RAISE NOTICE '  ✓ mv_los_by_diagnosis_insurance';

    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_risk_score_distribution;
    RAISE NOTICE '  ✓ mv_risk_score_distribution';

    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_high_risk_patients_today;
    RAISE NOTICE '  ✓ mv_high_risk_patients_today';

    RAISE NOTICE 'All views refreshed at %', NOW();
END;
$$;
