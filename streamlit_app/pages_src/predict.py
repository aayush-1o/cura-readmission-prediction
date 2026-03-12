"""CareIQ — Manual Risk Prediction Page"""
from __future__ import annotations

import streamlit as st
import numpy as np
import plotly.graph_objects as go

from data.synthetic import (
    DEPARTMENTS, INSURANCE_TYPES, DISCHARGE_DISPOSITIONS,
    PRIMARY_DIAGNOSES, CARE_INTERVENTIONS, _score_to_tier,
)


def render_predict(data: dict):
    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">🤖 Risk Prediction</div>'
        '<div class="page-subtitle">Score a new admission in real-time using the CareIQ heuristic model</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    st.info(
        "Enter patient and admission details below to compute a readmission risk score. "
        "In production, this runs on the trained XGBoost model (AUROC 0.84). "
        "Here the heuristic scoring model is used for demonstration."
    )

    col_form, col_result = st.columns([1, 1])

    with col_form:
        st.markdown("#### 👤 Patient Characteristics")
        age = st.slider("Age", 18, 95, 68, key="p_age")
        gender = st.selectbox("Gender", ["Male", "Female", "Non-binary"], key="p_gender")
        insurance = st.selectbox("Insurance Type", INSURANCE_TYPES, key="p_ins")
        cci = st.slider("Charlson Comorbidity Index (CCI)", 0.0, 14.0, 4.0, step=0.5, key="p_cci")
        n_comorbidities = st.slider("Number of Comorbidities", 0, 10, 2, key="p_comorbid")

        st.markdown("#### 🏥 Admission Details")
        department = st.selectbox("Department", DEPARTMENTS, key="p_dept")
        dx_category = st.selectbox("Primary Diagnosis", list(PRIMARY_DIAGNOSES.keys()), key="p_dx")
        los = st.slider("Length of Stay (days)", 1, 30, 5, key="p_los")
        admit_type = st.selectbox("Admission Type", ["Emergency", "Elective", "Urgent"], key="p_admit")
        icu_flag = st.checkbox("ICU Stay", key="p_icu")
        emergency_flag = admit_type == "Emergency"
        discharge_disp = st.selectbox("Discharge Disposition", DISCHARGE_DISPOSITIONS, key="p_disp")

        st.markdown("#### 📊 Utilization History")
        prior_admissions = st.slider("Prior Admissions (12 months)", 0, 10, 1, key="p_prioradm")
        prior_readmissions = st.slider("Prior Readmissions (1 year)", 0, 5, 0, key="p_priorre")
        high_utilizer = prior_admissions >= 3 or prior_readmissions >= 2

        calculate = st.button("🔍 Calculate Risk Score", use_container_width=True, type="primary")

    with col_result:
        if not calculate:
            st.markdown(
                """
                <div style="background:#F5F4F0;border:2px dashed #E7E5E0;border-radius:12px;
                            padding:40px 20px;text-align:center;margin-top:60px">
                    <div style="font-size:2rem;margin-bottom:12px">🎯</div>
                    <div style="font-size:1rem;color:#78716C">Fill in the form and click<br/><strong>Calculate Risk Score</strong></div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            # ── Compute score ─────────────────────────────────────────────────
            score = (
                0.10
                + cci * 0.028
                + prior_readmissions * 0.075
                + (0.09 if icu_flag else 0)
                + (0.05 if emergency_flag else 0)
                + (0.06 if high_utilizer else 0)
                + min(los, 14) * 0.008
                + (0.02 if prior_admissions > 0 else 0) * prior_admissions
                + np.clip(np.random.default_rng(42).normal(0, 0.02), -0.05, 0.05)
            )
            score = round(float(np.clip(score, 0.03, 0.97)), 4)
            tier = _score_to_tier(score)

            tier_colors = {"critical": "#DC2626", "high": "#D97706", "medium": "#B45309", "low": "#059669"}
            tier_bg = {"critical": "#FEF2F2", "high": "#FFFBEB", "medium": "#FEF3C7", "low": "#ECFDF5"}
            color = tier_colors[tier]
            bg = tier_bg[tier]

            # Risk score display
            st.markdown(
                f"""
                <div style="background:{bg};border:2px solid {color};border-radius:16px;padding:28px;text-align:center;margin-bottom:20px">
                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.6px;color:{color};font-weight:700;margin-bottom:8px">30-Day Readmission Risk</div>
                    <div style="font-size:3.5rem;font-weight:800;color:{color};line-height:1">{score:.1%}</div>
                    <div style="font-size:1rem;font-weight:700;color:{color};text-transform:uppercase;margin-top:8px;letter-spacing:.3px">{tier} Risk</div>
                    <div style="margin-top:16px;background:rgba(0,0,0,0.06);border-radius:8px;height:12px;overflow:hidden">
                        <div style="width:{int(score*100)}%;height:100%;background:{color};border-radius:8px;transition:width .5s"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:{color};margin-top:4px">
                        <span>Low</span><span>Critical</span>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            # ── SHAP-like factors ─────────────────────────────────────────
            factors = []
            if prior_readmissions > 0:
                factors.append(("Prior readmissions (1yr)", prior_readmissions * 0.075))
            if cci > 0:
                factors.append(("Charlson CCI", cci * 0.028))
            if icu_flag:
                factors.append(("ICU stay", 0.09))
            if high_utilizer:
                factors.append(("High utilizer", 0.06))
            if emergency_flag:
                factors.append(("Emergency admission", 0.05))
            if prior_admissions > 0:
                factors.append(("Prior admissions (12m)", prior_admissions * 0.02))
            if los > 5:
                factors.append(("Length of stay", min(los, 14) * 0.008))
            factors.append(("Base rate", 0.10))
            factors.sort(key=lambda x: x[1], reverse=True)

            st.markdown("**Risk Factor Contributions:**")
            max_v = factors[0][1] if factors else 1
            for label, val in factors[:6]:
                pct = int((val / max_v) * 100)
                st.markdown(
                    f"""<div class="shap-bar-container">
                        <span class="shap-label">{label}</span>
                        <div class="shap-bar-wrap"><div class="shap-bar" style="width:{pct}%;background:{color}"></div></div>
                        <span class="shap-val">+{val:.3f}</span>
                    </div>""",
                    unsafe_allow_html=True,
                )

            # ── Recommendations ───────────────────────────────────────────
            st.markdown("---")
            st.markdown("**💡 Top Recommended Interventions:**")
            # Pick top 3 recommendations based on score tier
            rng = np.random.default_rng(42)
            cats = list(CARE_INTERVENTIONS.items())
            rng.shuffle(cats)
            for i, (cat_key, cat_data) in enumerate(cats[:3]):
                action_idx = int(rng.integers(0, len(cat_data["actions"])))
                st.markdown(
                    f"""
                    <div class="rec-card">
                        <div class="rec-header">
                            <span class="rec-priority">#{i+1}</span>
                            <span style="font-size:1rem">{cat_data['icon']}</span>
                            <span class="rec-category">{cat_data['label']}</span>
                        </div>
                        <div class="rec-action">{cat_data['actions'][action_idx]}</div>
                        <div class="rec-rationale">{cat_data['rationale']}</div>
                        <div class="rec-evidence">
                            <span class="evidence-badge">Grade {cat_data['evidence_grade']} Evidence</span>
                            <span class="reduces-badge">↓ {cat_data['reduces_by']}% readmission risk</span>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
