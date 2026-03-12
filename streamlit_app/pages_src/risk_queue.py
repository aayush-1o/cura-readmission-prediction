"""CareIQ — Risk Queue Page"""
from __future__ import annotations

import streamlit as st
import pandas as pd


RISK_ICONS = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}


def render_risk_queue(data: dict):
    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">⚠️ Risk Queue</div>'
        '<div class="page-subtitle">High and critical risk patients requiring immediate care planning</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    high_risk = data["high_risk"].copy()

    # ── Filters ────────────────────────────────────────────────────────────────
    fc1, fc2, fc3, fc4 = st.columns(4)
    with fc1:
        tier_filter = st.multiselect(
            "Risk Tier",
            ["critical", "high", "medium"],
            default=["critical", "high"],
            key="rq_tier",
        )
    with fc2:
        dept_opts = ["All"] + sorted(high_risk["department"].dropna().unique().tolist())
        dept_filter = st.selectbox("Department", dept_opts, key="rq_dept")
    with fc3:
        sort_by = st.selectbox("Sort By", ["Risk Score ↓", "LOS ↓", "Age ↓"], key="rq_sort")
    with fc4:
        show_n = st.slider("Show rows", 10, 50, 25, key="rq_n")

    # Apply filters
    df = high_risk.copy()
    if tier_filter:
        df = df[df["risk_tier"].isin(tier_filter)]
    if dept_filter != "All":
        df = df[df["department"] == dept_filter]
    if sort_by == "Risk Score ↓":
        df = df.sort_values("risk_score", ascending=False)
    elif sort_by == "LOS ↓":
        df = df.sort_values("length_of_stay_days", ascending=False)
    elif sort_by == "Age ↓":
        df = df.sort_values("age", ascending=False)
    df = df.head(show_n)

    # ── Summary counts ─────────────────────────────────────────────────────────
    vc = high_risk["risk_tier"].value_counts()
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("🔴 Critical", vc.get("critical", 0))
    c2.metric("🟠 High", vc.get("high", 0))
    c3.metric("Showing", len(df))
    c4.metric("Avg Score", f"{df['risk_score'].mean():.3f}" if len(df) else "—")

    st.markdown("<br/>", unsafe_allow_html=True)

    if df.empty:
        st.info("No patients match the current filters.")
        return

    # ── Patient rows ───────────────────────────────────────────────────────────
    st.markdown("**Click a patient row to view their full risk profile and care plan.**")

    for _, row in df.iterrows():
        tier = row.get("risk_tier", "low")
        icon = RISK_ICONS.get(tier, "⚪")
        score_pct = int(row["risk_score"] * 100)
        bar_color = {"critical": "#DC2626", "high": "#D97706", "medium": "#B45309", "low": "#059669"}.get(tier, "#6B7280")
        cci = row.get("charlson_comorbidity_index", "—")
        los = row.get("length_of_stay_days", "—")
        age = row.get("age", "—")
        prior_r = row.get("prior_readmissions_1y", "—")

        col1, col2 = st.columns([8, 2])
        with col1:
            st.markdown(
                f"""
                <div class="patient-row">
                    <span style="font-size:1.4rem">{icon}</span>
                    <div style="flex:1">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                            <span style="font-weight:700;font-size:0.95rem">{row['patient_id']}</span>
                            <span class="risk-badge {tier}">{tier.upper()}</span>
                            <span style="font-size:0.78rem;color:#57534E">{row.get('department','—')}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                            <div style="flex:1;background:#F0EEE9;border-radius:4px;height:8px;overflow:hidden">
                                <div style="width:{score_pct}%;height:100%;background:{bar_color};border-radius:4px"></div>
                            </div>
                            <span style="font-size:0.85rem;font-weight:700;min-width:48px">{row['risk_score']:.3f}</span>
                        </div>
                        <div style="display:flex;gap:20px;font-size:0.78rem;color:#78716C">
                            <span>Age: <b>{age}</b></span>
                            <span>LOS: <b>{los}d</b></span>
                            <span>CCI: <b>{cci}</b></span>
                            <span>Prior Readmits: <b>{prior_r}</b></span>
                            <span>Dx: <b>{row.get('primary_diagnosis_category','—')}</b></span>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        with col2:
            if st.button("View →", key=f"rq_view_{row['patient_id']}_{row['admission_id']}"):
                st.session_state.selected_patient = {
                    "patient_id": row["patient_id"],
                    "admission_id": row["admission_id"],
                }
                st.rerun()
