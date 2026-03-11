import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Filter, RefreshCw, ChevronDown, ArrowRight, CheckSquare, Square, Users } from 'lucide-react';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { useHighRiskToday } from '../services/hooks.js';

const DEPT_OPTIONS = ['All', 'Cardiology', 'Internal Medicine', 'Pulmonology', 'Nephrology', 'Orthopedics'];
const TIER_OPTIONS = ['All', 'critical', 'high', 'medium', 'low'];

export default function RiskQueue() {
    const navigate = useNavigate();
    const [dept, setDept] = useState('All');
    const [tier, setTier] = useState('All');
    const [selected, setSelected] = useState(new Set());
    const [search, setSearch] = useState('');

    const { data: patients = [], isLoading, refetch, dataUpdatedAt } = useHighRiskToday({ limit: 50 });

    const filtered = useMemo(() => {
        return patients.filter((p) => {
            const matchDept = dept === 'All' || p.department === dept;
            const matchTier = tier === 'All' || p.risk_tier === tier;
            const matchSearch = !search || p.patient_id?.toLowerCase().includes(search.toLowerCase()) || p.department?.toLowerCase().includes(search.toLowerCase());
            return matchDept && matchTier && matchSearch;
        });
    }, [patients, dept, tier, search]);

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(filtered.map((p) => p.patient_id)));
    const clearAll = () => setSelected(new Set());

    const timeSince = dataUpdatedAt
        ? `${Math.round((Date.now() - dataUpdatedAt) / 60000)} min ago`
        : 'just now';

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '24px', color: '#F9FAFB' }}>
                        Risk Queue
                    </h1>
                    <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>
                        Patients requiring clinical attention — sorted by predicted readmission risk
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span style={{ fontSize: '12px', color: '#4B5563' }}>Last updated: {timeSince}</span>
                    <button className="btn-ghost py-2 px-3" onClick={() => refetch()} aria-label="Refresh">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div
                className="flex flex-wrap items-center gap-3 card py-3"
                style={{ borderRadius: '10px' }}
            >
                {/* Search */}
                <div className="flex items-center gap-2 flex-1 min-w-48">
                    <Search size={14} color="#4B5563" />
                    <input
                        className="bg-transparent border-none outline-none text-sm w-full"
                        style={{ color: '#F9FAFB', fontSize: '13px', fontFamily: '"Inter", system-ui' }}
                        placeholder="Patient ID, department…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Dept filter */}
                <div className="relative">
                    <select
                        className="input py-2 pr-8 appearance-none cursor-pointer"
                        style={{ minWidth: '140px', fontSize: '13px' }}
                        value={dept}
                        onChange={(e) => setDept(e.target.value)}
                    >
                        {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" color="#9CA3AF" />
                </div>

                {/* Tier filter */}
                <div className="relative">
                    <select
                        className="input py-2 pr-8 appearance-none cursor-pointer"
                        style={{ minWidth: '130px', fontSize: '13px' }}
                        value={tier}
                        onChange={(e) => setTier(e.target.value)}
                    >
                        {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t === 'All' ? 'All Risk Tiers' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" color="#9CA3AF" />
                </div>

                {/* Count */}
                <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: 'auto' }}>
                    {filtered.length} patients
                </span>
            </div>

            {/* Bulk actions bar */}
            {selected.size > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
                >
                    <Users size={16} color="#00D4FF" />
                    <span style={{ fontSize: '13px', color: '#00D4FF' }}>{selected.size} selected</span>
                    <button className="btn-primary py-1.5 px-4 text-xs">Assign to Care Coordinator</button>
                    <button className="btn-ghost py-1.5 px-3 text-xs" onClick={clearAll}>Clear</button>
                </motion.div>
            )}

            {/* Patient rows */}
            <div className="space-y-2">
                {/* Select all row */}
                <div className="flex items-center gap-3 px-4 py-2">
                    <button
                        onClick={selected.size === filtered.length ? clearAll : selectAll}
                        style={{ color: '#9CA3AF' }}
                    >
                        {selected.size === filtered.length ? <CheckSquare size={16} color="#00D4FF" /> : <Square size={16} />}
                    </button>
                    <span style={{ fontSize: '12px', color: '#4B5563', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                        Select All
                    </span>
                </div>

                {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => <QueueRowSkeleton key={i} />)
                    : filtered.map((p, i) => (
                        <QueueRow
                            key={p.patient_id || i}
                            patient={p}
                            index={i}
                            isSelected={selected.has(p.patient_id)}
                            onToggle={() => toggleSelect(p.patient_id)}
                            onView={() => navigate(`/patients/${p.patient_id}`)}
                        />
                    ))
                }

                {!isLoading && filtered.length === 0 && (
                    <div className="text-center py-16" style={{ color: '#4B5563' }}>
                        <Filter size={32} className="mx-auto mb-3 opacity-40" />
                        <p style={{ fontSize: '14px' }}>No patients match your filters.</p>
                        <p style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting the department or risk tier filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function QueueRow({ patient: p, index, isSelected, onToggle, onView }) {
    const riskPct = Math.round((p.risk_score || 0) * 100);
    const barColor = p.risk_tier === 'critical' || p.risk_tier === 'high' ? '#EF4444'
        : p.risk_tier === 'medium' ? '#F59E0B' : '#10B981';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            style={{
                background: isSelected ? 'rgba(0,212,255,0.06)' : '#111827',
                border: `1px solid ${isSelected ? 'rgba(0,212,255,0.3)' : '#1F2937'}`,
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'all 150ms ease',
                cursor: 'pointer',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#1C2333'; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = '#111827'; }}
            onClick={onView}
        >
            {/* Checkbox */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                style={{ color: '#4B5563', flexShrink: 0 }}
            >
                {isSelected ? <CheckSquare size={16} color="#00D4FF" /> : <Square size={16} />}
            </button>

            {/* Risk mini gauge */}
            <div className="flex flex-col items-center gap-0.5" style={{ minWidth: '44px' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '17px', fontWeight: 600, color: barColor, lineHeight: 1 }}>
                    {riskPct}%
                </span>
                <div style={{ height: '3px', width: '40px', background: '#1F2937', borderRadius: '2px' }}>
                    <div style={{ height: '100%', width: `${riskPct}%`, background: barColor, borderRadius: '2px', transition: 'width 300ms ease' }} />
                </div>
                <RiskBadge tier={p.risk_tier} size="sm" showDot={false} />
            </div>

            {/* Patient info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#00D4FF', fontWeight: 500 }}>
                        {p.patient_id}
                    </span>
                    {p.emergency_flag && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontWeight: 600 }}>EMERGENCY</span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{p.department || '—'}</span>
                    {p.primary_diagnosis && (
                        <span style={{ fontSize: '12px', color: '#4B5563' }}>{p.primary_diagnosis}</span>
                    )}
                    {p.length_of_stay_days && (
                        <span style={{ fontSize: '12px', color: '#4B5563' }}>LOS: {p.length_of_stay_days.toFixed(1)}d</span>
                    )}
                </div>
            </div>

            {/* Top 3 risk factor chips */}
            <div className="hidden lg:flex flex-wrap gap-1.5">
                {(p.top_risk_factors || ['Prior readmissions']).slice(0, 3).map((f, i) => (
                    <span
                        key={i}
                        style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                            background: '#1C2333', color: '#9CA3AF', border: '1px solid #1F2937',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {f}
                    </span>
                ))}
            </div>

            {/* Top recommendation */}
            <div className="hidden xl:block" style={{ maxWidth: '180px' }}>
                <p style={{ fontSize: '11px', color: '#4B5563', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recommended</p>
                <p style={{ fontSize: '12px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.top_recommendation || 'View care plan'}
                </p>
            </div>

            {/* Action button */}
            <button
                className="btn-ghost py-2 px-3 flex-shrink-0"
                style={{ fontSize: '12px' }}
                onClick={(e) => { e.stopPropagation(); onView(); }}
            >
                Care Plan <ArrowRight size={13} />
            </button>
        </motion.div>
    );
}

function QueueRowSkeleton() {
    return (
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#111827', border: '1px solid #1F2937' }}>
            <div className="skeleton w-4 h-4 rounded" />
            <div className="skeleton w-12 h-10 rounded" />
            <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-48" />
            </div>
            <div className="skeleton h-6 w-48 hidden lg:block" />
            <div className="skeleton h-8 w-24" />
        </div>
    );
}
