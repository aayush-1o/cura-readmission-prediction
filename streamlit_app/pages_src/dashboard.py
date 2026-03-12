"""CareIQ — Dashboard Page"""
from __future__ import annotations

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def render_dashboard(data: dict):
    d = data["dashboard"]
    trends = data["trends"]
    risk_dist = data["risk_distribution"]
    dept_perf = data["dept_performance"]

    # ── Header ─────────────────────────────────────────────────────────────────
    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">🏠 Clinical Dashboard</div>'
        '<div class="page-subtitle">Real-time readmission risk overview · Last refreshed just now</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── KPI Tiles ──────────────────────────────────────────────────────────────
    c1, c2, c3, c4, c5, c6 = st.columns(6)

    def kpi(col, label, value, sub, variant="", delta="", delta_dir=""):
        with col:
            delta_html = (
                f'<div class="kpi-delta {delta_dir}">{delta}</div>' if delta else ""
            )
            st.markdown(
                f"""
                <div class="kpi-tile {variant}">
                    <div class="kpi-label">{label}</div>
                    <div class="kpi-value {variant}">{value}</div>
                    <div class="kpi-sub">{sub}</div>
                    {delta_html}
                </div>
                """,
                unsafe_allow_html=True,
            )

    kpi(c1, "Total Patients", f"{d['total_patients']:,}", "in registry", "")
    kpi(c2, "Admissions (30d)", f"{d['total_admissions_30d']:,}", "past 30 days", "")
    kpi(c3, "Readmit Rate", f"{d['avg_readmission_rate_pct']:.1f}%", "30-day rate",
        "high" if d['avg_readmission_rate_pct'] > 15 else "success",
        delta=f"{'↑' if d['avg_readmission_rate_pct'] > 15 else '↓'} vs 15% benchmark",
        delta_dir="up" if d['avg_readmission_rate_pct'] > 15 else "down")
    kpi(c4, "Avg LOS", f"{d['avg_los_days']:.1f}d", "length of stay", "")
    kpi(c5, "High Risk Today", f"{d['high_risk_patients_today']}", "high + critical", "critical")
    kpi(c6, "Avg Risk Score", f"{d['avg_risk_score']:.3f}", "across all admissions", "")

    st.markdown("<br/>", unsafe_allow_html=True)

    # ── Trend Chart + Risk Distribution ───────────────────────────────────────
    col_left, col_right = st.columns([2, 1])

    with col_left:
        st.markdown('<div class="card"><div class="card-title">📈 Readmission Trends by Department</div>', unsafe_allow_html=True)
        df_trends = pd.DataFrame(trends)
        df_trends["period_start"] = pd.to_datetime(df_trends["period_start"])

        dept_filter = st.selectbox(
            "Department",
            ["All"] + sorted(df_trends["department_name"].unique().tolist()),
            key="dash_dept",
            label_visibility="collapsed",
        )
        if dept_filter != "All":
            df_plot = df_trends[df_trends["department_name"] == dept_filter]
        else:
            df_plot = df_trends.groupby("period_start").agg(
                readmission_rate_pct=("readmission_rate_pct", "mean"),
                total_admissions=("total_admissions", "sum"),
            ).reset_index()
            df_plot["department_name"] = "All Departments"

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=df_plot["period_start"], y=df_plot["readmission_rate_pct"],
            mode="lines+markers", name="Readmit Rate",
            line=dict(color="#4F46E5", width=2.5),
            marker=dict(size=5),
            fill="tozeroy", fillcolor="rgba(79,70,229,0.07)",
        ))
        fig.add_hline(y=15.0, line_dash="dash", line_color="#DC2626",
                      annotation_text="CMS 15% Benchmark", annotation_position="bottom right",
                      annotation_font_color="#DC2626", annotation_font_size=11)
        fig.update_layout(
            margin=dict(t=10, b=20, l=0, r=0), height=260,
            yaxis_title="Rate (%)", xaxis_title="",
            plot_bgcolor="white", paper_bgcolor="white",
            yaxis=dict(gridcolor="#F0EEE9"),
            xaxis=dict(gridcolor="#F0EEE9"),
            showlegend=False,
        )
        st.plotly_chart(fig, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_right:
        st.markdown('<div class="card"><div class="card-title">🎯 Risk Distribution</div>', unsafe_allow_html=True)
        tier_colors = {"critical": "#DC2626", "high": "#D97706", "medium": "#B45309", "low": "#059669"}
        tier_order = ["critical", "high", "medium", "low"]

        df_risk = pd.DataFrame(data["risk_distribution"])
        df_risk["risk_tier"] = pd.Categorical(df_risk["risk_tier"], categories=tier_order, ordered=True)
        df_risk = df_risk.sort_values("risk_tier")

        fig2 = go.Figure(go.Bar(
            x=df_risk["risk_tier"].str.capitalize(),
            y=df_risk["patient_count"],
            marker_color=[tier_colors.get(t, "#9CA3AF") for t in df_risk["risk_tier"]],
            text=df_risk["patient_count"],
            textposition="outside",
        ))
        fig2.update_layout(
            margin=dict(t=10, b=20, l=0, r=0), height=260,
            plot_bgcolor="white", paper_bgcolor="white",
            yaxis=dict(gridcolor="#F0EEE9", title="Count"),
            xaxis_title="",
            showlegend=False,
        )
        st.plotly_chart(fig2, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Department Performance Table ───────────────────────────────────────────
    st.markdown('<div class="card"><div class="card-title">🏥 Department Performance vs CMS Benchmark</div>', unsafe_allow_html=True)

    df_dept = pd.DataFrame(dept_perf).sort_values("readmission_rate", ascending=False)

    # Color-code delta column
    def style_delta(val):
        if val > 2:
            return "color:#DC2626;font-weight:700"
        elif val > 0:
            return "color:#D97706;font-weight:600"
        else:
            return "color:#059669;font-weight:600"

    def stars(n):
        return "⭐" * int(n)

    df_display = df_dept[["department_name", "readmission_rate", "benchmark_readmission_rate",
                            "vs_benchmark_delta", "cms_star_rating", "avg_los_days", "performance_label"]].copy()
    df_display.columns = ["Department", "Rate %", "Benchmark %", "Δ vs Benchmark", "Stars", "Avg LOS", "Status"]
    df_display["Stars"] = df_display["Stars"].apply(stars)
    df_display["Rate %"] = df_display["Rate %"].apply(lambda x: f"{x:.1f}%")
    df_display["Benchmark %"] = df_display["Benchmark %"].apply(lambda x: f"{x:.1f}%")
    df_display["Δ vs Benchmark"] = df_display["Δ vs Benchmark"].apply(lambda x: f"+{x:.1f}%" if x > 0 else f"{x:.1f}%")
    df_display["Avg LOS"] = df_display["Avg LOS"].apply(lambda x: f"{x:.1f}d")

    st.dataframe(df_display, use_container_width=True, hide_index=True, height=320)
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Cost Summary ───────────────────────────────────────────────────────────
    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("💰 Total Charges (30d)", f"${d['total_cost_30d']:,.0f}")
    with c2:
        avg_cost = d['total_cost_30d'] / max(d['total_admissions_30d'], 1)
        st.metric("📋 Avg Cost / Admission", f"${avg_cost:,.0f}")
    with c3:
        st.metric("🏢 Departments Tracked", str(d['department_count']))
