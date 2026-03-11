-- =============================================================================
-- Migration 014: report_jobs — async report generation queue
-- =============================================================================
-- Design: Every report request gets a job row immediately (status='queued').
-- A background task updates progress 10→30→70→90→100 and writes file_paths
-- when done. The frontend polls GET /reports/jobs/{job_id} every 2s.
--
-- Interview talking point:
-- "The job table acts as the persistent queue — even if the API server restarts
-- mid-generation, the job record shows 'generating' and the next health check
-- can detect stalled jobs. In production you'd add a 'stalled_at' check and
-- re-queue anything stuck at the same progress for >5 minutes."
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_jobs (
    job_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type     VARCHAR(50)  NOT NULL,
    parameters      JSONB        NOT NULL DEFAULT '{}',
    formats         TEXT[]       NOT NULL DEFAULT '{pdf}',
    status          VARCHAR(20)  NOT NULL DEFAULT 'queued',
        -- queued | generating | complete | failed
    progress        INTEGER      NOT NULL DEFAULT 0,  -- 0-100
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    created_by      VARCHAR(100),
    file_paths      JSONB,       -- {"pdf": "/reports/abc.pdf", "csv": "/reports/abc.csv"}
    error_message   TEXT,
    file_size_bytes INTEGER,
    is_scheduled    BOOLEAN      NOT NULL DEFAULT FALSE,
    schedule_cron   VARCHAR(50)  -- e.g. "0 6 * * *" for daily at 6 AM
);

CREATE INDEX IF NOT EXISTS idx_report_jobs_status     ON report_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_created_by ON report_jobs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_scheduled  ON report_jobs(is_scheduled) WHERE is_scheduled = TRUE;

-- =============================================================================
-- Seed: realistic completed reports for the recent reports table
--       + 2 scheduled report configs
-- =============================================================================
INSERT INTO report_jobs
    (job_id, report_type, parameters, formats, status, progress,
     created_at, started_at, completed_at, created_by,
     file_paths, file_size_bytes, is_scheduled, schedule_cron)
VALUES

-- Completed: High-Risk Daily Brief (today)
('a1b2c3d4-0001-0001-0001-000000000001',
 'high_risk_daily',
 '{"department": "All", "risk_threshold": 70, "date": "2026-03-11"}'::jsonb,
 '{pdf,csv}', 'complete', 100,
 '2026-03-11 06:00:00', '2026-03-11 06:00:01', '2026-03-11 06:00:09',
 'system-scheduler',
 '{"pdf": "/reports/high_risk_20260311.pdf", "csv": "/reports/high_risk_20260311.csv"}'::jsonb,
 250880, TRUE, '0 6 * * *'),

-- Completed: Dept Readmission (yesterday)
('a1b2c3d4-0002-0002-0002-000000000002',
 'dept_readmission_monthly',
 '{"department": "All", "date_range": "2026-02"}'::jsonb,
 '{pdf}', 'complete', 100,
 '2026-03-10 18:00:00', '2026-03-10 18:00:01', '2026-03-10 18:00:14',
 'dr.chen@careiq.health',
 '{"pdf": "/reports/readmission_20260310.pdf"}'::jsonb,
 1258291, FALSE, NULL),

-- Completed: Care Plan export
('a1b2c3d4-0003-0003-0003-000000000003',
 'patient_care_plan',
 '{"patient_id": "PAT-010000"}'::jsonb,
 '{pdf}', 'complete', 100,
 '2026-03-11 09:31:00', '2026-03-11 09:31:01', '2026-03-11 09:31:07',
 'dr.chen@careiq.health',
 '{"pdf": "/reports/care_plan_PAT010000_20260311.pdf"}'::jsonb,
 91136, FALSE, NULL),

-- Completed: Model Performance Wk 10
('a1b2c3d4-0004-0004-0004-000000000004',
 'model_performance_weekly',
 '{"model_version": "v1.0", "date_range": "2026-W10"}'::jsonb,
 '{pdf}', 'complete', 100,
 '2026-03-10 07:00:00', '2026-03-10 07:00:01', '2026-03-10 07:00:11',
 'system-scheduler',
 '{"pdf": "/reports/model_perf_w10_2026.pdf"}'::jsonb,
 421888, TRUE, '0 7 * * 1'),

-- Completed: High-Risk Daily Brief (yesterday)
('a1b2c3d4-0005-0005-0005-000000000005',
 'high_risk_daily',
 '{"department": "All", "risk_threshold": 70, "date": "2026-03-10"}'::jsonb,
 '{pdf,csv}', 'complete', 100,
 '2026-03-10 06:00:00', '2026-03-10 06:00:01', '2026-03-10 06:00:08',
 'system-scheduler',
 '{"pdf": "/reports/high_risk_20260310.pdf", "csv": "/reports/high_risk_20260310.csv"}'::jsonb,
 243712, TRUE, '0 6 * * *'),

-- In-progress: Pipeline SLA report (still generating)
('a1b2c3d4-0006-0006-0006-000000000006',
 'pipeline_sla_weekly',
 '{"date_range": "2026-W10"}'::jsonb,
 '{pdf,csv}', 'generating', 45,
 '2026-03-10 07:00:00', '2026-03-10 07:00:01', NULL,
 'system-scheduler',
 NULL, NULL, TRUE, '0 7 * * 1')

ON CONFLICT DO NOTHING;
