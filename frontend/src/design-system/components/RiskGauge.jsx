import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const TIER_COLORS = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#EF4444',
};

function scoreToTier(score) {
    if (score < 0.35) return 'low';
    if (score < 0.65) return 'medium';
    if (score < 0.80) return 'high';
    return 'critical';
}

/**
 * RiskGauge — semicircular gauge showing readmission probability 0–100%.
 * Needle animates to value on mount.
 * @param {number} score - Risk probability [0, 1]
 * @param {number} size  - SVG diameter (default 240)
 */
export default function RiskGauge({ score = 0.5, size = 240, isLoading = false }) {
    const tier = scoreToTier(score);
    const color = TIER_COLORS[tier];
    const pct = Math.round(score * 100);

    if (isLoading) return <GaugeSkeleton size={size} />;

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.4;
    const strokeW = size * 0.055;

    // Arc helpers — semicircle from 180° to 360° (left to right)
    const polarToXY = (angle) => {
        const rad = (angle - 90) * (Math.PI / 180);
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };

    const describeArc = (startAngle, endAngle) => {
        const start = polarToXY(startAngle);
        const end = polarToXY(endAngle);
        const large = endAngle - startAngle > 180 ? 1 : 0;
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
    };

    // Gradient stops: green → amber (35%) → red (65%)
    const trackPath = describeArc(180, 360);
    // Filled: 180 + score * 180
    const filledEnd = 180 + score * 180;
    const filledPath = describeArc(180, filledEnd);

    // Needle position
    const needleAngle = 180 + score * 180;
    const needleEnd = polarToXY(needleAngle);
    const needleTip = { x: cx + (r - strokeW) * Math.cos((needleAngle - 90) * Math.PI / 180), y: cy + (r - strokeW) * Math.sin((needleAngle - 90) * Math.PI / 180) };

    return (
        <div className="flex flex-col items-center">
            <svg width={size} height={size * 0.58} viewBox={`0 0 ${size} ${size * 0.6}`} overflow="visible">
                <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="45%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#EF4444" />
                    </linearGradient>
                    <filter id="glowFilter">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Track (background arc) */}
                <path
                    d={trackPath}
                    fill="none"
                    stroke="#1F2937"
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                />

                {/* Filled arc — animates via stroke-dasharray trick */}
                <motion.path
                    d={filledPath}
                    fill="none"
                    stroke="url(#gaugeGradient)"
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    filter="url(#glowFilter)"
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 1, pathLength: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                />

                {/* Needle */}
                <motion.line
                    x1={cx}
                    y1={cy}
                    x2={needleTip.x}
                    y2={needleTip.y}
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    initial={{ rotate: -90, originX: cx, originY: cy, opacity: 0 }}
                    animate={{ rotate: score * 180 - 90, originX: cx, originY: cy, opacity: 1 }}
                    transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1], delay: 0.2 }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                />

                {/* Needle pivot dot */}
                <circle cx={cx} cy={cy} r={size * 0.025} fill={color} />

                {/* Tick marks */}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const a = 180 + t * 180;
                    const inner = polarToXY(a);
                    const outerA = polarToXY(a);
                    const label = `${Math.round(t * 100)}%`;
                    const lp = { x: cx + (r + strokeW * 1.7) * Math.cos((a - 90) * Math.PI / 180), y: cy + (r + strokeW * 1.7) * Math.sin((a - 90) * Math.PI / 180) };
                    return (
                        <text
                            key={t}
                            x={lp.x}
                            y={lp.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#4B5563"
                            fontSize={size * 0.045}
                            fontFamily='"JetBrains Mono", monospace'
                        >
                            {label}
                        </text>
                    );
                })}
            </svg>

            {/* Center display */}
            <div className="flex flex-col items-center -mt-4">
                <motion.p
                    className="font-mono font-medium"
                    style={{ fontSize: size * 0.18, color, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                >
                    {pct}%
                </motion.p>
                <p
                    className="font-semibold mt-1 uppercase tracking-wider"
                    style={{ fontSize: size * 0.055, color, letterSpacing: '0.1em' }}
                >
                    {tier} risk
                </p>
                <p style={{ fontSize: size * 0.046, color: '#9CA3AF', marginTop: 2 }}>
                    30-Day Readmission Probability
                </p>
            </div>
        </div>
    );
}

function GaugeSkeleton({ size }) {
    return (
        <div className="flex flex-col items-center gap-3">
            <div className="skeleton rounded-full" style={{ width: size, height: size * 0.58 }} />
            <div className="skeleton h-12 w-24" />
            <div className="skeleton h-4 w-16" />
        </div>
    );
}
