-- ═══════════════════════════════════════════════════════════════════════════
-- CareIQ Data Warehouse — Phase 1 Star Schema (Full DDL)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Architecture: Kimball-style star schema for hospital readmission analytics.
-- PostgreSQL 16 — all identifiers snake_case, all surrogate keys BIGSERIAL.
--
-- Schemas:
--   public   — Fact and dimension tables (live warehouse)
--   staging  — Raw CSV loads (temporary, truncated each run)
--   audit    — Pipeline run logs, data quality results
--
-- Execution order (respects FK dependency chain):
--   1. Extensions & schemas
--   2. Dimension tables (no FKs)
--   3. Fact tables (depend on dims)
--   4. Bridge tables (depend on facts + dims)
--   5. ML output tables
--   6. Audit tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- EXTENSIONS & SCHEMAS
-- ─────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fast text search on diagnosis descriptions
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- GIN indexes on composite keys

CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS audit;

SET search_path TO public, staging, audit;

-- ─────────────────────────────────────────────────────────────────────
-- STAGING TABLES (raw loads, truncated each ETL run)
-- These mirror CSV structure exactly — no transforms, no constraints.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staging.raw_patients (
    patient_id          TEXT,
    mrn                 TEXT,
    age                 TEXT,
    date_of_birth       TEXT,
    gender              TEXT,
    ethnicity           TEXT,
    zip_code            TEXT,
    state               TEXT,
    insurance_type      TEXT,
    primary_language    TEXT,
    num_comorbidities   TEXT,
    comorbidities       TEXT,
    loaded_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.raw_admissions (
    admission_id                TEXT,
    patient_id                  TEXT,
    admission_date              TEXT,
    discharge_date              TEXT,
    los_days                    TEXT,
    department                  TEXT,
    primary_diagnosis_category  TEXT,
    admission_type              TEXT,
    discharge_disposition       TEXT,
    readmitted_30_day           TEXT,
    icu_days                    TEXT,
    drg_code                    TEXT,
    total_charges               TEXT,
    loaded_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.raw_diagnoses (
    diagnosis_id        TEXT,
    admission_id        TEXT,
    icd10_code          TEXT,
    description         TEXT,
    diagnosis_type      TEXT,
    sequence            TEXT,
    loaded_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.raw_procedures (
    procedure_id            TEXT,
    admission_id            TEXT,
    cpt_code                TEXT,
    procedure_date          TEXT,
    performing_department   TEXT,
    charge_amount           TEXT,
    loaded_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.raw_vitals (
    vital_id            TEXT,
    admission_id        TEXT,
    recorded_at         TEXT,
    systolic_bp         TEXT,
    diastolic_bp        TEXT,
    heart_rate          TEXT,
    respiratory_rate    TEXT,
    temperature_f       TEXT,
    spo2_pct            TEXT,
    weight_kg           TEXT,
    news2_score         TEXT,
    loaded_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.raw_medications (
    medication_id           TEXT,
    admission_id            TEXT,
    medication_name         TEXT,
    route                   TEXT,
    frequency               TEXT,
    order_date              TEXT,
    status                  TEXT,
    prescribing_provider    TEXT,
    loaded_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_date
-- Full calendar dimension. Pre-seeded for 2020–2026.
-- date_key format: YYYYMMDD (e.g. 20240315 for March 15, 2024)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_date (
    date_key            INTEGER PRIMARY KEY,            -- YYYYMMDD surrogate
    full_date           DATE NOT NULL UNIQUE,
    year                SMALLINT NOT NULL,
    quarter             SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    month_name          VARCHAR(10) NOT NULL,
    week_of_year        SMALLINT NOT NULL CHECK (week_of_year BETWEEN 1 AND 53),
    day_of_month        SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=Mon, 7=Sun
    day_name            VARCHAR(10) NOT NULL,
    is_weekend          BOOLEAN NOT NULL DEFAULT FALSE,
    is_holiday          BOOLEAN NOT NULL DEFAULT FALSE,
    fiscal_quarter      SMALLINT,                       -- For hospitals on non-calendar FY
    fiscal_year         SMALLINT,
    season              VARCHAR(10)                     -- Spring/Summer/Fall/Winter
);

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_patient (Slowly Changing Dimension Type 2)
-- One row per patient version. is_current=TRUE is the active record.
-- patient_id is the anonymized business key (HMAC pseudonym from Phase 0).
--
-- SCD2 design: when demographics change, expire the old row (set
-- expiry_date + is_current=FALSE) and insert a new row with a new
-- surrogate key. Fact tables join on patient_key (surrogate), so
-- historical facts stay linked to historical dimension state.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_patient (
    patient_key             BIGSERIAL PRIMARY KEY,      -- Surrogate key
    patient_id              VARCHAR(60) NOT NULL,       -- Business key (ANON-XXXXXXXX)
    mrn                     VARCHAR(30),                -- Masked MRN
    -- Demographics (preserves state at time of snapshot)
    age_at_snapshot         SMALLINT CHECK (age_at_snapshot BETWEEN 0 AND 120),
    age_group               VARCHAR(15) NOT NULL DEFAULT 'Unknown',
                                                        -- '18-30','31-45','46-60','61-75','76+'
    birth_year              SMALLINT,                   -- DOB generalized to year (k-anonymity)
    gender                  VARCHAR(20),
    race_ethnicity          VARCHAR(60),                -- For fairness monitoring
    zip_code_prefix         CHAR(3),                    -- First 3 digits: SDoH proxy
    state                   CHAR(2),
    primary_language        VARCHAR(50),
    insurance_category      VARCHAR(50),                -- Simplified: Commercial/Medicare/Medicaid/Other
    -- Comorbidities (boolean flags for fast filtering)
    has_diabetes            BOOLEAN NOT NULL DEFAULT FALSE,
    has_hypertension        BOOLEAN NOT NULL DEFAULT FALSE,
    has_chf                 BOOLEAN NOT NULL DEFAULT FALSE,  -- Congestive Heart Failure
    has_copd                BOOLEAN NOT NULL DEFAULT FALSE,
    has_ckd                 BOOLEAN NOT NULL DEFAULT FALSE,  -- Chronic Kidney Disease
    has_afib                BOOLEAN NOT NULL DEFAULT FALSE,  -- Atrial Fibrillation
    has_obesity             BOOLEAN NOT NULL DEFAULT FALSE,
    has_depression          BOOLEAN NOT NULL DEFAULT FALSE,
    comorbidity_count       SMALLINT NOT NULL DEFAULT 0,
    charlson_comorbidity_index SMALLINT DEFAULT 0,      -- CCI score (0-37 scale)
    -- SCD2 tracking columns
    effective_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date             DATE NOT NULL DEFAULT '9999-12-31',
    is_current              BOOLEAN NOT NULL DEFAULT TRUE,
    row_hash                VARCHAR(64),                -- SHA-256 hash of key demographic fields
    -- Audit
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for dim_patient
CREATE UNIQUE INDEX IF NOT EXISTS uidx_dim_patient_current
    ON dim_patient (patient_id)
    WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_dim_patient_business_key
    ON dim_patient (patient_id, is_current);

CREATE INDEX IF NOT EXISTS idx_dim_patient_age_group
    ON dim_patient (age_group) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_dim_patient_insurance
    ON dim_patient (insurance_category) WHERE is_current = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_diagnosis
-- ICD-10 code reference table with clinical hierarchy and risk flags.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_diagnosis (
    diagnosis_key               SERIAL PRIMARY KEY,
    icd10_code                  VARCHAR(10) NOT NULL UNIQUE,
    icd10_description           VARCHAR(255),
    long_description            TEXT,
    -- Clinical hierarchy
    category                    VARCHAR(60),        -- e.g. 'Cardiovascular','Respiratory'
    subcategory                 VARCHAR(60),
    icd10_chapter               VARCHAR(100),       -- e.g. 'Diseases of the circulatory system'
    icd10_chapter_range         VARCHAR(20),        -- e.g. 'I00-I99'
    -- Clinical flags
    chronic_flag                BOOLEAN NOT NULL DEFAULT FALSE,
    high_readmission_risk_flag  BOOLEAN NOT NULL DEFAULT FALSE,
    billable                    BOOLEAN NOT NULL DEFAULT TRUE,
    -- CMS / DRG alignment
    cms_condition_category      VARCHAR(50),        -- For risk adjustment
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_diagnosis_code
    ON dim_diagnosis (icd10_code);
CREATE INDEX IF NOT EXISTS idx_dim_diagnosis_category
    ON dim_diagnosis (category);
CREATE INDEX IF NOT EXISTS idx_dim_diagnosis_fts
    USING gin ON dim_diagnosis USING gin(to_tsvector('english', icd10_description));

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_procedure
-- CPT procedure code reference with complexity tier scoring.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_procedure (
    procedure_key       SERIAL PRIMARY KEY,
    cpt_code            VARCHAR(10) NOT NULL UNIQUE,
    cpt_description     VARCHAR(300),
    procedure_category  VARCHAR(80),        -- e.g. 'Evaluation & Management','Surgery'
    subcategory         VARCHAR(80),
    -- Clinical metadata
    complexity_tier     SMALLINT CHECK (complexity_tier BETWEEN 1 AND 5),
                                            -- 1=Routine, 5=High-complexity
    is_surgical         BOOLEAN DEFAULT FALSE,
    is_diagnostic       BOOLEAN DEFAULT FALSE,
    avg_duration_min    SMALLINT,
    -- Cost context
    avg_medicare_payment NUMERIC(10, 2),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_procedure_code ON dim_procedure (cpt_code);

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_provider
-- Anonymized provider records. NPI is pseudonymized in Phase 0.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_provider (
    provider_key        SERIAL PRIMARY KEY,
    provider_id         VARCHAR(60) NOT NULL UNIQUE, -- Anonymized NPI
    specialty           VARCHAR(80),
    department          VARCHAR(80),
    hospital_unit       VARCHAR(80),
    -- Performance context (populated by aggregations)
    avg_patient_los     NUMERIC(5, 2),
    readmission_rate    NUMERIC(5, 4),
    patient_volume_ytd  INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_department
-- Hospital departments with service line mapping.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_department (
    department_key      SERIAL PRIMARY KEY,
    department_code     VARCHAR(20) NOT NULL UNIQUE,
    department_name     VARCHAR(100) NOT NULL,
    service_line        VARCHAR(80),
    floor_unit          VARCHAR(40),
    bed_count           SMALLINT,
    is_icu              BOOLEAN NOT NULL DEFAULT FALSE,
    is_surgical         BOOLEAN NOT NULL DEFAULT FALSE,
    -- Readmission benchmark (target rate for this dept type)
    benchmark_readmission_rate NUMERIC(5, 4),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- DIMENSION: dim_discharge_disposition
-- CMS discharge disposition codes + high-risk flag for readmission.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_discharge_disposition (
    disposition_key     SERIAL PRIMARY KEY,
    disposition_code    VARCHAR(10) NOT NULL UNIQUE,
    disposition_name    VARCHAR(100) NOT NULL,
    disposition_group   VARCHAR(40),        -- 'Home','Post-Acute Care','AMA','Expired'
    high_risk_flag      BOOLEAN NOT NULL DEFAULT FALSE,
    cms_category        VARCHAR(50),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- FACT: fact_admissions
-- Central fact table. Grain: one row per hospital admission.
-- All measures are additive or semi-additive.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fact_admissions (
    -- Surrogate PK
    admission_key               BIGSERIAL PRIMARY KEY,
    -- Business key (from source EHR system, unique)
    admission_id                VARCHAR(50) NOT NULL UNIQUE,
    -- Dimension foreign keys
    patient_key                 BIGINT NOT NULL
                                    REFERENCES dim_patient (patient_key) ON DELETE RESTRICT,
    admit_date_key              INTEGER NOT NULL
                                    REFERENCES dim_date (date_key),
    discharge_date_key          INTEGER
                                    REFERENCES dim_date (date_key),
    primary_diagnosis_key       INTEGER
                                    REFERENCES dim_diagnosis (diagnosis_key),
    department_key              INTEGER
                                    REFERENCES dim_department (department_key),
    discharge_disposition_key   INTEGER
                                    REFERENCES dim_discharge_disposition (disposition_key),
    -- Degenerate dimensions (no dimension table needed, low cardinality)
    admission_type              VARCHAR(20)     -- 'Emergency','Elective','Urgent'
                                    CHECK (admission_type IN ('Emergency','Elective','Urgent')),
    drg_code                    VARCHAR(10),
    insurance_type              VARCHAR(50),
    -- Measures
    length_of_stay_days         SMALLINT CHECK (length_of_stay_days >= 0),
    icu_days                    SMALLINT NOT NULL DEFAULT 0,
    total_cost_usd              NUMERIC(12, 2) CHECK (total_cost_usd >= 0),
    -- Flags (semi-additive — can sum within a day or patient, not across)
    emergency_flag              BOOLEAN NOT NULL DEFAULT FALSE,
    icu_flag                    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Target label (outcome for ML)
    readmit_30day_flag          BOOLEAN NOT NULL DEFAULT FALSE,
    readmit_date                DATE,           -- Actual readmission date (nullable)
    readmit_admission_key       BIGINT,         -- FK to the readmission encounter
    days_to_readmission         SMALLINT,
    -- Audit
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes on fact_admissions (high-cardinality joins + common filters)
CREATE INDEX IF NOT EXISTS idx_fact_adm_patient
    ON fact_admissions (patient_key);
CREATE INDEX IF NOT EXISTS idx_fact_adm_admit_date
    ON fact_admissions (admit_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_adm_discharge_date
    ON fact_admissions (discharge_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_adm_department
    ON fact_admissions (department_key);
CREATE INDEX IF NOT EXISTS idx_fact_adm_readmit
    ON fact_admissions (readmit_30day_flag)
    WHERE readmit_30day_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_fact_adm_insurance
    ON fact_admissions (insurance_type);

-- ─────────────────────────────────────────────────────────────────────
-- FACT: fact_predictions
-- Stores ML model outputs per admission. One row per model run.
-- Multiple rows per admission possible (re-scores, model upgrades).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fact_predictions (
    prediction_key              BIGSERIAL PRIMARY KEY,
    prediction_id               UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    -- Dimension foreign keys
    patient_key                 BIGINT NOT NULL
                                    REFERENCES dim_patient (patient_key),
    admission_key               BIGINT NOT NULL
                                    REFERENCES fact_admissions (admission_key),
    date_key                    INTEGER
                                    REFERENCES dim_date (date_key),
    -- Model metadata
    model_name                  VARCHAR(100) NOT NULL,
    model_version               VARCHAR(50) NOT NULL,
    predicted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prediction output
    readmission_risk_score      NUMERIC(6, 4) NOT NULL
                                    CHECK (readmission_risk_score BETWEEN 0.0 AND 1.0),
    risk_tier                   VARCHAR(10) NOT NULL
                                    CHECK (risk_tier IN ('low','medium','high','critical')),
    confidence_interval_low     NUMERIC(6, 4),
    confidence_interval_high    NUMERIC(6, 4),
    -- Explainability (SHAP outputs)
    top_features                JSONB,          -- {"feature_name": shap_value, ...} top 5
    -- Care path recommendations
    recommended_actions         JSONB,          -- [{"action": str, "priority": int, ...}]
    -- Outcome tracking (filled in retrospectively after 30 days)
    clinician_reviewed          BOOLEAN NOT NULL DEFAULT FALSE,
    clinician_reviewed_at       TIMESTAMPTZ,
    clinician_notes             TEXT,
    actual_outcome              BOOLEAN,        -- TRUE = readmitted, FALSE = not, NULL = pending
    outcome_recorded_at         TIMESTAMPTZ,
    -- Audit
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_pred_admission
    ON fact_predictions (admission_key);
CREATE INDEX IF NOT EXISTS idx_fact_pred_patient
    ON fact_predictions (patient_key);
CREATE INDEX IF NOT EXISTS idx_fact_pred_risk_tier
    ON fact_predictions (risk_tier);
CREATE INDEX IF NOT EXISTS idx_fact_pred_predicted_at
    ON fact_predictions (predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fact_pred_model_version
    ON fact_predictions (model_name, model_version);
-- GIN index for JSONB querying on top_features
CREATE INDEX IF NOT EXISTS idx_fact_pred_top_features_gin
    ON fact_predictions USING gin (top_features);

-- ─────────────────────────────────────────────────────────────────────
-- FACT: fact_vitals (Appendable time-series fact)
-- Grain: one row per vital sign reading during an admission.
-- Designed for high-volume append-only insertion.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fact_vitals (
    vital_key           BIGSERIAL PRIMARY KEY,
    vital_id            VARCHAR(50) NOT NULL UNIQUE,
    -- Dimension foreign keys
    patient_key         BIGINT NOT NULL
                            REFERENCES dim_patient (patient_key),
    admission_key       BIGINT NOT NULL
                            REFERENCES fact_admissions (admission_key),
    date_key            INTEGER
                            REFERENCES dim_date (date_key),
    -- Timestamps
    recorded_at         TIMESTAMPTZ NOT NULL,
    hours_since_admit   SMALLINT,               -- Computed: for trend windows
    -- Cardiovascular vitals
    heart_rate          NUMERIC(5, 1) CHECK (heart_rate BETWEEN 0 AND 400),
    systolic_bp         NUMERIC(5, 1) CHECK (systolic_bp BETWEEN 0 AND 350),
    diastolic_bp        NUMERIC(5, 1) CHECK (diastolic_bp BETWEEN 0 AND 250),
    -- Respiratory vitals
    respiratory_rate    NUMERIC(4, 1) CHECK (respiratory_rate BETWEEN 0 AND 100),
    spo2                NUMERIC(5, 2) CHECK (spo2 BETWEEN 0 AND 100),
    temperature         NUMERIC(5, 2) CHECK (temperature BETWEEN 80 AND 120),  -- Fahrenheit
    -- Lab values (Phase 2: populated when lab CSV is added)
    glucose_level       NUMERIC(6, 1),          -- mg/dL
    creatinine          NUMERIC(5, 2),          -- mg/dL
    wbc_count           NUMERIC(6, 2),          -- K/uL
    -- Derived score
    news2_score         SMALLINT CHECK (news2_score BETWEEN 0 AND 20),
    -- Anomaly detection flag (set by ML pipeline)
    anomaly_flag        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Audit
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_vitals_admission
    ON fact_vitals (admission_key);
CREATE INDEX IF NOT EXISTS idx_fact_vitals_patient
    ON fact_vitals (patient_key);
CREATE INDEX IF NOT EXISTS idx_fact_vitals_recorded_at
    ON fact_vitals (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fact_vitals_anomaly
    ON fact_vitals (anomaly_flag)
    WHERE anomaly_flag = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- BRIDGE: bridge_admission_diagnoses
-- Resolves many-to-many between fact_admissions and dim_diagnosis.
-- An admission can have 1 primary + up to 25 secondary diagnoses.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bridge_admission_diagnoses (
    admission_key       BIGINT NOT NULL REFERENCES fact_admissions (admission_key),
    diagnosis_key       INTEGER NOT NULL REFERENCES dim_diagnosis (diagnosis_key),
    diagnosis_type      VARCHAR(20) NOT NULL DEFAULT 'Secondary',
                            -- 'Primary','Secondary','Admitting','Discharge'
    sequence_number     SMALLINT NOT NULL DEFAULT 1,
    poa_flag            BOOLEAN DEFAULT NULL,   -- Present on Admission
    PRIMARY KEY (admission_key, diagnosis_key)
);

CREATE INDEX IF NOT EXISTS idx_bridge_adm_diag_admission
    ON bridge_admission_diagnoses (admission_key);
CREATE INDEX IF NOT EXISTS idx_bridge_adm_diag_diagnosis
    ON bridge_admission_diagnoses (diagnosis_key);

-- ─────────────────────────────────────────────────────────────────────
-- BRIDGE: bridge_admission_procedures
-- Resolves many-to-many between fact_admissions and dim_procedure.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bridge_admission_procedures (
    admission_key       BIGINT NOT NULL REFERENCES fact_admissions (admission_key),
    procedure_key       INTEGER NOT NULL REFERENCES dim_procedure (procedure_key),
    procedure_date_key  INTEGER REFERENCES dim_date (date_key),
    charge_amount       NUMERIC(10, 2),
    quantity            SMALLINT NOT NULL DEFAULT 1,
    PRIMARY KEY (admission_key, procedure_key)
);

CREATE INDEX IF NOT EXISTS idx_bridge_adm_proc_admission
    ON bridge_admission_procedures (admission_key);

-- ─────────────────────────────────────────────────────────────────────
-- AUDIT: pipeline_runs
-- Records every ETL pipeline execution for lineage and debugging.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.pipeline_runs (
    run_id              BIGSERIAL PRIMARY KEY,
    dag_id              VARCHAR(100) NOT NULL,
    run_date            DATE NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    status              VARCHAR(20) DEFAULT 'running'
                            CHECK (status IN ('running','success','failed','partial')),
    -- Row count metrics
    patients_loaded     INTEGER,
    admissions_loaded   INTEGER,
    diagnoses_loaded    INTEGER,
    vitals_loaded       INTEGER,
    patients_scored     INTEGER,
    -- Data quality metrics
    dq_null_pct         NUMERIC(5, 2),
    dq_referential_errors INTEGER DEFAULT 0,
    -- Notes / error details
    notes               TEXT,
    error_detail        TEXT
);

-- ─────────────────────────────────────────────────────────────────────
-- AUDIT: data_quality_checks
-- Stores per-column data quality results from each pipeline run.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.data_quality_checks (
    check_id            BIGSERIAL PRIMARY KEY,
    run_id              BIGINT NOT NULL REFERENCES audit.pipeline_runs (run_id),
    table_name          VARCHAR(100) NOT NULL,
    column_name         VARCHAR(100),
    check_name          VARCHAR(100) NOT NULL,
    check_status        VARCHAR(10) NOT NULL CHECK (check_status IN ('PASS','FAIL','WARN')),
    rows_checked        INTEGER,
    rows_failed         INTEGER DEFAULT 0,
    failure_pct         NUMERIC(7, 4),
    threshold_pct       NUMERIC(7, 4),
    details             TEXT,
    checked_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dq_checks_run_id
    ON audit.data_quality_checks (run_id);
CREATE INDEX IF NOT EXISTS idx_dq_checks_status
    ON audit.data_quality_checks (check_status)
    WHERE check_status IN ('FAIL','WARN');

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3 TABLES: Association Rules & Patient Clusters
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- care_path_rules
-- Stores all mined association rules from CarePathRuleMiner.
-- Served by the recommendations API endpoint.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS care_path_rules (
    rule_id             BIGSERIAL PRIMARY KEY,
    -- Items stored as JSONB arrays for flexible query patterns:
    --   WHERE antecedent_items @> '["DX:I50.9"]'  (contains CHF)
    antecedent_items    JSONB NOT NULL,
    consequent_item     VARCHAR(200) NOT NULL,
    -- Apriori metrics
    support             NUMERIC(8, 6) NOT NULL,
    confidence          NUMERIC(8, 6) NOT NULL,
    lift                NUMERIC(10, 6) NOT NULL,
    conviction          NUMERIC(10, 4),
    evidence_count      INTEGER NOT NULL DEFAULT 0,
    -- 'diagnosis_association' | 'intervention_effectiveness'
    rule_type           VARCHAR(50) NOT NULL,
    -- Model lineage
    model_version       VARCHAR(50),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT care_path_rules_type_check
        CHECK (rule_type IN ('diagnosis_association','intervention_effectiveness'))
);

-- GIN index for JSONB containment queries on antecedent_items
CREATE INDEX IF NOT EXISTS idx_care_path_rules_antecedents
    ON care_path_rules USING GIN (antecedent_items);

CREATE INDEX IF NOT EXISTS idx_care_path_rules_type_lift
    ON care_path_rules (rule_type, lift DESC)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_care_path_rules_consequent
    ON care_path_rules (consequent_item);

COMMENT ON TABLE care_path_rules IS
    'Apriori association rules: diagnosis co-occurrence and intervention effectiveness. '
    'Mined by ml/association_rules.py. Refreshed with each model training cycle.';

-- ─────────────────────────────────────────────────────────────────────
-- patient_clusters
-- Stores cluster assignments from PatientCohortAnalyzer.
-- umap_x/umap_y enable 2D scatter chart in the UI.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_clusters (
    assignment_id       BIGSERIAL PRIMARY KEY,
    patient_id          VARCHAR(100) NOT NULL,
    cluster_id          SMALLINT NOT NULL,
    cluster_name        VARCHAR(100) NOT NULL,
    cluster_label       VARCHAR(50) NOT NULL,
    -- UMAP coordinates for scatter visualization
    umap_x              NUMERIC(8, 6),
    umap_y              NUMERIC(8, 6),
    -- Model tracking
    model_version       VARCHAR(50),
    -- Silhouette score for this patient (how well it fits its cluster)
    silhouette_score    NUMERIC(6, 4),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_patient_clusters_patient
    ON patient_clusters (patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_clusters_cluster_id
    ON patient_clusters (cluster_id);

CREATE INDEX IF NOT EXISTS idx_patient_clusters_name
    ON patient_clusters (cluster_name);

COMMENT ON TABLE patient_clusters IS
    'KMeans cluster assignments per patient, with UMAP 2D coordinates for '
    'visualization. Assigned by ml/clustering.py. One row per patient (latest assignment).';
