"""CareIQ — Alerts Page"""
from __future__ import annotations

import streamlit as st
import pandas as pd


SEV_ICONS = {"critical": "🔴", "high": "🟠", "warning": "🟡", "info": "🔵"}


def render_alerts(data: dict):
    alerts = data["alerts"]

    st.markdown(
        '<div class="page-header">'
        '<div class="page-title">🔔 Alerts</div>'
        '<div class="page-subtitle">Clinical and operational alerts requiring review</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Filters ────────────────────────────────────────────────────────────
    fc1, fc2, fc3 = st.columns(3)
    with fc1:
        sev_filter = st.multiselect(
            "Severity",
            ["critical", "high", "warning", "info"],
            default=["critical", "high", "warning"],
            key="alt_sev",
        )
    with fc2:
        ack_filter = st.selectbox(
            "Status",
            ["All", "Unacknowledged", "Acknowledged"],
            key="alt_ack",
        )
    with fc3:
        type_opts = ["All"] + list({a["alert_type"] for a in alerts})
        type_filter = st.selectbox("Type", type_opts, key="alt_type")

    # Apply filters
    filtered = alerts
    if sev_filter:
        filtered = [a for a in filtered if a["severity"] in sev_filter]
    if ack_filter == "Unacknowledged":
        filtered = [a for a in filtered if not a["acknowledged"]]
    elif ack_filter == "Acknowledged":
        filtered = [a for a in filtered if a["acknowledged"]]
    if type_filter != "All":
        filtered = [a for a in filtered if a["alert_type"] == type_filter]

    # ── Summary counts ─────────────────────────────────────────────────────
    all_unacked = [a for a in alerts if not a["acknowledged"]]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("🔴 Critical", sum(1 for a in all_unacked if a["severity"] == "critical"))
    c2.metric("🟠 High", sum(1 for a in all_unacked if a["severity"] == "high"))
    c3.metric("Total Unacked", len(all_unacked))
    c4.metric("Showing", len(filtered))

    st.markdown("<br/>", unsafe_allow_html=True)

    if not filtered:
        st.success("✅ No alerts match the current filters.")
        return

    # ── Alert list ─────────────────────────────────────────────────────────
    for alert in filtered:
        sev = alert["severity"]
        icon = SEV_ICONS.get(sev, "⚪")
        acked_class = "alert-acked" if alert["acknowledged"] else ""
        acked_label = '<span style="font-size:0.68rem;color:#059669;font-weight:600">✓ Acknowledged</span>' if alert["acknowledged"] else ""
        pat_html = (
            f'<span style="font-size:0.72rem;color:#4F46E5;font-weight:600">Patient: {alert["related_patient_id"]}</span>'
            if alert.get("related_patient_id") else ""
        )

        st.markdown(
            f"""
            <div class="alert-item {sev} {acked_class}">
                <div class="alert-header">
                    <div>
                        <span style="margin-right:6px">{icon}</span>
                        <span class="sev-badge {sev}">{sev.upper()}</span>
                        <span class="alert-title" style="margin-left:8px">{alert['title']}</span>
                        <span style="margin-left:10px">{acked_label}</span>
                    </div>
                    <span class="alert-time">{alert['created_at']}</span>
                </div>
                <div class="alert-desc">{alert['description']}</div>
                <div style="margin-top:6px;display:flex;gap:10px;align-items:center">
                    <span style="font-size:0.72rem;color:#A8A29E;text-transform:uppercase;letter-spacing:.3px">{alert['alert_type'].replace('_',' ')}</span>
                    {pat_html}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ── Alert type breakdown ────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### Alert Type Breakdown")
    import plotly.express as px
    type_counts = pd.Series([a["alert_type"] for a in alerts]).value_counts().reset_index()
    type_counts.columns = ["type", "count"]
    type_counts["type"] = type_counts["type"].str.replace("_", " ").str.title()
    fig = px.pie(type_counts, names="type", values="count",
                 color_discrete_sequence=px.colors.qualitative.Set2)
    fig.update_layout(height=300, margin=dict(t=0, b=0), showlegend=True)
    st.plotly_chart(fig, use_container_width=True)
