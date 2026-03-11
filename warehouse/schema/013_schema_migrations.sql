-- =============================================================================
-- Migration 013: schema_migrations tracking table
-- =============================================================================
-- Custom migration tracking table (inspired by Alembic's alembic_version table
-- but extended with business context: business_reason, checksum, sql_up/down).
--
-- Design trade-off vs Alembic:
-- Alembic only tracks the current HEAD version. This table tracks the FULL
-- history with business context — why each change was made, who made it,
-- and a SHA256 checksum to detect if migration SQL was modified after the fact
-- (a HIPAA-relevant tamper-detection mechanism).
--
-- Interview talking point: "We chose a custom table over plain Alembic so we
-- could attach business_reason to every migration. When debugging a data
-- issue 6 months later, knowing WHY a column was added is more valuable than
-- just knowing WHEN."
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version         VARCHAR(10)  PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    applied_at      TIMESTAMP    NOT NULL,
    author          VARCHAR(100),
    description     TEXT,
    business_reason TEXT,
    sql_up          TEXT,             -- the actual migration SQL (forward)
    sql_down        TEXT,             -- rollback SQL (NULL if not rollback-safe)
    breaking_change BOOLEAN          DEFAULT FALSE,
    rollback_safe   BOOLEAN          DEFAULT TRUE,
    tables_affected JSONB,            -- {"created": [...], "altered": [...], "dropped": [...]}
    applied_by      VARCHAR(100),     -- which system/service account ran it
    checksum        VARCHAR(64)       -- SHA256(sql_up) — detects post-hoc tampering
);

-- =============================================================================
-- Seed: 6 milestone migrations matching the project timeline
-- =============================================================================
INSERT INTO schema_migrations
    (version, name, applied_at, author, description, business_reason, sql_up, sql_down,
     breaking_change, rollback_safe, tables_affected, applied_by, checksum)
VALUES

('001', 'initial_star_schema',
 '2024-09-01 10:00:00', 'data-team',
 'Initial star schema: fact_admissions + 4 dimensions',
 NULL,
 E'CREATE TABLE dim_patient (...);\nCREATE TABLE dim_diagnosis (...);\nCREATE TABLE dim_provider (...);\nCREATE TABLE dim_date (...);\nCREATE TABLE fact_admissions (...);',
 E'DROP TABLE fact_admissions;\nDROP TABLE dim_patient;\nDROP TABLE dim_diagnosis;\nDROP TABLE dim_provider;\nDROP TABLE dim_date;',
 FALSE, TRUE,
 '{"created": ["fact_admissions", "dim_patient", "dim_diagnosis", "dim_provider", "dim_date"]}'::jsonb,
 'alembic-runner', 'a1b2c3d4e5f6'),

('002', 'add_fact_vitals',
 '2024-09-08 14:30:00', 'data-team',
 'Add time-series vitals table for anomaly detection pipeline',
 'Anomaly detection model requires HR, BP, SpO2, Temp as a continuous time series. Adding fact_vitals enables sub-daily granularity not possible with admission-level data.',
 E'CREATE TABLE fact_vitals (\n  vital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  patient_key INT NOT NULL REFERENCES dim_patient(patient_key),\n  admission_key INT REFERENCES fact_admissions(admission_id),\n  recorded_at TIMESTAMP NOT NULL,\n  heart_rate_bpm NUMERIC,\n  bp_systolic INT,\n  bp_diastolic INT,\n  spo2_pct NUMERIC,\n  temp_fahrenheit NUMERIC\n);\nCREATE INDEX idx_vitals_patient ON fact_vitals(patient_key, recorded_at DESC);',
 E'DROP TABLE fact_vitals;',
 FALSE, TRUE,
 '{"created": ["fact_vitals"]}'::jsonb,
 'alembic-runner', 'b2c3d4e5f6a7'),

('003', 'add_ml_predictions',
 '2024-10-02 09:00:00', 'ml-team',
 'Add predictions table to store ML model outputs and SHAP feature importance values',
 'XGBoost v1.0 model requires a persistent store for predictions + SHAP values. Downstream: care plan recommendations are generated from this table.',
 E'CREATE TABLE fact_predictions (\n  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  patient_key INT NOT NULL,\n  admission_key INT,\n  model_version VARCHAR(20) NOT NULL,\n  predicted_at TIMESTAMP NOT NULL,\n  risk_score NUMERIC(5,4) NOT NULL,\n  risk_tier VARCHAR(20),\n  shap_values JSONB,\n  cohort_label VARCHAR(50)\n);\nCREATE INDEX idx_pred_patient ON fact_predictions(patient_key, predicted_at DESC);',
 E'DROP TABLE fact_predictions;',
 FALSE, TRUE,
 '{"created": ["fact_predictions"]}'::jsonb,
 'alembic-runner', 'c3d4e5f6a7b8'),

('004', 'add_charlson_index',
 '2024-10-15 11:00:00', 'data-team',
 'Add Charlson Comorbidity Index to dim_patient — required for ML feature set v2',
 'CCI is the #2 most predictive feature per SHAP analysis (SHAP value: 0.18 avg). Adding it to the warehouse enables it as an ML training input. Backward compatible: NULL for historical patients, populated going forward.',
 E'ALTER TABLE dim_patient\n  ADD COLUMN charlson_comorbidity_index NUMERIC(5,2);\n\nCOMMENT ON COLUMN dim_patient.charlson_comorbidity_index IS\n  ''Charlson Comorbidity Index — predicts 10-year survival based on comorbidities. NULL for patients admitted before 2024-10-15.'';',
 E'ALTER TABLE dim_patient DROP COLUMN charlson_comorbidity_index;',
 FALSE, TRUE,
 '{"altered": [{"table": "dim_patient", "columns_added": ["charlson_comorbidity_index"]}]}'::jsonb,
 'alembic-runner', 'd4e5f6a7b8c9'),

('005', 'add_care_path_rules',
 '2024-10-20 16:00:00', 'ml-team',
 'Add association rules table for care-path recommendation engine',
 'The recommendation engine (Apriori algorithm) requires persisted rules with confidence/lift scores for real-time lookup. rules are re-mined monthly from fact_admissions.',
 E'CREATE TABLE care_path_rules (\n  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  antecedent JSONB NOT NULL,\n  consequent JSONB NOT NULL,\n  support NUMERIC(6,4),\n  confidence NUMERIC(6,4),\n  lift NUMERIC(8,4),\n  cohort_label VARCHAR(50),\n  mined_at TIMESTAMP NOT NULL\n);',
 E'DROP TABLE care_path_rules;',
 FALSE, TRUE,
 '{"created": ["care_path_rules"]}'::jsonb,
 'alembic-runner', 'e5f6a7b8c9d0'),

('006', 'add_audit_infrastructure',
 '2025-01-10 09:00:00', 'platform-team',
 'Add HIPAA-compliant audit log (append-only), pipeline_runs, and dq_check_results tables',
 'HIPAA Security Rule §164.312(b) requires audit controls for all PHI access. audit_log is append-only — no UPDATE or DELETE ever touches it. Not rollback-safe: you cannot un-create a HIPAA audit trail.',
 E'CREATE TABLE audit_log (\n  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  event_at TIMESTAMP NOT NULL DEFAULT NOW(),\n  event_type VARCHAR(50) NOT NULL,\n  actor_user_id VARCHAR(100),\n  actor_role VARCHAR(50),\n  patient_id VARCHAR(50),\n  resource_type VARCHAR(50),\n  resource_id VARCHAR(100),\n  action VARCHAR(50) NOT NULL,\n  ip_address VARCHAR(45),\n  user_agent VARCHAR(300),\n  request_id VARCHAR(100),\n  metadata JSONB DEFAULT ''{}''::JSONB\n);\n-- APPEND-ONLY: no UPDATE or DELETE\nCREATE TABLE pipeline_runs (...);\nCREATE TABLE dq_check_results (...);',
 NULL,
 FALSE, FALSE,
 '{"created": ["audit_log", "pipeline_runs", "dq_check_results"]}'::jsonb,
 'platform-deploy', 'f6a7b8c9d0e1')

ON CONFLICT DO NOTHING;
