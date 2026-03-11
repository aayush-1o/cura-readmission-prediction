import clsx from 'clsx';
import { motion } from 'framer-motion';

const RISK_CONFIG = {
    low: {
        label: 'Low Risk',
        textColor: '#10B981',
        bg: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.30)',
        dotClass: 'bg-success',
        pulse: false,
        glow: false,
    },
    medium: {
        label: 'Med Risk',
        textColor: '#F59E0B',
        bg: 'rgba(245,158,11,0.15)',
        border: 'rgba(245,158,11,0.30)',
        dotClass: 'bg-warning',
        pulse: false,
        glow: false,
    },
    high: {
        label: 'High Risk',
        textColor: '#EF4444',
        bg: 'rgba(239,68,68,0.15)',
        border: 'rgba(239,68,68,0.30)',
        dotClass: 'bg-danger',
        pulse: true,
        glow: false,
    },
    critical: {
        label: 'Critical',
        textColor: '#EF4444',
        bg: 'rgba(239,68,68,0.18)',
        border: 'rgba(239,68,68,0.50)',
        dotClass: 'bg-danger',
        pulse: true,
        glow: true,
    },
};

/**
 * RiskBadge — pill badge showing risk tier with semantic colors.
 * @param {string} tier - 'low' | 'medium' | 'high' | 'critical'
 * @param {string} size - 'sm' | 'md'
 * @param {boolean} showDot - show the status dot
 */
export default function RiskBadge({ tier = 'low', size = 'md', showDot = true, className = '' }) {
    const config = RISK_CONFIG[tier] || RISK_CONFIG.low;
    const isSm = size === 'sm';

    return (
        <span
            className={clsx('inline-flex items-center gap-1.5 font-medium', className)}
            style={{
                backgroundColor: config.bg,
                border: `1px solid ${config.border}`,
                color: config.textColor,
                borderRadius: '9999px',
                padding: isSm ? '2px 8px' : '3px 10px',
                fontSize: isSm ? '11px' : '12px',
                letterSpacing: '0.01em',
                boxShadow: config.glow ? `0 0 12px rgba(239,68,68,0.35)` : 'none',
                whiteSpace: 'nowrap',
            }}
        >
            {showDot && (
                <span
                    className={clsx(
                        'rounded-full flex-shrink-0',
                        isSm ? 'w-1.5 h-1.5' : 'w-2 h-2',
                        config.glow || config.pulse ? 'pulse-danger' : ''
                    )}
                    style={{ backgroundColor: config.textColor }}
                />
            )}
            {config.label}
        </span>
    );
}
