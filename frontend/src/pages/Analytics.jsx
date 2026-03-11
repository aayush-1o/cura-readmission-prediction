import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    ReferenceLine, Legend, Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { C, AXIS, GRID, TOOLTIP } from '../design-system/chartTokens.js';
import {
    useReadmissionTrends, useDepartmentBreakdown, useRiskDistribution, useClusterProfiles,
} from '../services/hooks.js';
import { mockDepartments, mockTrends } from '../services/mockData.js';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const TABS = ['Readmission Trends', 'Department Performance', 'Cohort Analysis', 'Model Performance'];

// Clinical Linen department palette — warm, distinct, not cyan
const DEPT_COLORS = [C.indigo, C.emerald, C.amber, C.violet, C.red];

const COHORT_COLORS = {
    'Complex Elderly':    C.red,
    'Young Comorbid':     C.amber,
    'Low-Risk Elective':  C.emerald,
    'Chronic Disease':    C.indigo,
};

/* ─── Analytics page ─────────────────────────────────────────────────────── */
export default function Analytics() {
    const [tab, setTab] = useState('Readmission Trends');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div>
                <h1 className="t-display" style={{ marginBottom: 2 }}>Analytics &amp; Performance</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                    Clinical intelligence, department benchmarks, and model monitoring
                </p>
            </div>

            {/* Underline tab nav */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '9px 18px',
                            fontSize: 13,
                            fontWeight: tab === t ? 600 : 500,
                            color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                            borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            marginBottom: -1,
                            background: 'none',
                            border: 'none',
                            borderBottomStyle: 'solid',
                            borderBottomWidth: 2,
                            borderBottomColor: tab === t ? 'var(--accent-primary)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            fontFamily: "'Instrument Sans', sans-serif",
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
                    {tab === 'Readmission Trends'    && <TrendsTab />}
                    {tab === 'Department Performance' && <DeptTab />}
                    {tab === 'Cohort Analysis'        && <CohortTab />}
                    {tab === 'Model Performance'      && <ModelTab />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

/* ─── Tab 1: Readmission Trends ──────────────────────────────────────────── */
function TrendsTab() {
    const { data: trends = [] } = useReadmissionTrends({ months_back: 6 });
    const allData = trends.length ? trends : mockTrends;

    const byDept = allData.reduce((acc, r) => {
        if (!acc[r.department_name]) acc[r.department_name] = [];
        acc[r.department_name].push({
            date: r.period_start,
            rate: parseFloat(r.readmission_rate_pct?.toFixed(1)),
        });
        return acc;
    }, {});

    const departments = Object.keys(byDept).slice(0, 4);
    const dateUnion = [...new Set(allData.map((r) => r.period_start))].sort().slice(-60);

    const chartData = dateUnion.map((date) => {
        const row = { date };
        departments.forEach((dept) => {
            const entry = byDept[dept]?.find((d) => d.date === date);
            row[dept] = entry?.rate ?? null;
        });
        return row;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: '20px 20px 16px' }}>
                <div style={{ marginBottom: 16 }}>
                    <h2 className="t-heading">Readmission Rate by Department — 6 Months</h2>
                    <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                        Dashed line = 15% CMS benchmark
                    </p>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                        <CartesianGrid {...GRID} />
                        <XAxis
                            dataKey="date"
                            {...AXIS}
                            tickFormatter={(d) => { try { return format(parseISO(d), 'MMM d'); } catch { return ''; } }}
                            interval={8}
                            axisLine={false} tickLine={false}
                        />
                        <YAxis
                            {...AXIS}
                            tickFormatter={(v) => `${v}%`}
                            axisLine={false} tickLine={false}
                            width={38}
                        />
                        <Tooltip {...TOOLTIP} formatter={(v) => [`${v}%`, undefined]} />
                        <ReferenceLine
                            y={15}
                            stroke={C.benchmark}
                            strokeDasharray="5 3"
                            strokeWidth={1.5}
                            label={{ value: 'CMS 15%', fill: C.axisText, fontSize: 10, position: 'right' }}
                        />
                        <Legend
                            wrapperStyle={{
                                paddingTop: 16,
                                fontSize: 12,
                                fontFamily: 'Instrument Sans, sans-serif',
                                color: C.textSecondary,
                            }}
                        />
                        {departments.map((dept, i) => (
                            <Line
                                key={dept}
                                type="monotone"
                                dataKey={dept}
                                stroke={DEPT_COLORS[i]}
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                                animationDuration={600}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>

                {/* Summary stats strip */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
                    gap: 1, background: 'var(--border-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden', marginTop: 16,
                }}>
                    {[
                        { label: 'Total Readmissions',   value: '418',       sub: 'this period' },
                        { label: 'Depts Below Benchmark', value: '3 of 5',    sub: 'within CMS target' },
                        { label: 'Worst Performing',     value: 'Cardiology', sub: '+3.2pp above benchmark', color: 'var(--risk-high)' },
                        { label: 'Best Performing',      value: 'Ortho',      sub: '-2.1pp below benchmark', color: 'var(--risk-low)' },
                    ].map((s) => (
                        <div key={s.label} style={{ background: 'var(--bg-surface)', padding: '12px 16px' }}>
                            <p className="t-micro" style={{ marginBottom: 4 }}>{s.label}</p>
                            <p className="t-mono" style={{ fontSize: 15, fontWeight: 500, color: s.color || 'var(--text-primary)', marginBottom: 2 }}>
                                {s.value}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Insight banner */}
            <div style={{
                background: 'var(--accent-light)',
                border: '1px solid var(--accent-mid)',
                borderLeft: '4px solid var(--accent-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
                <span style={{ fontSize: 16 }}>💡</span>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        Cardiology Trend Alert
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Cardiology's readmission rate has exceeded the CMS 15% benchmark for 6 consecutive weeks.
                        Consider scheduling a departmental quality review.
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ─── Tab 2: Department Performance ─────────────────────────────────────── */
function DeptTab() {
    const { data: departments = [] } = useDepartmentBreakdown();
    const depts = departments.length ? departments : mockDepartments;
    const [sortKey, setSortKey] = useState('vs_benchmark_delta');
    const [sortDir, setSortDir] = useState('desc');
    const [hoveredRow, setHoveredRow] = useState(null);

    const sorted = [...depts].sort((a, b) => {
        const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
    });

    // Generate mock 7-day sparkline data per dept
    function deptSpark(baseRate) {
        return Array.from({ length: 7 }, (_, i) => ({
            i, v: baseRate + (Math.random() - 0.5) * 2,
        }));
    }

    const cols = [
        { key: 'department_name',        label: 'Department',    numeric: false },
        { key: 'readmission_rate',        label: 'Rate %',        numeric: true  },
        { key: 'benchmark_readmission_rate', label: 'Benchmark', numeric: true  },
        { key: 'vs_benchmark_delta',      label: 'vs Benchmark',  numeric: true  },
        { key: null,                      label: '7-Day Trend',   numeric: false },
        { key: 'avg_los_days',            label: 'Avg LOS',       numeric: true  },
        { key: 'cms_star_rating',         label: 'CMS Stars',     numeric: true  },
    ];

    const toggleSort = (key) => {
        if (!key) return;
        setSortKey(key);
        setSortDir(sortKey === key && sortDir === 'desc' ? 'asc' : 'desc');
    };

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 className="t-heading">Department Performance vs. CMS Benchmark</h2>
                <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>Click headers to sort</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            {cols.map((col) => (
                                <th
                                    key={col.label}
                                    onClick={() => toggleSort(col.key)}
                                    style={{
                                        textAlign: col.numeric ? 'right' : 'left',
                                        cursor: col.key ? 'pointer' : 'default',
                                        userSelect: 'none',
                                    }}
                                >
                                    {col.label} {col.key && sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((dept, i) => {
                            const isGood = (dept.vs_benchmark_delta || 0) <= 0;
                            const deltaColor = isGood ? 'var(--risk-low)' : 'var(--risk-high)';
                            const deltaBg = isGood ? 'var(--risk-low-bg)' : 'var(--risk-high-bg)';
                            const sparkColor = isGood ? C.emerald : C.red;
                            const sparkData = deptSpark(dept.readmission_rate || 14);
                            const isHovered = hoveredRow === dept.department_name;

                            return (
                                <motion.tr
                                    key={dept.department_name}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.04 }}
                                    onMouseEnter={() => setHoveredRow(dept.department_name)}
                                    onMouseLeave={() => setHoveredRow(null)}
                                    style={{ cursor: 'pointer', position: 'relative' }}
                                >
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {dept.department_name}
                                            </span>
                                            {isHovered && (
                                                <motion.span
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    style={{ fontSize: 11, color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}
                                                >
                                                    View patients →
                                                </motion.span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span className="t-mono" style={{ fontSize: 13 }}>
                                            {dept.readmission_rate?.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span className="t-mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            {dept.benchmark_readmission_rate?.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: deltaColor,
                                            background: deltaBg,
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-pill)',
                                        }}>
                                            {dept.vs_benchmark_delta > 0 ? '+' : ''}{dept.vs_benchmark_delta?.toFixed(1)}pp
                                        </span>
                                    </td>
                                    <td>
                                        <ResponsiveContainer width={80} height={28}>
                                            <LineChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                                                <Line
                                                    type="monotone"
                                                    dataKey="v"
                                                    stroke={sparkColor}
                                                    strokeWidth={1.5}
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span className="t-mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            {dept.avg_los_days?.toFixed(1)}d
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span style={{
                                            fontSize: 13,
                                            color: dept.cms_star_rating >= 4 ? 'var(--risk-low)'
                                                : dept.cms_star_rating <= 2 ? 'var(--risk-critical)'
                                                : 'var(--risk-high)',
                                        }}>
                                            {'★'.repeat(dept.cms_star_rating || 0)}
                                            <span style={{ color: 'var(--border-default)' }}>
                                                {'★'.repeat(5 - (dept.cms_star_rating || 0))}
                                            </span>
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

/* ─── Tab 3: Cohort Analysis (UMAP) ─────────────────────────────────────── */
function CohortTab() {
    const [activeCluster, setActiveCluster] = useState(null);

    const scatterData = [
        ...Array.from({ length: 40 }, () => ({ x: -2 + Math.random() * 4, y: -1.5 + Math.random() * 3, cluster: 'Complex Elderly', risk: 0.6 + Math.random() * 0.3 })),
        ...Array.from({ length: 50 }, () => ({ x: 2 + Math.random() * 3,  y: -0.5 + Math.random() * 2, cluster: 'Young Comorbid',   risk: 0.35 + Math.random() * 0.25 })),
        ...Array.from({ length: 60 }, () => ({ x: -1 + Math.random() * 3, y: 2 + Math.random() * 3,    cluster: 'Low-Risk Elective', risk: 0.1 + Math.random() * 0.2 })),
        ...Array.from({ length: 30 }, () => ({ x: 4 + Math.random() * 2,  y: 2.5 + Math.random() * 2,  cluster: 'Chronic Disease',   risk: 0.45 + Math.random() * 0.2 })),
    ];

    const cohortProfiles = [
        { name: 'Complex Elderly MultiMorbid', cluster: 'Complex Elderly',  size: 487, avgRisk: 0.71, description: 'High CCI, multiple prior admissions, ICU stays' },
        { name: 'Young Comorbid Patients',     cluster: 'Young Comorbid',   size: 623, avgRisk: 0.48, description: 'Chronic conditions, younger cohort, social determinants' },
        { name: 'Low Risk Elective',           cluster: 'Low-Risk Elective', size: 892, avgRisk: 0.16, description: 'Planned procedures, minimal comorbidities' },
        { name: 'Chronic Disease Mgmt',        cluster: 'Chronic Disease',  size: 341, avgRisk: 0.52, description: 'Stable chronic conditions, medication-dependent' },
    ];

    const clusterKeys = Object.keys(COHORT_COLORS);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
            {/* UMAP scatter */}
            <div className="card" style={{ padding: 20 }}>
                <h2 className="t-heading" style={{ marginBottom: 2 }}>Patient Cohort Map (UMAP)</h2>
                <p className="t-label" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                    Each point = one patient. Click a cluster to inspect it.
                </p>
                <ResponsiveContainer width="100%" height={340}>
                    <ScatterChart>
                        <CartesianGrid {...GRID} />
                        <XAxis
                            type="number" dataKey="x"
                            {...AXIS}
                            axisLine={false} tickLine={false}
                            label={{ value: 'UMAP-1', fill: C.axisText, fontSize: 11, position: 'insideBottom', offset: -4 }}
                        />
                        <YAxis
                            type="number" dataKey="y"
                            {...AXIS}
                            axisLine={false} tickLine={false}
                            width={30}
                            label={{ value: 'UMAP-2', fill: C.axisText, fontSize: 11, angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip content={<ScatterTooltip />} />
                        {clusterKeys.map((cluster) => (
                            <Scatter
                                key={cluster}
                                name={cluster}
                                data={scatterData
                                    .filter((d) => d.cluster === cluster)
                                    .map((d) => ({
                                        ...d,
                                        opacity: activeCluster === null || activeCluster === cluster ? 0.75 : 0.15,
                                    }))}
                                fill={COHORT_COLORS[cluster]}
                                onClick={() => setActiveCluster(cluster === activeCluster ? null : cluster)}
                                cursor="pointer"
                            />
                        ))}
                    </ScatterChart>
                </ResponsiveContainer>

                {activeCluster && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                        Showing <strong>{activeCluster}</strong> · Click again to deselect
                    </p>
                )}
            </div>

            {/* Cohort profiles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cohortProfiles.map((c, i) => {
                    const color = COHORT_COLORS[c.cluster];
                    const isActive = activeCluster === c.cluster;

                    return (
                        <motion.div
                            key={c.name}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="card card-interactive"
                            onClick={() => setActiveCluster(c.cluster === activeCluster ? null : c.cluster)}
                            style={{
                                padding: '14px 16px',
                                cursor: 'pointer',
                                borderLeft: `3px solid ${color}`,
                                outline: isActive ? `2px solid ${color}` : 'none',
                                outlineOffset: 1,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {c.name}
                                </p>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div>
                                    <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {c.size.toLocaleString()}
                                    </span>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Patients</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color }}>
                                        {Math.round(c.avgRisk * 100)}%
                                    </span>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Risk</p>
                                </div>
                            </div>
                            {isActive && (
                                <motion.p
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 4 }}
                                >
                                    {c.description}
                                </motion.p>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

function ScatterTooltip({ active, payload }) {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    const color = COHORT_COLORS[d.cluster] || C.indigo;
    return (
        <div style={{
            background: C.tooltipBg,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            boxShadow: '0 4px 16px rgba(28,25,23,0.10)',
        }}>
            <p style={{ fontWeight: 600, color, marginBottom: 2 }}>{d.cluster}</p>
            <p style={{ color: C.textSecondary }}>Risk: {Math.round(d.risk * 100)}%</p>
        </div>
    );
}

/* ─── Tab 4: Model Performance ───────────────────────────────────────────── */
function ModelTab() {
    const aucRoc = 0.84;
    const radius = 60;
    const circumference = Math.PI * radius;
    const offset = circumference * (1 - aucRoc);

    const featureImportance = [
        { feature: 'Prior readmissions (1yr)', importance: 0.28 },
        { feature: 'Charlson CCI',             importance: 0.21 },
        { feature: 'ICU stay flag',             importance: 0.18 },
        { feature: 'High utilizer',             importance: 0.15 },
        { feature: 'Prior admits (12m)',         importance: 0.12 },
        { feature: 'CHF diagnosis',             importance: 0.10 },
        { feature: 'Length of stay',            importance: 0.08 },
        { feature: 'Age',                       importance: 0.06 },
    ];

    const fairnessData = [
        { group: 'Male',       auc: 0.83, calibration: 0.97 },
        { group: 'Female',     auc: 0.86, calibration: 0.98 },
        { group: 'Medicare',   auc: 0.82, calibration: 0.95 },
        { group: 'Medicaid',   auc: 0.79, calibration: 0.93 },
        { group: 'Commercial', auc: 0.87, calibration: 0.99 },
        { group: 'Age 18-45',  auc: 0.81, calibration: 0.96 },
        { group: 'Age 46-65',  auc: 0.84, calibration: 0.97 },
        { group: 'Age 65+',    auc: 0.85, calibration: 0.98 },
    ];

    const medicaidAuc = fairnessData.find((d) => d.group === 'Medicaid')?.auc ?? 1;
    const showFairnessAlert = medicaidAuc < 0.80;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* AUC gauge + model info */}
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <h2 className="t-heading" style={{ alignSelf: 'flex-start' }}>Model Performance</h2>

                {/* Semicircle gauge */}
                <svg width="160" height="100" viewBox="0 0 160 100" overflow="visible">
                    <defs>
                        <linearGradient id="aucGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={C.emerald} />
                            <stop offset="55%" stopColor={C.amber} />
                            <stop offset="100%" stopColor={C.indigo} />
                        </linearGradient>
                    </defs>
                    <path d="M 10 100 A 70 70 0 0 1 150 100" fill="none" stroke="var(--border-default)" strokeWidth="12" strokeLinecap="round" />
                    <motion.path
                        d="M 10 100 A 70 70 0 0 1 150 100"
                        fill="none" stroke="url(#aucGrad)" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                    <text x="80" y="85" textAnchor="middle" fill="var(--text-primary)" fontFamily="DM Mono, monospace" fontSize="22" fontWeight="700">
                        {(aucRoc * 100).toFixed(0)}%
                    </text>
                    <text x="80" y="100" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="Instrument Sans, sans-serif">
                        AUC-ROC
                    </text>
                </svg>

                {/* Calibration note */}
                <div style={{
                    width: '100%',
                    background: 'var(--bg-sunken)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    textAlign: 'center',
                }}>
                    <span className="t-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Brier Score: 0.12 · Threshold: 0.30 · Catches 79% of actual readmissions
                    </span>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                        ['Model',            'XGBoost v1.0'],
                        ['Training data',    '~12,000 admissions'],
                        ['Last retrained',   '2024-10-01'],
                        ['Precision @ 0.5',  '0.71'],
                        ['Recall @ 0.5',     '0.79'],
                        ['F1 Score',         '0.75'],
                    ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k}</span>
                            <span className="t-mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{v}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature importance + fairness */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card" style={{ padding: 20 }}>
                    <h3 className="t-heading" style={{ marginBottom: 14 }}>Top Feature Importances</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {featureImportance.map((f, i) => (
                            <div key={f.feature}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.feature}</span>
                                    <span className="t-mono" style={{ fontSize: 12, color: 'var(--accent-primary)' }}>
                                        {(f.importance * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div style={{ height: 4, background: 'var(--bg-sunken)', borderRadius: 2, overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(f.importance / 0.28) * 100}%` }}
                                        transition={{ delay: i * 0.05, duration: 0.45 }}
                                        style={{ height: '100%', background: 'var(--accent-primary)', borderRadius: 2 }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card" style={{ padding: 20 }}>
                    <h3 className="t-heading" style={{ marginBottom: 12 }}>Fairness by Subgroup</h3>

                    {showFairnessAlert && (
                        <div style={{
                            background: 'var(--risk-high-bg)',
                            border: '1px solid var(--risk-high-border)',
                            borderLeft: '4px solid var(--risk-high)',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 14px',
                            marginBottom: 12,
                        }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--risk-high)', marginBottom: 2 }}>
                                ⚠ Fairness Gap: Medicaid AUC {medicaidAuc.toFixed(2)}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                Medicaid patients have lower model accuracy. Consider collecting additional features or reweighting.
                            </p>
                        </div>
                    )}

                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                {['Subgroup', 'AUC', 'Calibration'].map((h) => (
                                    <th key={h} style={{ textAlign: h === 'Subgroup' ? 'left' : 'right' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {fairnessData.map((row) => {
                                const aucColor = row.auc >= 0.83 ? 'var(--risk-low)'
                                    : row.auc >= 0.80 ? 'var(--risk-medium)'
                                    : 'var(--risk-critical)';
                                return (
                                    <tr key={row.group}>
                                        <td>{row.group}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className="t-mono" style={{ fontSize: 12, fontWeight: 600, color: aucColor }}>
                                                {row.auc.toFixed(2)}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className="t-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {row.calibration.toFixed(2)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
