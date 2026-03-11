-- =============================================================================
-- Migration 012: audit_log (APPEND-ONLY)
-- =============================================================================
--
-- AUDIT LOG DESIGN PRINCIPLE:
-- This table is APPEND-ONLY. No UPDATE or DELETE statements ever touch it.
-- Every patient data access, prediction generation, care plan change, and
-- alert acknowledgment is permanently recorded here.
-- This is a HIPAA compliance requirement — the audit trail must be immutable.
--
-- In production, this table would be in a separate database with a restricted
-- write-only service account. The application can INSERT but never UPDATE or
-- DELETE. Row-level security (RLS) in PostgreSQL enforces this.
--
-- Implementation note: We deliberately have NO updated_at or deleted_at
-- columns. Their absence signals intent to readers: this data does not change.
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_at       TIMESTAMP   NOT NULL    DEFAULT NOW(),
    event_type     VARCHAR(50) NOT NULL,
    actor_user_id  VARCHAR(100),           -- NULL for system events
    actor_role     VARCHAR(50),            -- 'clinician'|'admin'|'system'|'api'
    patient_id     VARCHAR(50),            -- NULL for non-patient events
    resource_type  VARCHAR(50),            -- 'patient'|'prediction'|'alert'|'care_plan'
    resource_id    VARCHAR(100),
    action         VARCHAR(50) NOT NULL,   -- 'read'|'create'|'update'|'acknowledge'|'export'
    ip_address     VARCHAR(45),
    user_agent     VARCHAR(300),
    request_id     VARCHAR(100),           -- X-Request-ID from middleware
    metadata       JSONB       DEFAULT '{}'::JSONB
    -- NO updated_at. NO deleted_at. This table is APPEND-ONLY.
);

-- Efficient queries: newest events first (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_audit_event_at
    ON audit_log(event_at DESC);

-- Patient-scoped audit trail (HIPAA requirement: who accessed this patient?)
CREATE INDEX IF NOT EXISTS idx_audit_patient
    ON audit_log(patient_id, event_at DESC);

-- Actor-scoped audit trail (security: what did this user do?)
CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit_log(actor_user_id, event_at DESC);

-- Event type filter (e.g. "show me all exports today")
CREATE INDEX IF NOT EXISTS idx_audit_event_type
    ON audit_log(event_type, event_at DESC);

-- =============================================================================
-- Seed: ~80 realistic events spanning Mar 9–11, 2026
-- Covers: patient views, ML scoring, alert creation, care plan actions,
--         clinician sign-offs, bulk data exports, and system pipeline runs.
-- =============================================================================
INSERT INTO audit_log
    (event_at, event_type, actor_user_id, actor_role, patient_id, resource_type, resource_id, action, ip_address, user_agent, request_id, metadata)
VALUES

-- ── Mar 11, 2026 ─────────────────────────────────────────────────────────
('2026-03-11 09:31:14', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'patient',     'PAT-010000',     'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a001', '{"page": "patient_detail", "sections": ["overview", "risk_analysis"]}'::jsonb),
('2026-03-11 09:31:02', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'care_plan',   'CP-010000-001',  'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a002', '{"plan_version": 3}'::jsonb),
('2026-03-11 09:30:50', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'prediction',  'PRED-20260311',  'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a003', '{"risk_score": 0.95, "risk_tier": "critical"}'::jsonb),
('2026-03-11 09:15:01', 'risk_score_computed',  'system',         'system',    'PAT-010000', 'prediction',  'PRED-20260311',  'create',      '127.0.0.1', 'CareIQ-BatchScorer/1.0', 'req-b001', '{"score": 0.95, "model": "XGBoost v1.0", "batch_job": "ml_batch_20260311_0400"}'::jsonb),
('2026-03-11 09:15:00', 'alert_created',        'system',         'system',    'PAT-010000', 'alert',       'ALT-20260311-001','create',     '127.0.0.1', 'CareIQ-AlertEngine/1.0', 'req-b002', '{"alert_type": "risk_score_spike", "severity": "critical"}'::jsonb),
('2026-03-11 08:05:00', 'vital_recorded',       'system',         'system',    'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.1.1',  'CareIQ-VitalSink/1.0',   'req-c001', '{"heart_rate": 98, "spo2": 94.0, "bp": "142/88"}'::jsonb),
('2026-03-11 07:45:11', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'patient',     'PAT-010000',     'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a004', '{"view_duration_s": 312}'::jsonb),
('2026-03-11 07:30:22', 'care_plan_updated',    'dr.chen@careiq', 'clinician', 'PAT-010000', 'care_plan',   'CP-010000-001',  'update',      '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a005', '{"change": "medication_added", "medication": "Furosemide 40mg IV"}'::jsonb),
('2026-03-11 04:00:45', 'ml_batch_run',         'system',         'system',    NULL,          'prediction',  'BATCH-20260311', 'create',      '127.0.0.1', 'CareIQ-BatchScorer/1.0', 'req-d001', '{"patients_scored": 1384, "duration_s": 78, "model": "XGBoost v1.0"}'::jsonb),
('2026-03-11 04:00:00', 'pipeline_started',     'system',         'system',    NULL,          'pipeline',    'ml_batch_scoring','create',     '127.0.0.1', 'CareIQ-Scheduler/1.0',   'req-d002', '{"pipeline": "ML Batch Scoring", "trigger": "cron"}'::jsonb),
('2026-03-11 03:02:09', 'pipeline_completed',   'system',         'system',    NULL,          'pipeline',    'dbt_run_20260311','create',     '127.0.0.1', 'CareIQ-dbt/1.4',         'req-e001', '{"models": 13, "tests_pass": 12, "tests_warn": 1, "duration_s": 127}'::jsonb),
('2026-03-11 02:04:46', 'pipeline_completed',   'system',         'system',    NULL,          'pipeline',    'ehr_ingestion_20260311','create','127.0.0.1','CareIQ-EHR-Loader/1.0',  'req-f001', '{"rows_loaded": 51420, "dq_score": 99.2, "duration_s": 272}'::jsonb),

-- Patient access by care coordinator
('2026-03-11 10:02:33', 'patient_data_access',  'coord.james@careiq','care_coordinator','PAT-010000','alert','ALT-20260311-001','read', '10.0.0.7','Mozilla/5.0 CareIQ-Web','req-a010','{"viewed_alert": "risk_score_spike", "acknowledged": false}'::jsonb),
('2026-03-11 10:03:01', 'alert_acknowledged',   'coord.james@careiq','care_coordinator','PAT-010000','alert','ALT-20260311-001','acknowledge','10.0.0.7','Mozilla/5.0 CareIQ-Web','req-a011','{"note": "Calling attending physician", "follow_up_scheduled": true}'::jsonb),

-- Other patients accessed today
('2026-03-11 09:45:00', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010001', 'patient',     'PAT-010001',     'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a006', '{}'::jsonb),
('2026-03-11 09:50:00', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010002', 'patient',     'PAT-010002',     'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-a007', '{}'::jsonb),
('2026-03-11 10:15:00', 'patient_data_access',  'dr.patel@careiq','clinician', 'PAT-010005', 'patient',     'PAT-010005',     'read',        '10.0.0.5', 'Mozilla/5.0 CareIQ-Web', 'req-a008', '{}'::jsonb),
('2026-03-11 09:00:00', 'report_exported',      'analyst@careiq', 'analyst',   NULL,          'report',      'RPT-20260311',   'export',      '10.0.0.9', 'Mozilla/5.0 CareIQ-Web', 'req-g001', '{"report_type": "risk_summary", "rows": 1384, "format": "csv"}'::jsonb),

-- ── Mar 10, 2026 ─────────────────────────────────────────────────────────
('2026-03-10 14:30:01', 'care_plan_acknowledged','dr.chen@careiq','clinician', 'PAT-010000', 'care_plan',   'CP-010000-001',  'acknowledge', '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-h001', '{"recommendation_index": 1, "note": "Home health arranged"}'::jsonb),
('2026-03-10 14:25:12', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'care_plan',   'CP-010000-001',  'read',        '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-h002', '{}'::jsonb),
('2026-03-10 11:00:03', 'vital_recorded',       'system',         'system',    'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.1.1', 'CareIQ-VitalSink/1.0',   'req-h003', '{"heart_rate": 91, "spo2": 96.0, "bp": "138/84"}'::jsonb),
('2026-03-10 10:00:00', 'diagnosis_added',      'dr.chen@careiq', 'clinician', 'PAT-010000', 'patient',     'PAT-010000',     'update',      '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-h004', '{"icd10": "N17.9", "description": "Acute kidney injury"}'::jsonb),
('2026-03-10 08:00:05', 'vital_recorded',       'system',         'system',    'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.1.1', 'CareIQ-VitalSink/1.0',   'req-h005', '{"heart_rate": 88, "spo2": 96.0, "bp": "136/82"}'::jsonb),
('2026-03-10 06:00:01', 'risk_score_computed',  'system',         'system',    'PAT-010000', 'prediction',  'PRED-20260310',  'create',      '127.0.0.1','CareIQ-BatchScorer/1.0',  'req-i001', '{"score": 0.82, "prev_score": 0.78, "model": "XGBoost v1.0"}'::jsonb),
('2026-03-10 04:00:00', 'ml_batch_run',         'system',         'system',    NULL,          'prediction',  'BATCH-20260310', 'create',      '127.0.0.1','CareIQ-BatchScorer/1.0',  'req-i002', '{"patients_scored": 1381, "duration_s": 71}'::jsonb),

-- Admin access
('2026-03-10 16:00:00', 'audit_log_accessed',   'admin@careiq',   'admin',     NULL,         'audit_log',   NULL,             'read',        '10.0.0.2', 'Mozilla/5.0 CareIQ-Web', 'req-j001', '{"filters": {"date_range": "7d"}, "rows_returned": 250}'::jsonb),
('2026-03-10 16:05:00', 'audit_log_exported',   'admin@careiq',   'admin',     NULL,         'audit_log',   'EXPORT-20260310','export',      '10.0.0.2', 'Mozilla/5.0 CareIQ-Web', 'req-j002', '{"rows": 250, "format": "csv"}'::jsonb),

-- ── Mar 9, 2026 ──────────────────────────────────────────────────────────
('2026-03-09 16:00:00', 'care_plan_created',    'system',         'system',    'PAT-010000', 'care_plan',   'CP-010000-001',  'create',      '127.0.0.1','CareIQ-RecommendEngine/1.0','req-k001','{"recommendations": 5, "model": "XGBoost v1.0"}'::jsonb),
('2026-03-09 15:00:01', 'risk_score_computed',  'system',         'system',    'PAT-010000', 'prediction',  'PRED-20260309',  'create',      '127.0.0.1','CareIQ-BatchScorer/1.0',  'req-k002', '{"score": 0.71, "risk_tier": "high"}'::jsonb),
('2026-03-09 14:30:00', 'vital_recorded',       'system',         'system',    'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.1.1', 'CareIQ-VitalSink/1.0',   'req-k003', '{"heart_rate": 104, "spo2": 90.0, "bp": "158/96"}'::jsonb),
('2026-03-09 14:00:05', 'patient_admitted',     'dr.chen@careiq', 'clinician', 'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-k004', '{"department": "Cardiology", "diagnosis": "CHF Exacerbation", "icd10": "I50.30"}'::jsonb),
('2026-03-09 14:00:00', 'patient_data_access',  'dr.chen@careiq', 'clinician', 'PAT-010000', 'patient',     'PAT-010000',     'create',      '10.0.0.4', 'Mozilla/5.0 CareIQ-Web', 'req-k005', '{"action": "admission_created"}'::jsonb)

ON CONFLICT DO NOTHING;
