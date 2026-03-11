/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                'bg-primary': '#0A0F1C',
                'bg-secondary': '#111827',
                'bg-tertiary': '#1C2333',
                'bg-sidebar': '#080D18',
                'accent': '#00D4FF',
                'accent-hover': '#00B8E0',
                'success': '#10B981',
                'warning': '#F59E0B',
                'danger': '#EF4444',
                'info': '#3B82F6',
                'text-primary': '#F9FAFB',
                'text-secondary': '#9CA3AF',
                'text-muted': '#4B5563',
                'border-default': '#1F2937',
            },
            fontFamily: {
                display: ['"DM Sans"', 'system-ui', 'sans-serif'],
                body: ['"Inter"', 'system-ui', 'sans-serif'],
                mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
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
                sm: '4px',
                md: '8px',
                lg: '12px',
                xl: '16px',
                '2xl': '24px',
                full: '9999px',
            },
            boxShadow: {
                'card': '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)',
                'card-hover': '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.2)',
                'accent-glow': '0 0 20px rgba(0,212,255,0.35)',
                'danger-glow': '0 0 16px rgba(239,68,68,0.35)',
                'success-glow': '0 0 16px rgba(16,185,129,0.35)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
                'shimmer': 'shimmer 1.5s infinite',
                'fade-in': 'fadeIn 0.2s ease forwards',
                'fade-in-up': 'fadeInUp 0.3s ease forwards',
                'draw-line': 'drawLine 0.6s ease-out forwards',
            },
            keyframes: {
                shimmer: {
                    '0%': { backgroundPosition: '-1000px 0' },
                    '100%': { backgroundPosition: '1000px 0' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                drawLine: {
                    '0%': { strokeDashoffset: '1000' },
                    '100%': { strokeDashoffset: '0' },
                },
            },
            transitionDuration: {
                fast: '100ms',
                base: '200ms',
                slow: '300ms',
            },
        },
    },
    plugins: [],
};
