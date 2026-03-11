import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Bell, Search, AlertTriangle, TrendingUp, Activity,
    Database, BarChart2, Clock, X, Check, ChevronDown, ChevronUp,
} from 'lucide-react';

/* ─── Route → page meta ──────────────────────────────────────────────────── */
const PAGE_META = {
    '/dashboard':     { title: 'Clinical Overview',       subtitle: 'Real-time readmission intelligence' },
    '/patients':      { title: 'Patient Registry',         subtitle: 'Active admissions and care history' },
    '/risk-queue':    { title: 'Risk Queue',               subtitle: 'Prioritised high-risk patient worklist' },
    '/analytics':     { title: 'Analytics',                subtitle: 'Department performance and model metrics' },
    '/reports':       { title: 'Reports',                  subtitle: 'Scheduled and on-demand clinical reports' },
    '/data-platform': { title: 'Data Platform',           subtitle: 'Pipeline observability — health, freshness, and quality' },
    '/alerts':        { title: 'Alerts',                   subtitle: 'Real-time clinical and operational alerts' },
    '/settings':      { title: 'Settings',                 subtitle: 'System configuration and preferences' },
};

function getPageMeta(pathname) {
    if (PAGE_META[pathname]) return PAGE_META[pathname];
    const prefix = Object.keys(PAGE_META).find((k) => k !== '/' && pathname.startsWith(k));
    return prefix ? PAGE_META[prefix] : { title: 'CareIQ', subtitle: '' };
}

/* ─── Alert-type icon map ────────────────────────────────────────────────── */
const ALERT_ICONS = {
    new_critical_admission: AlertTriangle,
    risk_score_spike:       TrendingUp,
    vital_anomaly:          Activity,
    pipeline_failure:       Database,
    model_drift_detected:   BarChart2,
    sla_breach:             Clock,
};

/* ─── Severity config ────────────────────────────────────────────────────── */
function severityConfig(severity) {
    switch (severity) {
        case 'critical': return { color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)' };
        case 'high':     return { color: 'var(--risk-high)',     bg: 'var(--risk-high-bg)',     border: 'var(--risk-high-border)' };
        case 'warning':  return { color: 'var(--risk-medium)',   bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)' };
        default:         return { color: 'var(--accent-primary)', bg: 'var(--accent-light)',    border: 'var(--accent-mid)' };
    }
}

/* ─── Relative time helper ───────────────────────────────────────────────── */
function relTime(isoString) {
    if (!isoString) return '';
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60)   return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
}

/* ─── Mock alert data (used when API is unavailable) ────────────────────── */
const MOCK_ALERTS = [
    {
        alert_id: 'a1',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010000 admitted to Cardiology with risk score 95%',
        created_at: new Date(Date.now() - 120_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: 'PAT-010000',
        related_pipeline: null,
    },
    {
        alert_id: 'a2',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010001 admitted to Cardiology with risk score 91%',
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: 'PAT-010001',
        related_pipeline: null,
    },
    {
        alert_id: 'a3',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010007 risk increased from 45% to 77% in last 6h',
        created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: 'PAT-010007',
        related_pipeline: null,
    },
    {
        alert_id: 'a4',
        alert_type: 'vital_anomaly',
        severity: 'high',
        title: 'Vital Sign Anomaly',
        description: 'PAT-010003: SpO₂ = 88% (expected 95–100%)',
        created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: 'PAT-010003',
        related_pipeline: null,
    },
    {
        alert_id: 'a5',
        alert_type: 'pipeline_failure',
        severity: 'warning',
        title: 'Pipeline Failed',
        description: 'Data Quality Monitor failed at 05:00. 0 rows processed.',
        created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: null,
        related_pipeline: 'Data Quality Monitor',
    },
    {
        alert_id: 'a6',
        alert_type: 'sla_breach',
        severity: 'warning',
        title: 'Data Freshness SLA Breach',
        description: 'fact_admissions has not been updated in 7h (SLA: 6h)',
        created_at: new Date(Date.now() - 55 * 60_000).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_note: null,
        related_patient_id: null,
        related_pipeline: 'EHR Ingestion',
    },
    {
        alert_id: 'a7',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010002 admitted to ICU with risk score 98%',
        created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 1.75 * 3600_000).toISOString(),
        acknowledged_by: 'dr.chen',
        acknowledged_note: 'Escalated to attending. Care team assigned.',
        related_patient_id: 'PAT-010002',
        related_pipeline: null,
    },
    {
        alert_id: 'a8',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010012 risk increased from 38% to 72% in last 6h',
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
        acknowledged_by: 'coordinator.rodriguez',
        acknowledged_note: 'Patient reassigned to high-risk bed. Family notified.',
        related_patient_id: 'PAT-010012',
        related_pipeline: null,
    },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Notification panel item                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
function NotifItem({ alert, onDismiss, onView }) {
    const [hovered, setHovered] = useState(false);
    const isUnread = !alert.acknowledged_at;
    const sc = severityConfig(alert.severity);
    const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
    const navigate = useNavigate();

    const handleView = () => {
        if (alert.related_patient_id) {
            navigate(`/patients/${alert.related_patient_id}`);
        } else if (alert.related_pipeline) {
            navigate('/data-platform');
        } else {
            navigate('/alerts');
        }
        onView?.();
    };

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: 'relative',
                padding: '12px 14px 12px 12px',
                borderLeft: isUnread ? `3px solid ${sc.color}` : '3px solid transparent',
                background: isUnread ? 'var(--bg-surface)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
                transition: 'background var(--t-fast)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {/* Icon */}
                <div style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-md)',
                    background: sc.bg, border: `1px solid ${sc.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Icon size={13} style={{ color: sc.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {alert.title}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {relTime(alert.created_at)}
                        </span>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 6 }}>
                        {alert.description}
                    </p>

                    {/* View link */}
                    {(alert.related_patient_id || alert.related_pipeline) && (
                        <button
                            onClick={handleView}
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--accent-primary)',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                textDecoration: 'none',
                            }}
                        >
                            {alert.related_patient_id ? 'View Patient →' : 'View Pipeline →'}
                        </button>
                    )}
                </div>

                {/* Dismiss × */}
                {hovered && isUnread && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDismiss(alert.alert_id); }}
                        aria-label="Dismiss"
                        style={{
                            position: 'absolute', top: 10, right: 10,
                            width: 20, height: 20,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-sunken)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                            zIndex: 202,
                        }}
                    >
                        <X size={10} />
                    </button>
                )}

            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Notification Panel (dropdown)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
function NotificationPanel({ alerts, onClose, onDismiss, onMarkAllRead }) {
    const navigate = useNavigate();
    const [showEarlier, setShowEarlier] = useState(false);
    const panelRef = useRef(null);

    // Close on click outside — no backdrop z-index conflicts
    useEffect(() => {
        function handleMouseDown(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [onClose]);

    // Split: unread vs acked
    const unread  = alerts.filter((a) => !a.acknowledged_at);
    const earlier = alerts.filter((a) =>  a.acknowledged_at);

    return (
        <>
            <div
                ref={panelRef}
                style={{
                    position: 'absolute',
                    top: 40,
                    right: 0,
                    width: 360,
                    maxHeight: 520,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transformOrigin: 'top right',
                    animation: 'scaleIn 150ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 14px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Notifications
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {unread.length > 0 && (
                            <button
                                onClick={onMarkAllRead}
                                style={{
                                    fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)',
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                }}
                            >
                                Mark all read
                            </button>
                        )}
                        <button
                            onClick={() => { navigate('/alerts'); onClose(); }}
                            style={{
                                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            }}
                        >
                            View all →
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {/* Unread group */}
                    {unread.length > 0 && (
                        <div>
                            <div style={{
                                padding: '7px 14px 4px',
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                                textTransform: 'uppercase', color: 'var(--text-muted)',
                                background: 'var(--bg-base)',
                                borderBottom: '1px solid var(--border-subtle)',
                            }}>
                                UNREAD ({unread.length})
                            </div>
                            {unread.map((a) => (
                                <NotifItem
                                    key={a.alert_id}
                                    alert={a}
                                    onDismiss={onDismiss}
                                    onView={onClose}
                                />
                            ))}
                        </div>
                    )}

                    {/* Earlier (acked) group — collapsible */}
                    {earlier.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowEarlier((v) => !v)}
                                style={{
                                    width: '100%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 14px',
                                    background: 'var(--bg-base)',
                                    border: 'none',
                                    borderTop: '1px solid var(--border-subtle)',
                                    cursor: 'pointer',
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                                    textTransform: 'uppercase', color: 'var(--text-muted)',
                                }}
                            >
                                <span>EARLIER ({earlier.length})</span>
                                {showEarlier ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {showEarlier && earlier.map((a) => (
                                <NotifItem
                                    key={a.alert_id}
                                    alert={a}
                                    onDismiss={onDismiss}
                                    onView={onClose}
                                />
                            ))}
                        </div>
                    )}

                    {alerts.length === 0 && (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            <Check size={18} style={{ marginBottom: 6, opacity: 0.4 }} />
                            <br />
                            No new alerts
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-4px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes pulseDot {
                    0%, 100% { box-shadow: 0 0 0 0 var(--risk-critical); opacity: 1; }
                    50%      { box-shadow: 0 0 0 4px transparent; opacity: 0.8; }
                }
            `}</style>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* TopBar                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function TopBar({ alerts = MOCK_ALERTS, onDismissAlert, onMarkAllRead }) {
    const { pathname } = useLocation();
    const { title, subtitle } = getPageMeta(pathname);

    const [searchHover, setSearchHover] = useState(false);
    const [bellHover,   setBellHover]   = useState(false);
    const [panelOpen,   setPanelOpen]   = useState(false);

    const unread = alerts.filter((a) => !a.acknowledged_at);
    const unreadCount = unread.length;

    const handleDismiss = useCallback((id) => {
        onDismissAlert?.(id);
    }, [onDismissAlert]);

    const handleMarkAll = useCallback(() => {
        onMarkAllRead?.();
    }, [onMarkAllRead]);

    return (
        <header style={{
            height: 54,
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            flexShrink: 0,
            gap: 16,
        }}>
            {/* ── Left: page title ─────────────────────────────────────── */}
            <div style={{ minWidth: 0 }}>
                <p style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: "'Instrument Sans', sans-serif",
                }}>
                    {title}
                </p>
                {subtitle && (
                    <p style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginTop: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {subtitle}
                    </p>
                )}
            </div>

            {/* ── Right: actions ─────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

                {/* Search */}
                <button
                    aria-label="Search"
                    onMouseEnter={() => setSearchHover(true)}
                    onMouseLeave={() => setSearchHover(false)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: searchHover ? 'var(--bg-sunken)' : 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        fontFamily: "'Instrument Sans', sans-serif",
                        transition: 'all var(--t-fast)',
                    }}
                >
                    <Search size={14} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Search
                        <kbd style={{
                            fontSize: 10,
                            background: 'var(--bg-sunken)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 4,
                            padding: '0 4px',
                            color: 'var(--text-muted)',
                            fontFamily: "'DM Mono', monospace",
                            lineHeight: '16px',
                        }}>
                            ⌘K
                        </kbd>
                    </span>
                </button>

                {/* Live indicator */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--risk-low-bg)',
                    border: '1px solid var(--risk-low-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 10px',
                    flexShrink: 0,
                }}>
                    <div
                        className="pulse-dot"
                        style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: 'var(--risk-low)', flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--risk-low)', letterSpacing: '0.05em' }}>
                        LIVE
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                        · 2m ago
                    </span>
                </div>

                {/* Bell + panel */}
                <div style={{ position: 'relative' }}>
                    <button
                        id="notification-bell"
                        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                        onClick={() => setPanelOpen((v) => !v)}
                        onMouseEnter={() => setBellHover(true)}
                        onMouseLeave={() => setBellHover(false)}
                        style={{
                            position: 'relative',
                            width: 34, height: 34,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: panelOpen ? 'var(--bg-sunken)' : bellHover ? 'var(--bg-sunken)' : 'transparent',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            color: panelOpen ? 'var(--text-primary)' : bellHover ? 'var(--text-primary)' : 'var(--text-muted)',
                            transition: 'all var(--t-fast)',
                        }}
                    >
                        <Bell size={17} />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: 6, right: 6,
                                width: 8, height: 8,
                                background: unread.some(a => a.severity === 'critical')
                                    ? 'var(--risk-critical)' : 'var(--risk-medium)',
                                borderRadius: '50%',
                                border: '1.5px solid var(--bg-elevated)',
                                animation: 'pulseDot 2s ease infinite',
                            }} />
                        )}
                    </button>

                    {panelOpen && (
                        <NotificationPanel
                            alerts={alerts}
                            onClose={() => setPanelOpen(false)}
                            onDismiss={handleDismiss}
                            onMarkAllRead={handleMarkAll}
                        />
                    )}
                </div>
            </div>
        </header>
    );
}
