import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Activity, AlertTriangle, TrendingDown, Target, DollarSign,
    ChevronRight,
} from 'lucide-react';
import {
    AreaChart, Area,
    BarChart, Bar, Cell, LabelList,
    XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, Label,
    ResponsiveContainer,
} from 'recharts';
import {
    useDashboardSummary, useReadmissionTrends,
    useHighRiskToday, useRiskDistribution, useSparklines,
} from '../services/hooks.js';
import MetricTile from '../design-system/components/MetricTile.jsx';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { C, AXIS, GRID, TOOLTIP } from '../design-system/chartTokens.js';

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
}

function formatTrendDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const RISK_TIER_LABELS = {
    low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};
const RISK_BAR_COLORS = {
    low: C.emerald, medium: C.amber, high: '#F97316', critical: C.red,
};

/* ── Dashboard ──────────────────────────────────────────────────────────────── */

export default function Dashboard() {
    const navigate = useNavigate();

    const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
    const { data: trends = [], isLoading: trendsLoading }  = useReadmissionTrends();
    const { data: patients = [], isLoading: patientsLoading } = useHighRiskToday();
    const { data: riskDist = [], isLoading: distLoading } = useRiskDistribution();
    const { data: sparklines } = useSparklines();

    /* ── Chart data ─────────────────────────────────────────────────────── */
    const trendData = trends
        .filter((_, i) => i % 3 === 0)            // sample to ~30 points
        .slice(0, 30)
        .map((t) => ({
            date: formatTrendDate(t.period_start),
            rate: parseFloat(t.readmission_rate_pct.toFixed(1)),
        }));

    const riskDistData = riskDist.map((d) => ({
        tier: RISK_TIER_LABELS[d.risk_tier] ?? d.risk_tier,
        count: d.patient_count,
        color: RISK_BAR_COLORS[d.risk_tier] ?? C.indigo,
    }));

    const highRiskRows = patients.slice(0, 8);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
        >
            {/* ── Page header ────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
                <p className="t-micro" style={{ marginBottom: 4 }}>
                    {formatDate(new Date())}
                </p>
                <h1 className="t-display" style={{ marginBottom: 2 }}>
                    Clinical Overview
                </h1>
                <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                    Real-time readmission risk intelligence
                </p>
            </div>

            {/* ── KPI tiles ──────────────────────────────────────────────── */}
            <div
                className="stagger"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <MetricTile
                    label="Today's Admissions"
                    value={summary?.total_admissions_30d ?? 0}
                    format="number"
                    trend={3.2}
                    trendLabel="vs last 7 days"
                    trendPositiveIsGood={false}
                    sparkData={sparklines?.admissions ?? []}
                    icon={Activity}
                    isLoading={summaryLoading}
                    startDelay={0}
                />
                <MetricTile
                    label="High-Risk Patients"
                    value={summary?.high_risk_patients_today ?? 0}
                    format="number"
                    trend={2.1}
                    trendLabel="vs last 7 days"
                    trendPositiveIsGood={false}
                    sparkData={sparklines?.highRisk ?? []}
                    icon={AlertTriangle}
                    isLoading={summaryLoading}
                    startDelay={100}
                />
                <MetricTile
                    label="30-Day Readmit Rate"
                    value={summary?.avg_readmission_rate_pct ?? 0}
                    format="percent"
                    trend={-1.4}
                    trendLabel="vs last period"
                    trendPositiveIsGood={false}
                    sparkData={sparklines?.readmitRate ?? []}
                    icon={TrendingDown}
                    isLoading={summaryLoading}
                    startDelay={200}
                />
                <MetricTile
                    label="Avg Risk Score"
                    value={summary?.avg_risk_score ?? 0}
                    format="decimal"
                    trend={-0.9}
                    trendLabel="vs last period"
                    trendPositiveIsGood={false}
                    sparkData={sparklines?.avgRiskScore ?? []}
                    icon={Target}
                    isLoading={summaryLoading}
                    startDelay={300}
                />
                {/* BUG-018 FIX: Add cost KPI tile — total_cost_30d was computed but never shown */}
                <MetricTile
                    label="Est. 30-Day Cost"
                    value={summary?.total_cost_30d != null ? `$${(summary.total_cost_30d / 1_000_000).toFixed(1)}M` : '—'}
                    format="text"
                    trend={-2.3}
                    trendLabel="vs last period"
                    trendPositiveIsGood={false}
                    sparkData={[]}
                    icon={DollarSign}
                    isLoading={summaryLoading}
                    startDelay={400}
                />
            </div>

            {/* ── Main body: chart (left) + risk dist (right) ────────────── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 340px',
                    gap: 16,
                    marginBottom: 16,
                }}
            >
                {/* ── Area chart ─────────────────────────────────────────── */}
                <div className="card" style={{ padding: '20px 20px 16px' }}>
                    <div style={{ marginBottom: 16 }}>
                        <h2 className="t-heading">Readmission Rate</h2>
                        <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                            30-day rolling window
                        </p>
                    </div>

                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart
                            data={trendData}
                            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor={C.indigo} stopOpacity={0.12} />
                                    <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid {...GRID} />
                            <XAxis
                                dataKey="date"
                                {...AXIS}
                                interval={4}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tickFormatter={(v) => `${v}%`}
                                {...AXIS}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                            />
                            <Tooltip
                                {...TOOLTIP}
                                formatter={(v) => [`${v}%`, 'Readmit Rate']}
                            />
                            <ReferenceLine
                                y={15}
                                stroke={C.benchmark}
                                strokeDasharray="5 3"
                                strokeWidth={1.5}
                            >
                                <Label
                                    value="CMS 15%"
                                    position="insideTopRight"
                                    style={{
                                        fontSize: 10,
                                        fill: C.axisText,
                                        fontFamily: 'Instrument Sans, sans-serif',
                                    }}
                                />
                            </ReferenceLine>
                            <Area
                                type="monotone"
                                dataKey="rate"
                                stroke={C.indigo}
                                strokeWidth={2}
                                fill="url(#rateGrad)"
                                dot={false}
                                activeDot={{ r: 4, fill: C.indigo, strokeWidth: 2, stroke: '#FFFFFF' }}
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>

                    {/* ── Summary stat row below chart ─────────────────── */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 1,
                            background: 'var(--border-subtle)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            marginTop: 16,
                        }}
                    >
                        {/* BUG-012 FIX: Real data from API, not hardcoded strings */}
                        {[
                            { label: 'Total Admissions', value: summary?.total_admissions_30d?.toLocaleString() ?? '—' },
                            { label: 'Readmissions',     value: summary?.total_readmissions_30d?.toLocaleString() ?? '—' },
                            { label: 'High-Risk Today',  value: summary?.high_risk_patients_today?.toLocaleString() ?? '—' },
                            { label: 'Avg LOS',          value: summary?.avg_los_days ? `${summary.avg_los_days.toFixed(1)}d` : '—' },
                        ].map(({ label, value }) => (
                            <div
                                key={label}
                                style={{ background: 'var(--bg-surface)', padding: '12px 16px' }}
                            >
                                <p className="t-micro" style={{ marginBottom: 4 }}>{label}</p>
                                <p
                                    className="t-mono"
                                    style={{
                                        fontSize: 16,
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Risk distribution bar chart ─────────────────────── */}
                <div className="card" style={{ padding: '20px 16px 16px' }}>
                    <div style={{ marginBottom: 16 }}>
                        <h2 className="t-heading">Risk Distribution</h2>
                        <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                            Current admissions by tier
                        </p>
                    </div>

                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                            data={riskDistData}
                            barSize={44}
                            margin={{ top: 16, right: 8, left: -16, bottom: 0 }}
                        >
                            <CartesianGrid {...GRID} />
                            <XAxis
                                dataKey="tier"
                                {...AXIS}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis {...AXIS} axisLine={false} tickLine={false} />
                            <Tooltip
                                {...TOOLTIP}
                                formatter={(v, name) => [v, 'Patients']}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={800}>
                                <LabelList
                                    dataKey="count"
                                    position="top"
                                    style={{
                                        ...AXIS,
                                        fontWeight: 600,
                                        fill: C.textPrimary,
                                    }}
                                />
                                {riskDistData.map((entry) => (
                                    <Cell key={entry.tier} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>

                    {/* Tier legend */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: '1px solid var(--border-subtle)',
                        }}
                    >
                        {riskDistData.map(({ tier, count, color }) => (
                            <div
                                key={tier}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: color,
                                        flexShrink: 0,
                                    }} />
                                    <span style={{
                                        fontSize: 12,
                                        color: 'var(--text-secondary)',
                                        fontFamily: "'Instrument Sans', sans-serif",
                                    }}>
                                        {tier}
                                    </span>
                                </div>
                                <span
                                    className="t-mono"
                                    style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}
                                >
                                    {count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── High-risk patient table ─────────────────────────────────── */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Table header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border-subtle)',
                    }}
                >
                    <div>
                        <h2 className="t-heading">High-Risk Worklist</h2>
                        <p className="t-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                            {highRiskRows.length} patients requiring attention today
                        </p>
                    </div>
                    <button
                        className="btn btn-ghost"
                        onClick={() => navigate('/risk-queue')}
                        style={{ fontSize: 12, gap: 4 }}
                    >
                        Full queue <ChevronRight size={13} />
                    </button>
                </div>

                {/* Table */}
                <div style={{ overflowY: 'auto', maxHeight: 360 }}>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Patient ID</th>
                                <th>Risk</th>
                                <th>Department</th>
                                <th>Primary Factor</th>
                                <th>LOS</th>
                                <th style={{ width: 100 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {patientsLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 6 }).map((_, j) => (
                                            <td key={j}>
                                                <div className="skeleton" style={{ height: 12, width: '70%' }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                                : highRiskRows.map((p) => (
                                    <tr
                                        key={p.patient_id}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/patients/${p.patient_id}`)}
                                    >
                                        <td>
                                            <span
                                                className="t-mono"
                                                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                                            >
                                                {p.patient_id}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span
                                                    className="t-mono"
                                                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
                                                >
                                                    {(p.risk_score * 100).toFixed(0)}%
                                                </span>
                                                <RiskBadge tier={p.risk_tier} size="sm" showDot />
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                                {p.department}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                {p.top_risk_factors?.[0] ?? '—'}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className="t-mono"
                                                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                                            >
                                                {p.length_of_stay_days?.toFixed(1)}d
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-ghost"
                                                style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/patients/${p.patient_id}`);
                                                }}
                                            >
                                                Care Plan →
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
}
