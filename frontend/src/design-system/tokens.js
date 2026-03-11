/**
 * CareIQ Design System — Token Definitions (Clinical Linen Theme)
 *
 * This file exports JS token values for use in component logic.
 * CSS custom properties are defined in tokens.css, which is imported by index.css.
 *
 * The injectCSSVariables() function is a no-op since all tokens now live in tokens.css
 * (imported via @import in index.css).
 *
 * Usage:
 *   import { colors, typography, spacing } from './tokens';
 */

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTE — Clinical Linen
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: {
    base:     '#F5F4F0',      // warm off-white — main app background
    surface:  '#FAFAF8',      // card/panel surface
    elevated: '#FFFFFF',      // modals, dropdowns, focused cards
    sunken:   '#EEEDE8',      // inset areas, table zebra
    overlay:  'rgba(245, 244, 240, 0.95)', // backdrop overlays
  },

  // Accent — Rich Indigo
  accent: {
    primary:  '#4F46E5',                  // indigo-600 — main CTA, active nav
    hover:    '#4338CA',                  // indigo-700 — button hover
    light:    '#EEF2FF',                  // indigo-50 — subtle bg tint
    mid:      '#C7D2FE',                  // indigo-200 — borders on accent bg
    glow:     'rgba(79,70,229,0.12)',     // focus rings, card glows
  },

  // Risk semantic colors
  risk: {
    critical:       '#DC2626', // red-600
    criticalBg:     '#FEF2F2', // red-50
    criticalBorder: '#FECACA', // red-200
    high:           '#D97706', // amber-600
    highBg:         '#FFFBEB', // amber-50
    highBorder:     '#FDE68A', // amber-200
    medium:         '#B45309', // amber-700 (darker for light bg)
    mediumBg:       '#FEF3C7', // amber-100
    mediumBorder:   '#FCD34D', // amber-300
    low:            '#059669', // emerald-600
    lowBg:          '#ECFDF5', // emerald-50
    lowBorder:      '#A7F3D0', // emerald-200
  },

  // Typography
  text: {
    primary:   '#1C1917',   // stone-900 — near black with warm undertone
    secondary: '#57534E',   // stone-600 — secondary labels
    muted:     '#A8A29E',   // stone-400 — placeholder, disabled
    accent:    '#4F46E5',   // indigo — links, active labels
    onAccent:  '#FFFFFF',   // text on indigo backgrounds
    danger:    '#DC2626',   // red — error states
    success:   '#059669',   // emerald — success states
  },

  // Borders
  border: {
    subtle:  '#E4E2DB',  // card borders, section dividers
    default: '#D4D1C8',  // interactive elements, inputs
    strong:  '#B8B4A8',  // focused states, emphasis
  },

  // Data viz
  chart: {
    series: ['#4F46E5', '#059669', '#D97706', '#7C3AED', '#DC2626'],
    grid:    '#E4E2DB',
    tooltip: '#FFFFFF',
    axisText:'#A8A29E',
    benchmark: '#D4D1C8',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans:    "'Instrument Sans', system-ui, sans-serif",
    serif:   "'Instrument Serif', Georgia, serif",
    mono:    "'DM Mono', monospace",
    // Legacy aliases
    display: "'Instrument Sans', system-ui, sans-serif",
    body:    "'Instrument Sans', system-ui, sans-serif",
  },
  fontSize: {
    xs:   '0.75rem',    // 12px
    sm:   '0.875rem',   // 14px
    base: '1rem',       // 16px
    lg:   '1.125rem',   // 18px
    xl:   '1.25rem',    // 20px
    '2xl':'1.5rem',     // 24px
    '3xl':'1.875rem',   // 30px
    '4xl':'2.25rem',    // 36px
    '5xl':'3rem',       // 48px
  },
  fontWeight: {
    regular:   400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },
  lineHeight: {
    tight:   1.15,
    snug:    1.2,
    normal:  1.55,
    relaxed: 1.6,
    loose:   2,
  },
  letterSpacing: {
    tighter: '-0.03em',
    tight:   '-0.02em',
    normal:  '0',
    wide:    '0.01em',
    wider:   '0.05em',
    widest:  '0.07em',
  },
  googleFontsUrl:
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&display=swap',
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
  sm:   '6px',
  md:   '10px',
  lg:   '14px',
  xl:   '20px',
  pill: '999px',
  full: '9999px',
};

// ─────────────────────────────────────────────────────────────────────────────
// SHADOWS
// ─────────────────────────────────────────────────────────────────────────────

export const shadows = {
  xs:       '0 1px 2px rgba(28,25,23,0.06)',
  sm:       '0 1px 3px rgba(28,25,23,0.08), 0 1px 2px rgba(28,25,23,0.06)',
  md:       '0 4px 6px rgba(28,25,23,0.07), 0 2px 4px rgba(28,25,23,0.06)',
  lg:       '0 10px 15px rgba(28,25,23,0.08), 0 4px 6px rgba(28,25,23,0.05)',
  card:     '0 1px 3px rgba(28,25,23,0.08), 0 0 0 1px #E4E2DB',
  elevated: '0 4px 16px rgba(28,25,23,0.10), 0 0 0 1px #D4D1C8',
  accent:   '0 0 0 3px rgba(79,70,229,0.12)',
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
  fast:   '120ms cubic-bezier(0.4, 0, 0.2, 1)',
  base:   '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow:   '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Z-INDEX SCALE
// ─────────────────────────────────────────────────────────────────────────────

export const zIndex = {
  base:     0,
  dropdown: 100,
  sticky:   200,
  overlay:  300,
  modal:    400,
  popover:  500,
  tooltip:  600,
  toast:    700,
};

// ─────────────────────────────────────────────────────────────────────────────
// CSS VARIABLE INJECTION
// All tokens are now defined in tokens.css (imported by index.css).
// This function is kept as a no-op for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

export function injectCSSVariables() {
  // No-op: CSS custom properties are now defined in design-system/tokens.css
  // and loaded through the @import in index.css.
  // Kept here for any direct callers to avoid breaking imports.
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME OBJECT
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
