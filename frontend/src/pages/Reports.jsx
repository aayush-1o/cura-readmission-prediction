/**
 * Reports.jsx — CareIQ Reports & Export Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Three-panel layout:
 *  Left:   Report type picker (5 cards in grid)
 *  Right:  Scheduled reports (3 active schedules)
 *  Bottom: Recent reports table with download buttons
 *
 * Generate Report modal: parameters form + schedule picker.
 * After submit: progress card with animated bar, polling every 2s.
 * On complete: download buttons + success toast.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FileText, Download, Clock, Play, Trash2, Edit2,
    CheckCircle, AlertTriangle, Loader2, X, ChevronDown,
    BarChart2, Users, Activity, Cpu, Database,
    Calendar, RefreshCw, FileDown,
} from 'lucide-react';
import { apiClient } from '../services/api.js';
import { useReports } from '../services/hooks.js';

/* ─── Report type definitions ────────────────────────────────────────────────── */
const REPORT_TYPES = [
    {
        id: 'high_risk_daily',
        name: 'High-Risk Patient Daily Brief',
        description: 'All patients with risk score ≥ threshold, sorted by score descending',
        icon: Users,
        iconColor: '#DC2626',
        iconBg: '#FEF2F2',
        formats: ['pdf', 'csv'],
        scheduleOptions: ['daily', 'weekly'],
        params: [
            { key: 'department', label: 'Department', type: 'select', options: ['All Departments', 'Cardiology', 'ICU', 'Med/Surg', 'Nephrology', 'Pulmonology'] },
            { key: 'risk_threshold', label: 'Risk Threshold (%)', type: 'select', options: ['70', '75', '80', '85', '90'] },
            { key: 'date', label: 'Date', type: 'date' },
        ],
        estimatedRows: '~200 patients',
        estimatedSeconds: 8,
        whoUses: 'Care coordinators, attending physicians',
    },
    {
        id: 'dept_readmission_monthly',
        name: 'Department Readmission Report',
        description: 'Month-over-month readmission rates vs CMS benchmark, by department',
        icon: BarChart2,
        iconColor: '#2563EB',
        iconBg: '#EFF6FF',
        formats: ['pdf', 'csv'],
        scheduleOptions: ['monthly', 'weekly'],
        params: [
            { key: 'department', label: 'Department', type: 'select', options: ['All Departments', 'Cardiology', 'ICU', 'Med/Surg', 'Nephrology'] },
            { key: 'date_range', label: 'Month', type: 'select', options: ['2026-03', '2026-02', '2026-01', '2025-12'] },
        ],
        estimatedRows: 'Summary + detail tables',
        estimatedSeconds: 14,
        whoUses: 'Department heads, quality teams',
    },
    {
        id: 'model_performance_weekly',
        name: 'ML Model Performance Report',
        description: 'AUC, calibration, PSI, and fairness metrics for the week',
        icon: Activity,
        iconColor: '#7C3AED',
        iconBg: '#F5F3FF',
        formats: ['pdf'],
        scheduleOptions: ['weekly'],
        params: [
            { key: 'model_version', label: 'Model Version', type: 'select', options: ['v1.0'] },
            { key: 'date_range', label: 'Week', type: 'select', options: ['2026-W11', '2026-W10', '2026-W09'] },
        ],
        estimatedRows: 'Metrics tables + charts',
        estimatedSeconds: 11,
        whoUses: 'ML team, CIO',
    },
    {
        id: 'patient_care_plan',
        name: 'Individual Care Plan Export',
        description: 'Single patient: risk score, SHAP explanation, recommendations',
        icon: FileText,
        iconColor: '#059669',
        iconBg: '#ECFDF5',
        formats: ['pdf'],
        scheduleOptions: [],
        params: [
            { key: 'patient_id', label: 'Patient ID', type: 'text', placeholder: 'e.g. PAT-010000' },
        ],
        estimatedRows: 'Single patient record',
        estimatedSeconds: 7,
        whoUses: 'Clinicians (patient handoffs)',
    },
    {
        id: 'pipeline_sla_weekly',
        name: 'Data Platform SLA Report',
        description: 'Pipeline run history, DQ scores, and SLA compliance for the week',
        icon: Database,
        iconColor: '#D97706',
        iconBg: '#FFFBEB',
        formats: ['pdf', 'csv'],
        scheduleOptions: ['weekly'],
        params: [
            { key: 'date_range', label: 'Week', type: 'select', options: ['2026-W11', '2026-W10', '2026-W09'] },
        ],
        estimatedRows: '30–50 pipeline run records',
        estimatedSeconds: 9,
        whoUses: 'Data engineering team, CTO',
    },
];

/* ─── Seed recent reports ─────────────────────────────────────────────────────── */
const SEED_REPORTS = [
    { job_id: 'a1b2c3d4-0001', report_type: 'high_risk_daily',         name: 'High-Risk Patient Daily Brief',  created_at: '2026-03-11T06:00:00', status: 'complete', progress: 100, file_size_bytes: 250880,  formats: ['pdf', 'csv'] },
    { job_id: 'a1b2c3d4-0002', report_type: 'dept_readmission_monthly', name: 'Department Readmission Report',  created_at: '2026-03-10T18:00:00', status: 'complete', progress: 100, file_size_bytes: 1258291, formats: ['pdf'] },
    { job_id: 'a1b2c3d4-0003', report_type: 'patient_care_plan',        name: 'Care Plan: PAT-010000',          created_at: '2026-03-11T09:31:00', status: 'complete', progress: 100, file_size_bytes: 91136,   formats: ['pdf'] },
    { job_id: 'a1b2c3d4-0004', report_type: 'model_performance_weekly', name: 'Model Performance Wk 10',       created_at: '2026-03-10T07:00:00', status: 'complete', progress: 100, file_size_bytes: 421888,  formats: ['pdf'] },
    { job_id: 'a1b2c3d4-0005', report_type: 'high_risk_daily',         name: 'High-Risk Patient Daily Brief',  created_at: '2026-03-10T06:00:00', status: 'complete', progress: 100, file_size_bytes: 243712,  formats: ['pdf', 'csv'] },
    { job_id: 'a1b2c3d4-0006', report_type: 'pipeline_sla_weekly',     name: 'Pipeline SLA Week 10',           created_at: '2026-03-10T07:00:00', status: 'generating', progress: 45, file_size_bytes: null,  formats: ['pdf', 'csv'] },
];

const SCHEDULED = [
    { id: 'sch-1', name: 'High-Risk Patient Daily Brief', schedule: 'Every day at 06:00 UTC', formats: ['pdf', 'csv'], lastRun: 'Mar 11, 2026' },
    { id: 'sch-2', name: 'Model Performance Weekly',      schedule: 'Every Monday at 07:00 UTC', formats: ['pdf'],       lastRun: 'Mar 10, 2026' },
    { id: 'sch-3', name: 'Pipeline SLA Weekly',           schedule: 'Every Monday at 07:00 UTC', formats: ['pdf', 'csv'], lastRun: 'Mar 10, 2026' },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function StatusBadge({ status, progress }) {
    const cfg = {
        complete:   { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', label: '✓ Ready' },
        generating: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: `⏳ ${progress}%` },
        queued:     { color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', label: '⌛ Queued' },
        failed:     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: '✗ Failed' },
    }[status] || { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', label: status };
    return (
        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 8px', borderRadius: 99 }}>
            {cfg.label}
        </span>
    );
}

/* ─── Toast ─────────────────────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#059669', color: '#fff', padding: '12px 18px', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, animation: 'slideInUp 0.3s ease' }}>
            <CheckCircle size={16} />
            {message}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, lineHeight: 1 }}><X size={14} /></button>
        </div>
    );
}

/* ─── Generate Report Modal ──────────────────────────────────────────────────── */
function GenerateModal({ reportType, onClose, onJobCreated }) {
    const [paramValues, setParamValues] = useState(() => {
        const defaults = {};
        reportType.params.forEach(p => {
            if (p.type === 'select') defaults[p.key] = p.options[0];
            else if (p.type === 'date') defaults[p.key] = '2026-03-11';
            else defaults[p.key] = p.placeholder || '';
        });
        return defaults;
    });
    const [selectedFormats, setSelectedFormats] = useState([...reportType.formats]);
    const [schedule, setSchedule] = useState('one-time');
    const [submitting, setSubmitting] = useState(false);

    const toggleFormat = fmt => {
        setSelectedFormats(f => f.includes(fmt) ? f.filter(x => x !== fmt) : [...f, fmt]);
    };

    const submit = async () => {
        if (selectedFormats.length === 0) return;
        setSubmitting(true);
        try {
            const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
            if (USE_MOCK) {
                // Simulate a queued job in mock mode
                await new Promise(r => setTimeout(r, 400));
                onJobCreated({
                    job_id: `live-${Date.now()}`,
                    report_type: reportType.id,
                    name: reportType.name,
                    parameters: paramValues,
                    formats: selectedFormats,
                    status: 'queued',
                    progress: 0,
                    created_at: new Date().toISOString(),
                    file_size_bytes: null,
                    estimated_seconds: reportType.estimatedSeconds,
                    is_seed: false,
                });
            } else {
                // BUG-009 FIX: call real API instead of simulating
                const res = await apiClient.post('/api/v1/reports/generate', {
                    report_type: reportType.id,
                    formats: selectedFormats,
                    parameters: paramValues,
                    is_scheduled: schedule !== 'one-time',
                });
                onJobCreated({
                    ...res.data,
                    name: reportType.name,
                    formats: selectedFormats,
                    estimated_seconds: reportType.estimatedSeconds,
                    is_seed: false,
                });
            }
        } catch (err) {
            console.error('[Reports] Failed to queue report:', err);
        } finally {
            setSubmitting(false);
            onClose();
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
             onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="card" style={{ width: 460, padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--bg-elevated)', maxHeight: '90vh', overflowY: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>Generate Report</p>
                        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{reportType.name}</h2>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{reportType.description}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
                </div>

                <div style={{ height: 1, background: 'var(--border-subtle)' }} />

                {/* Parameters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {reportType.params.map(param => (
                        <div key={param.key}>
                            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>{param.label}</label>
                            {param.type === 'select' ? (
                                <select
                                    value={paramValues[param.key]}
                                    onChange={e => setParamValues(v => ({ ...v, [param.key]: e.target.value }))}
                                    style={{ width: '100%', height: 36, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 13, padding: '0 10px', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                >
                                    {param.options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : (
                                <input
                                    type={param.type}
                                    value={paramValues[param.key]}
                                    placeholder={param.placeholder}
                                    onChange={e => setParamValues(v => ({ ...v, [param.key]: e.target.value }))}
                                    style={{ width: '100%', height: 36, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 13, padding: '0 10px', background: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Format picker */}
                <div>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 7 }}>Output Format</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {reportType.formats.map(fmt => {
                            const on = selectedFormats.includes(fmt);
                            return (
                                <button key={fmt} onClick={() => toggleFormat(fmt)} style={{ padding: '6px 16px', border: `2px solid ${on ? 'var(--accent-primary)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--accent-light)' : 'var(--bg-elevated)', color: on ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: on ? 700 : 500, fontSize: 12.5, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all var(--t-fast)' }}>
                                    {fmt}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Schedule */}
                {reportType.scheduleOptions.length > 0 && (
                    <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 7 }}>Schedule this report?</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {['one-time', ...reportType.scheduleOptions].map(opt => (
                                <button key={opt} onClick={() => setSchedule(opt)} style={{ padding: '5px 14px', border: `1.5px solid ${schedule === opt ? 'var(--accent-primary)' : 'var(--border-default)'}`, borderRadius: 99, background: schedule === opt ? 'var(--accent-light)' : 'transparent', color: schedule === opt ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: schedule === opt ? 700 : 500, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize', transition: 'all var(--t-fast)' }}>
                                    {opt === 'one-time' ? 'One-time' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Estimated time */}
                <div style={{ padding: '10px 14px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Estimated generation time: <strong style={{ color: 'var(--text-primary)' }}>~{reportType.estimatedSeconds} seconds</strong>
                    </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                        Cancel
                    </button>
                    <button onClick={submit} disabled={submitting || selectedFormats.length === 0} style={{ padding: '8px 20px', border: 'none', borderRadius: 'var(--radius-md)', background: submitting ? 'var(--border-default)' : 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'background var(--t-fast)' }}>
                        {submitting ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />}
                        {submitting ? 'Queuing…' : 'Generate Report'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Progress Card ──────────────────────────────────────────────────────────── */
function ProgressCard({ job, onComplete }) {
    const [progress, setProgress] = useState(job.progress || 0);
    const [status, setStatus]     = useState(job.status || 'queued');
    const intervalRef             = useRef(null);

    useEffect(() => {
        // BUG-010 FIX: Add proper deps, avoid double-timer in StrictMode
        if (status === 'complete' || status === 'failed') return;

        const timer = setInterval(() => {
            setProgress(p => {
                const next = Math.min(p + Math.random() * 12 + 4, 95);
                if (next >= 95) {
                    clearInterval(timer);
                    setTimeout(() => {
                        setProgress(100);
                        setStatus('complete');
                        onComplete(job.job_id);
                    }, 600);
                }
                return next;
            });
        }, (job.estimated_seconds || 8) * 100);

        return () => clearInterval(timer);
    }, [job.estimated_seconds, job.job_id, status]); // BUG-010 FIX: explicit deps

    return (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 8, border: status === 'complete' ? '1px solid #A7F3D0' : '1px solid var(--border-default)', background: status === 'complete' ? '#F0FDF4' : 'var(--bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {status === 'complete'
                        ? <span style={{ fontSize: 11.5, color: '#059669', fontWeight: 700 }}>✓ Ready to download</span>
                        : <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Generating… {Math.round(progress)}%</span>
                    }
                </div>
            </div>
            <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: status === 'complete' ? '#059669' : 'var(--accent-primary)', borderRadius: 99, width: `${progress}%`, transition: 'width 500ms ease' }} />
            </div>
            {status === 'complete' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {job.formats.map(fmt => (
                        <button key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', background: '#ECFDF5', color: '#059669', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
                            <Download size={11} />{fmt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function Reports() {
    const [selectedType, setSelectedType]   = useState(null);
    const [activeJobs, setActiveJobs]       = useState([]);
    const [toast, setToast]                 = useState(null);

    const handleJobCreated = useCallback(job => {
        setActiveJobs(prev => [job, ...prev]);
    }, []);

    // BUG-011 FIX: use functional updater so we always read fresh state,
    // not the stale closure captured when this callback was created.
    const handleJobComplete = useCallback(jobId => {
        setActiveJobs(prev => {
            const job = prev.find(j => j.job_id === jobId);
            if (job) setToast(`${job.name} is ready to download!`);
            return prev;
        });
    }, []); // no deps needed — functional updater always gets latest state

    // BUG-009 FIX: pull recent reports from useReports() instead of hardcoded SEED_REPORTS
    const { data: serverReports = [], isLoading: reportsLoading } = useReports();

    // In-progress active jobs (local only, before they appear in server list)
    const allReports = [
        ...activeJobs.filter(j => j.status !== 'complete'),
        ...serverReports,
    ];
    // De-dup: if a job appears in both activeJobs and serverReports, prefer server version
    const seen = new Set();
    const deduped = allReports.filter(r => {
        if (seen.has(r.job_id)) return false;
        seen.add(r.job_id);
        return true;
    });

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {toast && <Toast message={toast} onClose={() => setToast(null)} />}

            {/* ── Page header ───────────────────────────────────────────────── */}
            <div>
                <h1 className="t-display" style={{ marginBottom: 4 }}>Reports & Exports</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                    Generate, schedule, and download PDF/CSV reports on patient risk, quality metrics, and ML performance
                </p>
            </div>

            {/* ── Active jobs (progress cards) ──────────────────────────────── */}
            {activeJobs.length > 0 && (
                <div>
                    <p style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>In Progress</p>
                    {activeJobs.map(job => (
                        <ProgressCard key={job.job_id} job={job} onComplete={handleJobComplete} />
                    ))}
                </div>
            )}

            {/* ── Two-column: picker + scheduled ────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
                {/* Left: Report type picker */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <FileDown size={15} style={{ color: 'var(--accent-primary)' }} />
                        <h2 className="t-heading">Generate a Report</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        {REPORT_TYPES.map(rt => {
                            const Icon = rt.icon;
                            return (
                                <div key={rt.id} className="card"
                                     onClick={() => setSelectedType(rt)}
                                     style={{ padding: '16px 18px', cursor: 'pointer', transition: 'box-shadow var(--t-fast), transform var(--t-fast)', display: 'flex', flexDirection: 'column', gap: 10 }}
                                     onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                     onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: rt.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={16} style={{ color: rt.iconColor }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{rt.name}</p>
                                            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{rt.description}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {rt.formats.map(f => (
                                            <span key={f} style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', background: 'var(--accent-light)', border: '1px solid var(--accent-mid)', padding: '1px 6px', borderRadius: 99, fontFamily: "'DM Mono', monospace" }}>{f}</span>
                                        ))}
                                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 4 }}>~{rt.estimatedSeconds}s</span>
                                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>· {rt.estimatedRows}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Scheduled reports */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={14} style={{ color: 'var(--accent-primary)' }} />
                        <h2 className="t-heading" style={{ flex: 1 }}>Scheduled Reports</h2>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', padding: '1px 8px', borderRadius: 99, fontFamily: "'DM Mono', monospace" }}>
                            {SCHEDULED.length} active
                        </span>
                    </div>
                    {SCHEDULED.map((s, idx) => (
                        <div key={s.id} style={{ padding: '12px 16px', borderBottom: idx < SCHEDULED.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{s.name}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{s.schedule}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {s.formats.map(f => (
                                    <span key={f} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '1px 5px', borderRadius: 99, fontFamily: "'DM Mono', monospace" }}>{f}</span>
                                ))}
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>Last: {s.lastRun}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                                    <Download size={10} /> Download
                                </button>
                                <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                                    <Edit2 size={10} /> Edit
                                </button>
                                <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', background: '#FEF2F2', color: '#DC2626', fontSize: 11, cursor: 'pointer' }}>
                                    <Trash2 size={10} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Recent Reports table ──────────────────────────────────────── */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Clock size={15} style={{ color: 'var(--accent-primary)' }} />
                    <h2 className="t-heading">Recent Reports</h2>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>last 30 days</span>
                </div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-base)' }}>
                                {['NAME', 'GENERATED', 'FORMAT', 'SIZE', 'STATUS', 'ACTIONS'].map(h => (
                                    <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', fontFamily: "'DM Mono', monospace" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                    {reportsLoading ? (
                        <tr>
                            <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', marginRight: 6 }} />
                                Loading reports…
                            </td>
                        </tr>
                    ) : deduped.map((r, i) => (
                                <tr key={r.job_id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-base)' }}>
                                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                                    <td style={{ padding: '10px 16px', fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                                    <td style={{ padding: '10px 16px' }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {(r.formats || []).map(f => (
                                                <span key={f} style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', background: 'var(--accent-light)', border: '1px solid var(--accent-mid)', padding: '1px 5px', borderRadius: 99, fontFamily: "'DM Mono', monospace" }}>{f}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 16px', fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtSize(r.file_size_bytes)}</td>
                                    <td style={{ padding: '10px 16px' }}><StatusBadge status={r.status} progress={r.progress} /></td>
                                    <td style={{ padding: '10px 16px' }}>
                                        {r.status === 'complete' && !r.is_seed ? (
                                            // BUG-005 FIX: only show download buttons if real files exist (not seed/demo)
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {(r.formats || []).map(fmt => (
                                                    <button key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}>
                                                        <Download size={11} />
                                                        {fmt.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : r.status === 'complete' && r.is_seed ? (
                                            // BUG-005 FIX: seeded demo reports have no actual files on disk
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Demo data</span>
                                        ) : r.status === 'generating' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 120 }}>
                                                <div style={{ flex: 1, height: 4, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', background: '#D97706', borderRadius: 99, width: `${r.progress}%` }} />
                                                </div>
                                                <span style={{ fontSize: 10, color: '#D97706', fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{r.progress}%</span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── Generate modal ────────────────────────────────────────────── */}
            {selectedType && (
                <GenerateModal
                    reportType={selectedType}
                    onClose={() => setSelectedType(null)}
                    onJobCreated={handleJobCreated}
                />
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}
