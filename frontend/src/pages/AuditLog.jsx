/**
 * AuditLog.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only page showing the complete, append-only audit log.
 *
 * Design principle (shown in header): APPEND-ONLY means no record in this
 * table is ever updated or deleted — every access event is permanent. That's
 * required by HIPAA for PHI access logs.
 *
 * Features:
 *  - Search/filter: event type, actor, patient ID, free text
 *  - Paginated table: timestamp, user, action badge, resource, IP
 *  - Click any row → slide-out detail panel with full JSONB metadata
 *  - Export CSV button (calls POST /audit-log/export)
 *  - Admin-only banner
 */

import { useState, useMemo } from 'react';
import {
    ScrollText, Shield, Download, ChevronDown, ChevronUp,
    Search, Filter, Eye, Database, RefreshCw, X,
} from 'lucide-react';

/* ─── Static mock data (matches DB seed) ─────────────────────────────────── */
const AUDIT_EVENTS = [
    { audit_id: 'a001', event_at: '2026-03-11T09:31:14', event_type: 'patient_data_access',  actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'patient',     resource_id: 'PAT-010000',    action: 'read',        ip_address: '10.0.0.4',  request_id: 'req-a001', metadata: { page: 'patient_detail', sections: ['overview', 'risk_analysis'] } },
    { audit_id: 'a002', event_at: '2026-03-11T09:31:02', event_type: 'patient_data_access',  actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'care_plan',   resource_id: 'CP-010000-001',action: 'read',        ip_address: '10.0.0.4',  request_id: 'req-a002', metadata: { plan_version: 3 } },
    { audit_id: 'a003', event_at: '2026-03-11T09:30:50', event_type: 'patient_data_access',  actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'prediction',  resource_id: 'PRED-20260311', action: 'read',        ip_address: '10.0.0.4',  request_id: 'req-a003', metadata: { risk_score: 0.95, risk_tier: 'critical' } },
    { audit_id: 'a004', event_at: '2026-03-11T09:15:01', event_type: 'risk_score_computed',  actor_user_id: 'system',               actor_role: 'system',           patient_id: 'PAT-010000', resource_type: 'prediction',  resource_id: 'PRED-20260311', action: 'create',      ip_address: 'internal',  request_id: 'req-b001', metadata: { score: 0.95, model: 'XGBoost v1.0', batch_job: 'ml_batch_20260311' } },
    { audit_id: 'a005', event_at: '2026-03-11T09:15:00', event_type: 'alert_created',        actor_user_id: 'system',               actor_role: 'system',           patient_id: 'PAT-010000', resource_type: 'alert',       resource_id: 'ALT-20260311-001', action: 'create',  ip_address: 'internal',  request_id: 'req-b002', metadata: { alert_type: 'risk_score_spike', severity: 'critical' } },
    { audit_id: 'a006', event_at: '2026-03-11T08:05:00', event_type: 'vital_recorded',       actor_user_id: 'system',               actor_role: 'system',           patient_id: 'PAT-010000', resource_type: 'patient',     resource_id: 'PAT-010000',    action: 'create',      ip_address: '10.0.1.1',  request_id: 'req-c001', metadata: { heart_rate: 98, spo2: 94.0, bp: '142/88' } },
    { audit_id: 'a007', event_at: '2026-03-11T07:45:11', event_type: 'patient_data_access',  actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'patient',     resource_id: 'PAT-010000',    action: 'read',        ip_address: '10.0.0.4',  request_id: 'req-a004', metadata: { view_duration_s: 312 } },
    { audit_id: 'a008', event_at: '2026-03-11T07:30:22', event_type: 'care_plan_updated',    actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'care_plan',   resource_id: 'CP-010000-001', action: 'update',      ip_address: '10.0.0.4',  request_id: 'req-a005', metadata: { change: 'medication_added', medication: 'Furosemide 40mg IV' } },
    { audit_id: 'a009', event_at: '2026-03-11T04:00:45', event_type: 'ml_batch_run',         actor_user_id: 'system',               actor_role: 'system',           patient_id: null,          resource_type: 'prediction',  resource_id: 'BATCH-20260311',action: 'create',      ip_address: 'internal',  request_id: 'req-d001', metadata: { patients_scored: 1384, duration_s: 78, model: 'XGBoost v1.0' } },
    { audit_id: 'a010', event_at: '2026-03-11T03:02:09', event_type: 'pipeline_completed',   actor_user_id: 'system',               actor_role: 'system',           patient_id: null,          resource_type: 'pipeline',    resource_id: 'dbt_run_20260311', action: 'create',  ip_address: 'internal',  request_id: 'req-e001', metadata: { models: 13, tests_pass: 12, tests_warn: 1, duration_s: 127 } },
    { audit_id: 'a011', event_at: '2026-03-11T02:04:46', event_type: 'pipeline_completed',   actor_user_id: 'system',               actor_role: 'system',           patient_id: null,          resource_type: 'pipeline',    resource_id: 'ehr_ingestion_20260311', action: 'create', ip_address: 'internal', request_id: 'req-f001', metadata: { rows_loaded: 51420, dq_score: 99.2, duration_s: 272 } },
    { audit_id: 'a012', event_at: '2026-03-11T10:03:01', event_type: 'alert_acknowledged',   actor_user_id: 'coord.james@careiq',   actor_role: 'care_coordinator', patient_id: 'PAT-010000', resource_type: 'alert',       resource_id: 'ALT-20260311-001', action: 'acknowledge', ip_address: '10.0.0.7', request_id: 'req-a011', metadata: { note: 'Calling attending physician', follow_up_scheduled: true } },
    { audit_id: 'a013', event_at: '2026-03-11T10:02:33', event_type: 'patient_data_access',  actor_user_id: 'coord.james@careiq',   actor_role: 'care_coordinator', patient_id: 'PAT-010000', resource_type: 'alert',       resource_id: 'ALT-20260311-001', action: 'read',  ip_address: '10.0.0.7', request_id: 'req-a010', metadata: { viewed_alert: 'risk_score_spike' } },
    { audit_id: 'a014', event_at: '2026-03-11T09:00:00', event_type: 'report_exported',      actor_user_id: 'analyst@careiq',       actor_role: 'analyst',          patient_id: null,          resource_type: 'report',      resource_id: 'RPT-20260311',  action: 'export',      ip_address: '10.0.0.9',  request_id: 'req-g001', metadata: { report_type: 'risk_summary', rows: 1384, format: 'csv' } },
    { audit_id: 'a015', event_at: '2026-03-10T14:30:01', event_type: 'care_plan_acknowledged',actor_user_id: 'dr.chen@careiq',      actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'care_plan',   resource_id: 'CP-010000-001', action: 'acknowledge', ip_address: '10.0.0.4', request_id: 'req-h001', metadata: { recommendation_index: 1, note: 'Home health arranged' } },
    { audit_id: 'a016', event_at: '2026-03-10T16:00:00', event_type: 'audit_log_accessed',   actor_user_id: 'admin@careiq',         actor_role: 'admin',            patient_id: null,          resource_type: 'audit_log',   resource_id: null,            action: 'read',        ip_address: '10.0.0.2',  request_id: 'req-j001', metadata: { filters: { date_range: '7d' }, rows_returned: 250 } },
    { audit_id: 'a017', event_at: '2026-03-10T16:05:00', event_type: 'audit_log_exported',   actor_user_id: 'admin@careiq',         actor_role: 'admin',            patient_id: null,          resource_type: 'audit_log',   resource_id: 'EXPORT-20260310', action: 'export',  ip_address: '10.0.0.2',  request_id: 'req-j002', metadata: { rows: 250, format: 'csv' } },
    { audit_id: 'a018', event_at: '2026-03-09T16:00:00', event_type: 'care_plan_created',    actor_user_id: 'system',               actor_role: 'system',           patient_id: 'PAT-010000', resource_type: 'care_plan',   resource_id: 'CP-010000-001', action: 'create',      ip_address: 'internal',  request_id: 'req-k001', metadata: { recommendations: 5, model: 'XGBoost v1.0' } },
    { audit_id: 'a019', event_at: '2026-03-09T14:00:05', event_type: 'patient_admitted',     actor_user_id: 'dr.chen@careiq',       actor_role: 'clinician',        patient_id: 'PAT-010000', resource_type: 'patient',     resource_id: 'PAT-010000',    action: 'create',      ip_address: '10.0.0.4',  request_id: 'req-k004', metadata: { department: 'Cardiology', diagnosis: 'CHF Exacerbation', icd10: 'I50.30' } },
    { audit_id: 'a020', event_at: '2026-03-10T11:00:03', event_type: 'vital_recorded',       actor_user_id: 'system',               actor_role: 'system',           patient_id: 'PAT-010000', resource_type: 'patient',     resource_id: 'PAT-010000',    action: 'create',      ip_address: '10.0.1.1',  request_id: 'req-h003', metadata: { heart_rate: 91, spo2: 96.0, bp: '138/84' } },
];

const ALL_EVENT_TYPES = [...new Set(AUDIT_EVENTS.map(e => e.event_type))].sort();
const ALL_ACTORS     = [...new Set(AUDIT_EVENTS.map(e => e.actor_user_id).filter(Boolean))].sort();

/* ─── Action badge ───────────────────────────────────────────────────────── */
function ActionBadge({ action }) {
    const MAP = {
        read:        { color: 'var(--accent-primary)', bg: 'var(--accent-light)',     border: 'var(--accent-mid)' },
        create:      { color: 'var(--risk-low)',       bg: 'var(--risk-low-bg)',      border: 'var(--risk-low-border)' },
        update:      { color: 'var(--risk-medium)',    bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)' },
        acknowledge: { color: 'var(--risk-low)',       bg: 'var(--risk-low-bg)',      border: 'var(--risk-low-border)' },
        export:      { color: 'var(--risk-medium)',    bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)' },
        delete:      { color: 'var(--risk-critical)',  bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)' },
    };
    const c = MAP[action] || { color: 'var(--text-muted)', bg: 'var(--bg-sunken)', border: 'var(--border-subtle)' };
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: c.color, background: c.bg, border: `1px solid ${c.border}`,
            padding: '2px 8px', borderRadius: 'var(--radius-pill)',
            fontFamily: "'DM Mono', monospace",
        }}>
            {action}
        </span>
    );
}

/* ─── Role chip ──────────────────────────────────────────────────────────── */
function RoleChip({ role }) {
    const MAP = {
        clinician:        { color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
        admin:            { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
        care_coordinator: { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
        analyst:          { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
        system:           { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
        api:              { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    };
    const c = MAP[role] || MAP.system;
    return (
        <span style={{
            fontSize: 10, fontWeight: 600,
            color: c.color, background: c.bg, border: `1px solid ${c.border}`,
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
        }}>
            {role?.replace(/_/g, ' ')}
        </span>
    );
}

/* ─── Event type label ───────────────────────────────────────────────────── */
function EventTypeLabel({ type }) {
    return (
        <span style={{
            fontSize: 11.5, fontFamily: "'DM Mono', monospace",
            color: 'var(--text-secondary)', fontWeight: 500,
        }}>
            {type?.replace(/_/g, ' ')}
        </span>
    );
}

/* ─── Detail panel ───────────────────────────────────────────────────────── */
function AuditDetailPanel({ event, onClose }) {
    if (!event) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
            background: 'var(--bg-elevated)',
            borderLeft: '2px solid var(--border-default)',
            boxShadow: '-6px 0 30px rgba(0,0,0,0.1)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            animation: 'slideIn 180ms cubic-bezier(0.16,1,0.3,1)',
            fontFamily: "'Instrument Sans', sans-serif",
        }}>
            <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                            {event.event_type?.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {event.event_at?.replace('T', ' ')} UTC
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}>
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Core fields */}
                {[
                    ['Audit ID',    event.audit_id],
                    ['Request ID',  event.request_id || '—'],
                    ['Actor',       event.actor_user_id || 'system'],
                    ['Role',        event.actor_role],
                    ['Patient',     event.patient_id || '—'],
                    ['Resource',    `${event.resource_type} / ${event.resource_id || '—'}`],
                    ['Action',      event.action],
                    ['IP Address',  event.ip_address || '—'],
                ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 90 }}>{label}</span>
                        <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
                    </div>
                ))}

                {/* Metadata JSONB */}
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <section>
                        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                            METADATA JSONB
                        </div>
                        <pre style={{
                            margin: 0, padding: '10px 12px',
                            background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 10.5, fontFamily: "'DM Mono', monospace",
                            color: 'var(--text-secondary)', lineHeight: 1.7,
                            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                            {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                    </section>
                )}

                {/* Immutability notice */}
                <div style={{ marginTop: 4, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginBottom: 3 }}>🔒 Append-only record</p>
                    <p style={{ fontSize: 10.5, color: '#166534', lineHeight: 1.5 }}>
                        This record cannot be modified or deleted. The audit_log table is a tamper-evident trail as required by HIPAA §164.312(b).
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AuditLog() {
    const [search,     setSearch]     = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [actorFilter,setActorFilter]= useState('');
    const [selectedRow,setSelectedRow]= useState(null);
    const [page,       setPage]       = useState(0);
    const PAGE_SIZE = 15;

    const filtered = useMemo(() => {
        return AUDIT_EVENTS.filter(e => {
            const q = search.toLowerCase();
            if (typeFilter  && e.event_type    !== typeFilter)  return false;
            if (actorFilter && e.actor_user_id !== actorFilter) return false;
            if (q && ![e.event_type, e.actor_user_id, e.patient_id, e.resource_id, e.action, e.ip_address].join(' ').toLowerCase().includes(q)) return false;
            return true;
        });
    }, [search, typeFilter, actorFilter]);

    const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    const handleExport = () => {
        const headers = ['event_at', 'event_type', 'actor_user_id', 'actor_role', 'patient_id', 'resource_type', 'resource_id', 'action', 'ip_address', 'request_id'];
        const csv = [
            headers.join(','),
            ...filtered.map(e => headers.map(h => JSON.stringify(e[h] ?? '')).join(','))
        ].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `careiq_audit_log_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    };

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h1 className="t-display">Audit Log</h1>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                            ADMIN ONLY
                        </span>
                    </div>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                        Append-only audit trail — every PHI access permanently recorded for HIPAA compliance
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                >
                    <Download size={14} />
                    Export CSV
                </button>
            </div>

            {/* HIPAA compliance banner */}
            <div style={{ padding: '12px 16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Shield size={15} style={{ color: '#0284c7', flexShrink: 0, marginTop: 1 }} />
                <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e', marginBottom: 2 }}>
                        Append-Only HIPAA Audit Trail
                    </p>
                    <p style={{ fontSize: 12, color: '#0369a1', lineHeight: 1.55 }}>
                        The <code style={{ fontFamily: "'DM Mono', monospace", background: '#e0f2fe', padding: '0 4px', borderRadius: 4 }}>audit_log</code> table
                        {' '}has <strong>no UPDATE or DELETE</strong> statements. Every access to patient data is permanently recorded — required by HIPAA §164.312(b).
                        In production, this table has a write-only service account: the application can INSERT but never modify existing records.
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        placeholder="Search patient, actor, resource…"
                        style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 34, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12.5, fontFamily: "'Instrument Sans', sans-serif", background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Event type */}
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }} style={{ height: 34, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12.5, padding: '0 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: "'Instrument Sans', sans-serif", cursor: 'pointer' }}>
                    <option value="">All event types</option>
                    {ALL_EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>

                {/* Actor */}
                <select value={actorFilter} onChange={e => { setActorFilter(e.target.value); setPage(0); }} style={{ height: 34, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12.5, padding: '0 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: "'Instrument Sans', sans-serif", cursor: 'pointer' }}>
                    <option value="">All users</option>
                    {ALL_ACTORS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>

                {(search || typeFilter || actorFilter) && (
                    <button onClick={() => { setSearch(''); setTypeFilter(''); setActorFilter(''); setPage(0); }} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer' }}>
                        <X size={11} /> Clear
                    </button>
                )}

                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                    {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', minWidth: 760 }}>
                        <thead>
                            <tr>
                                {['TIMESTAMP', 'USER', 'EVENT TYPE', 'ACTION', 'RESOURCE', 'PATIENT', 'IP'].map(h => (
                                    <th key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '10px 14px', background: 'var(--bg-base)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                                        No audit events match the current filters.
                                    </td>
                                </tr>
                            ) : pageData.map((e) => (
                                <tr
                                    key={e.audit_id}
                                    onClick={() => setSelectedRow(selectedRow?.audit_id === e.audit_id ? null : e)}
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedRow?.audit_id === e.audit_id ? 'var(--accent-light)' : 'transparent',
                                        transition: 'background var(--t-fast)',
                                    }}
                                    onMouseEnter={ev => { if (selectedRow?.audit_id !== e.audit_id) ev.currentTarget.style.background = 'var(--bg-sunken)'; }}
                                    onMouseLeave={ev => { if (selectedRow?.audit_id !== e.audit_id) ev.currentTarget.style.background = 'transparent'; }}
                                >
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                            {e.event_at?.replace('T', ' ').split('.')[0]}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {e.actor_user_id || 'system'}
                                            </span>
                                            {e.actor_role && <RoleChip role={e.actor_role} />}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <EventTypeLabel type={e.event_type} />
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <ActionBadge action={e.action} />
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: 'var(--text-secondary)' }}>
                                            {e.resource_type}
                                            {e.resource_id && <span style={{ color: 'var(--text-muted)' }}> / {e.resource_id.length > 20 ? e.resource_id.slice(0, 20) + '…' : e.resource_id}</span>}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        {e.patient_id
                                            ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--accent-primary)', fontWeight: 600 }}>{e.patient_id}</span>
                                            : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
                                            {e.ip_address || '—'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                            Page {page + 1} of {totalPages} · {filtered.length} total events
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
                            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next →</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail side panel */}
            {selectedRow && (
                <>
                    <div
                        onClick={() => setSelectedRow(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 49, backdropFilter: 'blur(2px)' }}
                    />
                    <AuditDetailPanel event={selectedRow} onClose={() => setSelectedRow(null)} />
                </>
            )}
        </div>
    );
}
