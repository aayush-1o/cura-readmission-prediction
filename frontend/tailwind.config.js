/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                // Backgrounds
                'bg-base':        'var(--bg-base)',
                'bg-surface':     'var(--bg-surface)',
                'bg-elevated':    'var(--bg-elevated)',
                'bg-sunken':      'var(--bg-sunken)',
                // Borders
                'border-subtle':  'var(--border-subtle)',
                'border-default': 'var(--border-default)',
                'border-strong':  'var(--border-strong)',
                // Accent
                'accent':         'var(--accent-primary)',
                'accent-hover':   'var(--accent-hover)',
                'accent-light':   'var(--accent-light)',
                'accent-mid':     'var(--accent-mid)',
                // Text
                'text-primary':   'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-muted':     'var(--text-muted)',
                'text-accent':    'var(--accent-primary)',
                // Risk
                'risk-critical':  'var(--risk-critical)',
                'risk-high':      'var(--risk-high)',
                'risk-medium':    'var(--risk-medium)',
                'risk-low':       'var(--risk-low)',
            },
            fontFamily: {
                sans:  ['Instrument Sans', 'system-ui', 'sans-serif'],
                serif: ['Instrument Serif', 'Georgia', 'serif'],
                mono:  ['DM Mono', 'monospace'],
                // Legacy aliases — kept for backward-compat
                display: ['Instrument Sans', 'system-ui', 'sans-serif'],
                body:    ['Instrument Sans', 'system-ui', 'sans-serif'],
            },
            fontSize: {
                'xs': ['0.75rem', { lineHeight: '1rem' }],
                'sm': ['0.875rem', { lineHeight: '1.25rem' }],
                'base': ['1rem', { lineHeight: '1.5rem' }],
                'lg': ['1.125rem', { lineHeight: '1.75rem' }],
                'xl': ['1.25rem', { lineHeight: '1.75rem' }],
                '2xl': ['1.5rem', { lineHeight: '2rem' }],
                '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
                '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
                '5xl': ['3rem', { lineHeight: '1' }],
            },
            borderRadius: {
                sm:   'var(--radius-sm)',
                md:   'var(--radius-md)',
                lg:   'var(--radius-lg)',
                xl:   'var(--radius-xl)',
                pill: 'var(--radius-pill)',
                '2xl': '24px',
                full: '9999px',
            },
            boxShadow: {
                'xs':       'var(--shadow-xs)',
                'sm':       'var(--shadow-sm)',
                'md':       'var(--shadow-md)',
                'lg':       'var(--shadow-lg)',
                'card':     'var(--shadow-card)',
                'elevated': 'var(--shadow-elevated)',
                'accent':   'var(--shadow-accent)',
            },
            animation: {
                'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
                'shimmer':     'shimmer 1.8s ease-in-out infinite',
                'fade-in':     'fadeIn 0.2s ease forwards',
                'fade-in-up':  'fadeUp 0.35s ease forwards',
                'scale-in':    'scaleIn 0.2s ease forwards',
                'slide-right': 'slideInRight 0.3s ease forwards',
            },
            keyframes: {
                shimmer: {
                    'from': { backgroundPosition: '-600px 0' },
                    'to':   { backgroundPosition: '600px 0' },
                },
                fadeIn: {
                    '0%':   { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeUp: {
                    '0%':   { opacity: '0', transform: 'translateY(16px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                scaleIn: {
                    '0%':   { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                slideInRight: {
                    '0%':   { opacity: '0', transform: 'translateX(20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
            },
            transitionDuration: {
                fast: '120ms',
                base: '200ms',
                slow: '350ms',
            },
        },
    },
    plugins: [],
};
