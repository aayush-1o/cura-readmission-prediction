"""
CareIQ — Streamlit Deployment
==============================
Hospital Readmission Risk & Care-Path Recommendation System

Pages:
  1. 🏠 Dashboard        — KPI tiles, trend charts, risk distribution
  2. ⚠️  Risk Queue       — High-risk patients today, sortable/filterable
  3. 👥 Patients         — Searchable patient list with filters
  4. 🔍 Patient Detail   — Full risk score, SHAP factors, care plan
  5. 📊 Analytics        — Department performance, LOS breakdown
  6. 🔔 Alerts           — Real-time alert feed
  7. 🤖 Predict          — Manual risk scoring for new admission

Run:
    streamlit run app.py
"""

import streamlit as st

st.set_page_config(
    page_title="CareIQ — Clinical Intelligence Platform",
    page_icon="🏥",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Import pages ─────────────────────────────────────────────────────────────
from pages_src.dashboard import render_dashboard
from pages_src.risk_queue import render_risk_queue
from pages_src.patients import render_patients
from pages_src.patient_detail import render_patient_detail
from pages_src.analytics import render_analytics
from pages_src.alerts import render_alerts
from pages_src.predict import render_predict
from pages_src.styles import inject_styles
from data.synthetic import get_session_data

# ─── Styles ───────────────────────────────────────────────────────────────────
inject_styles()

# ─── Session state init ───────────────────────────────────────────────────────
if "selected_patient" not in st.session_state:
    st.session_state.selected_patient = None
if "page" not in st.session_state:
    st.session_state.page = "Dashboard"
if "data" not in st.session_state:
    st.session_state.data = get_session_data()

# ─── Sidebar navigation ───────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        """
        <div class="sidebar-brand">
            <span class="brand-icon">🏥</span>
            <div>
                <div class="brand-name">CareIQ</div>
                <div class="brand-tagline">Predict · Prevent · Personalize</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown("---")

    pages = {
        "Dashboard": "🏠",
        "Risk Queue": "⚠️",
        "Patients": "👥",
        "Analytics": "📊",
        "Alerts": "🔔",
        "Predict": "🤖",
    }

    for page_name, icon in pages.items():
        active = "nav-active" if st.session_state.page == page_name else ""
        if st.button(
            f"{icon}  {page_name}",
            key=f"nav_{page_name}",
            use_container_width=True,
        ):
            st.session_state.page = page_name
            st.session_state.selected_patient = None
            st.rerun()

    st.markdown("---")
    # Quick stats in sidebar
    data = st.session_state.data
    st.markdown(
        f"""
        <div class="sidebar-stats">
            <div class="sidebar-stat">
                <span class="stat-num critical">{data['dashboard']['high_risk_patients_today']}</span>
                <span class="stat-label">High Risk Today</span>
            </div>
            <div class="sidebar-stat">
                <span class="stat-num">{data['dashboard']['avg_readmission_rate_pct']:.1f}%</span>
                <span class="stat-label">Readmit Rate</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown("---")
    st.markdown(
        '<div class="sidebar-footer">CareIQ v1.0 · Demo Mode<br/>Synthetic Data Only</div>',
        unsafe_allow_html=True,
    )

# ─── Page routing ─────────────────────────────────────────────────────────────
page = st.session_state.page

if st.session_state.selected_patient is not None:
    render_patient_detail(st.session_state.data, st.session_state.selected_patient)
elif page == "Dashboard":
    render_dashboard(st.session_state.data)
elif page == "Risk Queue":
    render_risk_queue(st.session_state.data)
elif page == "Patients":
    render_patients(st.session_state.data)
elif page == "Analytics":
    render_analytics(st.session_state.data)
elif page == "Alerts":
    render_alerts(st.session_state.data)
elif page == "Predict":
    render_predict(st.session_state.data)
