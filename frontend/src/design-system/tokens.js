/**
 * CareIQ Design System — Token Definitions
 *
 * This is the single source of truth for all visual design tokens.
 * Import this file anywhere you need design values.
 *
 * Usage:
 *   import { colors, typography, spacing } from './tokens';
 *   import { injectCSSVariables } from './tokens';
 *
 * Call injectCSSVariables() once at app root (main.jsx) to make
 * CSS custom properties available globally.
 */

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTE
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: {
    primary: '#0A0F1C',      // Deep navy — main app background
    secondary: '#111827',    // Dark card surface
    tertiary: '#1C2333',     // Slightly lighter panel / card
    sidebar: '#080D18',      // Sidebar — darker than primary bg
    overlay: 'rgba(10, 15, 28, 0.85)', // Modal overlays
  },

  // Accent
  accent: {
    primary: '#00D4FF',             // Electric cyan — CTAs, highlights, sparklines
    primaryHover: '#00B8E0',        // Cyan hover state
    primaryMuted: 'rgba(0, 212, 255, 0.12)', // Cyan translucent bg
    primaryGlow: '0 0 20px rgba(0, 212, 255, 0.35)', // Cyan glow shadow
  },

  // Risk / Status
  status: {
    success: '#10B981',            // Emerald green — low risk
    successMuted: 'rgba(16, 185, 129, 0.15)',
    warning: '#F59E0B',            // Amber — medium risk
    warningMuted: 'rgba(245, 158, 11, 0.15)',
    danger: '#EF4444',             // Red — high risk / critical
    dangerMuted: 'rgba(239, 68, 68, 0.15)',
    info: '#3B82F6',               // Blue — informational
    infoMuted: 'rgba(59, 130, 246, 0.15)',
  },

  // Typography
  text: {
    primary: '#F9FAFB',    // Near-white — primary text
    secondary: '#9CA3AF',  // Gray — secondary / subtext
    muted: '#4B5563',      // Dark gray — disabled / muted
    inverse: '#0A0F1C',    // For text on light/accent backgrounds
    accent: '#00D4FF',     // Cyan text for highlighted values
  },

  // Borders
  border: {
    default: '#1F2937',         // Subtle border
    focus: '#00D4FF',           // Focus ring (cyan)
    subtle: 'rgba(31, 41, 55, 0.6)', // Ultra-subtle dividers
  },

  // Chart palette (ordered by usage priority)
  chart: {
    series: ['#00D4FF', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'],
    grid: '#1F2937',
    tooltip: '#1C2333',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────────

export const typography = {
  // Font families
  fontFamily: {
    display: '"DM Sans", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },

  // Font sizes (rem-based, assumes 16px root)
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },

  // Font weights
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  // Line heights
  lineHeight: {
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  // Letter spacings
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },

  // Google Fonts import URL
  googleFontsUrl:
    'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;1,9..40,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
};

// ─────────────────────────────────────────────────────────────────────────────
// SPACING SCALE
// ─────────────────────────────────────────────────────────────────────────────

export const spacing = {
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
};

// ─────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────────────────────────────────────

export const borderRadius = {
  none: '0',
  sm: '4px',
  md: '8px',      // Inputs, small buttons
  lg: '12px',     // Cards — primary card radius
  xl: '16px',
  '2xl': '24px',
  full: '9999px', // Pill badges, avatars
};

// ─────────────────────────────────────────────────────────────────────────────
// SHADOWS
// ─────────────────────────────────────────────────────────────────────────────

export const shadows = {
  card: '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)',
  cardHover: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.2)',
  accentGlow: '0 0 20px rgba(0, 212, 255, 0.35)',
  successGlow: '0 0 16px rgba(16, 185, 129, 0.35)',
  dangerGlow: '0 0 16px rgba(239, 68, 68, 0.35)',
  dropdown: '0 8px 32px rgba(0,0,0,0.6)',
  modal: '0 20px 60px rgba(0,0,0,0.8)',
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export const layout = {
  sidebarWidth: '240px',
  sidebarCollapsedWidth: '64px',
  headerHeight: '64px',
  contentMaxWidth: '1440px',
  contentPadding: spacing[6],
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const transitions = {
  fast: '100ms ease',
  base: '200ms ease',
  slow: '300ms ease',
  spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Z-INDEX SCALE
// ─────────────────────────────────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  popover: 500,
  tooltip: 600,
  toast: 700,
};

// ─────────────────────────────────────────────────────────────────────────────
// CSS VARIABLE INJECTION
// Injects all tokens as CSS custom properties on :root.
// Call once in main.jsx before rendering the app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injects all design tokens as CSS custom properties into the document root.
 * Must be called before the React tree renders.
 */
export function injectCSSVariables() {
  const root = document.documentElement;

  // Background colors
  root.style.setProperty('--bg-primary', colors.bg.primary);
  root.style.setProperty('--bg-secondary', colors.bg.secondary);
  root.style.setProperty('--bg-tertiary', colors.bg.tertiary);
  root.style.setProperty('--bg-sidebar', colors.bg.sidebar);
  root.style.setProperty('--bg-overlay', colors.bg.overlay);

  // Accent colors
  root.style.setProperty('--accent-primary', colors.accent.primary);
  root.style.setProperty('--accent-primary-hover', colors.accent.primaryHover);
  root.style.setProperty('--accent-primary-muted', colors.accent.primaryMuted);

  // Status colors
  root.style.setProperty('--status-success', colors.status.success);
  root.style.setProperty('--status-success-muted', colors.status.successMuted);
  root.style.setProperty('--status-warning', colors.status.warning);
  root.style.setProperty('--status-warning-muted', colors.status.warningMuted);
  root.style.setProperty('--status-danger', colors.status.danger);
  root.style.setProperty('--status-danger-muted', colors.status.dangerMuted);
  root.style.setProperty('--status-info', colors.status.info);
  root.style.setProperty('--status-info-muted', colors.status.infoMuted);

  // Text colors
  root.style.setProperty('--text-primary', colors.text.primary);
  root.style.setProperty('--text-secondary', colors.text.secondary);
  root.style.setProperty('--text-muted', colors.text.muted);
  root.style.setProperty('--text-accent', colors.text.accent);

  // Borders
  root.style.setProperty('--border-default', colors.border.default);
  root.style.setProperty('--border-focus', colors.border.focus);

  // Typography
  root.style.setProperty('--font-display', typography.fontFamily.display);
  root.style.setProperty('--font-body', typography.fontFamily.body);
  root.style.setProperty('--font-mono', typography.fontFamily.mono);

  // Border radius
  root.style.setProperty('--radius-md', borderRadius.md);
  root.style.setProperty('--radius-lg', borderRadius.lg);
  root.style.setProperty('--radius-full', borderRadius.full);

  // Shadows
  root.style.setProperty('--shadow-card', shadows.card);
  root.style.setProperty('--shadow-card-hover', shadows.cardHover);
  root.style.setProperty('--shadow-accent-glow', shadows.accentGlow);

  // Layout
  root.style.setProperty('--sidebar-width', layout.sidebarWidth);
  root.style.setProperty('--sidebar-collapsed-width', layout.sidebarCollapsedWidth);
  root.style.setProperty('--header-height', layout.headerHeight);

  // Transitions
  root.style.setProperty('--transition-fast', transitions.fast);
  root.style.setProperty('--transition-base', transitions.base);
  root.style.setProperty('--transition-slow', transitions.slow);
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME OBJECT (convenience export for styled-components / emotion if needed)
// ─────────────────────────────────────────────────────────────────────────────

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  layout,
  transitions,
  zIndex,
};

export default theme;
