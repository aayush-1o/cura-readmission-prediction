import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, TrendingUp, Activity, Database, BarChart2, Clock,
    Check, X, ChevronDown, ChevronUp, Filter, Search as SearchIcon,
} from 'lucide-react';

/* ─── Mock data (same as TopBar mock, kept in sync) ─────────────────────── */
const MOCK_ALERTS = [
    {
        alert_id: 'a1',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010000 admitted to Cardiology with risk score 95%',
        created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010000', related_pipeline: null,
    },
    {
        alert_id: 'a2',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010001 admitted to Cardiology with risk score 91%',
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010001', related_pipeline: null,
    },
    {
        alert_id: 'a3',
        alert_type: 'vital_anomaly',
        severity: 'critical',
        title: 'Vital Sign Anomaly',
        description: 'PAT-010003: SpO₂ = 88% (expected 95–100%)',
        created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010003', related_pipeline: null,
    },
    {
        alert_id: 'a4',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010007 risk increased from 45% to 77% in last 6h',
        created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010007', related_pipeline: null,
    },
    {
        alert_id: 'a5',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010019 risk increased from 52% to 81% in last 6h',
        created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010019', related_pipeline: null,
    },
    {
        alert_id: 'a6',
        alert_type: 'vital_anomaly',
        severity: 'high',
        title: 'Vital Sign Anomaly',
        description: 'PAT-010008: Heart rate = 142 bpm (expected 60–100 bpm)',
        created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010008', related_pipeline: null,
    },
    {
        alert_id: 'a7',
        alert_type: 'pipeline_failure',
        severity: 'warning',
        title: 'Pipeline Failed',
        description: 'Data Quality Monitor failed at 05:00. 0 rows processed.',
        created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: null, related_pipeline: 'Data Quality Monitor',
    },
    {
        alert_id: 'a8',
        alert_type: 'sla_breach',
        severity: 'warning',
        title: 'Data Freshness SLA Breach',
        description: 'fact_admissions has not been updated in 7h (SLA: 6h)',
        created_at: new Date(Date.now() - 55 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: null, related_pipeline: 'EHR Ingestion',
    },
    // Acknowledged alerts
    {
        alert_id: 'a9',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010002 admitted to ICU with risk score 98%',
        created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 1.75 * 3600_000).toISOString(),
        acknowledged_by: 'dr.chen',
        acknowledged_note: 'Escalated to attending. Care team assigned.',
        related_patient_id: 'PAT-010002', related_pipeline: null,
    },
    {
        alert_id: 'a10',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010012 risk increased from 38% to 72% in last 6h',
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
        acknowledged_by: 'coordinator.rodriguez',
        acknowledged_note: 'Patient reassigned to high-risk bed. Family notified.',
        related_patient_id: 'PAT-010012', related_pipeline: null,
    },
    {
        alert_id: 'a11',
        alert_type: 'pipeline_failure',
        severity: 'warning',
        title: 'Pipeline Failed',
        description: 'dbt Transformations ran with 1 test warning at 03:00.',
        created_at: new Date(Date.now() - 7 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
        acknowledged_by: 'data.eng',
        acknowledged_note: 'Known issue: cost nulls in synthetic data. Ticket #DEP-441 open.',
        related_patient_id: null, related_pipeline: 'dbt Transformations',
    },
    {
        alert_id: 'a12',
        alert_type: 'vital_anomaly',
        severity: 'high',
        title: 'Vital Sign Anomaly',
        description: 'PAT-009960: Blood pressure = 185/115 mmHg (expected < 140/90)',
        created_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 3 * 86400_000 + 3600_000).toISOString(),
        acknowledged_by: 'dr.chen',
        acknowledged_note: 'Anti-hypertensive administered. Patient stabilised.',
        related_patient_id: 'PAT-009960', related_pipeline: null,
    },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const ALERT_ICONS = {
    new_critical_admission: AlertTriangle,
    risk_score_spike:       TrendingUp,
    vital_anomaly:          Activity,
    pipeline_failure:       Database,
    model_drift_detected:   BarChart2,
    sla_breach:             Clock,
};

const SEVERITY_ORDER = { critical: 0, high: 1, warning: 2, info: 3 };

function severityConfig(severity) {
    switch (severity) {
        case 'critical': return { color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)' };
        case 'high':     return { color: 'var(--risk-high)',     bg: 'var(--risk-high-bg)',     border: 'var(--risk-high-border)' };
        case 'warning':  return { color: 'var(--risk-medium)',   bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)' };
        default:         return { color: 'var(--accent-primary)', bg: 'var(--accent-light)',    border: 'var(--accent-mid)' };
    }
}

function relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return `${Math.round(diff)}s ago`;
    if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
}

function fmt(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-GB', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

/* ─── Acknowledge Modal ───────────────────────────────────────────────────── */
function AcknowledgeModal({ alert, onConfirm, onCancel }) {
    const [note, setNote] = useState('');
    const sc = severityConfig(alert.severity);

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 500,
            backdropFilter: 'blur(2px)',
        }}>
            <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                width: 380,
                padding: '24px',
                animation: 'scaleIn 150ms cubic-bezier(0.16,1,0.3,1)',
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Acknowledge Alert
                </h3>
                <div style={{
                    background: sc.bg, border: `1px solid ${sc.border}`,
                    borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 16,
                }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: sc.color, marginBottom: 2 }}>{alert.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{alert.description}</p>
                </div>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Add note (optional)
                </label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Assigned to care coordinator Rodriguez per protocol..."
                    rows={3}
                    style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12.5,
                        color: 'var(--text-primary)',
                        fontFamily: "'Instrument Sans', sans-serif",
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        outline: 'none',
                        marginBottom: 16,
                    }}
                />

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '7px 16px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 12.5, fontWeight: 600,
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontFamily: "'Instrument Sans', sans-serif",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(alert.alert_id, note)}
                        style={{
                            padding: '7px 16px',
                            background: 'var(--accent-primary)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 12.5, fontWeight: 600,
                            color: '#fff',
                            cursor: 'pointer',
                            fontFamily: "'Instrument Sans', sans-serif",
                        }}
                    >
                        Acknowledge
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}

/* ─── Alert Row ────────────────────────────────────────────────────────────── */
function AlertRow({ alert, onAcknowledge }) {
    const [hovered, setHovered] = useState(false);
    const navigate = useNavigate();
    const sc = severityConfig(alert.severity);
    const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
    const isAcked = !!alert.acknowledged_at;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr auto',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                background: hovered && !isAcked ? 'var(--bg-sunken)' : 'transparent',
                transition: 'background var(--t-fast)',
                opacity: isAcked ? 0.7 : 1,
            }}
        >
            {/* Severity icon */}
            <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-md)',
                background: sc.bg, border: `1px solid ${sc.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
            }}>
                <Icon size={13} style={{ color: sc.color }} />
            </div>

            {/* Content */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {alert.title}
                    </span>
                    {alert.related_patient_id && (
                        <span style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 11,
                            color: 'var(--accent-primary)',
                            background: 'var(--accent-light)',
                            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                            fontWeight: 500,
                        }}>
                            {alert.related_patient_id}
                        </span>
                    )}
                    {alert.related_pipeline && (
                        <span style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 11,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-sunken)',
                            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                        }}>
                            {alert.related_pipeline}
                        </span>
                    )}
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                        {fmt(alert.created_at)}
                    </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: isAcked ? 4 : 0 }}>
                    {alert.description}
                </p>
                {isAcked && (
                    <div style={{
                        marginTop: 6,
                        padding: '7px 10px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 11,
                    }}>
                        <span style={{ color: 'var(--risk-low)', fontWeight: 700 }}>✓ Acknowledged</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            {' '}by <strong>{alert.acknowledged_by}</strong> — {relTime(alert.acknowledged_at)}
                        </span>
                        {alert.acknowledged_note && (
                            <p style={{ marginTop: 3, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                "{alert.acknowledged_note}"
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            {!isAcked && (
                <div style={{
                    display: 'flex', gap: 6, alignItems: 'flex-start',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity var(--t-fast)',
                    flexShrink: 0,
                }}>
                    {(alert.related_patient_id || alert.related_pipeline) && (
                        <button
                            onClick={() => alert.related_patient_id
                                ? navigate(`/patients/${alert.related_patient_id}`)
                                : navigate('/data-platform')}
                            style={{
                                fontSize: 11, fontWeight: 600,
                                color: 'var(--accent-primary)',
                                background: 'var(--accent-light)',
                                border: '1px solid var(--accent-mid)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '4px 10px', cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            View →
                        </button>
                    )}
                    <button
                        onClick={() => onAcknowledge(alert)}
                        style={{
                            fontSize: 11, fontWeight: 600,
                            color: 'var(--risk-low)',
                            background: 'var(--risk-low-bg)',
                            border: '1px solid var(--risk-low-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 10px', cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        <Check size={10} />
                        Acknowledge
                    </button>
                </div>
            )}
        </div>
    );
}

/* ─── Severity group ─────────────────────────────────────────────────────── */
function SeverityGroup({ severity, alerts, expanded, onToggle, onAcknowledge }) {
    const sc = severityConfig(severity);
    const label = severity.charAt(0).toUpperCase() + severity.slice(1);

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px',
                background: sc.bg,
                border: '1px solid var(--border-subtle)',
                borderRadius: expanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                cursor: 'pointer',
            }}
                onClick={onToggle}
            >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: sc.color }}>
                    {label.toUpperCase()} ({alerts.length})
                </span>
                <div style={{ flex: 1, height: 1, background: sc.border }} />
                {expanded ? <ChevronUp size={13} style={{ color: sc.color }} /> : <ChevronDown size={13} style={{ color: sc.color }} />}
            </div>
            {expanded && (
                <div style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid var(--border-subtle)`,
                    borderTop: 'none',
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    overflow: 'hidden',
                }}>
                    {alerts.map((a) => (
                        <AlertRow key={a.alert_id} alert={a} onAcknowledge={onAcknowledge} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Main Alerts page ───────────────────────────────────────────────────── */
export default function AlertsPage() {
    const [alerts, setAlerts] = useState(MOCK_ALERTS);
    const [severityFilter, setSeverityFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [search, setSearch]   = useState('');
    const [expandedSeverities, setExpandedSeverities] = useState({ critical: true, high: true, warning: true });
    const [expandedAcked, setExpandedAcked] = useState(false);
    const [ackModal, setAckModal] = useState(null);  // alert object

    const handleAcknowledge = useCallback((alert) => {
        setAckModal(alert);
    }, []);

    const confirmAcknowledge = useCallback((alertId, note) => {
        setAlerts((prev) =>
            prev.map((a) =>
                a.alert_id === alertId
                    ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: 'dr.chen', acknowledged_note: note || null }
                    : a
            )
        );
        setAckModal(null);
    }, []);

    const handleBulkAck = useCallback((sev) => {
        setAlerts((prev) =>
            prev.map((a) =>
                !a.acknowledged_at && (sev === 'all' || a.severity === sev)
                    ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: 'dr.chen', acknowledged_note: 'Bulk acknowledged' }
                    : a
            )
        );
    }, []);

    const [bulkOpen, setBulkOpen] = useState(false);

    // Apply filters
    const filtered = useMemo(() => {
        return alerts.filter((a) => {
            if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
            if (typeFilter !== 'all' && a.alert_type !== typeFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!a.title.toLowerCase().includes(q) &&
                    !a.description.toLowerCase().includes(q) &&
                    !(a.related_patient_id?.toLowerCase() || '').includes(q) &&
                    !(a.related_pipeline?.toLowerCase() || '').includes(q)) return false;
            }
            return true;
        });
    }, [alerts, severityFilter, typeFilter, search]);

    const unacked = filtered.filter((a) => !a.acknowledged_at);
    const acked   = filtered.filter((a) =>  a.acknowledged_at);

    // Group unacked by severity
    const bySeverity = {};
    for (const sev of ['critical', 'high', 'warning', 'info']) {
        const group = unacked.filter((a) => a.severity === sev);
        if (group.length > 0) bySeverity[sev] = group;
    }

    const totalUnread = alerts.filter((a) => !a.acknowledged_at).length;

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="t-display" style={{ marginBottom: 4 }}>Alerts</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                        Real-time clinical and operational alerts — acknowledge or dismiss to clear
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Summary chips */}
                    {[
                        { label: `${alerts.filter(a => !a.acknowledged_at && a.severity === 'critical').length} Critical`, sev: 'critical' },
                        { label: `${alerts.filter(a => !a.acknowledged_at && a.severity === 'high').length} High`, sev: 'high' },
                        { label: `${alerts.filter(a => !a.acknowledged_at && a.severity === 'warning').length} Warning`, sev: 'warning' },
                    ].map((chip) => {
                        const sc = severityConfig(chip.sev);
                        return (
                            <span key={chip.sev} style={{
                                fontSize: 11, fontWeight: 700,
                                color: sc.color, background: sc.bg,
                                border: `1px solid ${sc.border}`,
                                padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                            }}>
                                {chip.label}
                            </span>
                        );
                    })}

                    {/* Bulk acknowledge */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setBulkOpen((v) => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 12, fontWeight: 600,
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontFamily: "'Instrument Sans', sans-serif",
                            }}
                        >
                            <Check size={12} /> Acknowledge All
                            <ChevronDown size={11} />
                        </button>
                        {bulkOpen && (
                            <div style={{
                                position: 'absolute', right: 0, top: 34,
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-lg)',
                                zIndex: 100, minWidth: 170, overflow: 'hidden',
                            }}>
                                {[
                                    { label: 'All unread', value: 'all' },
                                    { label: 'Critical only', value: 'critical' },
                                    { label: 'High only', value: 'high' },
                                    { label: 'Warning only', value: 'warning' },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { handleBulkAck(opt.value); setBulkOpen(false); }}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            padding: '9px 14px', fontSize: 12.5,
                                            color: 'var(--text-primary)',
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            fontFamily: "'Instrument Sans', sans-serif",
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-sunken)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 12px',
                    flex: 1, minWidth: 200,
                }}>
                    <SearchIcon size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search alerts, patient IDs, pipelines..."
                        style={{
                            border: 'none', background: 'none', outline: 'none',
                            fontSize: 12.5, color: 'var(--text-primary)',
                            width: '100%',
                            fontFamily: "'Instrument Sans', sans-serif",
                        }}
                    />
                </div>

                {/* Severity filter */}
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    style={{
                        padding: '6px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12.5, color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: "'Instrument Sans', sans-serif",
                    }}
                >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                </select>

                {/* Type filter */}
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{
                        padding: '6px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12.5, color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: "'Instrument Sans', sans-serif",
                    }}
                >
                    <option value="all">All Types</option>
                    <option value="new_critical_admission">Critical Admission</option>
                    <option value="risk_score_spike">Risk Spike</option>
                    <option value="vital_anomaly">Vital Anomaly</option>
                    <option value="pipeline_failure">Pipeline Failure</option>
                    <option value="model_drift_detected">Model Drift</option>
                    <option value="sla_breach">SLA Breach</option>
                </select>

                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, flexShrink: 0 }}>
                    {unacked.length} unread · {acked.length} acknowledged
                </span>
            </div>

            {/* Alert groups */}
            {Object.entries(bySeverity).map(([sev, group]) => (
                <SeverityGroup
                    key={sev}
                    severity={sev}
                    alerts={group}
                    expanded={!!expandedSeverities[sev]}
                    onToggle={() => setExpandedSeverities((prev) => ({ ...prev, [sev]: !prev[sev] }))}
                    onAcknowledge={handleAcknowledge}
                />
            ))}

            {unacked.length === 0 && (
                <div className="card" style={{
                    padding: '40px 24px', textAlign: 'center',
                    color: 'var(--text-muted)',
                }}>
                    <Check size={24} style={{ marginBottom: 8, color: 'var(--risk-low)', opacity: 0.7 }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        All caught up!
                    </p>
                    <p style={{ fontSize: 12 }}>No unread alerts matching your filters.</p>
                </div>
            )}

            {/* Acknowledged section */}
            {acked.length > 0 && (
                <div>
                    <button
                        onClick={() => setExpandedAcked((v) => !v)}
                        style={{
                            width: '100%',
                            display: 'flex', alignItems: 'center',
                            padding: '9px 16px', gap: 10,
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: expandedAcked ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                            cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            ACKNOWLEDGED ({acked.length})
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                        {expandedAcked ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
                    </button>
                    {expandedAcked && (
                        <div style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderTop: 'none',
                            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                            overflow: 'hidden',
                        }}>
                            {acked.map((a) => (
                                <AlertRow key={a.alert_id} alert={a} onAcknowledge={handleAcknowledge} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Acknowledge modal */}
            {ackModal && (
                <AcknowledgeModal
                    alert={ackModal}
                    onConfirm={confirmAcknowledge}
                    onCancel={() => setAckModal(null)}
                />
            )}
        </div>
    );
}
