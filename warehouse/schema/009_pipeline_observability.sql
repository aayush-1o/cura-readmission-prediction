-- ============================================================================
-- Migration 009: Pipeline Observability Tables
-- ============================================================================
-- Creates audit tables for pipeline run history and DQ check results.
-- These power the /data-platform API endpoints and the Data Platform UI page.
--
-- Run order: after star_schema.sql and create_tables.sql
-- ============================================================================

-- ─── pipeline_runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_name   VARCHAR(100) NOT NULL,
    started_at      TIMESTAMP    NOT NULL,
    ended_at        TIMESTAMP,
    status          VARCHAR(20)  NOT NULL CHECK (status IN ('success', 'running', 'failed', 'warning')),
    rows_in         INTEGER,
    rows_out        INTEGER,
    duration_seconds INTEGER,
    log_output      TEXT,
    error_message   TEXT,
    triggered_by    VARCHAR(50) DEFAULT 'scheduler'
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_name_started
    ON pipeline_runs (pipeline_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started
    ON pipeline_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status
    ON pipeline_runs (status);


-- ─── dq_check_results ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dq_check_results (
    check_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name          VARCHAR(100)  NOT NULL,
    table_name          VARCHAR(100)  NOT NULL,
    checked_at          TIMESTAMP     NOT NULL,
    status              VARCHAR(20)   NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
    actual_value        NUMERIC,
    threshold_value     NUMERIC,
    threshold_operator  VARCHAR(10),   -- lt | gt | eq | between | lte | gte
    details             JSONB
);

CREATE INDEX IF NOT EXISTS idx_dq_check_results_name_table
    ON dq_check_results (check_name, table_name, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_dq_check_results_status
    ON dq_check_results (status);


-- ============================================================================
-- Seed Data: 30 days of realistic pipeline run history
-- ============================================================================

-- Helper: generate runs for each pipeline across 30 days
-- Pipelines:
--   EHR Ingestion       → daily at 02:00
--   dbt Transformations → daily at 03:00
--   ML Batch Scoring    → daily at 04:00
--   Data Quality Monitor→ daily at 05:00  (one failure on most recent day)
--   Model Drift Monitor → weekly on Mondays at 06:00
--   Association Rule Mining → weekly on Sundays at 01:00

DO $$
DECLARE
    d DATE;
    run_status VARCHAR(20);
    dur INTEGER;
    rows_in INTEGER;
    rows_out INTEGER;
    log_text TEXT;
BEGIN

FOR i IN 1..30 LOOP
    d := CURRENT_DATE - i;

    -- ─── EHR Ingestion (daily 02:00) ────────────────────────────────────────
    -- Slight variance in rows; occasional warning
    rows_in  := 50000 + (random() * 3000)::int;
    rows_out := rows_in - (random() * 200)::int;
    dur      := 240 + (random() * 80)::int;  -- ~4 min
    IF i = 1 THEN
        run_status := 'warning';
        log_text := format(
            '[02:00:14] INFO  Starting EHR Ingestion pipeline%s'
            '[02:00:16] INFO  Source files validated (%s rows)%s'
            '[02:01:45] INFO  Staging complete%s'
            '[02:01:58] WARN  DQ check admission_cost_range: 23 rows outside p99%s'
            '[02:02:01] INFO  DQ checks: 12 passed, 0 failed, 1 warned%s'
            '[02:04:46] INFO  Pipeline finished. Duration: %sm',
            E'\n', rows_in, E'\n', E'\n', E'\n', E'\n', (dur/60)
        );
    ELSE
        run_status := 'success';
        log_text := format(
            '[02:00:14] INFO  Starting EHR Ingestion pipeline%s'
            '[02:00:16] INFO  Source files validated (%s rows)%s'
            '[02:01:45] INFO  Staging complete%s'
            '[02:02:01] INFO  DQ checks: 12 passed, 0 failed, 0 warned%s'
            '[02:04:46] INFO  Pipeline finished. Duration: %ss',
            E'\n', rows_in, E'\n', E'\n', E'\n', dur
        );
    END IF;

    INSERT INTO pipeline_runs
        (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
    VALUES (
        'EHR Ingestion',
        (d + INTERVAL '2 hours'),
        (d + INTERVAL '2 hours' + make_interval(secs => dur)),
        run_status, rows_in, rows_out, dur, log_text, 'scheduler'
    );

    -- ─── dbt Transformations (daily 03:00) ──────────────────────────────────
    rows_in  := rows_out;
    rows_out := rows_in - (random() * 800)::int;
    dur      := 115 + (random() * 60)::int;
    IF i = 1 THEN
        run_status := 'warning';
    ELSE
        run_status := 'success';
    END IF;

    INSERT INTO pipeline_runs
        (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
    VALUES (
        'dbt Transformations',
        (d + INTERVAL '3 hours'),
        (d + INTERVAL '3 hours' + make_interval(secs => dur)),
        run_status, rows_in, rows_out, dur,
        format('[03:00:02] INFO  Starting dbt run (13 models)%s[03:02:07] INFO  %s finished. Duration: %ss',
            E'\n', CASE WHEN run_status = 'warning' THEN '12 of 13 models OK. 1 test warning.' ELSE 'All 13 models OK.' END, dur),
        'scheduler'
    );

    -- ─── ML Batch Scoring (daily 04:00) ─────────────────────────────────────
    rows_in  := 1300 + (random() * 200)::int;
    rows_out := rows_in;
    dur      := 70 + (random() * 30)::int;

    INSERT INTO pipeline_runs
        (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
    VALUES (
        'ML Batch Scoring',
        (d + INTERVAL '4 hours'),
        (d + INTERVAL '4 hours' + make_interval(secs => dur)),
        'success', rows_in, rows_out, dur,
        format('[04:00:01] INFO  Starting ML Batch Scoring%s[04:01:18] INFO  %s patients scored. Duration: %ss',
            E'\n', rows_in, dur),
        'scheduler'
    );

    -- ─── Data Quality Monitor (daily 05:00) ─────────────────────────────────
    -- Most recent run (i=1) failed; all others success
    IF i = 1 THEN
        run_status := 'failed';
        dur := 0;
        INSERT INTO pipeline_runs
            (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, error_message, triggered_by)
        VALUES (
            'Data Quality Monitor',
            (d + INTERVAL '5 hours'),
            (d + INTERVAL '5 hours' + make_interval(secs => dur)),
            run_status, 0, 0, dur,
            '[05:00:01] INFO  Starting Data Quality Monitor' || E'\n' ||
            '[05:00:01] ERROR Could not connect to warehouse: Connection refused' || E'\n' ||
            '[05:00:16] FATAL Pipeline aborted after 3 failed connection attempts.',
            'Connection refused (host=postgres, port=5432)',
            'scheduler'
        );
    ELSE
        dur := 18 + (random() * 10)::int;
        INSERT INTO pipeline_runs
            (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
        VALUES (
            'Data Quality Monitor',
            (d + INTERVAL '5 hours'),
            (d + INTERVAL '5 hours' + make_interval(secs => dur)),
            'success', 50000, 50000, dur,
            format('[05:00:01] INFO  Starting DQ Monitor%s[05:00:22] INFO  7 checks passed. Duration: %ss', E'\n', dur),
            'scheduler'
        );
    END IF;

    -- ─── Model Drift Monitor (weekly Mondays at 06:00) ──────────────────────
    IF EXTRACT(DOW FROM d) = 1 THEN  -- 1 = Monday
        dur := 40 + (random() * 15)::int;
        INSERT INTO pipeline_runs
            (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
        VALUES (
            'Model Drift Monitor',
            (d + INTERVAL '6 hours'),
            (d + INTERVAL '6 hours' + make_interval(secs => dur)),
            'success', 7000 + (random() * 500)::int, 7000, dur,
            '[06:00:01] INFO  Starting Model Drift Monitor' || E'\n' ||
            '[06:00:28] INFO  PSI=0.04 (OK). AUC=0.84 (stable).' || E'\n' ||
            format('[06:00:%s] INFO  No drift detected. Duration: %ss', lpad(dur::text, 2, '0'), dur),
            'scheduler'
        );
    END IF;

    -- ─── Association Rule Mining (weekly Sundays at 01:00) ──────────────────
    IF EXTRACT(DOW FROM d) = 0 THEN  -- 0 = Sunday
        dur := 500 + (random() * 100)::int;
        INSERT INTO pipeline_runs
            (pipeline_name, started_at, ended_at, status, rows_in, rows_out, duration_seconds, log_output, triggered_by)
        VALUES (
            'Association Rule Mining',
            (d + INTERVAL '1 hour'),
            (d + INTERVAL '1 hour' + make_interval(secs => dur)),
            'success', 12000 + (random() * 800)::int, 12000, dur,
            '[01:00:01] INFO  Starting Apriori mining' || E'\n' ||
            '[01:08:00] INFO  847 frequent itemsets, 212 rules generated.' || E'\n' ||
            format('[01:08:%s] INFO  Pipeline finished. Duration: %ss', lpad((dur % 60)::text, 2, '0'), dur),
            'scheduler'
        );
    END IF;

END LOOP;
END $$;


-- ─── Seed DQ check results (snapshot of most recent run) ─────────────────────

INSERT INTO dq_check_results (check_name, table_name, checked_at, status, actual_value, threshold_value, threshold_operator, details)
VALUES
    ('null_rate_patient_id',  'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 0.000, 0.001, 'lt', '{"rows_checked": 51420, "nulls_found": 0}'::jsonb),
    ('null_rate_admit_date',  'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 0.000, 0.001, 'lt', '{"rows_checked": 51420, "nulls_found": 0}'::jsonb),
    ('readmit_rate_range',    'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 14.7,  NULL,   'between', '{"lower": 10, "upper": 20, "actual_pct": 14.7}'::jsonb),
    ('row_count_delta',       'fact_admissions', NOW() - INTERVAL '2 hours', 'warn', 2.8,   2.0,   'lt', '{"prev_count": 50000, "curr_count": 51420, "delta_pct": 2.8}'::jsonb),
    ('cost_distribution_psi', 'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 0.08,  0.20,  'lt', '{"reference_period": "2026-02", "psi": 0.08}'::jsonb),
    ('duplicate_admissions',  'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 0.0,   0.0,   'eq', '{"duplicates_found": 0}'::jsonb),
    ('los_outliers_z3',       'fact_admissions', NOW() - INTERVAL '2 hours', 'pass', 12.0,  50.0,  'lt', '{"z_score_threshold": 3, "outlier_rows": 12}'::jsonb)
ON CONFLICT DO NOTHING;
