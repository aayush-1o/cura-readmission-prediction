{{/*
  stg_patients.sql
  ─────────────────────────────────────────────────────────────────────
  Staging model: clean and cast raw patient records from staging.raw_patients.

  Transformations applied:
    - Cast age to integer, birth_year derived from age + current year
    - Standardize insurance_type into four canonical categories
    - Derive age_group buckets (18-30, 31-45, 46-60, 61-75, 76+)
    - Parse pipe-delimited comorbidities list into boolean columns
    - Assign zip_code_prefix (first 3 digits only — SDoH proxy)
    - Standardize gender to M/F/Other

  Materialization: view (cheap and always-current)
*/}}
{{ config(materialized='view') }}

WITH source AS (
    SELECT * FROM {{ source('staging', 'raw_patients') }}
),

cleaned AS (
    SELECT
        patient_id,
        mrn,
        -- Age and derived fields
        NULLIF(TRIM(age), '')::INTEGER                              AS age,
        NULLIF(TRIM(age), '')::INTEGER                              AS age_at_snapshot,
        (EXTRACT(YEAR FROM CURRENT_DATE)::INT
            - NULLIF(TRIM(age), '')::INTEGER)                      AS birth_year,
        -- Age group bucketing for dimension
        CASE
            WHEN NULLIF(TRIM(age), '')::INTEGER BETWEEN  0 AND 30  THEN '18-30'
            WHEN NULLIF(TRIM(age), '')::INTEGER BETWEEN 31 AND 45  THEN '31-45'
            WHEN NULLIF(TRIM(age), '')::INTEGER BETWEEN 46 AND 60  THEN '46-60'
            WHEN NULLIF(TRIM(age), '')::INTEGER BETWEEN 61 AND 75  THEN '61-75'
            ELSE '76+'
        END                                                        AS age_group,
        -- Gender standardization
        CASE
            WHEN UPPER(TRIM(gender)) IN ('M','MALE')               THEN 'Male'
            WHEN UPPER(TRIM(gender)) IN ('F','FEMALE')             THEN 'Female'
            ELSE 'Other'
        END                                                        AS gender,
        TRIM(ethnicity)                                            AS race_ethnicity,
        -- SDoH proxy: only first 3 digits of zip
        LEFT(REGEXP_REPLACE(TRIM(zip_code), '[^0-9]', '', 'g'), 3) AS zip_code_prefix,
        UPPER(TRIM(state))                                         AS state,
        TRIM(primary_language)                                     AS primary_language,
        -- Insurance standardization
        CASE
            WHEN UPPER(TRIM(insurance_type)) LIKE '%MEDICARE%'     THEN 'Medicare'
            WHEN UPPER(TRIM(insurance_type)) LIKE '%MEDICAID%'     THEN 'Medicaid'
            WHEN UPPER(TRIM(insurance_type)) IN
                ('HMO','PPO','COMMERCIAL','BLUE CROSS','AETNA','CIGNA','HUMANA') THEN 'Commercial'
            ELSE 'Other'
        END                                                        AS insurance_category,
        NULLIF(TRIM(num_comorbidities), '')::INTEGER               AS comorbidity_count,
        TRIM(comorbidities)                                        AS comorbidities_raw,
        -- Boolean comorbidity flags (case-insensitive)
        (UPPER(comorbidities) LIKE '%DIABETES%')                   AS has_diabetes,
        (UPPER(comorbidities) LIKE '%HYPERTENSION%')               AS has_hypertension,
        (UPPER(comorbidities) LIKE '%HEART FAILURE%'
          OR UPPER(comorbidities) LIKE '%CHF%')                    AS has_chf,
        (UPPER(comorbidities) LIKE '%COPD%')                       AS has_copd,
        (UPPER(comorbidities) LIKE '%CKD%'
          OR UPPER(comorbidities) LIKE '%CHRONIC KIDNEY%')         AS has_ckd,
        (UPPER(comorbidities) LIKE '%ATRIAL%'
          OR UPPER(comorbidities) LIKE '%AFIB%')                   AS has_afib,
        (UPPER(comorbidities) LIKE '%OBESITY%'
          OR UPPER(comorbidities) LIKE '%OBESE%')                  AS has_obesity,
        (UPPER(comorbidities) LIKE '%DEPRESSION%')                 AS has_depression,
        loaded_at
    FROM source
    WHERE patient_id IS NOT NULL
      AND TRIM(patient_id) != ''
)

SELECT * FROM cleaned
