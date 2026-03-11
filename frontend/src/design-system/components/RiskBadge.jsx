/**
 * RiskBadge — final Clinical Linen version.
 * Uses CSS custom properties from tokens.css for all colors.
 * Pulsing dot on critical tier only.
 */
const RISK_CONFIG = {
    critical: {
        label: 'Critical',
        color:  'var(--risk-critical)',
        bg:     'var(--risk-critical-bg)',
        border: 'var(--risk-critical-border)',
        pulse:  true,
    },
    high: {
        label: 'High',
        color:  'var(--risk-high)',
        bg:     'var(--risk-high-bg)',
        border: 'var(--risk-high-border)',
        pulse:  false,
    },
    medium: {
        label: 'Medium',
        color:  'var(--risk-medium)',
        bg:     'var(--risk-medium-bg)',
        border: 'var(--risk-medium-border)',
        pulse:  false,
    },
    low: {
        label: 'Low',
        color:  'var(--risk-low)',
        bg:     'var(--risk-low-bg)',
        border: 'var(--risk-low-border)',
        pulse:  false,
    },
};

/**
 * RiskBadge
 * @param {string}  tier     - 'low' | 'medium' | 'high' | 'critical'
 * @param {string}  size     - 'sm' | 'md'
 * @param {boolean} showDot  - show the status dot (default true)
 */
export default function RiskBadge({ tier = 'low', size = 'md', showDot = true }) {
    const cfg = RISK_CONFIG[tier] ?? RISK_CONFIG.low;
    const isSm = size === 'sm';

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: cfg.bg,
                color: cfg.color,
                border: `1px solid ${cfg.border}`,
                borderRadius: 'var(--radius-pill)',
                padding: isSm ? '2px 7px' : '3px 9px',
                fontSize: isSm ? 11 : 12,
                fontWeight: 600,
                fontFamily: "'Instrument Sans', sans-serif",
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
            }}
        >
            {showDot && (
                <span
                    className={cfg.pulse ? 'pulse-dot' : ''}
                    style={{
                        width: isSm ? 5 : 6,
                        height: isSm ? 5 : 6,
                        borderRadius: '50%',
                        background: cfg.color,
                        flexShrink: 0,
                        display: 'inline-block',
                    }}
                />
            )}
            {cfg.label}
        </span>
    );
}
