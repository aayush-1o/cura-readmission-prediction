{{/*
  stg_diagnoses.sql
  ─────────────────────────────────────────────────────────────────────
  Staging model: clean diagnosis records, attach ICD-10 flags from dim_diagnosis.

  Transformations:
    - Validate ICD-10 code format (letter + 2 digits minimum)
    - Identify primary vs secondary diagnoses
    - Join to pre-seeded dim_diagnosis to get category, chronic_flag,
      high_readmission_risk_flag
    - Derive poa_flag (present on admission) where available

  Materialization: view
*/}}
{{ config(materialized='view') }}

WITH source AS (
    SELECT * FROM {{ source('staging', 'raw_diagnoses') }}
),

dim_ref AS (
    -- Reference join to get clinical metadata for each ICD-10 code
    SELECT
        icd10_code,
        category,
        chronic_flag,
        high_readmission_risk_flag,
        icd10_description
    FROM {{ ref('dim_diagnosis') }}
),

cleaned AS (
    SELECT
        d.diagnosis_id,
        d.admission_id,
        UPPER(TRIM(d.icd10_code))                                   AS icd10_code,
        TRIM(d.description)                                         AS raw_description,
        -- Validate ICD-10 format: must start with a letter, then 2+ digits
        (TRIM(d.icd10_code) ~ '^[A-Z][0-9]{2}')                   AS valid_icd10_format,
        -- Standardize diagnosis type
        CASE
            WHEN UPPER(TRIM(d.diagnosis_type)) IN ('PRIMARY','PRINCIPAL','ADMITTING')
            THEN 'Primary'
            WHEN UPPER(TRIM(d.diagnosis_type)) IN ('DISCHARGE','FINAL')
            THEN 'Discharge'
            ELSE 'Secondary'
        END                                                         AS diagnosis_type,
        NULLIF(TRIM(d.sequence), '')::SMALLINT                      AS sequence_number,
        -- Joined clinical metadata from dimension
        ref.category                                                AS diagnosis_category,
        ref.icd10_description,
        ref.chronic_flag,
        ref.high_readmission_risk_flag,
        -- POA flag: if field exists in source, else null
        NULL::BOOLEAN                                               AS poa_flag,
        d.loaded_at
    FROM source d
    LEFT JOIN dim_ref ref ON ref.icd10_code = UPPER(TRIM(d.icd10_code))
    WHERE d.diagnosis_id IS NOT NULL
      AND TRIM(d.diagnosis_id) != ''
      AND d.admission_id IS NOT NULL
      AND TRIM(d.icd10_code) != ''
)

SELECT * FROM cleaned
