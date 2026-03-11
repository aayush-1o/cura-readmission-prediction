-- ═══════════════════════════════════════════════════════════════════════════
-- CareIQ — Database Initialization Script (Phase 1)
-- Run this once against a fresh PostgreSQL 16 instance.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Usage:
--   psql -U careiq -d careiq_warehouse -f create_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Execute the full schema DDL
\i star_schema.sql

-- ─────────────────────────────────────────────────────────────────────
-- SEED: dim_date
-- Generates a full date spine for 2019-01-01 through 2026-12-31.
-- This covers 3 years of historical synthetic data + 2 years future.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO dim_date (
    date_key,
    full_date,
    year,
    quarter,
    month,
    month_name,
    week_of_year,
    day_of_month,
    day_of_week,
    day_name,
    is_weekend,
    fiscal_quarter,
    fiscal_year,
    season
)
SELECT
    TO_CHAR(d, 'YYYYMMDD')::INTEGER                 AS date_key,
    d::DATE                                         AS full_date,
    EXTRACT(YEAR FROM d)::SMALLINT                  AS year,
    EXTRACT(QUARTER FROM d)::SMALLINT               AS quarter,
    EXTRACT(MONTH FROM d)::SMALLINT                 AS month,
    TRIM(TO_CHAR(d, 'Month'))                       AS month_name,
    EXTRACT(WEEK FROM d)::SMALLINT                  AS week_of_year,
    EXTRACT(DAY FROM d)::SMALLINT                   AS day_of_month,
    EXTRACT(ISODOW FROM d)::SMALLINT                AS day_of_week,
    TRIM(TO_CHAR(d, 'Day'))                         AS day_name,
    EXTRACT(ISODOW FROM d) IN (6, 7)                AS is_weekend,
    -- Fiscal quarter: hospitals often use Oct-Sep fiscal year
    CASE
        WHEN EXTRACT(MONTH FROM d) BETWEEN 10 AND 12 THEN 1
        WHEN EXTRACT(MONTH FROM d) BETWEEN  1 AND  3 THEN 2
        WHEN EXTRACT(MONTH FROM d) BETWEEN  4 AND  6 THEN 3
        ELSE 4
    END::SMALLINT                                   AS fiscal_quarter,
    -- Fiscal year: Oct 1 YYYY = start of FY YYYY+1
    CASE
        WHEN EXTRACT(MONTH FROM d) >= 10
        THEN EXTRACT(YEAR FROM d)::SMALLINT + 1
        ELSE EXTRACT(YEAR FROM d)::SMALLINT
    END                                             AS fiscal_year,
    -- Season (Northern Hemisphere)
    CASE
        WHEN EXTRACT(MONTH FROM d) IN (12, 1, 2)    THEN 'Winter'
        WHEN EXTRACT(MONTH FROM d) IN ( 3, 4, 5)    THEN 'Spring'
        WHEN EXTRACT(MONTH FROM d) IN ( 6, 7, 8)    THEN 'Summer'
        ELSE                                              'Fall'
    END                                             AS season
FROM generate_series(
    '2019-01-01'::TIMESTAMPTZ,
    '2026-12-31'::TIMESTAMPTZ,
    '1 day'::INTERVAL
) AS d
ON CONFLICT (date_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SEED: dim_discharge_disposition
-- CMS standard discharge disposition codes.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO dim_discharge_disposition
    (disposition_code, disposition_name, disposition_group, high_risk_flag, cms_category)
VALUES
    ('01', 'Home',                                      'Home',           FALSE, 'Home'),
    ('06', 'Home with Home Health Agency',              'Home',           FALSE, 'Home'),
    ('02', 'Short-term General Hospital',               'Transfer',       TRUE,  'Transfer'),
    ('03', 'Skilled Nursing Facility',                  'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('04', 'Intermediate Care Facility',                'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('05', 'Another Type of Institution',               'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('62', 'Inpatient Rehabilitation Facility',         'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('63', 'Long-term Care Hospital',                   'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('65', 'Psychiatric Hospital',                      'Post-Acute',     TRUE,  'Post-Acute Care'),
    ('07', 'Left Against Medical Advice',               'AMA',            TRUE,  'AMA'),
    ('20', 'Expired',                                   'Expired',        FALSE, 'Expired'),
    ('21', 'Expired — Medically Assisted Death',        'Expired',        FALSE, 'Expired'),
    ('30', 'Still Patient',                             'Other',          FALSE, 'Other'),
    ('50', 'Hospice — Home',                            'Hospice',        FALSE, 'Hospice'),
    ('51', 'Hospice — Medical Facility',                'Hospice',        FALSE, 'Hospice')
ON CONFLICT (disposition_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SEED: dim_department
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO dim_department
    (department_code, department_name, service_line, is_icu, is_surgical, benchmark_readmission_rate)
VALUES
    ('CARD', 'Cardiology',          'Heart & Vascular',   FALSE, FALSE, 0.180),
    ('IMED', 'Internal Medicine',   'General Medicine',   FALSE, FALSE, 0.140),
    ('PULM', 'Pulmonology',         'Respiratory',        FALSE, FALSE, 0.160),
    ('NEUR', 'Neurology',           'Neuroscience',       FALSE, FALSE, 0.120),
    ('ORTH', 'Orthopedics',         'Musculoskeletal',    FALSE, TRUE,  0.080),
    ('NEPH', 'Nephrology',          'Kidney Care',        FALSE, FALSE, 0.200),
    ('ONCO', 'Oncology',            'Cancer Center',      FALSE, TRUE,  0.150),
    ('ENDO', 'Endocrinology',       'Metabolic Health',   FALSE, FALSE, 0.130),
    ('GAST', 'Gastroenterology',    'GI Services',        FALSE, TRUE,  0.100),
    ('GSUR', 'General Surgery',     'Surgical Services',  FALSE, TRUE,  0.090),
    ('MICU', 'Medical ICU',         'Critical Care',      TRUE,  FALSE, 0.250),
    ('CICU', 'Cardiac ICU',         'Critical Care',      TRUE,  FALSE, 0.230),
    ('NICU', 'Neurological ICU',    'Critical Care',      TRUE,  FALSE, 0.210)
ON CONFLICT (department_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SEED: dim_diagnosis — seed with the synthetic data ICD-10 codes
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO dim_diagnosis
    (icd10_code, icd10_description, category, chronic_flag, high_readmission_risk_flag)
VALUES
    -- Heart Failure
    ('I50.9',   'Heart failure, unspecified',                          'Cardiovascular', TRUE,  TRUE),
    ('I50.1',   'Left ventricular failure, unspecified',               'Cardiovascular', TRUE,  TRUE),
    ('I50.20',  'Unspecified systolic heart failure',                  'Cardiovascular', TRUE,  TRUE),
    ('I50.30',  'Unspecified diastolic heart failure',                 'Cardiovascular', TRUE,  TRUE),
    ('I50.40',  'Unspecified combined systolic and diastolic HF',      'Cardiovascular', TRUE,  TRUE),
    -- COPD
    ('J44.1',   'Chronic obstructive pulmonary disease with exacerbation', 'Respiratory', TRUE, TRUE),
    ('J44.0',   'COPD with acute lower respiratory infection',         'Respiratory',    TRUE,  TRUE),
    ('J44.9',   'COPD, unspecified',                                   'Respiratory',    TRUE,  FALSE),
    -- Pneumonia
    ('J18.9',   'Pneumonia, unspecified organism',                     'Respiratory',    FALSE, FALSE),
    ('J18.1',   'Lobar pneumonia, unspecified organism',               'Respiratory',    FALSE, FALSE),
    ('J15.9',   'Unspecified bacterial pneumonia',                     'Respiratory',    FALSE, FALSE),
    ('J15.1',   'Pneumonia due to Pseudomonas',                        'Respiratory',    FALSE, FALSE),
    -- Sepsis
    ('A41.9',   'Sepsis, unspecified organism',                        'Infectious',     FALSE, TRUE),
    ('A41.51',  'Sepsis due to Escherichia coli',                      'Infectious',     FALSE, TRUE),
    ('A41.01',  'Sepsis due to methicillin susceptible Staph aureus',  'Infectious',     FALSE, TRUE),
    ('A40.0',   'Sepsis due to streptococcus, group A',                'Infectious',     FALSE, TRUE),
    -- Diabetes
    ('E11.9',   'Type 2 diabetes mellitus without complications',      'Endocrine',      TRUE,  FALSE),
    ('E11.65',  'Type 2 diabetes with hyperglycemia',                  'Endocrine',      TRUE,  TRUE),
    ('E11.649', 'Type 2 diabetes with hypoglycemia without coma',      'Endocrine',      TRUE,  TRUE),
    ('E10.9',   'Type 1 diabetes mellitus without complications',      'Endocrine',      TRUE,  FALSE),
    -- Acute MI
    ('I21.9',   'Acute myocardial infarction, unspecified',            'Cardiovascular', FALSE, TRUE),
    ('I21.3',   'ST elevation MI of unspecified site',                 'Cardiovascular', FALSE, TRUE),
    ('I21.0',   'STEMI of anterior wall',                              'Cardiovascular', FALSE, TRUE),
    ('I21.4',   'Non-ST elevation myocardial infarction',              'Cardiovascular', FALSE, TRUE),
    -- Stroke
    ('I63.9',   'Cerebral infarction, unspecified',                    'Neurological',   FALSE, TRUE),
    ('I63.50',  'Cerebral infarction due to unspecified occlusion or stenosis', 'Neurological', FALSE, TRUE),
    -- CKD
    ('N18.5',   'Chronic kidney disease, stage 5',                     'Renal',          TRUE,  TRUE),
    ('N18.6',   'End stage renal disease',                             'Renal',          TRUE,  TRUE),
    ('N18.4',   'Chronic kidney disease, stage 4',                     'Renal',          TRUE,  TRUE),
    ('N18.3',   'Chronic kidney disease, stage 3 (unspecified)',       'Renal',          TRUE,  FALSE),
    -- Hip Fracture
    ('S72.001A','Fracture of unspecified part of neck of right femur', 'Musculoskeletal', FALSE, FALSE),
    ('S72.002A','Fracture of unspecified part of neck of left femur',  'Musculoskeletal', FALSE, FALSE),
    -- UTI
    ('N39.0',   'Urinary tract infection, site not specified',         'Genitourinary',  FALSE, FALSE),
    ('N10',     'Acute pyelonephritis',                                'Genitourinary',  FALSE, FALSE),
    -- Comorbidities
    ('I10',     'Essential (primary) hypertension',                    'Cardiovascular', TRUE,  FALSE),
    ('I48.91',  'Unspecified atrial fibrillation',                     'Cardiovascular', TRUE,  TRUE),
    ('E66.9',   'Obesity, unspecified',                                'Endocrine',      TRUE,  FALSE),
    ('F32.9',   'Major depressive disorder, single episode, unspecified', 'Psychiatric', TRUE,  FALSE),
    ('D64.9',   'Anemia, unspecified',                                 'Hematological',  FALSE, FALSE),
    ('E03.9',   'Hypothyroidism, unspecified',                         'Endocrine',      TRUE,  FALSE)
ON CONFLICT (icd10_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SEED: dim_procedure — common CPT codes used in synthetic data
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO dim_procedure
    (cpt_code, cpt_description, procedure_category, complexity_tier, is_surgical, is_diagnostic)
VALUES
    ('99232', 'Subsequent hospital care, moderate complexity',      'E&M',         2, FALSE, FALSE),
    ('99233', 'Subsequent hospital care, high complexity',          'E&M',         3, FALSE, FALSE),
    ('93306', 'Echo transthoracic real-time w/ image doc, complete','Imaging',     2, FALSE, TRUE),
    ('93307', 'Echo transthoracic real-time w/ image doc, limited', 'Imaging',     1, FALSE, TRUE),
    ('71046', 'Radiologic examination chest, 2 views',              'Imaging',     1, FALSE, TRUE),
    ('80053', 'Comprehensive metabolic panel',                      'Lab',         1, FALSE, TRUE),
    ('85025', 'Blood count; complete (CBC), automated',             'Lab',         1, FALSE, TRUE),
    ('36415', 'Collection of venous blood by venipuncture',         'Procedure',   1, FALSE, FALSE),
    ('93000', 'Electrocardiogram routine ECG with 12 leads',        'Diagnostic',  1, FALSE, TRUE),
    ('99291', 'Critical care, evaluation and management, first hour','E&M',        5, FALSE, FALSE),
    ('31500', 'Endotracheal intubation, emergency',                 'Procedure',   4, FALSE, FALSE),
    ('36561', 'Insert tunneled CVC, age 5 or older',               'Surgery',     4, TRUE,  FALSE),
    ('92953', 'Temporary transcutaneous pacing',                    'Procedure',   4, FALSE, FALSE),
    ('43239', 'EGD with biopsy single/multiple',                    'Surgery',     3, TRUE,  TRUE)
ON CONFLICT (cpt_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- ANALYTICAL VIEWS
-- ─────────────────────────────────────────────────────────────────────

-- Summary view joining all dimensions onto fact_admissions
CREATE OR REPLACE VIEW vw_admission_full AS
SELECT
    fa.admission_id,
    fa.admission_key,
    dp.patient_id,
    dp.age_group,
    dp.gender,
    dp.race_ethnicity,
    dp.insurance_category,
    dp.comorbidity_count,
    dp.charlson_comorbidity_index,
    -- Comorbidity flags
    dp.has_diabetes,
    dp.has_hypertension,
    dp.has_chf,
    dp.has_copd,
    dp.has_ckd,
    -- Admission details
    dd_admit.full_date      AS admit_date,
    dd_admit.year           AS admit_year,
    dd_admit.quarter        AS admit_quarter,
    dd_admit.month          AS admit_month,
    dd_admit.day_name       AS admit_day_name,
    dd_admit.is_weekend     AS admitted_on_weekend,
    dd_disch.full_date      AS discharge_date,
    -- Outcome measures
    fa.length_of_stay_days,
    fa.icu_days,
    fa.icu_flag,
    fa.emergency_flag,
    fa.total_cost_usd,
    fa.insurance_type,
    fa.admission_type,
    fa.drg_code,
    fa.readmit_30day_flag,
    fa.days_to_readmission,
    -- Dimension names
    dpt.department_name,
    dpt.service_line,
    dx.icd10_code           AS primary_icd10,
    dx.icd10_description    AS primary_diagnosis,
    dx.category             AS diagnosis_category,
    dx.chronic_flag,
    disp.disposition_name   AS discharge_disposition,
    disp.disposition_group
FROM fact_admissions fa
JOIN dim_patient                dp   ON fa.patient_key               = dp.patient_key
JOIN dim_date                   dd_admit ON fa.admit_date_key        = dd_admit.date_key
LEFT JOIN dim_date              dd_disch ON fa.discharge_date_key    = dd_disch.date_key
LEFT JOIN dim_department        dpt  ON fa.department_key            = dpt.department_key
LEFT JOIN dim_diagnosis         dx   ON fa.primary_diagnosis_key     = dx.diagnosis_key
LEFT JOIN dim_discharge_disposition disp ON fa.discharge_disposition_key = disp.disposition_key
WHERE dp.is_current = TRUE;

-- High-risk patients view (for API and dashboard)
CREATE OR REPLACE VIEW vw_high_risk_patients_current AS
SELECT
    dp.patient_id,
    dp.age_group,
    dp.gender,
    dp.insurance_category,
    dp.comorbidity_count,
    dp.charlson_comorbidity_index,
    fa.admission_id,
    fa.length_of_stay_days,
    fa.department_key,
    dpt.department_name,
    fp.readmission_risk_score,
    fp.risk_tier,
    fp.top_features,
    fp.recommended_actions,
    fp.predicted_at,
    fp.clinician_reviewed
FROM fact_predictions fp
JOIN fact_admissions fa    ON fp.admission_key = fa.admission_key
JOIN dim_patient    dp     ON fp.patient_key   = dp.patient_key
LEFT JOIN dim_department dpt ON fa.department_key = dpt.department_key
WHERE fp.risk_tier IN ('high', 'critical')
  AND dp.is_current = TRUE
  AND fp.predicted_at = (
      -- Only use the most recent prediction per admission
      SELECT MAX(fp2.predicted_at)
      FROM fact_predictions fp2
      WHERE fp2.admission_key = fp.admission_key
  )
ORDER BY fp.readmission_risk_score DESC;
