# CareIQ Design Specification

> **Version**: 1.0.0 | **Phase**: 0 — Scaffolding & Design System  
> **Status**: ✅ Canonical — all future UI work must conform to this document.

This document is the **single source of truth** for all visual and interaction design decisions in the CareIQ platform. Any deviation requires explicit sign-off and an update to this document.

---

## 1. Design Philosophy

**Clinical precision meets modern fintech.**

CareIQ is used by clinicians, care coordinators, and hospital administrators to make high-stakes decisions about patient care. The design must communicate:

- **Trust** — Dense information, no gimmicks. Every pixel earns its place.
- **Clarity** — Risk must be instantly legible. Colors carry semantic weight.
- **Speed** — Clinicians scan, not read. Information hierarchy must be ruthlessly clear.
- **Precision** — Data values are sacred. Typography choices emphasize accuracy over decoration.

**Inspiration**: Bloomberg Terminal data density + Vercel/Linear minimalism + Figma's dark UI precision.

---

## 2. Color System

### 2.1 Background Palette

All backgrounds use a dark navy palette. Never use pure black (`#000000`) — it creates too much contrast and hurts readability in clinical contexts.

| Token               | Hex Value   | CSS Variable          | Usage                            |
|---------------------|-------------|----------------------|----------------------------------|
| `bg.primary`        | `#0A0F1C`   | `--bg-primary`       | Main app background              |
| `bg.secondary`      | `#111827`   | `--bg-secondary`     | Card surfaces, panels            |
| `bg.tertiary`       | `#1C2333`   | `--bg-tertiary`      | Nested cards, hover states       |
| `bg.sidebar`        | `#080D18`   | `--bg-sidebar`       | Sidebar navigation               |
| `bg.overlay`        | `rgba(10,15,28,0.85)` | `--bg-overlay` | Modal backdrops           |

### 2.2 Accent Color

The primary accent (`#00D4FF`, electric cyan) is used **sparingly**. Its job is to guide the eye to the most important interactive and data elements.

**✅ USE cyan for:**
- Primary CTA buttons
- Active nav items
- Focus rings on inputs
- Key metrics (current risk score, patient count)
- Sparklines / primary chart series
- Selected row highlights

**❌ NEVER USE cyan for:**
- Decorative borders that carry no meaning
- Text that isn't a link or key value
- More than 2 elements per screen section simultaneously

### 2.3 Risk / Status Colors

These four colors carry clinical meaning. Apply them consistently — a clinician shouldn't have to guess what red means.

| Color  | Hex       | CSS Variable           | Meaning                    |
|--------|-----------|------------------------|----------------------------|
| Green  | `#10B981` | `--status-success`     | Low risk / stable          |
| Amber  | `#F59E0B` | `--status-warning`     | Medium risk / watch        |
| Red    | `#EF4444` | `--status-danger`      | High risk / critical / alert |
| Blue   | `#3B82F6` | `--status-info`        | Informational / pending    |

Use the `*-muted` variants (`rgba` with 0.15 alpha) for badge backgrounds, row highlights, and subtle indicators.

### 2.4 Text Hierarchy

Three levels of text. Never invent a fourth.

| Role      | Color     | Token              | Usage                         |
|-----------|-----------|-------------------|-------------------------------|
| Primary   | `#F9FAFB` | `--text-primary`  | Body copy, labels, values     |
| Secondary | `#9CA3AF` | `--text-secondary`| Subheadings, metadata, dates  |
| Muted     | `#4B5563` | `--text-muted`    | Placeholders, disabled states |

---

## 3. Typography

### 3.1 Font Loading

Load fonts via Google Fonts link in `index.html`:
```
https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@...&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap
```

**Never** use system fonts for rendered UI text. System fonts are only acceptable in loading states before fonts are available.

### 3.2 Font Role Assignments

| Font         | Role             | Weights Used | Usage                                          |
|--------------|-----------------|--------------|------------------------------------------------|
| DM Sans      | Display/Headers  | 700, 800     | Page titles, section headers, dashboard KPIs   |
| Inter        | Body/UI          | 400, 500, 600| Body text, labels, nav items, buttons          |
| JetBrains Mono | Monospace/Data | 400, 500    | Patient IDs, lab values, timestamps, code      |

### 3.3 Scale

Use a consistent type scale. Don't invent custom sizes.

```
xs:   12px  — Table cell metadata, badge labels
sm:   14px  — Body text, sidebar nav, form labels
base: 16px  — Standard UI text
lg:   18px  — Card titles, section subtitles
xl:   20px  — Page subheadings
2xl:  24px  — Page headings
3xl:  30px  — Large KPI values
4xl:  36px  — Dashboard hero metrics
5xl:  48px  — Exceptional display only (landing page)
```

---

## 4. Component Patterns

### 4.1 Cards

```css
background: var(--bg-secondary);
border: 1px solid var(--border-default);
border-radius: 12px;
box-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3);
padding: 24px;
```

On hover, apply — do not apply on static display cards:
```css
box-shadow: var(--shadow-card-hover);
transition: box-shadow 200ms ease;
```

Nested content uses `bg.tertiary` (`#1C2333`).

### 4.2 Buttons

**Primary Button** (main CTA):
```css
background: var(--accent-primary);   /* #00D4FF */
color: #0A0F1C;                       /* dark text on light accent */
border: none;
border-radius: 8px;
font-family: var(--font-body);
font-weight: 600;
font-size: 14px;
padding: 10px 20px;
transition: background 200ms ease;
```

**Ghost Button** (secondary action):
```css
background: transparent;
border: 1px solid var(--accent-primary);
color: var(--accent-primary);
```

**Danger Button** (destructive):
```css
background: transparent;
border: 1px solid var(--status-danger);
color: var(--status-danger);
```

### 4.3 Data Tables

```css
/* Table container */
background: var(--bg-secondary);
border-radius: 12px;
border: 1px solid var(--border-default);

/* Row alternating (zebra) */
row-even: background: #111827;  /* --bg-secondary */
row-odd:  background: #0D1321;  /* slightly darker tint */

/* Header row */
background: #0A0F1C;
color: var(--text-secondary);
font-size: 12px;
font-weight: 600;
letter-spacing: 0.05em;
text-transform: uppercase;

/* Selected row */
background: rgba(0, 212, 255, 0.08);
border-left: 2px solid var(--accent-primary);
```

### 4.4 Status Badges

Pill-shaped, color-coded badges. Use semantic colors only.

```css
display: inline-flex;
align-items: center;
padding: 3px 10px;
border-radius: 9999px;
font-size: 12px;
font-weight: 500;
```

Badge variants:
- **Low Risk**: `color: #10B981; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3)`
- **Med Risk**: `color: #F59E0B; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3)`
- **High Risk**: `color: #EF4444; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3)`

### 4.5 Form Inputs

```css
background: var(--bg-secondary);    /* #111827 */
border: 1px solid var(--border-default);
border-radius: 8px;
color: var(--text-primary);
font-family: var(--font-body);
padding: 10px 14px;
transition: border-color 150ms ease, box-shadow 150ms ease;

/* Focus state */
border-color: var(--accent-primary);
box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
outline: none;
```

### 4.6 Navigation Sidebar

- Width: `240px` collapsed to `64px`
- Background: `#080D18`
- Items: 44px height, 12px border-radius
- Active item: `background: rgba(0,212,255,0.10); border-left: 2px solid #00D4FF; color: #00D4FF`
- Hover: `background: rgba(255,255,255,0.05)`
- Groups: uppercase labels, 11px, letter-spacing 0.08em, `--text-muted`

### 4.7 Charts

All charts share this base config:
```javascript
{
  background: 'transparent',
  grid: { stroke: '#1F2937', strokeDasharray: '3 3' },
  axis: { stroke: '#4B5563', tick: { fill: '#9CA3AF', fontSize: 12 } },
  tooltip: {
    contentStyle: { background: '#1C2333', border: '1px solid #1F2937' },
    labelStyle: { color: '#F9FAFB' },
  },
  // Primary series: cyan. Secondary: green/amber/red for risk bands.
}
```

---

## 5. Layout Architecture

```
┌─ Sidebar (240px) ─┬──────────── Main Content Area ────────────────┐
│                   │ ┌─ Header (64px) ──────────────────────────┐  │
│  Logo             │ │ Breadcrumb    Search    Notifications User│  │
│                   │ └───────────────────────────────────────────┘  │
│  Nav Items        │                                                 │
│                   │  ┌────────────────────────────────────────┐    │
│  Section Groups   │  │  Page Content                          │    │
│                   │  │  max-width: 1440px, padding: 24px      │    │
│  User / Settings  │  └────────────────────────────────────────┘    │
└───────────────────┴─────────────────────────────────────────────────┘
```

---

## 6. Motion & Animation

- **Duration**: Fast = 100ms, Base = 200ms, Slow = 300ms
- **Easing**: `ease` for most transitions. Spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for popins.
- **Hover states**: 200ms opacity/color transitions always enabled.
- **Page transitions**: Fade-in 200ms. No slide transitions—they feel sluggish in data-dense UIs.
- **Loading states**: Skeleton shimmer using gradient animation, never spinners for inline data.
- **Chart animations**: 600ms ease-out on mount only. No loop animations on charts.

---

## 7. Accessibility

- All color pairs must meet **WCAG AA** (4.5:1) minimum. Cyan on dark navy achieves ~8.5:1.
- Focus rings are always visible — never set `outline: none` without a replacement.
- All icons have accessible labels or `aria-hidden="true"` with adjacent text.
- Tables use `<th scope="col">` and `<tr role="row">`.

---

## 8. Do's and Don'ts

| ✅ Do                                      | ❌ Don't                                      |
|-------------------------------------------|----------------------------------------------|
| Use semantic color tokens                 | Use raw hex values outside of `tokens.js`    |
| Import from `design-system/tokens.js`    | Hardcode colors in component files           |
| Keep components under 200 lines          | Mix business logic with presentation         |
| Use `JetBrains Mono` for all data values | Display patient IDs in Inter/DM Sans         |
| Use status badges for risk levels         | Use just text color to convey risk           |
| Add hover/focus states to all interactive elements | Leave clickable areas without feedback |
| Test at 1280px, 1440px, 1920px widths    | Optimize only for one viewport              |
