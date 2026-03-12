"""Inject CareIQ Clinical Linen CSS into Streamlit."""
import streamlit as st


def inject_styles():
    st.markdown(
        """
        <style>
        /* ── CareIQ Clinical Linen Design System ── */
        :root {
            --bg-base: #F5F4F0;
            --bg-surface: #FAFAF8;
            --bg-elevated: #FFFFFF;
            --accent: #4F46E5;
            --accent-hover: #4338CA;
            --accent-light: #EEF2FF;
            --text-primary: #1C1917;
            --text-secondary: #57534E;
            --text-muted: #A8A29E;
            --border: #E7E5E0;
            --risk-critical: #DC2626;
            --risk-critical-bg: #FEF2F2;
            --risk-high: #D97706;
            --risk-high-bg: #FFFBEB;
            --risk-medium: #B45309;
            --risk-medium-bg: #FEF3C7;
            --risk-low: #059669;
            --risk-low-bg: #ECFDF5;
        }

        /* Global background */
        .stApp { background-color: var(--bg-base); }

        /* Sidebar */
        [data-testid="stSidebar"] {
            background: var(--bg-elevated) !important;
            border-right: 1px solid var(--border);
        }

        /* Sidebar brand */
        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0 16px 0;
        }
        .brand-icon { font-size: 2rem; }
        .brand-name {
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--accent);
            letter-spacing: -0.3px;
        }
        .brand-tagline {
            font-size: 0.68rem;
            color: var(--text-muted);
            letter-spacing: 0.3px;
        }

        /* Sidebar nav buttons */
        [data-testid="stSidebar"] .stButton > button {
            background: transparent !important;
            border: none !important;
            color: var(--text-secondary) !important;
            font-size: 0.9rem !important;
            font-weight: 500 !important;
            text-align: left !important;
            padding: 8px 12px !important;
            border-radius: 8px !important;
            width: 100% !important;
            transition: background 0.15s, color 0.15s !important;
        }
        [data-testid="stSidebar"] .stButton > button:hover {
            background: var(--accent-light) !important;
            color: var(--accent) !important;
        }

        /* Sidebar stats */
        .sidebar-stats {
            display: flex;
            gap: 16px;
            padding: 8px 0;
        }
        .sidebar-stat { text-align: center; flex: 1; }
        .stat-num {
            display: block;
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--accent);
        }
        .stat-num.critical { color: var(--risk-critical); }
        .stat-label {
            display: block;
            font-size: 0.65rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .sidebar-footer {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-align: center;
            line-height: 1.5;
        }

        /* Page header */
        .page-header {
            margin-bottom: 1.5rem;
        }
        .page-title {
            font-size: 1.6rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0;
        }
        .page-subtitle {
            font-size: 0.88rem;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        /* KPI tiles */
        .kpi-tile {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            height: 100%;
            position: relative;
            overflow: hidden;
        }
        .kpi-tile::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 3px;
            background: var(--accent);
            border-radius: 12px 12px 0 0;
        }
        .kpi-tile.critical::before { background: var(--risk-critical); }
        .kpi-tile.high::before { background: var(--risk-high); }
        .kpi-tile.success::before { background: var(--risk-low); }
        .kpi-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            font-weight: 600;
            margin-bottom: 6px;
        }
        .kpi-value {
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1;
        }
        .kpi-value.critical { color: var(--risk-critical); }
        .kpi-value.high { color: var(--risk-high); }
        .kpi-value.success { color: var(--risk-low); }
        .kpi-sub {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-top: 4px;
        }
        .kpi-delta {
            display: inline-block;
            font-size: 0.72rem;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            margin-top: 6px;
        }
        .kpi-delta.up { background: #FEF2F2; color: var(--risk-critical); }
        .kpi-delta.down { background: #ECFDF5; color: var(--risk-low); }

        /* Risk badge */
        .risk-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.72rem;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .risk-badge.critical {
            background: var(--risk-critical-bg);
            color: var(--risk-critical);
            border: 1px solid #FECACA;
        }
        .risk-badge.high {
            background: var(--risk-high-bg);
            color: var(--risk-high);
            border: 1px solid #FDE68A;
        }
        .risk-badge.medium {
            background: var(--risk-medium-bg);
            color: var(--risk-medium);
            border: 1px solid #FCD34D;
        }
        .risk-badge.low {
            background: var(--risk-low-bg);
            color: var(--risk-low);
            border: 1px solid #A7F3D0;
        }

        /* Cards */
        .card {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
        }
        .card-title {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        /* Patient list row */
        .patient-row {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 14px 18px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 16px;
            cursor: pointer;
            transition: box-shadow 0.15s, border-color 0.15s;
        }
        .patient-row:hover {
            border-color: var(--accent);
            box-shadow: 0 2px 8px rgba(79,70,229,0.12);
        }

        /* SHAP bar */
        .shap-bar-container {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 4px 0;
        }
        .shap-label { font-size: 0.82rem; color: var(--text-secondary); min-width: 180px; }
        .shap-bar-wrap { flex: 1; background: #F0EEE9; border-radius: 4px; height: 10px; overflow: hidden; }
        .shap-bar { height: 100%; border-radius: 4px; background: var(--accent); }
        .shap-val { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); min-width: 40px; text-align: right; }

        /* Recommendation card */
        .rec-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-left: 4px solid var(--accent);
            border-radius: 8px;
            padding: 14px 16px;
            margin-bottom: 10px;
        }
        .rec-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .rec-priority {
            font-size: 0.7rem;
            font-weight: 700;
            background: var(--accent-light);
            color: var(--accent);
            padding: 2px 7px;
            border-radius: 4px;
        }
        .rec-category {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .rec-action { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
        .rec-rationale { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; }
        .rec-evidence {
            display: inline-flex;
            gap: 6px;
            margin-top: 8px;
        }
        .evidence-badge {
            font-size: 0.68rem;
            font-weight: 700;
            background: #ECFDF5;
            color: #059669;
            padding: 2px 7px;
            border-radius: 4px;
        }
        .reduces-badge {
            font-size: 0.68rem;
            font-weight: 600;
            background: var(--accent-light);
            color: var(--accent);
            padding: 2px 7px;
            border-radius: 4px;
        }

        /* Alert items */
        .alert-item {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-left: 4px solid #6B7280;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 8px;
        }
        .alert-item.critical { border-left-color: var(--risk-critical); }
        .alert-item.high { border-left-color: var(--risk-high); }
        .alert-item.warning { border-left-color: #F59E0B; }
        .alert-item.info { border-left-color: #3B82F6; }
        .alert-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .alert-title { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
        .alert-time { font-size: 0.72rem; color: var(--text-muted); }
        .alert-desc { font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; }
        .alert-acked { opacity: 0.5; }

        /* Severity badge */
        .sev-badge {
            display: inline-block;
            font-size: 0.65rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            text-transform: uppercase;
        }
        .sev-badge.critical { background: var(--risk-critical-bg); color: var(--risk-critical); }
        .sev-badge.high { background: var(--risk-high-bg); color: var(--risk-high); }
        .sev-badge.warning { background: #FFFBEB; color: #92400E; }
        .sev-badge.info { background: #EFF6FF; color: #1D4ED8; }

        /* Hide Streamlit branding */
        #MainMenu, footer, header { visibility: hidden; }
        .block-container { padding-top: 1.5rem; padding-bottom: 2rem; }
        </style>
        """,
        unsafe_allow_html=True,
    )
