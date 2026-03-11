import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, ArrowRight, Filter } from 'lucide-react';
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
    ReferenceLine,
} from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import {
    useReadmissionTrends,
    useDepartmentBreakdown,
    useRiskDistribution,
    useClusterProfiles,
} from '../services/hooks.js';
import { mockDepartments, mockTrends } from '../services/mockData.js';

const TABS = ['Readmission Trends', 'Department Performance', 'Cohort Analysis', 'Model Performance'];
const TOOLTIP_STYLE = {
    contentStyle: { background: '#1C2333', border: '1px solid #1F2937', borderRadius: '8px', color: '#F9FAFB', fontSize: '12px' },
    labelStyle: { color: '#9CA3AF' },
};

const DEPT_COLORS = ['#00D4FF', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'];

export default function Analytics() {
    const [tab, setTab] = useState('Readmission Trends');

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '24px', color: '#F9FAFB' }}>
                    Analytics & Performance
                </h1>
                <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>
                    Clinical intelligence, department benchmarks, and model monitoring
                </p>
            </div>

            {/* Tab bar */}
            <div
                className="flex gap-0.5"
                style={{ background: '#111827', borderRadius: '10px', padding: '4px', border: '1px solid #1F2937', width: 'fit-content' }}
            >
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '7px 16px', borderRadius: '7px', fontSize: '13px',
                            fontWeight: tab === t ? 600 : 400,
                            color: tab === t ? '#F9FAFB' : '#9CA3AF',
                            background: tab === t ? '#1C2333' : 'transparent',
                            transition: 'all 150ms ease',
                            border: tab === t ? '1px solid #1F2937' : '1px solid transparent',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    {tab === 'Readmission Trends' && <TrendsTab />}
                    {tab === 'Department Performance' && <DeptTab />}
                    {tab === 'Cohort Analysis' && <CohortTab />}
                    {tab === 'Model Performance' && <ModelTab />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function TrendsTab() {
    const { data: trends = [] } = useReadmissionTrends({ months_back: 6 });
    const allData = trends.length ? trends : mockTrends;

    const byDept = allData.reduce((acc, r) => {
        if (!acc[r.department_name]) acc[r.department_name] = [];
        acc[r.department_name].push({ date: r.period_start, rate: parseFloat(r.readmission_rate_pct?.toFixed(1)) });
        return acc;
    }, {});

    const departments = Object.keys(byDept).slice(0, 4);
    const dateUnion = [...new Set(allData.map(r => r.period_start))].sort().slice(-60);

    const chartData = dateUnion.map((date) => {
        const row = { date };
        departments.forEach((dept) => {
            const entry = byDept[dept]?.find(d => d.date === date);
            row[dept] = entry?.rate ?? null;
        });
        return row;
    });

    return (
        <div className="space-y-4">
            <div className="card">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB' }}>
                            Readmission Rate by Department — 6 Months
                        </h2>
                        <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Dashed line = 15% CMS benchmark</p>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                        <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: '#9CA3AF', fontSize: 11 }}
                            tickFormatter={(d) => { try { return format(parseISO(d), 'MMM d'); } catch { return ''; } }}
                            axisLine={false} tickLine={false}
                        />
                        <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={38} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, undefined]} />
                        <ReferenceLine y={15} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'Benchmark', fill: '#F59E0B', fontSize: 10, position: 'right' }} />
                        <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px', color: '#9CA3AF' }} />
                        {departments.map((dept, i) => (
                            <Line key={dept} type="monotone" dataKey={dept} stroke={DEPT_COLORS[i]} strokeWidth={2} dot={false} connectNulls isAnimationActive animationDuration={600} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function DeptTab() {
    const { data: departments = [] } = useDepartmentBreakdown();
    const depts = departments.length ? departments : mockDepartments;
    const [sortKey, setSortKey] = useState('vs_benchmark_delta');
    const [sortDir, setSortDir] = useState('desc');

    const sorted = [...depts].sort((a, b) => {
        const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
    });

    const cols = [
        { key: 'department_name', label: 'Department', numeric: false },
        { key: 'readmission_rate', label: 'Rate %', numeric: true },
        { key: 'benchmark_readmission_rate', label: 'Benchmark %', numeric: true },
        { key: 'vs_benchmark_delta', label: 'vs Benchmark', numeric: true },
        { key: 'avg_los_days', label: 'Avg LOS', numeric: true },
        { key: 'cms_star_rating', label: 'CMS Stars', numeric: true },
    ];

    return (
        <div className="card overflow-hidden">
            <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', marginBottom: '16px' }}>
                Department Performance vs. CMS Benchmark
            </h2>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr style={{ background: '#0A0F1C' }}>
                            {cols.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={() => { setSortKey(col.key); setSortDir(sortKey === col.key && sortDir === 'desc' ? 'asc' : 'desc'); }}
                                    style={{ padding: '10px 16px', textAlign: col.numeric ? 'right' : 'left', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9CA3AF', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((dept, i) => {
                            const isGood = (dept.vs_benchmark_delta || 0) <= 0;
                            const deltaColor = isGood ? '#10B981' : '#EF4444';
                            return (
                                <motion.tr
                                    key={dept.department_name}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.04 }}
                                    style={{ background: i % 2 === 0 ? '#111827' : '#0D1321' }}
                                >
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#F9FAFB', fontWeight: 500, borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        {dept.department_name}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#F9FAFB' }}>
                                            {dept.readmission_rate?.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#9CA3AF' }}>
                                            {dept.benchmark_readmission_rate?.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <span
                                            style={{
                                                fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', fontWeight: 600, color: deltaColor,
                                                background: isGood ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                padding: '2px 8px', borderRadius: '4px',
                                            }}
                                        >
                                            {dept.vs_benchmark_delta > 0 ? '+' : ''}{dept.vs_benchmark_delta?.toFixed(1)}pp
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#9CA3AF', fontFamily: '"JetBrains Mono", monospace', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        {dept.avg_los_days?.toFixed(1)}d
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                                        <span style={{ fontSize: '13px', color: dept.cms_star_rating >= 4 ? '#10B981' : dept.cms_star_rating <= 2 ? '#EF4444' : '#F59E0B' }}>
                                            {'★'.repeat(dept.cms_star_rating || 0)}{'☆'.repeat(5 - (dept.cms_star_rating || 0))}
                                        </span>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function CohortTab() {
    const { data: clusters = [] } = useClusterProfiles();

    // Mock scatter data (UMAP embedding)
    const scatterData = [
        ...Array.from({ length: 40 }, (_, i) => ({ x: -2 + Math.random() * 4, y: -1.5 + Math.random() * 3, cluster: 'Complex Elderly', fill: '#EF4444', risk: 0.6 + Math.random() * 0.3 })),
        ...Array.from({ length: 50 }, (_, i) => ({ x: 2 + Math.random() * 3, y: -0.5 + Math.random() * 2, cluster: 'Young Comorbid', fill: '#F59E0B', risk: 0.35 + Math.random() * 0.25 })),
        ...Array.from({ length: 60 }, (_, i) => ({ x: -1 + Math.random() * 3, y: 2 + Math.random() * 3, cluster: 'Low-Risk Elective', fill: '#10B981', risk: 0.1 + Math.random() * 0.2 })),
        ...Array.from({ length: 30 }, (_, i) => ({ x: 4 + Math.random() * 2, y: 2.5 + Math.random() * 2, cluster: 'Chronic Disease', fill: '#3B82F6', risk: 0.45 + Math.random() * 0.2 })),
    ];

    const cohortSummaries = [
        { name: 'Complex Elderly MultiMorbid', size: 487, avgRisk: 0.71, color: '#EF4444' },
        { name: 'Young Comorbid Patients', size: 623, avgRisk: 0.48, color: '#F59E0B' },
        { name: 'Low Risk Elective', size: 892, avgRisk: 0.16, color: '#10B981' },
        { name: 'Chronic Disease Mgmt', size: 341, avgRisk: 0.52, color: '#3B82F6' },
    ];

    return (
        <div className="grid grid-cols-3 gap-4">
            {/* UMAP Scatter */}
            <div className="card col-span-2">
                <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', marginBottom: '4px' }}>
                    Patient Cohort Map (UMAP Embedding)
                </h2>
                <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
                    Each point = one patient. Color = cluster assignment. Proximity = clinical similarity.
                </p>
                <ResponsiveContainer width="100%" height={340}>
                    <ScatterChart>
                        <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" tick={{ fill: '#4B5563', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'UMAP-1', fill: '#4B5563', fontSize: 11, position: 'insideBottom', offset: -4 }} />
                        <YAxis type="number" dataKey="y" tick={{ fill: '#4B5563', fontSize: 10 }} axisLine={false} tickLine={false} width={30} label={{ value: 'UMAP-2', fill: '#4B5563', fontSize: 11, angle: -90, position: 'insideLeft' }} />
                        <Tooltip {...TOOLTIP_STYLE} content={<CustomScatterTooltip />} />
                        {['Complex Elderly', 'Young Comorbid', 'Low-Risk Elective', 'Chronic Disease'].map((cluster, ci) => (
                            <Scatter
                                key={cluster}
                                name={cluster}
                                data={scatterData.filter(d => d.cluster === cluster)}
                                fill={['#EF4444', '#F59E0B', '#10B981', '#3B82F6'][ci]}
                                fillOpacity={0.7}
                                isAnimationActive
                            />
                        ))}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* Cohort summaries */}
            <div className="card space-y-3">
                <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', marginBottom: '8px' }}>
                    Cohort Profiles
                </h2>
                {cohortSummaries.map((cohort, i) => (
                    <motion.div
                        key={cohort.name}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        style={{ padding: '12px', background: '#1C2333', borderRadius: '8px', border: '1px solid #1F2937' }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: cohort.color, flexShrink: 0 }} />
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cohort.name}
                            </p>
                        </div>
                        <div className="flex justify-between">
                            <div>
                                <p style={{ fontSize: '18px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#F9FAFB' }}>{cohort.size.toLocaleString()}</p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>Patients</p>
                            </div>
                            <div className="text-right">
                                <p style={{ fontSize: '18px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: cohort.color }}>{Math.round(cohort.avgRisk * 100)}%</p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>Avg Risk</p>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function CustomScatterTooltip({ active, payload }) {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
        <div style={{ background: '#1C2333', border: '1px solid #1F2937', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#F9FAFB' }}>
            <p style={{ fontWeight: 600, color: d.fill }}>{d.cluster}</p>
            <p style={{ color: '#9CA3AF' }}>Risk: {Math.round(d.risk * 100)}%</p>
        </div>
    );
}

function ModelTab() {
    const aucRoc = 0.84;
    const radius = 60;
    const circumference = Math.PI * radius;
    const offset = circumference * (1 - aucRoc);

    // Feature importance data
    const featureImportance = [
        { feature: 'Prior readmissions (1yr)', importance: 0.28 },
        { feature: 'Charlson CCI', importance: 0.21 },
        { feature: 'ICU stay flag', importance: 0.18 },
        { feature: 'High utilizer', importance: 0.15 },
        { feature: 'Prior admits (12m)', importance: 0.12 },
        { feature: 'CHF diagnosis', importance: 0.10 },
        { feature: 'Length of stay', importance: 0.08 },
        { feature: 'Age', importance: 0.06 },
    ];

    // Fairness by group
    const fairnessData = [
        { group: 'Male', auc: 0.83, calibration: 0.97 },
        { group: 'Female', auc: 0.86, calibration: 0.98 },
        { group: 'Medicare', auc: 0.82, calibration: 0.95 },
        { group: 'Medicaid', auc: 0.79, calibration: 0.93 },
        { group: 'Commercial', auc: 0.87, calibration: 0.99 },
        { group: 'Age 18-45', auc: 0.81, calibration: 0.96 },
        { group: 'Age 46-65', auc: 0.84, calibration: 0.97 },
        { group: 'Age 65+', auc: 0.85, calibration: 0.98 },
    ];

    return (
        <div className="grid grid-cols-2 gap-4">
            {/* AUC gauge + model info */}
            <div className="card flex flex-col items-center gap-4">
                <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '16px', color: '#F9FAFB', alignSelf: 'flex-start' }}>Model Performance</h2>

                <svg width="160" height="100" viewBox="0 0 160 100" overflow="visible">
                    <defs>
                        <linearGradient id="aucGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10B981" />
                            <stop offset="55%" stopColor="#F59E0B" />
                            <stop offset="100%" stopColor="#00D4FF" />
                        </linearGradient>
                    </defs>
                    <path d="M 10 100 A 70 70 0 0 1 150 100" fill="none" stroke="#1F2937" strokeWidth="12" strokeLinecap="round" />
                    <motion.path
                        d="M 10 100 A 70 70 0 0 1 150 100"
                        fill="none" stroke="url(#aucGrad)" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                    <text x="80" y="88" textAnchor="middle" fill="#00D4FF" fontFamily='"JetBrains Mono", monospace' fontSize="22" fontWeight="600">{(aucRoc * 100).toFixed(0)}%</text>
                    <text x="80" y="100" textAnchor="middle" fill="#9CA3AF" fontSize="11">AUC-ROC</text>
                </svg>

                <div className="w-full space-y-2">
                    {[
                        ['Model', 'XGBoost v1.0'],
                        ['Training data', '~12,000 admissions'],
                        ['Last retrained', '2024-10-01'],
                        ['Precision @ 0.5', '0.71'],
                        ['Recall @ 0.5', '0.79'],
                        ['F1 Score', '0.75'],
                    ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{k}</span>
                            <span style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: '#F9FAFB' }}>{v}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature importance + fairness */}
            <div className="space-y-4">
                <div className="card">
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '14px' }}>Top Feature Importances</h3>
                    <div className="space-y-2.5">
                        {featureImportance.map((f, i) => (
                            <div key={f.feature}>
                                <div className="flex justify-between mb-1">
                                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{f.feature}</span>
                                    <span style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: '#00D4FF' }}>{(f.importance * 100).toFixed(0)}%</span>
                                </div>
                                <div style={{ height: '4px', background: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${f.importance * 100 / 0.28 * 100}%` }}
                                        transition={{ delay: i * 0.05, duration: 0.4 }}
                                        style={{ height: '100%', background: '#00D4FF', borderRadius: '2px' }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '14px' }}>Fairness by Subgroup</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr style={{ background: '#0A0F1C' }}>
                                    {['Subgroup', 'AUC', 'Calibration'].map((h) => (
                                        <th key={h} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9CA3AF', textAlign: h === 'Subgroup' ? 'left' : 'right' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {fairnessData.map((row, i) => {
                                    const aucColor = row.auc >= 0.83 ? '#10B981' : row.auc >= 0.80 ? '#F59E0B' : '#EF4444';
                                    return (
                                        <tr key={row.group} style={{ background: i % 2 === 0 ? '#111827' : '#0D1321' }}>
                                            <td style={{ padding: '7px 10px', fontSize: '12px', color: '#F9FAFB', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{row.group}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: aucColor, borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{row.auc.toFixed(2)}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#9CA3AF', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>{row.calibration.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
