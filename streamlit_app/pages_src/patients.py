"""CareIQ — Patients Page"""
from __future__ import annotations

import streamlit as st
import pandas as pd


def render_patients(data: dict):
    patients = data["patients"].copy()
    admissions = data["admissions"]
    predictions = data["predictions"]

    # Merge latest risk score
    latest_pred = (
        predictions.merge(admissions[["admission_id", "patient_id"]], on="admission_id")
        .sort_values("risk_score", ascending=False)
        .drop_duplicates("patient_id")
    )
    patients = patients.merge(latest_pred[["patient_id", "risk_score", "risk_tier"]], on="patient_id", how="left")

    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">👥 Patients</div>'
        '<div class="page-subtitle">Search and filter the patient registry</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Filters ────────────────────────────────────────────────────────────────
    fc1, fc2, fc3, fc4, fc5 = st.columns(5)
    with fc1:
        search = st.text_input("Search Patient ID", placeholder="PAT-010042", key="pat_search")
    with fc2:
        dept_opts = ["All"] + sorted(patients["department"].dropna().unique().tolist())
        dept_filter = st.selectbox("Department", dept_opts, key="pat_dept")
    with fc3:
        cohort_opts = ["All", "T1_CatastrophicRisk", "T2_HighRisk", "T3_ModerateRisk", "T4_LowRisk"]
        cohort_filter = st.selectbox("Risk Cohort", cohort_opts, key="pat_cohort")
    with fc4:
        ins_opts = ["All"] + sorted(patients["insurance_category"].dropna().unique().tolist())
        ins_filter = st.selectbox("Insurance", ins_opts, key="pat_ins")
    with fc5:
        high_util_only = st.checkbox("High Utilizers Only", key="pat_util")

    df = patients.copy()
    if search:
        df = df[df["patient_id"].str.contains(search.upper(), na=False)]
    if dept_filter != "All":
        df = df[df["department"] == dept_filter]
    if cohort_filter != "All":
        df = df[df["risk_cohort"] == cohort_filter]
    if ins_filter != "All":
        df = df[df["insurance_category"] == ins_filter]
    if high_util_only:
        df = df[df["high_utilizer_flag"] == True]

    st.caption(f"Showing **{len(df):,}** of {len(patients):,} patients")

    # ── Paginated list ─────────────────────────────────────────────────────────
    PAGE_SIZE = 20
    total_pages = max(1, (len(df) - 1) // PAGE_SIZE + 1)
    page = st.number_input("Page", min_value=1, max_value=total_pages, value=1, key="pat_page")
    start = (page - 1) * PAGE_SIZE
    page_df = df.iloc[start: start + PAGE_SIZE]

    tier_colors = {"critical": "#DC2626", "high": "#D97706", "medium": "#B45309", "low": "#059669"}
    tier_icons = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}

    # Header
    hc = st.columns([2, 1, 1, 1, 1, 1, 1, 1])
    for col, label in zip(hc, ["Patient ID", "Age", "Gender", "Department", "Cohort", "CCI", "Risk Score", ""]):
        col.markdown(f"<span style='font-size:0.73rem;font-weight:700;color:#78716C;text-transform:uppercase;letter-spacing:.4px'>{label}</span>", unsafe_allow_html=True)

    for _, row in page_df.iterrows():
        tier = str(row.get("risk_tier", "low"))
        score = row.get("risk_score", 0)
        score_disp = f"{score:.3f}" if pd.notna(score) else "—"
        icon = tier_icons.get(tier, "⚪")

        rc = st.columns([2, 1, 1, 1, 1, 1, 1, 1])
        rc[0].markdown(f"**{row['patient_id']}**")
        rc[1].write(row["age"])
        rc[2].write(row["gender"])
        rc[3].write(row["department"])
        rc[4].markdown(
            f"<span style='font-size:0.72rem;color:#57534E'>{row['risk_cohort'].replace('T1_','').replace('T2_','').replace('T3_','').replace('T4_','')}</span>",
            unsafe_allow_html=True,
        )
        rc[5].write(f"{row['charlson_comorbidity_index']:.1f}")
        rc[6].markdown(
            f"<span style='color:{tier_colors.get(tier,\"#6B7280\")};font-weight:700'>{icon} {score_disp}</span>",
            unsafe_allow_html=True,
        )
        if rc[7].button("→", key=f"pat_view_{row['patient_id']}"):
            # get latest admission for this patient
            pat_adm = data["admissions"][data["admissions"]["patient_id"] == row["patient_id"]]
            if not pat_adm.empty:
                latest_adm = pat_adm.sort_values("admission_date").iloc[-1]["admission_id"]
            else:
                latest_adm = "ADM-000000"
            st.session_state.selected_patient = {
                "patient_id": row["patient_id"],
                "admission_id": latest_adm,
            }
            st.rerun()

        st.markdown("<hr style='margin:2px 0;border-color:#F0EEE9'>", unsafe_allow_html=True)
