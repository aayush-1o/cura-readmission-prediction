import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Filter } from 'lucide-react';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { useHighRiskToday } from '../services/hooks.js';
import { mockHighRiskPatients } from '../services/mockData.js';

const DEPT_OPTIONS = ['All Departments', 'Cardiology', 'Internal Medicine', 'Pulmonology', 'Nephrology', 'Orthopedics'];
const RISK_TIERS   = ['All Risk Tiers', 'critical', 'high', 'medium', 'low'];
const PAGE_SIZE    = 20;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function riskColor(tier) {
    return tier === 'critical' ? 'var(--risk-critical)'
        : tier === 'high'     ? 'var(--risk-high)'
        : tier === 'medium'   ? 'var(--risk-medium)'
        : 'var(--risk-low)';
}

function cciColor(cci) {
    if (cci >= 8) return 'var(--risk-critical)';
    if (cci >= 6) return 'var(--risk-high)';
    if (cci >= 4) return 'var(--risk-medium)';
    return 'var(--risk-low)';
}

/* ─── Patients page ──────────────────────────────────────────────────────── */
export default function Patients() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [dept,   setDept]   = useState('All Departments');
    const [tier,   setTier]   = useState('All Risk Tiers');
    const [page,   setPage]   = useState(1);

    const { data: rawPatients = [], isLoading } = useHighRiskToday({ limit: 100 });
    const patients = rawPatients.length ? rawPatients : mockHighRiskPatients;

    const filtered = patients.filter((p) => {
        const matchSearch = !search
            || p.patient_id?.toLowerCase().includes(search.toLowerCase())
            || p.department?.toLowerCase().includes(search.toLowerCase());
        const matchDept = dept === 'All Departments' || p.department === dept;
        const matchTier = tier === 'All Risk Tiers'  || p.risk_tier  === tier;
        return matchSearch && matchDept && matchTier;
    });

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const cols = [
        { key: 'patient_id', label: 'Patient ID',  width: 130 },
        { key: 'risk',       label: 'Risk Score',   width: 160 },
        { key: 'department', label: 'Department',   width: 160 },
        { key: 'diagnosis',  label: 'Diagnosis',    width: 200 },
        { key: 'los',        label: 'LOS',          width: 70  },
        { key: 'cci',        label: 'CCI',          width: 60  },
        { key: 'action',     label: '',             width: 110 },
    ];

    /* shared td style */
    const tdBase = {
        padding: '13px 16px',
        fontSize: 13,
        color: 'var(--text-primary)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        fontFamily: "'Instrument Sans', sans-serif",
        transition: 'background 120ms ease',
    };

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Page header ────────────────────────────────────────── */}
            <div>
                <h1 className="t-display">Patient Registry</h1>
                <p className="t-body" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                    Active admissions and care history
                </p>
                <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    Currently admitted patients — all departments
                </p>
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

                {/* Search */}
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                    <Search
                        size={14}
                        style={{
                            position: 'absolute', left: 10, top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                            pointerEvents: 'none',
                        }}
                    />
                    <input
                        className="input"
                        placeholder="Search by patient ID or department…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        style={{ paddingLeft: 34 }}
                    />
                </div>

                {/* Department */}
                <div style={{ position: 'relative' }}>
                    <select
                        className="input"
                        value={dept}
                        onChange={(e) => { setDept(e.target.value); setPage(1); }}
                        style={{ minWidth: 160, paddingRight: 28, appearance: 'none', cursor: 'pointer', fontSize: 13 }}
                    >
                        {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={12} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none',
                    }} />
                </div>

                {/* Risk tier */}
                <div style={{ position: 'relative' }}>
                    <select
                        className="input"
                        value={tier}
                        onChange={(e) => { setTier(e.target.value); setPage(1); }}
                        style={{ minWidth: 140, paddingRight: 28, appearance: 'none', cursor: 'pointer', fontSize: 13 }}
                    >
                        {RISK_TIERS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={12} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none',
                    }} />
                </div>

                <span className="t-label" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                    {filtered.length} patients
                </span>
            </div>

            {/* ── Table card ─────────────────────────────────────────── */}
            <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-card)',
                overflow: 'hidden',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {cols.map((col) => (
                                <th key={col.key} style={{
                                    width: col.width,
                                    padding: '10px 16px',
                                    textAlign: 'left',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '0.07em',
                                    textTransform: 'uppercase',
                                    color: 'var(--text-muted)',
                                    background: 'var(--bg-base)',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    fontFamily: "'Instrument Sans', sans-serif",
                                    whiteSpace: 'nowrap',
                                }}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* ── Skeleton loading ── */}
                        {isLoading && Array.from({ length: 10 }).map((_, i) => (
                            <tr key={i}>
                                {cols.map((col, j) => (
                                    <td key={j} style={{ ...tdBase, borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div className="skeleton" style={{ height: 14, borderRadius: 4 }} />
                                    </td>
                                ))}
                            </tr>
                        ))}

                        {/* ── Data rows ── */}
                        {!isLoading && paged.map((p, i) => {
                            const riskPct = Math.round((p.risk_score || 0) * 100);
                            const isLast  = i === paged.length - 1;

                            const rowTd = {
                                ...tdBase,
                                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                            };

                            return (
                                <tr
                                    key={p.patient_id || i}
                                    style={{
                                        cursor: 'pointer',
                                        animation: `fadeUp 0.25s ease-out ${i * 30}ms both`,
                                    }}
                                    onClick={() => navigate(`/patients/${p.patient_id}`)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll('td').forEach((td) => {
                                            td.style.background = 'var(--bg-sunken)';
                                        });
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll('td').forEach((td) => {
                                            td.style.background = 'var(--bg-elevated)';
                                        });
                                    }}
                                >
                                    {/* Patient ID */}
                                    <td style={rowTd}>
                                        <span style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 12,
                                            color: 'var(--accent-primary)',
                                            cursor: 'pointer',
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.textDecoration = 'underline';
                                                e.currentTarget.style.color = 'var(--accent-hover)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.textDecoration = 'none';
                                                e.currentTarget.style.color = 'var(--accent-primary)';
                                            }}
                                        >
                                            {p.patient_id}
                                        </span>
                                    </td>

                                    {/* Risk Score */}
                                    <td style={rowTd}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                fontFamily: "'DM Mono', monospace",
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: riskColor(p.risk_tier),
                                            }}>
                                                {riskPct}%
                                            </span>
                                            <RiskBadge tier={p.risk_tier} size="sm" showDot={false} />
                                        </div>
                                    </td>

                                    {/* Department */}
                                    <td style={{ ...rowTd, color: 'var(--text-secondary)' }}>
                                        {p.department || '—'}
                                    </td>

                                    {/* Diagnosis */}
                                    <td style={{
                                        ...rowTd,
                                        color: 'var(--text-muted)',
                                        fontSize: 12,
                                        maxWidth: 200,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {p.primary_diagnosis || '—'}
                                    </td>

                                    {/* LOS */}
                                    <td style={rowTd}>
                                        <span style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 13,
                                            color: 'var(--text-primary)',
                                        }}>
                                            {p.length_of_stay_days?.toFixed(1) ?? '—'}
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>d</span>
                                        </span>
                                    </td>

                                    {/* CCI */}
                                    <td style={rowTd}>
                                        <span style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: cciColor(p.charlson_cci ?? p.charlson_comorbidity_index ?? 0),
                                        }}>
                                            {p.charlson_cci ?? p.charlson_comorbidity_index ?? '—'}
                                        </span>
                                    </td>

                                    {/* Action */}
                                    <td style={{ ...rowTd, textAlign: 'right' }}>
                                        <button
                                            className="btn btn-ghost"
                                            style={{ fontSize: 12, padding: '5px 12px' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/patients/${p.patient_id}`);
                                            }}
                                        >
                                            View →
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* ── Empty state ── */}
                        {!isLoading && paged.length === 0 && (
                            <tr>
                                <td
                                    colSpan={cols.length}
                                    style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, background: 'var(--bg-elevated)' }}
                                >
                                    <Filter size={28} style={{ margin: '0 auto 12px', opacity: 0.35, display: 'block' }} />
                                    No patients match your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                    }}>
                        <p className="t-label" style={{ color: 'var(--text-muted)' }}>
                            {filtered.length} patients · Page {page} of {totalPages}
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: 12, padding: '5px 12px' }}
                                disabled={page === 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                ← Prev
                            </button>
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: 12, padding: '5px 12px' }}
                                disabled={page === totalPages}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
