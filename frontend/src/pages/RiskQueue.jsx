import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, ChevronDown, RefreshCw, Filter,
    Users, CheckSquare, Square,
} from 'lucide-react';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { useHighRiskToday } from '../services/hooks.js';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const DEPT_OPTIONS = ['All', 'Cardiology', 'Internal Medicine', 'Pulmonology', 'Nephrology', 'Orthopedics'];
const TIER_OPTIONS = ['All', 'critical', 'high', 'medium', 'low'];

/* ─── MiniRiskGauge ──────────────────────────────────────────────────────── */
function MiniRiskGauge({ score }) {
    const color = score >= 75 ? 'var(--risk-critical)'
        : score >= 50 ? 'var(--risk-high)'
        : score >= 25 ? 'var(--risk-medium)'
        : 'var(--risk-low)';

    const r = 26, cx = 32, cy = 32;
    const totalLength = Math.PI * r;
    const filled = (score / 100) * totalLength;

    return (
        <svg width="64" height="36" viewBox="0 0 64 36" style={{ display: 'block', margin: '0 auto 4px' }}>
            {/* Track */}
            <path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke="var(--border-default)"
                strokeWidth="5"
                strokeLinecap="round"
            />
            {/* Fill */}
            <path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke={color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${totalLength}`}
                style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.4,0,0.2,1)' }}
            />
            {/* Score label */}
            <text
                x={cx} y={cy - 4}
                textAnchor="middle"
                style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    fontFamily: 'DM Mono, monospace',
                    fill: 'var(--text-primary)',
                }}
            >
                {score}%
            </text>
        </svg>
    );
}

/* ─── PatientRiskCard ────────────────────────────────────────────────────── */
function PatientRiskCard({ patient: p, isSelected, onToggle, onClick }) {
    const riskPct = Math.round((p.risk_score || 0) * 100);
    const tierBorderColor = {
        critical: 'var(--risk-critical)',
        high: 'var(--risk-high)',
        medium: 'var(--risk-medium)',
        low: 'var(--risk-low)',
    }[p.risk_tier] || 'var(--border-subtle)';

    return (
        <div
            className="card card-interactive"
            style={{
                padding: '16px 20px',
                marginBottom: 6,
                cursor: 'pointer',
                borderLeft: `3px solid ${tierBorderColor}`,
                outline: isSelected ? '2px solid var(--accent-primary)' : 'none',
                outlineOffset: 1,
            }}
            onClick={onClick}
        >
            {/* Row 1: header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Checkbox */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: 0, display: 'flex' }}
                    >
                        {isSelected
                            ? <CheckSquare size={16} color="var(--accent-primary)" />
                            : <Square size={16} />
                        }
                    </button>

                    <span className="t-mono" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {p.patient_id}
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-sunken)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '2px 8px',
                    }}>
                        {p.department} · LOS {p.length_of_stay_days?.toFixed(0)}d
                    </span>
                    {p.emergency_flag && (
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'var(--risk-critical-bg)',
                            color: 'var(--risk-critical)',
                            border: '1px solid var(--risk-critical-border)',
                            borderRadius: 'var(--radius-pill)',
                            padding: '1px 7px',
                            letterSpacing: '0.04em',
                        }}>
                            EMERGENCY
                        </span>
                    )}
                </div>
                <span className="t-label" style={{ color: 'var(--text-muted)' }}>
                    Admitted {Math.round(p.length_of_stay_days || 0)}d ago
                </span>
            </div>

            {/* Row 2: gauge + factors + actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 16, alignItems: 'start' }}>
                {/* Mini gauge */}
                <div style={{ textAlign: 'center' }}>
                    <MiniRiskGauge score={riskPct} />
                    <RiskBadge tier={p.risk_tier} size="sm" showDot={false} />
                </div>

                {/* Top factors */}
                <div>
                    <p className="t-micro" style={{ marginBottom: 6 }}>TOP RISK FACTORS</p>
                    {(p.top_risk_factors || ['No factor data']).slice(0, 3).map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            <div style={{
                                width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                                background: i === 0 ? 'var(--risk-critical)' : i === 1 ? 'var(--risk-high)' : 'var(--text-muted)',
                            }} />
                            {f}
                        </div>
                    ))}
                    {p.primary_diagnosis && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                            {p.primary_diagnosis}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <button
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                        onClick={(e) => { e.stopPropagation(); onClick(); }}
                    >
                        View Care Plan
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}>
                        Assign <ChevronDown size={11} />
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function QueueCardSkeleton() {
    return (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="skeleton" style={{ height: 12, width: 120 }} />
                <div className="skeleton" style={{ height: 12, width: 100 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: 16 }}>
                <div className="skeleton" style={{ height: 56, borderRadius: 8 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="skeleton" style={{ height: 10, width: '60%' }} />
                    <div className="skeleton" style={{ height: 10, width: '80%' }} />
                    <div className="skeleton" style={{ height: 10, width: '50%' }} />
                </div>
                <div className="skeleton" style={{ height: 32, borderRadius: 8 }} />
            </div>
        </div>
    );
}

/* ─── RiskQueue ──────────────────────────────────────────────────────────── */
export default function RiskQueue() {
    const navigate = useNavigate();
    const [dept, setDept] = useState('All');
    const [tier, setTier] = useState('All');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());

    const { data: patients = [], isLoading, refetch, dataUpdatedAt } = useHighRiskToday({ limit: 50 });

    const filtered = useMemo(() => {
        return patients.filter((p) => {
            const matchDept = dept === 'All' || p.department === dept;
            const matchTier = tier === 'All' || p.risk_tier === tier;
            const matchSearch = !search
                || p.patient_id?.toLowerCase().includes(search.toLowerCase())
                || p.department?.toLowerCase().includes(search.toLowerCase());
            return matchDept && matchTier && matchSearch;
        });
    }, [patients, dept, tier, search]);

    const criticalCount = patients.filter((p) => p.risk_tier === 'critical').length;

    const toggleSelect = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const selectAll = () => setSelected(new Set(filtered.map((p) => p.patient_id)));
    const clearAll = () => setSelected(new Set());

    const timeSince = dataUpdatedAt
        ? `${Math.round((Date.now() - dataUpdatedAt) / 60000)} min ago`
        : 'just now';

    return (
        <div>
            {/* ── Page header ──────────────────────────────────────────── */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="t-display" style={{ marginBottom: 2 }}>Risk Queue</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                        Patients requiring clinical attention — sorted by predicted readmission risk
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Updated {timeSince}</span>
                    <button
                        className="btn btn-ghost"
                        onClick={() => refetch()}
                        aria-label="Refresh"
                        style={{ padding: '6px 10px' }}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* ── Filter bar ───────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
                    <Search size={14} style={{
                        position: 'absolute', left: 10, top: '50%',
                        transform: 'translateY(-50%)', color: 'var(--text-muted)',
                    }} />
                    <input
                        className="input"
                        placeholder="Search patients…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ paddingLeft: 32 }}
                    />
                </div>

                {/* Department */}
                <div style={{ position: 'relative' }}>
                    <select
                        className="input"
                        value={dept}
                        onChange={(e) => setDept(e.target.value)}
                        style={{ paddingRight: 28, appearance: 'none', minWidth: 150, fontSize: 13, cursor: 'pointer' }}
                    >
                        {DEPT_OPTIONS.map((d) => (
                            <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)', pointerEvents: 'none',
                        color: 'var(--text-muted)',
                    }} />
                </div>

                {/* Risk Tier */}
                <div style={{ position: 'relative' }}>
                    <select
                        className="input"
                        value={tier}
                        onChange={(e) => setTier(e.target.value)}
                        style={{ paddingRight: 28, appearance: 'none', minWidth: 140, fontSize: 13, cursor: 'pointer' }}
                    >
                        {TIER_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                                {t === 'All' ? 'All Risk Tiers' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={12} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)', pointerEvents: 'none',
                        color: 'var(--text-muted)',
                    }} />
                </div>

                {/* Count */}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span className="t-mono" style={{ fontWeight: 600, color: 'var(--risk-critical)' }}>
                        {criticalCount}
                    </span>
                    {' '}critical · {filtered.length} shown
                </span>
            </div>

            {/* ── Bulk actions ─────────────────────────────────────────── */}
            <AnimatePresence>
                {selected.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 16px',
                            background: 'var(--accent-light)',
                            border: '1px solid var(--accent-mid)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 12,
                        }}
                    >
                        <Users size={16} color="var(--accent-primary)" />
                        <span style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {selected.size} selected
                        </span>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}>
                            Assign to Care Coordinator
                        </button>
                        <button className="btn btn-ghost" onClick={clearAll} style={{ fontSize: 12 }}>
                            Clear
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Select all row ───────────────────────────────────────── */}
            {filtered.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 20px 8px', marginBottom: 2 }}>
                    <button
                        onClick={selected.size === filtered.length ? clearAll : selectAll}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                        {selected.size === filtered.length
                            ? <CheckSquare size={16} color="var(--accent-primary)" />
                            : <Square size={16} color="var(--text-muted)" />
                        }
                    </button>
                    <span className="t-micro">Select All</span>
                </div>
            )}

            {/* ── Card list ────────────────────────────────────────────── */}
            <div>
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => <QueueCardSkeleton key={i} />)
                    : filtered.length === 0
                    ? (
                        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text-muted)' }}>
                            <Filter size={32} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
                            <p style={{ fontSize: 14, marginBottom: 4 }}>No patients match your filters.</p>
                            <p style={{ fontSize: 12 }}>Try adjusting the department or risk tier filter.</p>
                        </div>
                    )
                    : filtered.map((p, i) => (
                        <motion.div
                            key={p.patient_id || i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.025 }}
                        >
                            <PatientRiskCard
                                patient={p}
                                isSelected={selected.has(p.patient_id)}
                                onToggle={() => toggleSelect(p.patient_id)}
                                onClick={() => navigate(`/patients/${p.patient_id}`)}
                            />
                        </motion.div>
                    ))
                }
            </div>
        </div>
    );
}
