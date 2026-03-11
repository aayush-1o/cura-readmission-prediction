import { useState, lazy, Suspense } from 'react';
import {
    CheckCircle2, XCircle, AlertTriangle, Loader2,
    Database, Clock, ChevronDown, ChevronUp,
    Rows3, HardDrive, RefreshCw, ShieldCheck, GitBranch, Table2,
} from 'lucide-react';

// Lazy-load heavy components
const LineageExplorer = lazy(() => import('../components/lineage/LineageExplorer.jsx'));
const SchemaRegistry  = lazy(() => import('../components/schema/SchemaRegistry.jsx'));


/* ─── Static mock data ───────────────────────────────────────────────────── */
const PIPELINES = [
    {
        name: 'EHR Ingestion',
        description: 'CSV → Staging → Star Schema',
        schedule: 'Daily 02:00 UTC',
        lastRun: '2026-03-11 02:00',
        duration: '4m 32s',
        status: 'success',
        rowsProcessed: 51420,
        rowsExpected: 50000,
        dqScore: 99.2,
        nextRun: '2026-03-12 02:00',
    },
    {
        name: 'ML Batch Scoring',
        description: 'Score all active admissions',
        schedule: 'Daily 04:00 UTC',
        lastRun: '2026-03-11 04:00',
        duration: '1m 18s',
        status: 'success',
        rowsProcessed: 1384,
        rowsExpected: 1400,
        dqScore: 98.7,
        nextRun: '2026-03-12 04:00',
    },
    {
        name: 'dbt Transformations',
        description: 'Staging → Marts (13 models)',
        schedule: 'Daily 03:00 UTC',
        lastRun: '2026-03-11 03:00',
        duration: '2m 07s',
        status: 'warning',
        rowsProcessed: 48900,
        rowsExpected: 50000,
        dqScore: 94.1,
        nextRun: '2026-03-12 03:00',
    },
    {
        name: 'Association Rule Mining',
        description: 'Apriori → Care-path rules',
        schedule: 'Weekly Sunday',
        lastRun: '2026-03-09 01:00',
        duration: '8m 45s',
        status: 'success',
        rowsProcessed: 12400,
        rowsExpected: 12000,
        dqScore: 100,
        nextRun: '2026-03-16 01:00',
    },
    {
        name: 'Model Drift Monitor',
        description: 'PSI + AUC weekly check',
        schedule: 'Weekly Monday',
        lastRun: '2026-03-10 06:00',
        duration: '45s',
        status: 'success',
        rowsProcessed: 7200,
        rowsExpected: 7000,
        dqScore: 100,
        nextRun: '2026-03-17 06:00',
    },
    {
        name: 'Data Quality Monitor',
        description: 'Null rates, distributions, Z-scores',
        schedule: 'Daily 05:00 UTC',
        lastRun: '2026-03-11 05:00',
        duration: '0s',
        status: 'failed',
        rowsProcessed: 0,
        rowsExpected: 51420,
        dqScore: 0,
        nextRun: '2026-03-12 05:00',
    },
];

const TIMELINE = [
    {
        date: 'Mar 11, 2026',
        runs: [
            {
                id: 'run-1',
                time: '02:00',
                pipeline: 'EHR Ingestion',
                status: 'success',
                duration: '4m 32s',
                rows: 51420,
                note: null,
                log: `[02:00:14] INFO  Starting EHR Ingestion pipeline
[02:00:15] INFO  Validating source files: patients.csv (10,000 rows ✓)
[02:00:16] INFO  Validating source files: admissions.csv (51,420 rows ✓)
[02:00:18] INFO  Running PII masking... done (0 PII fields found in synthetic data)
[02:00:22] INFO  Loading staging tables...
[02:01:45] INFO  Staging complete: 51,420 rows inserted
[02:01:46] INFO  Running DQ checks...
[02:01:58] WARN  DQ check 'admission_cost_range': 23 rows outside expected range (p99)
[02:02:01] INFO  DQ checks: 12 passed, 0 failed, 1 warned
[02:02:02] INFO  Transforming to star schema...
[02:04:44] INFO  Star schema load complete
[02:04:46] INFO  Pipeline finished. Duration: 4m 32s`,
            },
            {
                id: 'run-2',
                time: '03:00',
                pipeline: 'dbt Transformations',
                status: 'warning',
                duration: '2m 07s',
                rows: 48900,
                note: '⚠ 1 test failed',
                log: `[03:00:02] INFO  Starting dbt run (13 models)
[03:00:04] INFO  Running model: stg_patients... OK (10,000 rows)
[03:00:08] INFO  Running model: stg_admissions... OK (51,420 rows)
[03:01:12] INFO  Running model: dim_patients... OK
[03:01:44] INFO  Running model: fact_admissions... OK (48,900 rows)
[03:01:55] WARN  Test 'not_null_fact_admissions_cost' failed: 520 nulls found
[03:02:01] INFO  dbt run completed — 12 models OK, 1 test warning
[03:02:09] INFO  Duration: 2m 07s`,
            },
            {
                id: 'run-3',
                time: '04:00',
                pipeline: 'ML Batch Scoring',
                status: 'success',
                duration: '1m 18s',
                rows: 1384,
                note: null,
                log: `[04:00:01] INFO  Starting ML Batch Scoring
[04:00:03] INFO  Loading XGBoost model v1.0 from model registry
[04:00:04] INFO  Fetching active admissions: 1,384 patients
[04:00:06] INFO  Running inference...
[04:01:10] INFO  Inference complete. Avg risk score: 0.43
[04:01:12] INFO  Writing predictions to fact_predictions...
[04:01:18] INFO  Pipeline finished. 1,384 patients scored. Duration: 1m 18s`,
            },
            {
                id: 'run-4',
                time: '05:00',
                pipeline: 'Data Quality Monitor',
                status: 'failed',
                duration: '0s',
                rows: null,
                note: '✕ Connection error',
                log: `[05:00:01] INFO  Starting Data Quality Monitor
[05:00:01] ERROR Could not connect to warehouse: Connection refused (host=postgres, port=5432)
[05:00:01] ERROR Retrying in 5s... (attempt 1/3)
[05:00:06] ERROR Retrying in 5s... (attempt 2/3)
[05:00:11] ERROR Retrying in 5s... (attempt 3/3)
[05:00:16] FATAL Pipeline aborted after 3 failed connection attempts.
[05:00:16] INFO  Duration: 0s. Rows processed: 0.`,
            },
        ],
    },
    {
        date: 'Mar 10, 2026',
        runs: [
            {
                id: 'run-5',
                time: '06:00',
                pipeline: 'Model Drift Monitor',
                status: 'success',
                duration: '45s',
                rows: 7200,
                note: null,
                log: `[06:00:01] INFO  Starting Model Drift Monitor
[06:00:02] INFO  Loading reference distribution (2026-02-10)
[06:00:04] INFO  Loading current distribution (7,200 predictions)
[06:00:10] INFO  PSI score: 0.04 (threshold: 0.20 — OK)
[06:00:28] INFO  AUC this week: 0.84 (reference: 0.84 — stable)
[06:00:45] INFO  No drift detected. Model healthy. Duration: 45s`,
            },
            {
                id: 'run-6',
                time: '03:00',
                pipeline: 'dbt Transformations',
                status: 'success',
                duration: '1m 58s',
                rows: 51200,
                note: null,
                log: `[03:00:01] INFO  Starting dbt run (13 models)
[03:02:00] INFO  All 13 models passed. All tests passed.
[03:01:58] INFO  Duration: 1m 58s`,
            },
        ],
    },
    {
        date: 'Mar 9, 2026',
        runs: [
            {
                id: 'run-7',
                time: '01:00',
                pipeline: 'Association Rule Mining',
                status: 'success',
                duration: '8m 45s',
                rows: 12400,
                note: null,
                log: `[01:00:01] INFO  Starting Association Rule Mining (Apriori)
[01:00:03] INFO  Loading 12,400 care-path episodes
[01:00:18] INFO  min_support=0.05, min_confidence=0.7
[01:04:15] INFO  Apriori pass 1 complete: 847 frequent itemsets found
[01:07:30] INFO  Apriori pass 2 complete: 212 association rules generated
[01:08:45] INFO  Writing rules to mart_care_path_rules... done
[01:08:45] INFO  Pipeline finished. Duration: 8m 45s`,
            },
        ],
    },
];

const DQ_CHECKS = [
    { name: 'null_rate_patient_id',  table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '0.0%',  threshold: '< 0.1%' },
    { name: 'null_rate_admit_date',  table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '0.0%',  threshold: '< 0.1%' },
    { name: 'readmit_rate_range',    table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '14.7%', threshold: '10–20%' },
    { name: 'row_count_delta',       table: 'fact_admissions', lastRun: '2h ago', status: 'warn', value: '+2.8%', threshold: '< 2.0%' },
    { name: 'cost_distribution_psi', table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '0.08',  threshold: '< 0.20' },
    { name: 'duplicate_admissions',  table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '0',     threshold: '= 0' },
    { name: 'los_outliers_z3',       table: 'fact_admissions', lastRun: '2h ago', status: 'pass', value: '12 rows', threshold: '< 50' },
];

const WAREHOUSE_METRICS = [
    { label: 'Total Rows',        value: '51,420',   sub: 'fact_admissions', icon: Rows3,       color: 'var(--accent-primary)' },
    { label: 'Warehouse Size',    value: '2.4 GB',   sub: 'PostgreSQL',      icon: HardDrive,   color: 'var(--text-secondary)' },
    { label: 'Last Full Refresh', value: '2h ago',   sub: 'Mar 11, 05:00',   icon: RefreshCw,   color: 'var(--text-secondary)' },
    { label: 'Data Freshness SLA',value: '✓ Met',    sub: '< 6h target',     icon: ShieldCheck, color: 'var(--risk-low)' },
];

/* ─── Status helpers ─────────────────────────────────────────────────────── */
function statusConfig(status) {
    switch (status) {
        case 'success':
            return {
                label: 'SUCCESS',
                color: 'var(--risk-low)',
                bg: 'var(--risk-low-bg)',
                border: 'var(--risk-low-border)',
                dot: 'var(--risk-low)',
                Icon: CheckCircle2,
            };
        case 'running':
            return {
                label: 'RUNNING',
                color: 'var(--accent-primary)',
                bg: 'var(--accent-light)',
                border: 'var(--accent-mid)',
                dot: 'var(--accent-primary)',
                Icon: Loader2,
                spin: true,
            };
        case 'warning':
            return {
                label: 'WARNING',
                color: 'var(--risk-medium)',
                bg: 'var(--risk-medium-bg)',
                border: 'var(--risk-medium-border)',
                dot: 'var(--risk-medium)',
                Icon: AlertTriangle,
            };
        case 'failed':
            return {
                label: 'FAILED',
                color: 'var(--risk-critical)',
                bg: 'var(--risk-critical-bg)',
                border: 'var(--risk-critical-border)',
                dot: 'var(--risk-critical)',
                Icon: XCircle,
            };
        default:
            return {
                label: status.toUpperCase(),
                color: 'var(--text-muted)',
                bg: 'var(--bg-sunken)',
                border: 'var(--border-subtle)',
                dot: 'var(--text-muted)',
                Icon: Clock,
            };
    }
}

function dqBarColor(score) {
    if (score >= 98) return 'var(--risk-low)';
    if (score >= 90) return 'var(--risk-medium)';
    return 'var(--risk-critical)';
}

function dqStatusConfig(status) {
    switch (status) {
        case 'pass': return { label: '✓ Pass', color: 'var(--risk-low)',      bg: 'var(--risk-low-bg)' };
        case 'warn': return { label: '⚠ Warn', color: 'var(--risk-medium)',   bg: 'var(--risk-medium-bg)' };
        case 'fail': return { label: '✕ Fail', color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)' };
        default:     return { label: status,   color: 'var(--text-muted)',     bg: 'var(--bg-sunken)' };
    }
}

/* ─── Section 1: Pipeline Status Grid ───────────────────────────────────── */
function PipelineCard({ pipeline }) {
    const cfg = statusConfig(pipeline.status);
    const { Icon } = cfg;

    return (
        <div
            className="card card-interactive"
            style={{
                padding: '18px 20px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                borderLeft: `3px solid ${cfg.dot}`,
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: cfg.dot, flexShrink: 0,
                        boxShadow: pipeline.status === 'running' ? `0 0 0 3px ${cfg.bg}` : 'none',
                    }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {pipeline.name}
                    </span>
                </div>

                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                    color: cfg.color,
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    flexShrink: 0,
                }}>
                    <Icon size={10} style={{ animation: cfg.spin ? 'spin 1s linear infinite' : 'none' }} />
                    {cfg.label}
                </span>
            </div>

            {/* Description */}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, paddingLeft: 16 }}>
                {pipeline.description}
            </p>

            {/* Stats row */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 0,
                background: 'var(--bg-sunken)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                marginBottom: 10,
            }}>
                {[
                    { label: 'Rows',     value: pipeline.rowsProcessed > 0 ? pipeline.rowsProcessed.toLocaleString() : '—' },
                    { label: 'DQ Score', value: pipeline.dqScore > 0 ? `${pipeline.dqScore}%` : '—' },
                    { label: 'Duration', value: pipeline.duration },
                ].map((s, i) => (
                    <div key={s.label} style={{
                        padding: '7px 10px',
                        borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                            {s.label}
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {s.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Last / Next run */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last: {pipeline.lastRun}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next: {pipeline.nextRun}</span>
            </div>

            {/* DQ Score bar */}
            <div style={{
                height: 3, background: 'var(--border-subtle)',
                borderRadius: 'var(--radius-pill)', overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%', borderRadius: 'var(--radius-pill)',
                    width: `${pipeline.dqScore}%`,
                    background: dqBarColor(pipeline.dqScore),
                    transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)',
                }} />
            </div>
        </div>
    );
}

/* ─── Section 2: Timeline ─────────────────────────────────────────────────── */
function TimelineRow({ run }) {
    const [expanded, setExpanded] = useState(false);
    const cfg = statusConfig(run.status);
    const { Icon } = cfg;

    return (
        <div>
            <div
                onClick={() => setExpanded((v) => !v)}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '42px 180px 1fr 70px 80px 20px',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 16px',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'background var(--t-fast)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
                {/* Time */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {run.time}
                </span>

                {/* Status dot + pipeline name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.pipeline}
                    </span>
                </div>

                {/* Note */}
                <span style={{ fontSize: 11, color: run.status === 'failed' ? 'var(--risk-critical)' : run.status === 'warning' ? 'var(--risk-medium)' : 'var(--text-muted)' }}>
                    {run.note || ''}
                </span>

                {/* Status badge */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    color: cfg.color, background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-pill)',
                    whiteSpace: 'nowrap',
                }}>
                    <Icon size={9} />
                    {cfg.label}
                </span>

                {/* Duration + rows */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {run.duration}{run.rows != null ? ` · ${run.rows.toLocaleString()}` : ''}
                </span>

                {/* Expand chevron */}
                <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: '0 16px 12px' }}>
                    <pre style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px 16px',
                        overflowX: 'auto',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.7,
                        marginTop: 4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}>
                        {run.log}
                    </pre>
                </div>
            )}
        </div>
    );
}

/* ─── Main page ────────────────────────────────────────────────────────────── */
export default function DataPlatform() {
    const [activeTab, setActiveTab] = useState('overview');
    const failedCount  = PIPELINES.filter((p) => p.status === 'failed').length;
    const warnCount    = PIPELINES.filter((p) => p.status === 'warning').length;
    const successCount = PIPELINES.filter((p) => p.status === 'success').length;

    const TABS = [
        { id: 'overview', label: 'Overview',  icon: Database  },
        { id: 'lineage',  label: 'Lineage',   icon: GitBranch },
        { id: 'schema',   label: 'Schema',    icon: Table2    },
    ];

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Page header ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="t-display" style={{ marginBottom: 4 }}>Data Platform</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                        {activeTab === 'overview'
                            ? 'Pipeline observability — health, freshness, and quality scores for every ETL and ML job'
                            : activeTab === 'lineage'
                            ? 'Interactive data lineage graph — trace every row from source CSV to prediction'
                            : 'Schema browser, migration history, and diff view for every table in the warehouse'}
                    </p>
                </div>

                {/* Summary chips — only in Overview */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[
                            { label: `${successCount} Healthy`,  color: 'var(--risk-low)',      bg: 'var(--risk-low-bg)',      border: 'var(--risk-low-border)' },
                            { label: `${warnCount} Warning`,    color: 'var(--risk-medium)',   bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)' },
                            { label: `${failedCount} Failed`,   color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)' },
                        ].map((chip) => (
                            <span key={chip.label} style={{
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                                color: chip.color, background: chip.bg,
                                border: `1px solid ${chip.border}`,
                                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                            }}>
                                {chip.label}
                            </span>
                        ))}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                            as of Mar 11, 05:15 UTC
                        </span>
                    </div>
                )}
            </div>

            {/* ── Tabbar ───────────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', gap: 2,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 4,
                width: 'fit-content',
            }}>
                {TABS.map((tab) => {
                    const Icon  = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '6px 16px',
                                background: active ? '#fff' : 'transparent',
                                border: active ? '1px solid var(--border-default)' : '1px solid transparent',
                                borderRadius: 'var(--radius-sm)',
                                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                                fontSize: 12.5, fontWeight: active ? 700 : 500,
                                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                transition: 'all var(--t-fast)',
                                fontFamily: "'Instrument Sans', sans-serif",
                            }}
                        >
                            <Icon size={13} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                    {/* ── Section 1: Pipeline Status Grid ──────────────────────────────── */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <Database size={15} style={{ color: 'var(--accent-primary)' }} />
                            <h2 className="t-heading">Pipeline Status</h2>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>
                                {PIPELINES.length} pipelines
                            </span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: 14,
                        }}>
                            {PIPELINES.map((p) => (
                                <PipelineCard key={p.name} pipeline={p} />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 2: Run History Timeline ───────────────────────────────── */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <Clock size={15} style={{ color: 'var(--accent-primary)' }} />
                            <h2 className="t-heading">Pipeline Run History</h2>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>
                                last 30 runs · click to expand logs
                            </span>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {TIMELINE.map((group, gi) => (
                                <div key={group.date}>
                                    {/* Date header */}
                                    <div style={{
                                        padding: '8px 16px',
                                        background: 'var(--bg-base)',
                                        borderBottom: '1px solid var(--border-subtle)',
                                        borderTop: gi > 0 ? '1px solid var(--border-subtle)' : 'none',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}>
                                        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                                        <span style={{
                                            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                                            textTransform: 'uppercase', color: 'var(--text-muted)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {group.date}
                                        </span>
                                        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                                    </div>

                                    {/* Column headers (first group only) */}
                                    {gi === 0 && (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '42px 180px 1fr 70px 80px 20px',
                                            gap: 8,
                                            padding: '6px 16px 4px',
                                        }}>
                                            {['TIME', 'PIPELINE', 'NOTE', 'STATUS', 'DURATION / ROWS', ''].map((h) => (
                                                <span key={h} style={{
                                                    fontSize: 10, fontWeight: 700,
                                                    letterSpacing: '0.07em', textTransform: 'uppercase',
                                                    color: 'var(--text-muted)',
                                                }}>{h}</span>
                                            ))}
                                        </div>
                                    )}

                                    {group.runs.map((run) => (
                                        <TimelineRow key={run.id} run={run} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ── Section 3: DQ Checks Table ────────────────────────────────────── */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <ShieldCheck size={15} style={{ color: 'var(--accent-primary)' }} />
                            <h2 className="t-heading">Data Quality Checks</h2>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                {[
                                    { label: `${DQ_CHECKS.filter(c => c.status === 'pass').length} Passed`, color: 'var(--risk-low)', bg: 'var(--risk-low-bg)', border: 'var(--risk-low-border)' },
                                    { label: `${DQ_CHECKS.filter(c => c.status === 'warn').length} Warned`, color: 'var(--risk-medium)', bg: 'var(--risk-medium-bg)', border: 'var(--risk-medium-border)' },
                                    { label: `${DQ_CHECKS.filter(c => c.status === 'fail').length} Failed`, color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)' },
                                ].map((chip) => (
                                    <span key={chip.label} style={{
                                        fontSize: 10, fontWeight: 700,
                                        color: chip.color, background: chip.bg,
                                        border: `1px solid ${chip.border}`,
                                        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                                    }}>
                                        {chip.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table" style={{ width: '100%', minWidth: 640 }}>
                                    <thead>
                                        <tr>
                                            {['Check Name', 'Table', 'Last Run', 'Status', 'Value', 'Threshold'].map((h) => (
                                                <th key={h} style={{ textAlign: h === 'Value' || h === 'Threshold' ? 'right' : 'left' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DQ_CHECKS.map((check) => {
                                            const sc = dqStatusConfig(check.status);
                                            return (
                                                <tr key={check.name}>
                                                    <td>
                                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-primary)' }}>
                                                            {check.name}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-secondary)' }}>
                                                            {check.table}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                            {check.lastRun}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            fontSize: 11, fontWeight: 700,
                                                            color: sc.color, background: sc.bg,
                                                            padding: '2px 8px',
                                                            borderRadius: 'var(--radius-pill)',
                                                        }}>
                                                            {sc.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-primary)' }}>
                                                            {check.value}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                                                            {check.threshold}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    {/* ── Section 4: Warehouse Metrics ──────────────────────────────────── */}
                    <section style={{ paddingBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <HardDrive size={15} style={{ color: 'var(--accent-primary)' }} />
                            <h2 className="t-heading">Warehouse Metrics</h2>
                        </div>

                        <div className="stagger" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: 14,
                        }}>
                            {WAREHOUSE_METRICS.map((m) => {
                                const MIcon = m.icon;
                                return (
                                    <div key={m.label} className="card card-accent-top" style={{ padding: '18px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                            <div style={{
                                                width: 30, height: 30,
                                                borderRadius: 'var(--radius-md)',
                                                background: 'var(--bg-sunken)',
                                                border: '1px solid var(--border-subtle)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                <MIcon size={14} style={{ color: m.color }} />
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                                {m.label}
                                            </span>
                                        </div>
                                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: m.color, lineHeight: 1.1, marginBottom: 4 }}>
                                            {m.value}
                                        </p>
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.sub}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {/* ── LINEAGE TAB ──────────────────────────────────────────────────── */}
            {activeTab === 'lineage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Explainer */}
                    <div className="card" style={{
                        padding: '14px 18px',
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                        <GitBranch size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e', marginBottom: 3 }}>
                                How to use the lineage explorer
                            </p>
                            <p style={{ fontSize: 12, color: '#0369a1', lineHeight: 1.55 }}>
                                <strong>Click any node</strong> to see its schema, sample rows, transformation SQL, upstream dependencies, and downstream impact.
                                {' '}<strong>Hover over edges</strong> to see the transformation type (e.g. "SCD Type 1 upsert", "Apriori mining").
                                {' '}Animated dots flow from source to destination. Use <strong>Ctrl+Scroll</strong> to zoom, drag to pan, and the minimap (bottom-right) to navigate.
                            </p>
                        </div>
                    </div>

                    {/* ReactFlow DAG */}
                    <Suspense fallback={
                        <div style={{
                            height: 680, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-muted)', fontSize: 13, gap: 10, flexDirection: 'column',
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                border: '3px solid var(--accent-primary)',
                                borderTopColor: 'transparent',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <span>Loading lineage graph…</span>
                        </div>
                    }>
                        <LineageExplorer />
                    </Suspense>
                </div>
            )}
            {/* ── SCHEMA TAB ───────────────────────────────────────────────────── */}
            {activeTab === 'schema' && (
                <Suspense fallback={
                    <div style={{
                        height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', fontSize: 13, gap: 10, flexDirection: 'column',
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            border: '3px solid var(--accent-primary)',
                            borderTopColor: 'transparent',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                        <span>Loading schema registry…</span>
                    </div>
                }>
                    <SchemaRegistry />
                </Suspense>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
