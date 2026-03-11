-- =============================================================================
-- Migration 011: patient_timeline_events
-- =============================================================================
-- Stores every meaningful event in a patient's clinical journey.
-- Used by the Timeline tab on the PatientDetail page.
-- Each event has a type, timestamp, human-readable title/subtitle,
-- and an open-ended detail_json JSONB field for richer metadata.
--
-- This is an INSERT-heavy, query-by-patient_id table.
-- In production it would be partitioned by patient_id + event_at.
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_timeline_events (
    event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id     VARCHAR(50)  NOT NULL,
    admission_id   VARCHAR(50),
    event_type     VARCHAR(50)  NOT NULL,
    event_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    title          VARCHAR(200) NOT NULL,
    subtitle       VARCHAR(500),
    actor          VARCHAR(100),           -- 'system' | clinician name
    actor_role     VARCHAR(50),            -- 'system' | 'clinician' | 'care_coordinator'
    detail_json    JSONB        DEFAULT '{}'::JSONB,
    created_at     TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_patient_at
    ON patient_timeline_events(patient_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_admission
    ON patient_timeline_events(admission_id, event_at DESC);

-- =============================================================================
-- Seed: demo patient PAT-010000, 3 days of events (Mar 9–11, 2026)
-- =============================================================================
INSERT INTO patient_timeline_events
    (patient_id, admission_id, event_type, event_at, title, subtitle, actor, actor_role, detail_json)
VALUES

-- ── MARCH 11 (TODAY) ──────────────────────────────────────────────────────
('PAT-010000', 'ADM-010000-001', 'risk_score_spike',
 '2026-03-11 09:15:00', 'Risk Score Spike Detected',
 'Score jumped 82% → 95% (↑13%)',
 'system', 'system',
 '{"prev_score": 0.82, "new_score": 0.95, "delta": 0.13, "model": "XGBoost v1.0", "trigger": "nightly_batch_scoring"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'risk_score_updated',
 '2026-03-11 09:15:00', 'Risk Score Updated',
 'Score: 82% → 95% · Model: XGBoost v1.0',
 'system', 'system',
 '{"prev_score": 0.82, "new_score": 0.95, "model_version": "v1.0", "job": "ml_batch_scoring_20260311"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'alert_triggered',
 '2026-03-11 09:15:00', 'Alert Triggered',
 '"Risk Score Spike" — sent to Care Coordinator queue',
 'system', 'system',
 '{"alert_type": "risk_score_spike", "severity": "critical", "sent_to": "care_coordinator_queue"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'vital_anomaly',
 '2026-03-11 08:00:00', 'Vital Anomaly Detected',
 'SpO2 94% — below threshold (< 95%)',
 'system', 'system',
 '{"vitals": {"heart_rate": 98, "bp_systolic": 142, "bp_diastolic": 88, "spo2": 94.0, "temp_f": 98.7}, "anomaly_field": "spo2", "threshold": 95}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'vital_recorded',
 '2026-03-11 08:00:00', 'Vitals Recorded',
 'HR 98 bpm · BP 142/88 · SpO₂ 94% · Temp 98.7°F',
 'system', 'system',
 '{"heart_rate": 98, "bp_systolic": 142, "bp_diastolic": 88, "spo2": 94.0, "temp_f": 98.7, "recorded_by": "bedside_monitor"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'clinician_viewed',
 '2026-03-11 07:45:00', 'Patient Record Viewed',
 'Dr. Sarah Chen reviewed the full patient profile',
 'Dr. Sarah Chen', 'clinician',
 '{"view_duration_seconds": 312, "sections_viewed": ["overview", "risk_analysis", "care_plan"]}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'medication_changed',
 '2026-03-11 07:30:00', 'Medication Order Updated',
 'Furosemide 40mg IV — added by Dr. Sarah Chen',
 'Dr. Sarah Chen', 'clinician',
 '{"medication": "Furosemide", "dose": "40mg", "route": "IV", "frequency": "BID", "reason": "fluid_overload_management"}'::jsonb),

-- ── MARCH 10 (YESTERDAY) ──────────────────────────────────────────────────
('PAT-010000', 'ADM-010000-001', 'recommendation_acknowledged',
 '2026-03-10 14:30:00', 'Care Plan Action Completed',
 'Recommendation #1 marked complete — home health arranged',
 'Dr. Sarah Chen', 'clinician',
 '{"recommendation_index": 1, "recommendation": "Arrange home health follow-up", "note": "Home health arranged for expected discharge date of Mar 14", "acknowledged_by": "Dr. Sarah Chen"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'clinician_viewed',
 '2026-03-10 14:25:00', 'Patient Record Viewed',
 'Dr. Sarah Chen reviewed care plan',
 'Dr. Sarah Chen', 'clinician',
 '{"view_duration_seconds": 180, "sections_viewed": ["care_plan"]}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'vital_recorded',
 '2026-03-10 11:00:00', 'Vitals Recorded',
 'HR 91 bpm · BP 138/84 · SpO₂ 96% · Temp 99.1°F',
 'system', 'system',
 '{"heart_rate": 91, "bp_systolic": 138, "bp_diastolic": 84, "spo2": 96.0, "temp_f": 99.1, "recorded_by": "bedside_monitor"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'risk_score_updated',
 '2026-03-10 06:00:00', 'Risk Score Updated',
 'Score: 78% → 82% (↑4%) · Model: XGBoost v1.0',
 'system', 'system',
 '{"prev_score": 0.78, "new_score": 0.82, "model_version": "v1.0", "job": "ml_batch_scoring_20260310"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'vital_recorded',
 '2026-03-10 08:00:00', 'Vitals Recorded',
 'HR 88 bpm · BP 136/82 · SpO₂ 96% · Temp 99.3°F',
 'system', 'system',
 '{"heart_rate": 88, "bp_systolic": 136, "bp_diastolic": 82, "spo2": 96.0, "temp_f": 99.3, "recorded_by": "bedside_monitor"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'diagnosis_added',
 '2026-03-10 10:00:00', 'Secondary Diagnosis Added',
 'Acute kidney injury (N17.9) — moderate severity',
 'Dr. Sarah Chen', 'clinician',
 '{"icd10": "N17.9", "description": "Acute kidney injury, unspecified", "severity": "moderate", "creatinine": 1.8}'::jsonb),

-- ── MARCH 9 (ADMISSION DAY) ────────────────────────────────────────────────
('PAT-010000', 'ADM-010000-001', 'care_plan_created',
 '2026-03-09 16:00:00', 'Care Plan Generated',
 '5 evidence-based recommendations created by CareIQ AI',
 'system', 'system',
 '{"recommendation_count": 5, "model": "XGBoost v1.0", "cohort": "CHF + AKI — High Risk", "generation_ms": 342}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'risk_score_updated',
 '2026-03-09 15:00:00', 'Initial Risk Score Computed',
 'Score: 71% · Risk tier: HIGH · Cohort: CHF + AKI',
 'system', 'system',
 '{"score": 0.71, "risk_tier": "high", "cohort": "T4_CHF_AKI_High", "model_version": "v1.0"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'vital_recorded',
 '2026-03-09 14:30:00', 'Admission Vitals Recorded',
 'HR 104 bpm · BP 158/96 · SpO₂ 90% · Temp 99.8°F',
 'system', 'system',
 '{"heart_rate": 104, "bp_systolic": 158, "bp_diastolic": 96, "spo2": 90.0, "temp_f": 99.8, "recorded_by": "admissions_nursing"}'::jsonb),

('PAT-010000', 'ADM-010000-001', 'admission',
 '2026-03-09 14:00:00', 'Patient Admitted',
 'Cardiology · CHF Exacerbation · Provider: Dr. Sarah Chen',
 'Dr. Sarah Chen', 'clinician',
 '{"department": "Cardiology", "admission_type": "Emergency", "primary_diagnosis": "CHF Exacerbation", "icd10": "I50.30", "assigned_provider": "Dr. Sarah Chen", "initial_risk_estimate": 0.71}'::jsonb)

ON CONFLICT DO NOTHING;
