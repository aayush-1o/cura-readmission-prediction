"""CareIQ — Analytics Page"""
from __future__ import annotations

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go


def render_analytics(data: dict):
    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">📊 Analytics</div>'
        '<div class="page-subtitle">Department performance, LOS breakdown, and readmission drivers</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    admissions = data["admissions"]
    trends = pd.DataFrame(data["trends"])
    dept_perf = pd.DataFrame(data["dept_performance"])
    trends["period_start"] = pd.to_datetime(trends["period_start"])

    tab1, tab2, tab3, tab4 = st.tabs([
        "🏥 Department Performance",
        "📈 Readmission Trends",
        "🛏 LOS & Cost Breakdown",
        "🔍 Risk Factor Analysis",
    ])

    with tab1:
        st.markdown("#### Department vs CMS 15% Benchmark")

        fig = go.Figure()
        dept_sorted = dept_perf.sort_values("readmission_rate")
        colors = [
            "#DC2626" if d > 3 else "#D97706" if d > 0 else "#059669"
            for d in dept_sorted["vs_benchmark_delta"]
        ]
        fig.add_trace(go.Bar(
            y=dept_sorted["department_name"],
            x=dept_sorted["readmission_rate"],
            orientation="h",
            marker_color=colors,
            text=[f"{r:.1f}%" for r in dept_sorted["readmission_rate"]],
            textposition="outside",
            name="Readmission Rate",
        ))
        fig.add_vline(x=15.0, line_dash="dash", line_color="#4F46E5",
                      annotation_text="CMS Benchmark 15%",
                      annotation_position="top right",
                      annotation_font_color="#4F46E5")
        fig.update_layout(
            height=400, margin=dict(t=20, b=20, l=0, r=60),
            plot_bgcolor="white", paper_bgcolor="white",
            xaxis=dict(gridcolor="#F0EEE9", title="30-Day Readmission Rate (%)"),
            yaxis=dict(gridcolor="rgba(0,0,0,0)"),
            showlegend=False,
        )
        st.plotly_chart(fig, use_container_width=True)

        # Star ratings
        st.markdown("#### CMS Quality Star Ratings")
        c_cols = st.columns(len(dept_perf))
        for col, (_, row) in zip(c_cols, dept_perf.sort_values("cms_star_rating", ascending=False).iterrows()):
            with col:
                stars = "⭐" * int(row["cms_star_rating"])
                delta_txt = f"+{row['vs_benchmark_delta']:.1f}%" if row["vs_benchmark_delta"] > 0 else f"{row['vs_benchmark_delta']:.1f}%"
                c = "#DC2626" if row["vs_benchmark_delta"] > 0 else "#059669"
                st.markdown(
                    f"""
                    <div style="background:white;border:1px solid #E7E5E0;border-radius:10px;padding:12px;text-align:center">
                        <div style="font-size:0.7rem;color:#78716C;font-weight:600">{row['department_name']}</div>
                        <div style="font-size:1rem;margin:4px 0">{stars}</div>
                        <div style="font-size:1.1rem;font-weight:700;color:{c}">{row['readmission_rate']:.1f}%</div>
                        <div style="font-size:0.68rem;color:{c}">{delta_txt} vs bench</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

    with tab2:
        st.markdown("#### Monthly Readmission Rate Trends")

        depts = sorted(trends["department_name"].unique().tolist())
        sel_depts = st.multiselect("Select Departments", depts, default=depts[:3], key="ana_depts")

        if sel_depts:
            df_plot = trends[trends["department_name"].isin(sel_depts)]
            fig = px.line(
                df_plot, x="period_start", y="readmission_rate_pct",
                color="department_name",
                markers=True,
                labels={"readmission_rate_pct": "Rate (%)", "period_start": "", "department_name": "Department"},
            )
            fig.add_hline(y=15.0, line_dash="dash", line_color="#DC2626", annotation_text="CMS 15%")
            fig.update_layout(
                height=360, margin=dict(t=20, b=20),
                plot_bgcolor="white", paper_bgcolor="white",
                yaxis=dict(gridcolor="#F0EEE9"),
                xaxis=dict(gridcolor="#F0EEE9"),
            )
            st.plotly_chart(fig, use_container_width=True)

        # Monthly volume
        st.markdown("#### Monthly Admission Volume")
        vol = trends.groupby("period_start")["total_admissions"].sum().reset_index()
        fig_v = px.bar(vol, x="period_start", y="total_admissions",
                       labels={"total_admissions": "Admissions", "period_start": ""},
                       color_discrete_sequence=["#4F46E5"])
        fig_v.update_layout(
            height=250, margin=dict(t=10, b=10),
            plot_bgcolor="white", paper_bgcolor="white",
            yaxis=dict(gridcolor="#F0EEE9"),
        )
        st.plotly_chart(fig_v, use_container_width=True)

    with tab3:
        st.markdown("#### Length of Stay by Department & Diagnosis")

        if not admissions.empty:
            fig_los = px.box(
                admissions[admissions["length_of_stay_days"] < 30],
                x="department",
                y="length_of_stay_days",
                color="department",
                labels={"length_of_stay_days": "LOS (days)", "department": ""},
            )
            fig_los.update_layout(
                height=350, margin=dict(t=10, b=40),
                plot_bgcolor="white", paper_bgcolor="white",
                showlegend=False,
                xaxis=dict(tickangle=-30),
            )
            st.plotly_chart(fig_los, use_container_width=True)

            # LOS by insurance
            st.markdown("#### Average LOS by Insurance Type")
            los_ins = admissions.groupby("insurance_category")["length_of_stay_days"].mean().reset_index()
            los_ins.columns = ["Insurance", "Avg LOS"]
            los_ins = los_ins.sort_values("Avg LOS", ascending=False)
            fig_ins = px.bar(los_ins, x="Insurance", y="Avg LOS",
                             color="Avg LOS", color_continuous_scale="Blues",
                             labels={"Avg LOS": "Avg LOS (days)"})
            fig_ins.update_layout(
                height=280, margin=dict(t=10, b=10),
                plot_bgcolor="white", paper_bgcolor="white",
                coloraxis_showscale=False,
            )
            st.plotly_chart(fig_ins, use_container_width=True)

    with tab4:
        st.markdown("#### Readmission Drivers — Feature Correlation")

        if not admissions.empty:
            numeric_cols = ["length_of_stay_days", "charlson_comorbidity_index",
                            "prior_readmissions_1y", "prior_admissions_12m", "age"]
            available = [c for c in numeric_cols if c in admissions.columns]

            if available and "readmit_30day_flag" in admissions.columns:
                corr_df = admissions[available + ["readmit_30day_flag"]].dropna()
                corr_df["readmit_30day_flag"] = corr_df["readmit_30day_flag"].astype(int)
                corr = corr_df.corr()[["readmit_30day_flag"]].drop("readmit_30day_flag").sort_values("readmit_30day_flag")

                fig_corr = go.Figure(go.Bar(
                    y=[c.replace("_", " ").title() for c in corr.index],
                    x=corr["readmit_30day_flag"],
                    orientation="h",
                    marker_color=["#DC2626" if v > 0 else "#059669" for v in corr["readmit_30day_flag"]],
                    text=[f"{v:.3f}" for v in corr["readmit_30day_flag"]],
                    textposition="outside",
                ))
                fig_corr.update_layout(
                    height=320, margin=dict(t=10, b=10, l=0, r=60),
                    plot_bgcolor="white", paper_bgcolor="white",
                    xaxis=dict(gridcolor="#F0EEE9", title="Correlation with 30-Day Readmission"),
                    yaxis=dict(gridcolor="rgba(0,0,0,0)"),
                    title_text="Feature Correlation with Readmission",
                )
                st.plotly_chart(fig_corr, use_container_width=True)

            # Readmission rate by diagnosis category
            if "primary_diagnosis_category" in admissions.columns:
                dx_rate = (
                    admissions.groupby("primary_diagnosis_category")["readmit_30day_flag"]
                    .agg(["mean", "count"])
                    .reset_index()
                )
                dx_rate.columns = ["Diagnosis", "Readmit Rate", "Volume"]
                dx_rate["Readmit Rate"] = (dx_rate["Readmit Rate"] * 100).round(1)
                dx_rate = dx_rate.sort_values("Readmit Rate", ascending=False)

                fig_dx = px.bar(
                    dx_rate, x="Diagnosis", y="Readmit Rate",
                    color="Readmit Rate", color_continuous_scale=["#059669", "#D97706", "#DC2626"],
                    text="Readmit Rate",
                    labels={"Readmit Rate": "30d Readmit Rate (%)"},
                )
                fig_dx.update_layout(
                    height=320, margin=dict(t=20, b=40),
                    plot_bgcolor="white", paper_bgcolor="white",
                    xaxis=dict(tickangle=-30),
                    coloraxis_showscale=False,
                )
                fig_dx.update_traces(texttemplate="%{text:.1f}%", textposition="outside")
                st.plotly_chart(fig_dx, use_container_width=True)
