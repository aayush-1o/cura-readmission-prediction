import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
    LineChart, Line, ResponsiveContainer,
    Area, AreaChart,
} from 'recharts';
import { useCountUp } from '../../hooks/useCountUp.js';
import { C } from '../chartTokens.js';

/**
 * MetricTile — KPI card with label, animated value, trend indicator, and sparkline.
 *
 * Props:
 *   label               string
 *   value               number
 *   format?             'number' | 'percent' | 'decimal'
 *   unit?               string   — appended after formatted value
 *   trend?              number   — e.g. +5.2 or -1.4
 *   trendLabel?         string   — e.g. "vs last 7 days"
 *   trendPositiveIsGood?boolean  — false for metrics where up = bad
 *   sparkData?          number[] — 7+ data points for sparkline
 *   icon                ReactNode
 *   isLoading?          boolean
 *   startDelay?         number   — ms before count-up begins (stagger)
 */
export default function MetricTile({
    label,
    value = 0,
    format = 'number',
    unit = '',
    trend,
    trendLabel = 'vs last 7 days',
    trendPositiveIsGood = true,
    sparkData = [],
    icon: Icon,
    isLoading = false,
    startDelay = 0,
}) {
    const animated = useCountUp(isLoading ? 0 : value, 900, startDelay);

    if (isLoading) return <MetricTileSkeleton />;

    /* ── Format the display value ──────────────────────────────────────── */
    function fmt(v) {
        if (format === 'percent') return `${v.toFixed(1)}%`;
        if (format === 'decimal') return v.toFixed(3);
        // number
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
        return Math.round(v).toLocaleString();
    }

    /* ── Trend direction & semantic colour ─────────────────────────────── */
    const trendUp   = typeof trend === 'number' && trend > 0;
    const trendDown = typeof trend === 'number' && trend < 0;
    const trendGood = trendPositiveIsGood ? trendUp : trendDown;
    const trendBad  = trendPositiveIsGood ? trendDown : trendUp;
    const trendColor = trend === undefined
        ? 'var(--text-muted)'
        : trendGood ? '#059669'
        : trendBad  ? '#DC2626'
        : 'var(--text-muted)';

    /* ── Sparkline colour = same semantic logic ─────────────────────────── */
    const sparkColor = trendGood ? C.emerald : trendBad ? C.red : C.indigo;

    const sparkPoints = sparkData.map((v, i) => ({ i, v }));

    return (
        <div
            className="card card-accent-top"
            style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}
        >
            {/* ── Header row: label + icon ──────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <p className="t-micro">{label}</p>
                {Icon && (
                    <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--accent-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Icon size={16} color="var(--accent-primary)" />
                    </div>
                )}
            </div>

            {/* ── Animated value ────────────────────────────────────────── */}
            <p
                className="t-mono-lg"
                style={{ color: 'var(--text-primary)', lineHeight: 1, marginBottom: 10 }}
            >
                {fmt(animated)}{unit}
            </p>

            {/* ── Trend row ─────────────────────────────────────────────── */}
            {trend !== undefined && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    marginBottom: 14,
                }}>
                    <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 12,
                        fontWeight: 600,
                        color: trendColor,
                        fontFamily: "'Instrument Sans', sans-serif",
                    }}>
                        {trendUp
                            ? <TrendingUp size={12} />
                            : trendDown
                            ? <TrendingDown size={12} />
                            : <Minus size={12} />
                        }
                        {Math.abs(trend).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {trendLabel}
                    </span>
                </div>
            )}

            {/* ── Divider + sparkline ───────────────────────────────────── */}
            {sparkPoints.length > 1 && (
                <>
                    <div style={{
                        height: 1,
                        background: 'var(--border-subtle)',
                        marginBottom: 12,
                        marginLeft: -20,
                        marginRight: -20,
                    }} />
                    <div style={{ marginLeft: -4, marginRight: -4 }}>
                        <ResponsiveContainer width="100%" height={40}>
                            <AreaChart data={sparkPoints} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={`sg-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={sparkColor} stopOpacity={0.18} />
                                        <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="v"
                                    stroke={sparkColor}
                                    strokeWidth={1.5}
                                    dot={false}
                                    fill={`url(#sg-${label.replace(/\s/g, '')})`}
                                    animationDuration={800}
                                    isAnimationActive
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    );
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function MetricTileSkeleton() {
    return (
        <div className="card" style={{ padding: 20 }}>
            <div className="skeleton" style={{ height: 12, width: '55%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 28, width: '40%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 12, width: '35%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 40, width: '100%' }} />
        </div>
    );
}
