/**
 * CareIQ Chart Tokens — Clinical Linen Theme
 *
 * CSS custom properties don't work inside Recharts SVG elements.
 * Use these hardcoded values in ALL Recharts components.
 *
 * Usage:
 *   import { C, AXIS, GRID, TOOLTIP } from '../design-system/chartTokens';
 */

export const C = {
  indigo:     '#4F46E5',   // primary series — indigo-600
  emerald:    '#059669',   // secondary series
  amber:      '#D97706',   // tertiary series
  violet:     '#7C3AED',   // quaternary series
  red:        '#DC2626',   // danger / critical series
  benchmark:  '#D4D1C8',   // stone — dashed benchmark/reference line
  grid:       '#E4E2DB',   // subtle grid lines
  axisText:   '#A8A29E',   // axis labels — stone-400
  surface:    '#FAFAF8',   // chart background
  border:     '#E4E2DB',   // tooltip border
  textPrimary:'#1C1917',   // stone-900
  textSecondary: '#57534E', // stone-600
  tooltipBg:  '#FFFFFF',   // tooltip background
}

export const AXIS = {
  fontSize: 11,
  fill: C.axisText,
  fontFamily: 'DM Mono, monospace',
}

export const GRID = {
  strokeDasharray: '3 3',
  stroke: C.grid,
  vertical: false,
}

export const TOOLTIP = {
  contentStyle: {
    background: C.tooltipBg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: C.textPrimary,
    fontFamily: 'Instrument Sans, sans-serif',
    boxShadow: '0 4px 16px rgba(28,25,23,0.10)',
    padding: '8px 12px',
  },
  labelStyle: {
    fontWeight: 600,
    color: C.textPrimary,
    marginBottom: 4,
  },
  cursor: { stroke: C.border, strokeWidth: 1 },
}

// Ordered palette for multi-series charts
export const SERIES_COLORS = [
  C.indigo,
  C.emerald,
  C.amber,
  C.violet,
  C.red,
]
