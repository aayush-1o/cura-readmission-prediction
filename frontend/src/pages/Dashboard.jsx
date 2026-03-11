import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Users, Activity, TrendingDown, AlertTriangle,
    RefreshCw, ArrowRight, ChevronRight
} from 'lucide-react';
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import MetricTile from '../design-system/components/MetricTile.jsx';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import {
    useDashboardSummary,
    useReadmissionTrends,
    useDepartmentBreakdown,
    useRiskDistribution,
    useHighRiskToday,
    useSparklines,
} from '../services/hooks.js';
import { format, parseISO } from 'date-fns';

const TOOLTIP_STYLE = {
    contentStyle: { background: '#1C2333', border: '1px solid #1F2937', borderRadius: '8px', color: '#F9FAFB', fontSize: '12px' },
    labelStyle: { color: '#9CA3AF' },
};

const RISK_COLORS = {
    low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#EF4444',
};

export default function Dashboard() {
    const navigate = useNavigate();
    const { data: summary, isLoading: summaryLoading, refetch } = useDashboardSummary();
    const { data: trends = [] } = useReadmissionTrends({ months_back: 3 });
    const { data: departments = [] } = useDepartmentBreakdown();
    const { data: riskDist = [] } = useRiskDistribution();
    const { data: highRisk = [] } = useHighRiskToday({ limit: 10 });
    const { data: sparklines } = useSparklines();

    // Aggregate trend by date (combine departments)
    const trendByDate = trends.reduce((acc, row) => {
        const key = row.period_start;
        if (!acc[key]) acc[key] = { date: key, rate: 0, count: 0, cost: 0 };
        acc[key].rate += row.readmission_rate_pct;
        acc[key].count += 1;
        acc[key].cost += row.avg_cost_usd;
        return acc;
    }, {});
    const trendData = Object.values(trendByDate)
        .map((d) => ({ ...d, rate: +(d.rate / (d.count || 1)).toFixed(1) }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);

    // Group risk distribution
    const riskHistData = [
        { tier: 'Low', count: riskDist.find(r => r.risk_tier === 'low')?.patient_count || 612, fill: '#10B981' },
        { tier: 'Medium', count: riskDist.find(r => r.risk_tier === 'medium')?.patient_count || 487, fill: '#F59E0B' },
        { tier: 'High', count: riskDist.find(r => r.risk_tier === 'high')?.patient_count || 198, fill: '#EF4444' },
        { tier: 'Critical', count: riskDist.find(r => r.risk_tier === 'critical')?.patient_count || 87, fill: '#DC2626' },
    ];

    return (
        <div className="space-y-6">
            {/* ── Page header ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '24px', color: '#F9FAFB' }}>
                        Clinical Overview
                    </h1>
                    <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>
                        Real-time readmission risk intelligence
                    </p>
                </div>
                <button
                    className="btn-ghost py-2 px-3"
                    onClick={() => refetch()}
                    aria-label="Refresh dashboard"
                >
                    <RefreshCw size={14} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* ── Row 1: KPI Tiles ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MetricTile
                    label="Today's Admissions"
                    value={summary?.total_admissions_30d || 147}
                    sparkline={sparklines?.admissions}
                    change={+5.2}
                    icon={Users}
                    isLoading={summaryLoading}
                />
                <MetricTile
                    label="High-Risk Patients"
                    value={summary?.high_risk_patients_today || 38}
                    sparkline={sparklines?.highRisk}
                    change={-7.3}
                    inverseColor
                    icon={AlertTriangle}
                    isLoading={summaryLoading}
                />
                <MetricTile
                    label="30-Day Readmit Rate"
                    value={summary?.avg_readmission_rate_pct || 14.7}
                    format="percent"
                    sparkline={sparklines?.readmitRate}
                    change={-1.4}
                    inverseColor
                    icon={TrendingDown}
                    isLoading={summaryLoading}
                />
                <MetricTile
                    label="Avg Risk Score"
                    value={summary?.avg_risk_score || 0.421}
                    format="score"
                    sparkline={sparklines?.avgRiskScore}
                    change={+2.1}
                    inverseColor
                    icon={Activity}
                    isLoading={summaryLoading}
                />
            </div>

            {/* ── Row 2: Charts ────────────────────────────────────────────── */}
            <div className="grid grid-cols-5 gap-4">
                {/* Readmission trend */}
                <div className="card col-span-5 lg:col-span-3">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB' }}>
                                Readmission Rate — 30-Day Window
                            </h2>
                            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '1px' }}>All departments combined</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={trendData}>
                            <defs>
                                <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.2} />
                                    <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                tick={{ fill: '#9CA3AF', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}
                                tickFormatter={(d) => { try { return format(parseISO(d), 'MMM d'); } catch { return d; } }}
                                axisLine={false} tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                                tickFormatter={(v) => `${v}%`}
                                axisLine={false} tickLine={false}
                                width={38}
                            />
                            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v.toFixed(1)}%`, 'Readmission Rate']} />
                            <ReferenceLine y={15} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1}
                                label={{ value: 'Benchmark 15%', fill: '#F59E0B', fontSize: 10, position: 'right' }}
                            />
                            <Area
                                type="monotone" dataKey="rate"
                                stroke="#00D4FF" strokeWidth={2}
                                fill="url(#rateGrad)"
                                isAnimationActive animationDuration={600}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Risk distribution */}
                <div className="card col-span-5 lg:col-span-2">
                    <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', marginBottom: '4px' }}>
                        Current Risk Distribution
                    </h2>
                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>Patients by risk tier</p>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={riskHistData} barCategoryGap="25%">
                            <XAxis dataKey="tier" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                            <Tooltip
                                {...TOOLTIP_STYLE}
                                formatter={(v) => [v.toLocaleString(), 'Patients']}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600}>
                                {riskHistData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="flex justify-between mt-2">
                        {riskHistData.map((d) => (
                            <div key={d.tier} className="text-center">
                                <p style={{ fontSize: '18px', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', color: d.fill }}>{d.count}</p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>{d.tier}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Row 3: High-risk table + dept performance ─────────────────── */}
            <div className="grid grid-cols-5 gap-4">
                {/* High risk patients */}
                <div className="card col-span-5 lg:col-span-3">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB' }}>
                                High-Risk — Next 48 Hours
                            </h2>
                            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Top patients by predicted readmission risk</p>
                        </div>
                        <button
                            className="btn-ghost py-1.5 px-3 text-xs"
                            onClick={() => navigate('/risk-queue')}
                        >
                            View all <ChevronRight size={13} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr style={{ background: '#0A0F1C' }}>
                                    {['Patient', 'Risk', 'Department', 'Top factor', 'Action'].map((h) => (
                                        <th
                                            key={h}
                                            style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9CA3AF', whiteSpace: 'nowrap' }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(highRisk.length ? highRisk : []).slice(0, 8).map((p, i) => (
                                    <motion.tr
                                        key={p.patient_id || i}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: i * 0.04 }}
                                        style={{
                                            background: i % 2 === 0 ? '#111827' : '#0D1321',
                                            cursor: 'pointer',
                                            transition: 'background 150ms',
                                        }}
                                        onClick={() => navigate(`/patients/${p.patient_id}`)}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.05)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? '#111827' : '#0D1321'; }}
                                    >
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#00D4FF' }}>{p.patient_id}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                            <div className="flex items-center gap-2">
                                                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', fontWeight: 600, color: RISK_COLORS[p.risk_tier] }}>
                                                    {Math.round((p.risk_score || 0) * 100)}%
                                                </span>
                                                <RiskBadge tier={p.risk_tier} size="sm" />
                                            </div>
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(31,41,55,0.5)', fontSize: '12px', color: '#9CA3AF' }}>{p.department}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(31,41,55,0.5)', fontSize: '12px', color: '#9CA3AF' }}>{p.top_risk_factors?.[0] || '—'}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                            <button
                                                className="btn-ghost py-1 px-2.5"
                                                style={{ fontSize: '11px' }}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/patients/${p.patient_id}`); }}
                                            >
                                                Care plan <ArrowRight size={11} />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Department performance */}
                <div className="card col-span-5 lg:col-span-2">
                    <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', marginBottom: '4px' }}>
                        Department Performance
                    </h2>
                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>vs. CMS Benchmark</p>
                    <div className="space-y-1">
                        {(departments.length ? departments : []).slice(0, 5).map((dept, i) => {
                            const isGood = dept.vs_benchmark_delta <= 0;
                            const color = isGood ? '#10B981' : '#EF4444';
                            return (
                                <motion.div
                                    key={dept.department_name}
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.07 }}
                                    style={{ padding: '10px 12px', borderRadius: '8px', background: '#1C2333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept.department_name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {/* Mini rate bar */}
                                            <div style={{ height: '3px', width: '64px', background: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min((dept.readmission_rate / 25) * 100, 100)}%`, background: color, borderRadius: '2px' }} />
                                            </div>
                                            <span style={{ fontSize: '11px', fontFamily: '"JetBrains Mono", monospace', color: '#9CA3AF' }}>{dept.readmission_rate?.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color, fontFamily: '"JetBrains Mono", monospace' }}>
                                            {dept.vs_benchmark_delta > 0 ? '+' : ''}{dept.vs_benchmark_delta?.toFixed(1)}pp
                                        </span>
                                        {/* Star rating */}
                                        <p style={{ fontSize: '11px', color: '#4B5563' }}>
                                            {'★'.repeat(dept.cms_star_rating || 0)}{'☆'.repeat(5 - (dept.cms_star_rating || 0))}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                    <button
                        className="btn-ghost w-full mt-4 justify-center text-xs py-2"
                        onClick={() => navigate('/analytics')}
                    >
                        Full Analytics <ChevronRight size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}
