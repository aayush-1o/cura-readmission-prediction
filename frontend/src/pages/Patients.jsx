import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ChevronDown, Filter } from 'lucide-react';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { useHighRiskToday } from '../services/hooks.js';
import { mockHighRiskPatients } from '../services/mockData.js';

const DEPT_OPTIONS = ['All Departments', 'Cardiology', 'Internal Medicine', 'Pulmonology', 'Nephrology', 'Orthopedics'];
const RISK_TIERS = ['All Risk Tiers', 'critical', 'high', 'medium', 'low'];
const PAGE_SIZE = 20;

export default function Patients() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [dept, setDept] = useState('All Departments');
    const [tier, setTier] = useState('All Risk Tiers');
    const [page, setPage] = useState(1);

    // Reuse the high-risk-today endpoint for patient data (includes all admitted patients sorted by risk)
    const { data: rawPatients = [], isLoading } = useHighRiskToday({ limit: 100 });
    const patients = rawPatients.length ? rawPatients : mockHighRiskPatients;

    const filtered = patients.filter((p) => {
        const matchSearch = !search || p.patient_id?.toLowerCase().includes(search.toLowerCase()) || p.department?.toLowerCase().includes(search.toLowerCase());
        const matchDept = dept === 'All Departments' || p.department === dept;
        const matchTier = tier === 'All Risk Tiers' || p.risk_tier === tier;
        return matchSearch && matchDept && matchTier;
    });

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const cols = [
        { key: 'patient_id', label: 'Patient ID', width: '130px' },
        { key: 'risk', label: 'Risk Score', width: '120px' },
        { key: 'department', label: 'Department', width: '160px' },
        { key: 'diagnosis', label: 'Diagnosis', width: '180px' },
        { key: 'los', label: 'LOS', width: '70px' },
        { key: 'cci', label: 'CCI', width: '60px' },
        { key: 'action', label: '', width: '110px' },
    ];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '24px', color: '#F9FAFB' }}>Patients</h1>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>Currently admitted patients — all departments</p>
            </div>

            {/* Filter bar */}
            <div className="card py-3 flex flex-wrap items-center gap-3" style={{ borderRadius: '10px' }}>
                <div className="flex items-center gap-2 flex-1 min-w-48">
                    <Search size={14} color="#4B5563" />
                    <input
                        className="bg-transparent border-none outline-none text-sm w-full"
                        style={{ color: '#F9FAFB', fontSize: '13px' }}
                        placeholder="Search by patient ID or department…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <div className="relative">
                    <select className="input py-2 pr-8 appearance-none cursor-pointer" style={{ minWidth: '160px', fontSize: '13px' }} value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
                        {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" color="#9CA3AF" />
                </div>
                <div className="relative">
                    <select className="input py-2 pr-8 appearance-none cursor-pointer" style={{ minWidth: '140px', fontSize: '13px' }} value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}>
                        {RISK_TIERS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" color="#9CA3AF" />
                </div>
                <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: 'auto' }}>{filtered.length} patients</span>
            </div>

            {/* Table */}
            <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', overflow: 'hidden' }}>
                <table className="w-full border-collapse">
                    <thead>
                        <tr style={{ background: '#0A0F1C' }}>
                            {cols.map((col) => (
                                <th
                                    key={col.key}
                                    style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9CA3AF', whiteSpace: 'nowrap', width: col.width }}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            Array.from({ length: 10 }).map((_, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#111827' : '#0D1321' }}>
                                    {cols.map((col, j) => (
                                        <td key={j} style={{ padding: '12px 14px' }}><div className="skeleton h-4 rounded" /></td>
                                    ))}
                                </tr>
                            ))
                        ) : paged.map((p, i) => {
                            const riskPct = Math.round((p.risk_score || 0) * 100);
                            const riskColor = p.risk_tier === 'critical' || p.risk_tier === 'high' ? '#EF4444' : p.risk_tier === 'medium' ? '#F59E0B' : '#10B981';
                            return (
                                <motion.tr
                                    key={p.patient_id || i}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.025 }}
                                    style={{ background: i % 2 === 0 ? '#111827' : '#0D1321', cursor: 'pointer', transition: 'background 150ms' }}
                                    onClick={() => navigate(`/patients/${p.patient_id}`)}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.05)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? '#111827' : '#0D1321'; }}
                                >
                                    <td style={{ padding: '12px 14px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#00D4FF' }}>{p.patient_id}</span>
                                    </td>
                                    <td style={{ padding: '12px 14px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <div className="flex items-center gap-2">
                                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', fontWeight: 600, color: riskColor }}>{riskPct}%</span>
                                            <RiskBadge tier={p.risk_tier} size="sm" />
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#9CA3AF', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{p.department || '—'}</td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#9CA3AF', borderBottom: '1px solid rgba(31,41,55,0.5)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.primary_diagnosis || '—'}</td>
                                    <td style={{ padding: '12px 14px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#F9FAFB', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{p.length_of_stay_days?.toFixed(1) || '—'}d</td>
                                    <td style={{ padding: '12px 14px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#F59E0B', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{p.charlson_cci || '—'}</td>
                                    <td style={{ padding: '12px 14px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <button
                                            className="btn-ghost py-1.5 px-3"
                                            style={{ fontSize: '11px' }}
                                            onClick={(e) => { e.stopPropagation(); navigate(`/patients/${p.patient_id}`); }}
                                        >
                                            View →
                                        </button>
                                    </td>
                                </motion.tr>
                            );
                        })}
                        {!isLoading && paged.length === 0 && (
                            <tr>
                                <td colSpan={cols.length} className="text-center py-16" style={{ color: '#4B5563', fontSize: '14px' }}>
                                    <Filter size={28} className="mx-auto mb-3 opacity-30" />
                                    No patients match your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #1F2937' }}>
                        <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{filtered.length} patients · Page {page} of {totalPages}</p>
                        <div className="flex gap-2">
                            <button className="btn-ghost py-1 px-3 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                            <button className="btn-ghost py-1 px-3 text-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
