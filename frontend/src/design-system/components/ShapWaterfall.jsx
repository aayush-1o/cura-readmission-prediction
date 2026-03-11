import { motion } from 'framer-motion';

const MAX_SHAP = 0.35; // Normalize bar width relative to this max

/**
 * ShapWaterfall — horizontal SHAP explanation chart.
 * Positive SHAP values (increases risk) = red bars.
 * Negative SHAP values (protective) = green bars.
 * @param {Array} factors - Array of { feature, display_label, shap_value, direction }
 */
export default function ShapWaterfall({ factors = [], isLoading = false }) {
    if (isLoading) return <ShapSkeleton />;

    const sorted = [...factors]
        .filter((f) => f.shap_value !== null && f.shap_value !== undefined)
        .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
        .slice(0, 8);

    if (sorted.length === 0) return (
        <EmptyState message="No SHAP risk factors available for this admission." />
    );

    return (
        <div className="space-y-2">
            {sorted.map((factor, i) => {
                const isPositive = factor.shap_value > 0;
                const absVal = Math.abs(factor.shap_value);
                const pct = Math.min((absVal / MAX_SHAP) * 100, 100);
                const color = isPositive ? '#EF4444' : '#10B981';
                const bgColor = isPositive ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)';

                return (
                    <motion.div
                        key={factor.feature}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className="group"
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span
                                className="truncate max-w-[200px]"
                                style={{ fontSize: '12px', fontWeight: 500, color: '#F9FAFB' }}
                                title={factor.display_label || factor.feature}
                            >
                                {factor.display_label || factor.feature}
                            </span>
                            <div className="flex items-center gap-2 ml-2">
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontFamily: '"JetBrains Mono", monospace',
                                        color,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {isPositive ? '+' : ''}{factor.shap_value.toFixed(3)}
                                </span>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        background: bgColor,
                                        color,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {isPositive ? '↑ Risk' : '↓ Risk'}
                                </span>
                            </div>
                        </div>

                        {/* Bar track */}
                        <div
                            className="relative"
                            style={{ height: '6px', background: '#1C2333', borderRadius: '3px', overflow: 'hidden' }}
                        >
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ delay: i * 0.06 + 0.1, duration: 0.5, ease: 'easeOut' }}
                                style={{
                                    height: '100%',
                                    background: color,
                                    borderRadius: '3px',
                                    boxShadow: isPositive ? `0 0 6px rgba(239,68,68,0.4)` : `0 0 6px rgba(16,185,129,0.4)`,
                                }}
                            />
                        </div>
                    </motion.div>
                );
            })}

            {/* Legend */}
            <div
                className="flex items-center gap-4 pt-2 mt-1"
                style={{ borderTop: '1px solid #1F2937', fontSize: '11px', color: '#9CA3AF' }}
            >
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded inline-block" style={{ background: '#EF4444' }} />
                    Increases readmission risk
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded inline-block" style={{ background: '#10B981' }} />
                    Protective factor
                </span>
            </div>
        </div>
    );
}

function ShapSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                    <div className="skeleton h-3 w-40" />
                    <div className="skeleton h-1.5 w-full" />
                </div>
            ))}
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="flex flex-col items-center justify-center py-8" style={{ color: '#4B5563' }}>
            <p style={{ fontSize: '13px' }}>{message}</p>
        </div>
    );
}
