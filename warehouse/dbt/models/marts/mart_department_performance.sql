{{/*
  mart_department_performance.sql
  ─────────────────────────────────────────────────────────────────────
  Mart model: monthly readmission performance by department.

  Powers the "Department Performance" dashboard tab and the
  /analytics/department-breakdown API endpoint.

  Includes:
    - Actual vs benchmark readmission rate
    - Performance trajectory (vs prior month)
    - CMS star rating approximation (5-star scale)

  Materialization: table, refreshed daily
*/}}
{{ config(
    materialized='table',
    indexes=[
        {'columns': ['department_name', 'year', 'month'], 'unique': true},
        {'columns': ['department_name']},
    ]
) }}

WITH benchmarks AS (
    -- Department-specific readmission rate benchmarks (CMS national averages by care type)
    SELECT department_name, benchmark_readmission_rate
    FROM (
        VALUES
            ('Cardiology',       0.180),
            ('Internal Medicine',0.140),
            ('Pulmonology',      0.160),
            ('Neurology',        0.120),
            ('Orthopedics',      0.080),
            ('Nephrology',       0.200),
            ('Oncology',         0.150),
            ('Endocrinology',    0.130),
            ('Gastroenterology', 0.100),
            ('General Surgery',  0.090),
            ('Medical ICU',      0.250),
            ('Cardiac ICU',      0.230)
    ) AS t(department_name, benchmark_readmission_rate)
),

monthly AS (
    SELECT
        COALESCE(adm.department, 'Unknown')                         AS department_name,
        EXTRACT(YEAR  FROM adm.admission_date)::INT                 AS year,
        EXTRACT(MONTH FROM adm.admission_date)::INT                 AS month,
        DATE_TRUNC('month', adm.admission_date)::DATE               AS period_start,
        COUNT(*)                                                    AS total_admissions,
        SUM(adm.readmit_30day_flag::INT)                           AS total_readmissions,
        ROUND(AVG(adm.readmit_30day_flag::INT)::NUMERIC, 4)        AS readmission_rate,
        ROUND(AVG(adm.length_of_stay_days)::NUMERIC, 2)            AS avg_los_days,
        ROUND(AVG(adm.total_charges)::NUMERIC, 2)                  AS avg_cost_usd,
        SUM(adm.total_charges)                                     AS total_cost_usd,
        SUM(adm.icu_days)                                          AS total_icu_days,
        SUM(adm.emergency_flag::INT)                               AS emergency_count,
        ROUND(AVG(adm.emergency_flag::INT)::NUMERIC, 4)            AS emergency_rate
    FROM {{ ref('stg_admissions') }} adm
    GROUP BY
        COALESCE(adm.department, 'Unknown'),
        EXTRACT(YEAR FROM adm.admission_date),
        EXTRACT(MONTH FROM adm.admission_date),
        DATE_TRUNC('month', adm.admission_date)
),

with_benchmark AS (
    SELECT
        m.*,
        COALESCE(b.benchmark_readmission_rate, 0.15)               AS benchmark_readmission_rate,
        -- Delta vs benchmark (positive = above target = worse)
        ROUND((m.readmission_rate
               - COALESCE(b.benchmark_readmission_rate, 0.15))::NUMERIC, 4) AS vs_benchmark_delta
    FROM monthly m
    LEFT JOIN benchmarks b USING (department_name)
),

with_trajectory AS (
    SELECT
        *,
        -- Month-over-month readmission rate change
        LAG(readmission_rate) OVER (
            PARTITION BY department_name ORDER BY period_start
        )                                                           AS prior_month_readmission_rate,
        readmission_rate - LAG(readmission_rate) OVER (
            PARTITION BY department_name ORDER BY period_start
        )                                                           AS mom_delta,
        -- 3-month rolling average (smoothed trend)
        ROUND(AVG(readmission_rate) OVER (
            PARTITION BY department_name
            ORDER BY period_start
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
        )::NUMERIC, 4)                                             AS rolling_3m_avg
    FROM with_benchmark
)

SELECT
    department_name,
    year,
    month,
    period_start,
    total_admissions,
    total_readmissions,
    readmission_rate,
    benchmark_readmission_rate,
    vs_benchmark_delta,
    prior_month_readmission_rate,
    ROUND(COALESCE(mom_delta, 0)::NUMERIC, 4)                      AS mom_readmission_delta,
    rolling_3m_avg,
    avg_los_days,
    avg_cost_usd,
    total_cost_usd,
    total_icu_days,
    emergency_count,
    emergency_rate,
    -- CMS-style 5-star rating approximation
    -- 5 = >20% below benchmark, 1 = >20% above benchmark
    CASE
        WHEN vs_benchmark_delta <= -0.04  THEN 5
        WHEN vs_benchmark_delta <= -0.01  THEN 4
        WHEN vs_benchmark_delta <=  0.01  THEN 3
        WHEN vs_benchmark_delta <=  0.04  THEN 2
        ELSE 1
    END                                                             AS cms_star_rating,
    -- Performance label for UI
    CASE
        WHEN vs_benchmark_delta < -0.02   THEN 'Outperforming'
        WHEN vs_benchmark_delta >  0.02   THEN 'Underperforming'
        ELSE 'On Target'
    END                                                             AS performance_label
FROM with_trajectory
ORDER BY period_start DESC, vs_benchmark_delta DESC
