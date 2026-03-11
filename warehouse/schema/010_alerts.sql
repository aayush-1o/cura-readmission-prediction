-- ============================================================================
-- Migration 010: Alerts Table
-- ============================================================================
-- Creates the `alerts` audit table for real-time alert delivery,
-- acknowledgment workflow, and the SSE stream backend.
--
-- Run order: after 009_pipeline_observability.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
    alert_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type          VARCHAR(50) NOT NULL,
    severity            VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'warning', 'info')),
    title               VARCHAR(200) NOT NULL,
    description         TEXT        NOT NULL,
    metadata            JSONB,
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    acknowledged_at     TIMESTAMP,
    acknowledged_by     VARCHAR(100),
    acknowledged_note   TEXT,
    auto_dismissed      BOOLEAN     NOT NULL DEFAULT FALSE,
    related_patient_id  VARCHAR(50),
    related_pipeline    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_alerts_created
    ON alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_unacked
    ON alerts (acknowledged_at)
    WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_severity
    ON alerts (severity, created_at DESC);


-- ============================================================================
-- Seed Data: 20 realistic alerts over last 7 days
-- ============================================================================

INSERT INTO alerts (alert_type, severity, title, description, metadata, created_at, acknowledged_at, acknowledged_by, acknowledged_note, related_patient_id, related_pipeline)
VALUES

-- ── CRITICAL: New critical admissions (some unacked) ───────────────────────
(
    'new_critical_admission', 'critical',
    'New Critical Admission',
    'PAT-010000 admitted to Cardiology with risk score 95%',
    '{"patient_id": "PAT-010000", "department": "Cardiology", "risk_score": 95, "admission_id": "ADM-9901"}'::jsonb,
    NOW() - INTERVAL '2 minutes', NULL, NULL, NULL,
    'PAT-010000', NULL
),
(
    'new_critical_admission', 'critical',
    'New Critical Admission',
    'PAT-010001 admitted to Cardiology with risk score 91%',
    '{"patient_id": "PAT-010001", "department": "Cardiology", "risk_score": 91, "admission_id": "ADM-9902"}'::jsonb,
    NOW() - INTERVAL '20 minutes', NULL, NULL, NULL,
    'PAT-010001', NULL
),
(
    'new_critical_admission', 'critical',
    'New Critical Admission',
    'PAT-010002 admitted to ICU with risk score 98%',
    '{"patient_id": "PAT-010002", "department": "ICU", "risk_score": 98, "admission_id": "ADM-9903"}'::jsonb,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 45 minutes', 'dr.chen', 'Escalated to attending. Care team assigned.',
    'PAT-010002', NULL
),

-- ── HIGH: Risk score spikes (mixed acked/unacked) ──────────────────────────
(
    'risk_score_spike', 'high',
    'Risk Score Spike',
    'PAT-010007 risk increased from 45% to 77% in last 6h',
    '{"patient_id": "PAT-010007", "old_score": 45, "new_score": 77, "delta": 32}'::jsonb,
    NOW() - INTERVAL '18 minutes', NULL, NULL, NULL,
    'PAT-010007', NULL
),
(
    'risk_score_spike', 'high',
    'Risk Score Spike',
    'PAT-010012 risk increased from 38% to 72% in last 6h',
    '{"patient_id": "PAT-010012", "old_score": 38, "new_score": 72, "delta": 34}'::jsonb,
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '2 hours 30 minutes', 'coordinator.rodriguez', 'Patient reassigned to high-risk bed. Family notified.',
    'PAT-010012', NULL
),
(
    'risk_score_spike', 'high',
    'Risk Score Spike',
    'PAT-010019 risk increased from 52% to 81% in last 6h',
    '{"patient_id": "PAT-010019", "old_score": 52, "new_score": 81, "delta": 29}'::jsonb,
    NOW() - INTERVAL '1 day 2 hours',
    NOW() - INTERVAL '1 day 1 hour', 'dr.patel', 'Medication adjusted. Re-evaluate in 4h.',
    'PAT-010019', NULL
),

-- ── HIGH: Vital sign anomalies ─────────────────────────────────────────────
(
    'vital_anomaly', 'high',
    'Vital Sign Anomaly',
    'PAT-010003: SpO2 = 88% (expected 95–100%)',
    '{"patient_id": "PAT-010003", "vital": "SpO2", "value": "88%", "range": "95-100%", "department": "Nephrology"}'::jsonb,
    NOW() - INTERVAL '42 minutes', NULL, NULL, NULL,
    'PAT-010003', NULL
),
(
    'vital_anomaly', 'high',
    'Vital Sign Anomaly',
    'PAT-010008: Heart rate = 142 bpm (expected 60–100 bpm)',
    '{"patient_id": "PAT-010008", "vital": "Heart rate", "value": "142 bpm", "range": "60-100 bpm", "department": "Cardiology"}'::jsonb,
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours 30 minutes', 'dr.chen', 'Rate-control medication administered.',
    'PAT-010008', NULL
),

-- ── WARNING: Pipeline failures ─────────────────────────────────────────────
(
    'pipeline_failure', 'warning',
    'Pipeline Failed',
    'Data Quality Monitor failed at 05:00. 0 rows processed.',
    '{"pipeline_name": "Data Quality Monitor", "time": "05:00 UTC", "rows_unprocessed": 51420, "error": "Connection refused"}'::jsonb,
    NOW() - INTERVAL '1 hour', NULL, NULL, NULL,
    NULL, 'Data Quality Monitor'
),
(
    'pipeline_failure', 'warning',
    'Pipeline Failed',
    'dbt Transformations ran with 1 test warning at 03:00.',
    '{"pipeline_name": "dbt Transformations", "time": "03:00 UTC", "warning_count": 1, "test": "not_null_fact_admissions_cost"}'::jsonb,
    NOW() - INTERVAL '7 hours',
    NOW() - INTERVAL '6 hours', 'data.eng',  'Known issue: cost nulls in synthetic data. Ticket #DEP-441 open.',
    NULL, 'dbt Transformations'
),

-- ── WARNING: SLA breach ────────────────────────────────────────────────────
(
    'sla_breach', 'warning',
    'Data Freshness SLA Breach',
    'fact_admissions has not been updated in 7h (SLA: 6h)',
    '{"table": "fact_admissions", "hours_since_update": 7, "sla_hours": 6}'::jsonb,
    NOW() - INTERVAL '55 minutes', NULL, NULL, NULL,
    NULL, 'EHR Ingestion'
),

-- ── WARNING: Model drift ───────────────────────────────────────────────────
(
    'model_drift_detected', 'warning',
    'Model Drift Detected',
    'PSI = 0.23 exceeds threshold 0.20. Retraining recommended.',
    '{"psi": 0.23, "threshold": 0.20, "model": "XGBoost v1.0", "reference_date": "2026-02-01"}'::jsonb,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days 20 hours', 'data.eng', 'Scheduled retrain for 2026-03-15 maintenance window.',
    NULL, 'Model Drift Monitor'
),

-- ── ACKNOWLEDGED older alerts ──────────────────────────────────────────────
(
    'new_critical_admission', 'critical',
    'New Critical Admission',
    'PAT-009980 admitted to Cardiology with risk score 88%',
    '{"patient_id": "PAT-009980", "department": "Cardiology", "risk_score": 88}'::jsonb,
    NOW() - INTERVAL '1 day 4 hours',
    NOW() - INTERVAL '1 day 3 hours 45 minutes', 'dr.patel', 'Patient under monitoring. High risk protocol initiated.',
    'PAT-009980', NULL
),
(
    'risk_score_spike', 'high',
    'Risk Score Spike',
    'PAT-009975 risk increased from 41% to 69% in last 6h',
    '{"patient_id": "PAT-009975", "old_score": 41, "new_score": 69}'::jsonb,
    NOW() - INTERVAL '2 days 8 hours',
    NOW() - INTERVAL '2 days 7 hours', 'coordinator.rodriguez', 'Reviewed. Discharge plan updated.',
    'PAT-009975', NULL
),
(
    'vital_anomaly', 'high',
    'Vital Sign Anomaly',
    'PAT-009960: Blood pressure = 185/115 mmHg (expected < 140/90)',
    '{"patient_id": "PAT-009960", "vital": "Blood pressure", "value": "185/115", "range": "< 140/90"}'::jsonb,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days 23 hours', 'dr.chen', 'Anti-hypertensive administered. Patient stabilised.',
    'PAT-009960', NULL
),
(
    'pipeline_failure', 'warning',
    'Pipeline Failed',
    'EHR Ingestion timed out at 02:00. 0 rows processed.',
    '{"pipeline_name": "EHR Ingestion", "error": "Timeout after 300s", "rows_unprocessed": 50000}'::jsonb,
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '3 days 22 hours', 'data.eng', 'Source DB was under maintenance. Re-ran manually at 04:30.',
    NULL, 'EHR Ingestion'
),
(
    'new_critical_admission', 'critical',
    'New Critical Admission',
    'PAT-009940 admitted to ICU with risk score 93%',
    '{"patient_id": "PAT-009940", "department": "ICU", "risk_score": 93}'::jsonb,
    NOW() - INTERVAL '5 days 2 hours',
    NOW() - INTERVAL '5 days 1 hour 50 minutes', 'dr.patel', 'Family notified. End-of-life care plan initiated.',
    'PAT-009940', NULL
),
(
    'sla_breach', 'warning',
    'Data Freshness SLA Breach',
    'mv_risk_score_distribution has not been updated in 8h (SLA: 6h)',
    '{"table": "mv_risk_score_distribution", "hours_since_update": 8, "sla_hours": 6}'::jsonb,
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '5 days 23 hours', 'data.eng', 'Materialized view refresh job restarted.',
    NULL, NULL
),
(
    'risk_score_spike', 'high',
    'Risk Score Spike',
    'PAT-009920 risk increased from 30% to 65% in last 6h',
    '{"patient_id": "PAT-009920", "old_score": 30, "new_score": 65}'::jsonb,
    NOW() - INTERVAL '6 days 10 hours',
    NOW() - INTERVAL '6 days 9 hours', 'coordinator.rodriguez', 'Added to high-risk monitoring list.',
    'PAT-009920', NULL
),
(
    'model_drift_detected', 'warning',
    'Model Drift Detected',
    'PSI = 0.19 approaching threshold 0.20. Monitor closely.',
    '{"psi": 0.19, "threshold": 0.20, "model": "XGBoost v1.0"}'::jsonb,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '6 days 22 hours', 'data.eng', 'Monitoring weekly. Will retrain if PSI exceeds 0.20.',
    NULL, 'Model Drift Monitor'
);
