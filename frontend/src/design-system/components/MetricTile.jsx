import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

/**
 * MetricTile — KPI display card with large data value, trend indicator, and sparkline.
 * @param {string} label - Metric name
 * @param {number|string} value - The KPI value to display
 * @param {string} format - 'number' | 'percent' | 'currency' | 'score'
 * @param {number} change - % change vs previous period (positive = up)
 * @param {boolean} inverseColor - true if UP is bad (e.g. readmission rate)
 * @param {number[]} sparkline - Array of 7 data points for sparkline
 * @param {string} prefix - Prefix symbol (e.g. '$')
 * @param {string} suffix - Suffix symbol (e.g. '%')
 */
export default function MetricTile({
    label,
    value,
    format = 'number',
    change,
    inverseColor = false,
    sparkline = [],
    prefix = '',
    suffix = '',
    icon: Icon,
    isLoading = false,
}) {
    const [displayed, setDisplayed] = useState(0);
    const animRef = useRef(null);

    // Count-up animation
    useEffect(() => {
        if (isLoading || typeof value !== 'number') return;
        const target = value;
        const duration = 800;
        const start = performance.now();
        const step = (now) => {
            const pct = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - pct, 3); // ease-out cubic
            setDisplayed(eased * target);
            if (pct < 1) animRef.current = requestAnimationFrame(step);
        };
        animRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animRef.current);
    }, [value, isLoading]);

    if (isLoading) return <MetricTileSkeleton />;

    const formatValue = (v) => {
        if (format === 'currency') return `$${(v / 1_000_000).toFixed(1)}M`;
        if (format === 'percent') return `${v.toFixed(1)}%`;
        if (format === 'score') return v.toFixed(3);
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `${Math.round(v / 100) / 10}K`;
        return typeof v === 'number' ? Math.round(v).toLocaleString() : v;
    };

    const trendUp = typeof change === 'number' && change > 0;
    const trendDown = typeof change === 'number' && change < 0;
    const trendColor = change === undefined ? '#9CA3AF'
        : (trendUp && !inverseColor) || (trendDown && inverseColor) ? '#10B981'
            : '#EF4444';

    const sparkData = sparkline.map((v, i) => ({ i, v }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="card relative overflow-hidden"
        >
            {/* Subtle top accent line */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)' }}
            />

            <div className="flex items-start justify-between mb-3">
                <p className="section-label">{label}</p>
                {Icon && (
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(0,212,255,0.08)', color: '#00D4FF' }}
                    >
                        <Icon size={16} />
                    </div>
                )}
            </div>

            {/* Value */}
            <div className="flex items-end gap-3 mb-3">
                <p
                    className="font-mono font-medium leading-none"
                    style={{ fontSize: '2.25rem', color: '#00D4FF', fontFamily: '"JetBrains Mono", monospace' }}
                >
                    {prefix}{formatValue(displayed)}{suffix}
                </p>

                {/* Trend indicator */}
                {change !== undefined && (
                    <div
                        className="flex items-center gap-1 pb-1"
                        style={{ color: trendColor, fontSize: '12px', fontWeight: 500 }}
                    >
                        {trendUp ? <TrendingUp size={14} /> : trendDown ? <TrendingDown size={14} /> : <Minus size={14} />}
                        <span>{Math.abs(change).toFixed(1)}%</span>
                    </div>
                )}
            </div>

            {/* Sparkline */}
            {sparkData.length > 1 && (
                <div className="h-10 -mx-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData}>
                            <Line
                                type="monotone"
                                dataKey="v"
                                stroke="#00D4FF"
                                strokeWidth={1.5}
                                dot={false}
                                isAnimationActive
                                animationDuration={600}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </motion.div>
    );
}

function MetricTileSkeleton() {
    return (
        <div className="card">
            <div className="skeleton h-3 w-24 mb-4" />
            <div className="skeleton h-9 w-32 mb-4" />
            <div className="skeleton h-10 w-full" />
        </div>
    );
}
