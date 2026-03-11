{{/*
  stg_admissions.sql
  ─────────────────────────────────────────────────────────────────────
  Staging model: clean and cast raw admission records.

  Transformations applied:
    - Cast dates, numeric values
    - Derive length_of_stay_days (if not provided)
    - Standardize admission_type to Emergency/Elective/Urgent
    - Standardize discharge_disposition to CMS-aligned values
    - Derive icu_flag from icu_days > 0
    - Derive emergency_flag from admission_type

  Materialization: view
*/}}
{{ config(materialized='view') }}

WITH source AS (
    SELECT * FROM {{ source('staging', 'raw_admissions') }}
),

cleaned AS (
    SELECT
        admission_id,
        patient_id,
        -- Date casting
        NULLIF(TRIM(admission_date), '')::DATE                      AS admission_date,
        NULLIF(TRIM(discharge_date), '')::DATE                      AS discharge_date,
        -- LOS: prefer explicit value, derive if null
        COALESCE(
            NULLIF(TRIM(los_days), '')::INTEGER,
            (NULLIF(TRIM(discharge_date), '')::DATE
                - NULLIF(TRIM(admission_date), '')::DATE)
        )                                                           AS length_of_stay_days,
        -- Department standardization
        TRIM(department)                                            AS department,
        -- Admission type standardization
        CASE
            WHEN UPPER(TRIM(admission_type)) IN ('EMERGENCY','ED','ER','URGENT CARE') THEN 'Emergency'
            WHEN UPPER(TRIM(admission_type)) IN ('ELECTIVE','SCHEDULED')              THEN 'Elective'
            ELSE 'Urgent'
        END                                                         AS admission_type,
        -- Discharge disposition
        COALESCE(TRIM(discharge_disposition), 'Unknown')           AS discharge_disposition,
        -- Primary diagnosis
        TRIM(primary_diagnosis_category)                            AS primary_diagnosis_category,
        -- Numeric fields
        NULLIF(TRIM(icu_days), '')::INTEGER                         AS icu_days,
        NULLIF(TRIM(drg_code), '')                                  AS drg_code,
        NULLIF(TRIM(total_charges), '')::NUMERIC                   AS total_charges,
        -- Derived flags
        (UPPER(TRIM(admission_type)) IN ('EMERGENCY','ED','ER'))    AS emergency_flag,
        (NULLIF(TRIM(icu_days), '')::INTEGER > 0)                   AS icu_flag,
        -- Target label
        CASE
            WHEN TRIM(readmitted_30_day) IN ('1','true','True','TRUE','yes','Yes') THEN TRUE
            ELSE FALSE
        END                                                         AS readmit_30day_flag,
        -- Date keys for dim_date join
        TO_CHAR(NULLIF(TRIM(admission_date), '')::DATE, 'YYYYMMDD')::INTEGER AS admit_date_key,
        TO_CHAR(NULLIF(TRIM(discharge_date), '')::DATE, 'YYYYMMDD')::INTEGER AS discharge_date_key,
        loaded_at
    FROM source
    WHERE admission_id IS NOT NULL
      AND TRIM(admission_id) != ''
      AND TRIM(patient_id) != ''
      -- Exclude negative or extreme LOS
      AND (NULLIF(TRIM(los_days), '')::INTEGER IS NULL
           OR NULLIF(TRIM(los_days), '')::INTEGER BETWEEN 0 AND 365)
)

SELECT * FROM cleaned
