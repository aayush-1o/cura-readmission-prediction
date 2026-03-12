"""CareIQ — Patient Detail Page with Risk Score, SHAP Factors & Care Plan"""
from __future__ import annotations

import streamlit as st
import pandas as pd
import plotly.graph_objects as go

from data.synthetic import generate_care_plan


def render_patient_detail(data: dict, selected: dict):
    patient_id = selected["patient_id"]
    admission_id = selected["admission_id"]

    # ── Back button ─────────────────────────────────────────────────────────
    if st.button("← Back"):
        st.session_state.selected_patient = None
        st.rerun()

    # ── Fetch patient + admission ───────────────────────────────────────────
    patients = data["patients"]
    admissions = data["admissions"]

    pat_rows = patients[patients["patient_id"] == patient_id]
    adm_rows = admissions[admissions["admission_id"] == admission_id]

    if pat_rows.empty:
        st.error(f"Patient {patient_id} not found.")
        return

    patient = pat_rows.iloc[0].to_dict()
    admission = adm_rows.iloc[0].to_dict() if not adm_rows.empty else {}

    care_plan = generate_care_plan(patient, admission)

    risk_score = care_plan["risk_score"]
    risk_tier = care_plan["risk_tier"]
    tier_colors = {"critical": "#DC2626", "high": "#D97706", "medium": "#B45309", "low": "#059669"}
    tier_bg = {"critical": "#FEF2F2", "high": "#FFFBEB", "medium": "#FEF3C7", "low": "#ECFDF5"}
    color = tier_colors.get(risk_tier, "#6B7280")
    bg = tier_bg.get(risk_tier, "#F9FAFB")

    # ── Header ──────────────────────────────────────────────────────────────
    h1, h2 = st.columns([3, 1])
    with h1:
        st.markdown(
            f"""
            <div class="page-header">
                <div class="page-title">🔍 {patient_id}</div>
                <div class="page-subtitle">{patient.get('cluster_name','—')} · {patient.get('risk_cohort','—')} · Admission: {admission_id}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with h2:
        st.markdown(
            f"""
            <div style="background:{bg};border:2px solid {color};border-radius:12px;padding:16px 20px;text-align:center;margin-top:8px">
                <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.5px;color:{color};font-weight:700;margin-bottom:4px">Readmission Risk</div>
                <div style="font-size:2.4rem;font-weight:800;color:{color};line-height:1">{risk_score:.1%}</div>
                <div style="font-size:0.8rem;font-weight:700;color:{color};text-transform:uppercase;margin-top:4px">{risk_tier}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # ── Demographics + Admission Info ───────────────────────────────────────
    tab1, tab2, tab3 = st.tabs(["📋 Patient Overview", "🎯 SHAP Risk Factors", "💡 Care Plan"])

    with tab1:
        c1, c2, c3 = st.columns(3)

        with c1:
            st.markdown('<div class="card"><div class="card-title">👤 Demographics</div>', unsafe_allow_html=True)
            fields = [
                ("Age", patient.get("age", "—")),
                ("Gender", patient.get("gender", "—")),
                ("Race / Ethnicity", patient.get("race_ethnicity", "—")),
                ("Insurance", patient.get("insurance_category", "—")),
                ("Comorbidities", patient.get("comorbidity_count", "—")),
                ("Charlson CCI", f"{patient.get('charlson_comorbidity_index', 0):.1f}"),
            ]
            for label, val in fields:
                st.markdown(
                    f'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F0EEE9;font-size:0.85rem">'
                    f'<span style="color:#78716C">{label}</span><span style="font-weight:600">{val}</span></div>',
                    unsafe_allow_html=True,
                )
            st.markdown("</div>", unsafe_allow_html=True)

        with c2:
            st.markdown('<div class="card"><div class="card-title">🏥 Current Admission</div>', unsafe_allow_html=True)
            adm_fields = [
                ("Admission ID", admission.get("admission_id", "—")),
                ("Department", admission.get("department", "—")),
                ("Type", admission.get("admission_type", "—")),
                ("Admission Date", str(admission.get("admission_date", "—"))[:10]),
                ("Discharge Date", str(admission.get("discharge_date", "—"))[:10]),
                ("LOS (days)", admission.get("length_of_stay_days", "—")),
                ("ICU Stay", "✓ Yes" if admission.get("icu_flag") else "No"),
                ("Emergency", "✓ Yes" if admission.get("emergency_flag") else "No"),
                ("Diagnosis", admission.get("primary_diagnosis_category", "—")),
                ("Total Charges", f"${admission.get('total_charges', 0):,.0f}"),
            ]
            for label, val in adm_fields:
                st.markdown(
                    f'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F0EEE9;font-size:0.85rem">'
                    f'<span style="color:#78716C">{label}</span><span style="font-weight:600">{val}</span></div>',
                    unsafe_allow_html=True,
                )
            st.markdown("</div>", unsafe_allow_html=True)

        with c3:
            st.markdown('<div class="card"><div class="card-title">📊 Utilization History</div>', unsafe_allow_html=True)
            util_fields = [
                ("Prior Admissions (12m)", patient.get("prior_admissions_12m", "—")),
                ("Prior Readmissions (1yr)", patient.get("prior_readmissions_1y", "—")),
                ("High Utilizer", "✓ Yes" if patient.get("high_utilizer_flag") else "No"),
                ("Risk Cohort", patient.get("risk_cohort", "—").replace("_", " ")),
                ("Cluster", patient.get("cluster_name", "—")),
                ("Last Admission", str(patient.get("last_admission_date", "—"))[:10] if patient.get("last_admission_date") else "—"),
            ]
            for label, val in util_fields:
                st.markdown(
                    f'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F0EEE9;font-size:0.85rem">'
                    f'<span style="color:#78716C">{label}</span><span style="font-weight:600">{val}</span></div>',
                    unsafe_allow_html=True,
                )
            st.markdown("</div>", unsafe_allow_html=True)

        # ── Admission history table ─────────────────────────────────────────
        pat_admissions = data["admissions"][data["admissions"]["patient_id"] == patient_id].copy()
        if not pat_admissions.empty:
            st.markdown('<div class="card-title">📅 Admission History</div>', unsafe_allow_html=True)
            disp_cols = ["admission_id", "admission_date", "discharge_date", "department",
                         "length_of_stay_days", "primary_diagnosis_category", "readmit_30day_flag", "total_charges"]
            disp_df = pat_admissions[disp_cols].copy()
            disp_df["admission_date"] = disp_df["admission_date"].astype(str).str[:10]
            disp_df["discharge_date"] = disp_df["discharge_date"].astype(str).str[:10]
            disp_df["total_charges"] = disp_df["total_charges"].apply(lambda x: f"${x:,.0f}")
            disp_df["readmit_30day_flag"] = disp_df["readmit_30day_flag"].map({True: "✓", False: "—"})
            disp_df.columns = ["Admission ID", "Admit Date", "Discharge Date", "Department",
                                "LOS", "Diagnosis", "30d Readmit", "Charges"]
            st.dataframe(disp_df, use_container_width=True, hide_index=True)

    with tab2:
        st.markdown("### 🎯 SHAP Risk Factors")
        st.markdown(
            f"These features are the primary drivers of the **{risk_score:.1%} readmission risk score**. "
            "SHAP values indicate each feature's contribution to elevating or reducing risk."
        )

        factors = care_plan["risk_factors"]
        if not factors:
            st.info("No SHAP factors available for this admission.")
        else:
            max_shap = max(f["shap_value"] for f in factors) if factors else 1

            # Waterfall chart
            labels = [f["display_label"] for f in factors]
            values = [f["shap_value"] for f in factors]
            bar_colors = ["#DC2626" if f["direction"] == "increases_risk" else "#059669" for f in factors]

            fig = go.Figure(go.Bar(
                y=labels[::-1],
                x=values[::-1],
                orientation="h",
                marker_color=bar_colors[::-1],
                text=[f"+{v:.3f}" if v > 0 else f"{v:.3f}" for v in values[::-1]],
                textposition="outside",
            ))
            fig.update_layout(
                margin=dict(t=10, b=10, l=0, r=60),
                height=max(280, len(factors) * 45),
                plot_bgcolor="white", paper_bgcolor="white",
                xaxis=dict(gridcolor="#F0EEE9", title="SHAP Value (contribution to risk)"),
                yaxis=dict(gridcolor="rgba(0,0,0,0)"),
                showlegend=False,
            )
            st.plotly_chart(fig, use_container_width=True)

            st.markdown("**Feature detail:**")
            for f in factors:
                pct = int((f["shap_value"] / max_shap) * 100)
                dir_icon = "⬆️ increases risk" if f["direction"] == "increases_risk" else "⬇️ decreases risk"
                val_str = f"{f['value']}" if f['value'] is not None else "present"
                st.markdown(
                    f"""
                    <div class="shap-bar-container">
                        <span class="shap-label">{f['display_label']} <span style="color:#A8A29E;font-size:0.75rem">({val_str})</span></span>
                        <div class="shap-bar-wrap">
                            <div class="shap-bar" style="width:{pct}%;background:{'#DC2626' if f['direction']=='increases_risk' else '#059669'}"></div>
                        </div>
                        <span class="shap-val">+{f['shap_value']:.3f}</span>
                        <span style="font-size:0.72rem;color:#78716C;min-width:130px">{dir_icon}</span>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

        # Similar patients
        st.markdown("---")
        st.markdown("### 👥 Similar Patients (No Readmission)")
        similar = care_plan.get("similar_patient_outcomes", [])
        if similar:
            sim_df = pd.DataFrame(similar)
            sim_df["similarity"] = sim_df["similarity"].apply(lambda x: f"{x:.0%}")
            sim_df.columns = ["Patient ID", "Age", "CCI", "LOS", "Similarity", "Outcome"]
            st.dataframe(sim_df, use_container_width=True, hide_index=True)

    with tab3:
        st.markdown("### 💡 Evidence-Based Care Recommendations")
        cohort = care_plan.get("cohort_name", "—")
        cohort_risk = care_plan.get("cohort_average_risk", 0)
        st.markdown(
            f"Patient cohort: **{cohort}** · Cohort avg risk: **{cohort_risk:.1%}** · "
            f"This patient's risk: **{risk_score:.1%}** "
            f"({'above' if risk_score > cohort_risk else 'below'} cohort average)"
        )

        recs = care_plan.get("recommendations", [])
        for rec in recs:
            grade = rec.get("evidence_grade", "B")
            reduces = rec.get("reduces_readmission_by_pct", 0)
            grade_color = "#059669" if grade == "A" else "#D97706"
            st.markdown(
                f"""
                <div class="rec-card">
                    <div class="rec-header">
                        <span class="rec-priority">#{rec['priority']}</span>
                        <span style="font-size:1.1rem">{rec['category_icon']}</span>
                        <span class="rec-category">{rec['category_label']}</span>
                    </div>
                    <div class="rec-action">{rec['action']}</div>
                    <div class="rec-rationale">{rec['rationale']}</div>
                    <div class="rec-evidence">
                        <span class="evidence-badge" style="background:#ECFDF5;color:{grade_color}">Grade {grade} Evidence</span>
                        <span class="reduces-badge">↓ {reduces}% readmission risk</span>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        if not recs:
            st.info("No care recommendations available for this admission profile.")

        st.markdown("---")
        st.markdown(
            "_Recommendations are generated from association rule mining on historical outcomes "
            "and evidence-based clinical guidelines (ACC/AHA, ISMP, Coleman CTI). "
            "Always apply clinical judgment._"
        )
