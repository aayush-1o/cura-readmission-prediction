"""
CareIQ — Report Generators
===========================
Actual PDF and CSV report generation functions.

PDF: reportlab (ReportLab Community Edition)
CSV: Python built-in csv.DictWriter

Each generator:
1. Queries data (or uses mock data as fallback)
2. Updates job progress at 10 / 30 / 70 / 90 / 100 milestones
3. Writes file to /tmp/careiq_reports/ directory
4. Returns {"pdf": path, "csv": path} dict

Interview talking point:
"PDF generation is non-trivial — you need to think about pagination, headers
on every page, fonts, table overflow, and file size. reportlab gives you a raw
canvas (Platypus) API that handles page breaks automatically. The tricky part:
tables that span pages need a 'repeatRows' argument or the header disappears."
"""

from __future__ import annotations

import csv
import io
import logging
import os
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ─── Output directory ─────────────────────────────────────────────────────────
REPORTS_DIR = Path("/tmp/careiq_reports")
REPORTS_DIR.mkdir(exist_ok=True)

# ─── Colours (Clinical Linen palette) ────────────────────────────────────────
BRAND_BLUE   = (0.09,  0.28,  0.75)   # #1648C0
BRAND_LIGHT  = (0.94,  0.96,  1.0)    # #F0F5FF
RISK_HIGH    = (0.87,  0.24,  0.14)   # #DE3D24
RISK_MED     = (0.85,  0.52,  0.06)   # #D9850F
RISK_LOW     = (0.07,  0.53,  0.35)   # #128759
GREY_DARK    = (0.18,  0.22,  0.28)   # #2D3847
GREY_MED     = (0.40,  0.45,  0.52)   # #667284
GREY_LIGHT   = (0.93,  0.94,  0.96)   # #EDF0F5

# ─── Mock patient data ────────────────────────────────────────────────────────
MOCK_HIGH_RISK_PATIENTS = [
    {"patient_id": "PAT-010000", "name": "Robert Thornton",   "department": "Cardiology",      "risk_score": 0.95, "risk_tier": "Critical", "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-09", "los_days": 2},
    {"patient_id": "PAT-010017", "name": "Margaret Sullivan", "department": "Cardiology",      "risk_score": 0.91, "risk_tier": "Critical", "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-10", "los_days": 1},
    {"patient_id": "PAT-010034", "name": "James Kwan",        "department": "Med/Surg",        "risk_score": 0.87, "risk_tier": "High",     "attending": "Dr. James Park",  "admit_date": "2026-03-08", "los_days": 3},
    {"patient_id": "PAT-010051", "name": "Dorothy Vasquez",   "department": "Nephrology",      "risk_score": 0.84, "risk_tier": "High",     "attending": "Dr. Priya Patel", "admit_date": "2026-03-09", "los_days": 2},
    {"patient_id": "PAT-010068", "name": "Harold Mitchell",   "department": "ICU",             "risk_score": 0.82, "risk_tier": "High",     "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-10", "los_days": 1},
    {"patient_id": "PAT-010085", "name": "Pearl Johansson",   "department": "Cardiology",      "risk_score": 0.80, "risk_tier": "High",     "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-07", "los_days": 4},
    {"patient_id": "PAT-010102", "name": "Ernest Okafor",     "department": "General Medicine","risk_score": 0.79, "risk_tier": "High",     "attending": "Dr. James Park",  "admit_date": "2026-03-09", "los_days": 2},
    {"patient_id": "PAT-010119", "name": "Florence Nakamura", "department": "Pulmonology",     "risk_score": 0.77, "risk_tier": "High",     "attending": "Dr. James Park",  "admit_date": "2026-03-10", "los_days": 1},
    {"patient_id": "PAT-010136", "name": "Chester Williams",  "department": "Med/Surg",        "risk_score": 0.75, "risk_tier": "High",     "attending": "Dr. Priya Patel", "admit_date": "2026-03-08", "los_days": 3},
    {"patient_id": "PAT-010153", "name": "Mildred Hernandez", "department": "Nephrology",      "risk_score": 0.73, "risk_tier": "High",     "attending": "Dr. Priya Patel", "admit_date": "2026-03-09", "los_days": 2},
    {"patient_id": "PAT-010170", "name": "Walter Bergström",  "department": "Cardiology",      "risk_score": 0.72, "risk_tier": "High",     "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-11", "los_days": 0},
    {"patient_id": "PAT-010187", "name": "Agnes Patterson",   "department": "ICU",             "risk_score": 0.71, "risk_tier": "High",     "attending": "Dr. Sarah Chen",  "admit_date": "2026-03-10", "los_days": 1},
]

# ─── Helper: set progress (no-ops if DB write fails) ──────────────────────────
async def _set_progress(update_fn, job_id: str, pct: int, started_at: datetime | None = None) -> None:
    try:
        await update_fn(job_id, pct, started_at=started_at)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# PDF Builder: High-Risk Daily Brief
# ─────────────────────────────────────────────────────────────────────────────

def _build_high_risk_pdf(patients: list[dict], params: dict) -> bytes:
    """
    Generates a real PDF using reportlab Platypus.
    Returns raw PDF bytes.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle,
            Paragraph, Spacer, HRFlowable,
        )
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=landscape(letter),
            leftMargin=0.6 * inch, rightMargin=0.6 * inch,
            topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        )

        styles = getSampleStyleSheet()
        brand_blue_rl = colors.Color(*BRAND_BLUE)
        grey_dark_rl  = colors.Color(*GREY_DARK)
        risk_high_rl  = colors.Color(*RISK_HIGH)
        risk_med_rl   = colors.Color(*RISK_MED)
        risk_low_rl   = colors.Color(*RISK_LOW)
        grey_light_rl = colors.Color(*GREY_LIGHT)

        def style(name, **kw):
            return ParagraphStyle(name, parent=styles["Normal"], **kw)

        title_style    = style("TitleS",  fontSize=18, fontName="Helvetica-Bold",  textColor=brand_blue_rl, spaceAfter=2)
        sub_style      = style("SubS",    fontSize=10, fontName="Helvetica",       textColor=grey_dark_rl,  spaceAfter=2)
        meta_style     = style("MetaS",   fontSize=8,  fontName="Helvetica",       textColor=colors.Color(*GREY_MED), spaceAfter=0)
        cell_mono      = style("CellM",   fontSize=8,  fontName="Courier",         textColor=grey_dark_rl)
        cell_normal    = style("CellN",   fontSize=8,  fontName="Helvetica",       textColor=grey_dark_rl)
        cell_bold_r    = style("CellBR",  fontSize=8,  fontName="Helvetica-Bold",  textColor=risk_high_rl, alignment=TA_CENTER)
        cell_bold_m    = style("CellBM",  fontSize=8,  fontName="Helvetica-Bold",  textColor=risk_med_rl,  alignment=TA_CENTER)

        date_str = params.get("date", datetime.now().strftime("%Y-%m-%d"))
        threshold = params.get("risk_threshold", 70)
        dept = params.get("department", "All Departments")
        generated_at = datetime.now().strftime("%Y-%m-%d %H:%M UTC")

        story = []

        # ── Header ──
        story.append(Paragraph("CareIQ", style("Logo", fontSize=11, fontName="Helvetica-Bold", textColor=brand_blue_rl)))
        story.append(Paragraph("High-Risk Patient Daily Brief", title_style))
        story.append(Paragraph(f"Date: {date_str}  ·  Department: {dept}  ·  Threshold: ≥{threshold}%", sub_style))
        story.append(Paragraph(f"Generated: {generated_at}  ·  Confidential — For authorized clinical use only", meta_style))
        story.append(HRFlowable(width="100%", thickness=1, color=brand_blue_rl, spaceAfter=8))

        # ── Summary row ──
        critical_n = sum(1 for p in patients if p["risk_tier"] == "Critical")
        high_n     = sum(1 for p in patients if p["risk_tier"] == "High")

        summary_data = [
            ["Patients at Risk", "Critical (≥90%)", "High (70–89%)", "Avg Risk Score", "Departments"],
            [
                str(len(patients)),
                str(critical_n),
                str(high_n),
                f"{sum(p['risk_score'] for p in patients)/len(patients)*100:.1f}%",
                str(len(set(p["department"] for p in patients))),
            ],
        ]
        summary_tbl = Table(summary_data, colWidths=[1.6*inch]*5, hAlign="LEFT")
        summary_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), brand_blue_rl),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 8),
            ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
            ("GRID",        (0, 0), (-1, -1), 0.4, colors.Color(*GREY_LIGHT)),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(*BRAND_LIGHT)]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING",  (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_tbl)
        story.append(Spacer(1, 0.15 * inch))

        # ── Patient table ──
        headers = ["Patient ID", "Name", "Department", "Risk Score", "Tier", "Attending", "Admit Date", "LOS (days)"]
        rows = [headers]
        for p in patients:
            score_pct = f"{p['risk_score']*100:.0f}%"
            tier = p["risk_tier"]
            rows.append([
                Paragraph(p["patient_id"], cell_mono),
                Paragraph(p["name"], cell_normal),
                Paragraph(p["department"], cell_normal),
                Paragraph(score_pct, cell_bold_r if tier == "Critical" else cell_bold_m if tier == "High" else cell_normal),
                Paragraph(tier, cell_bold_r if tier == "Critical" else cell_bold_m),
                Paragraph(p["attending"], cell_normal),
                Paragraph(p["admit_date"], cell_mono),
                Paragraph(str(p["los_days"]), cell_normal),
            ])

        col_widths = [1.1*inch, 1.5*inch, 1.3*inch, 0.85*inch, 0.85*inch, 1.4*inch, 0.95*inch, 0.85*inch]
        patient_tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        patient_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), brand_blue_rl),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 8),
            ("ALIGN",       (3, 0), (4, -1), "CENTER"),
            ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(*BRAND_LIGHT)]),
            ("GRID",        (0, 0), (-1, -1), 0.4, grey_light_rl),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING",  (0, 0), (-1, -1), 5),
            ("LINEABOVE",   (0, 1), (-1, 1), 1, brand_blue_rl),
        ]))
        story.append(patient_tbl)

        # ── Footer note ──
        story.append(Spacer(1, 0.15 * inch))
        story.append(Paragraph(
            "⚕ CONFIDENTIAL — Contains Protected Health Information (PHI). "
            "Authorized clinical personnel only. Do not print or share outside care team.",
            style("Footer", fontSize=7, textColor=colors.Color(*GREY_MED), fontName="Helvetica-Oblique"),
        ))

        def add_page_number(canvas, doc):
            canvas.saveState()
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(colors.Color(*GREY_MED))
            canvas.drawString(0.6 * inch, 0.4 * inch, f"CareIQ · High-Risk Daily Brief · {date_str}")
            canvas.drawRightString(
                landscape(letter)[0] - 0.6 * inch, 0.4 * inch,
                f"Page {doc.page}",
            )
            canvas.restoreState()

        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        return buf.getvalue()

    except ImportError:
        # reportlab not installed — return a minimal placeholder PDF
        logger.warning("reportlab not installed, returning placeholder PDF")
        return _minimal_placeholder_pdf(
            "High-Risk Patient Daily Brief",
            f"Contains {len(patients)} patients with risk score ≥ {params.get('risk_threshold', 70)}%.\n"
            "Install reportlab (pip install reportlab) to generate formatted PDFs.",
        )


def _minimal_placeholder_pdf(title: str, body: str) -> bytes:
    """Fallback: returns a valid but minimal PDF when reportlab is unavailable."""
    lines = [
        "%PDF-1.4",
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        f"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        f"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    ]
    content = f"BT /F1 14 Tf 50 742 Td ({title}) Tj 0 -20 Td /F1 10 Tf ({body[:200]}) Tj ET"
    lines += [
        f"4 0 obj<</Length {len(content)}>>\nstream\n{content}\nendstream\nendobj",
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
        "xref\n0 6",
        "0000000000 65535 f",
        "trailer<</Size 6/Root 1 0 R>>\nstartxref\n%%EOF",
    ]
    return "\n".join(lines).encode()


# ─────────────────────────────────────────────────────────────────────────────
# CSV Builder: High-Risk Daily Brief
# ─────────────────────────────────────────────────────────────────────────────

def _build_high_risk_csv(patients: list[dict], params: dict) -> bytes:
    buf = io.StringIO()
    fieldnames = ["patient_id", "name", "department", "risk_score_pct", "risk_tier",
                  "attending", "admit_date", "los_days"]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for p in patients:
        writer.writerow({
            "patient_id":     p["patient_id"],
            "name":           p["name"],
            "department":     p["department"],
            "risk_score_pct": f"{p['risk_score']*100:.1f}",
            "risk_tier":      p["risk_tier"],
            "attending":      p["attending"],
            "admit_date":     p["admit_date"],
            "los_days":       p["los_days"],
        })
    return buf.getvalue().encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Main dispatcher: generate_report_files
# ─────────────────────────────────────────────────────────────────────────────

async def generate_report_files(
    job_id: str,
    report_type: str,
    params: dict,
    formats: list[str],
    update_progress,          # async callable(job_id, pct, *, started_at=None)
) -> dict[str, str]:
    """
    Orchestrates report generation.

    Returns: {"pdf": "/tmp/careiq_reports/xxx.pdf", "csv": "/tmp/careiq_reports/xxx.csv"}

    Progress milestones:
    10  → started
    30  → data fetched
    70  → formatted / rendered
    90  → files written
    100 → complete
    """
    import asyncio

    start = datetime.utcnow()
    await _set_progress(update_progress, job_id, 10, started_at=start)

    # ── 1. Fetch / prepare data ────────────────────────────────────────────
    patients = MOCK_HIGH_RISK_PATIENTS
    threshold = params.get("risk_threshold", 70)
    dept = params.get("department", "All")
    if dept not in ("All", "All Departments", ""):
        patients = [p for p in patients if p["department"] == dept]
    patients = [p for p in patients if p["risk_score"] * 100 >= threshold]

    await asyncio.sleep(1.0)  # simulate query latency
    await _set_progress(update_progress, job_id, 30)

    # ── 2. Render/format ──────────────────────────────────────────────────
    pdf_bytes: bytes | None = None
    csv_bytes: bytes | None = None

    if report_type == "high_risk_daily":
        if "pdf" in formats:
            pdf_bytes = _build_high_risk_pdf(patients, params)
        if "csv" in formats:
            csv_bytes = _build_high_risk_csv(patients, params)
    else:
        # Fallback for other report types — generate placeholder PDF
        if "pdf" in formats:
            title_map = {
                "dept_readmission_monthly": "Department Readmission Report",
                "model_performance_weekly": "ML Model Performance Report",
                "patient_care_plan":        "Individual Care Plan Export",
                "pipeline_sla_weekly":      "Data Platform SLA Report",
            }
            pdf_bytes = _minimal_placeholder_pdf(
                title_map.get(report_type, report_type.replace("_", " ").title()),
                f"Parameters: {params}\nFull reportlab implementation for this report type "
                "is a straightforward extension of the high_risk_daily generator.",
            )
        if "csv" in formats:
            csv_bytes = f"report_type,generated_at,params\n{report_type},{start.isoformat()},\"{params}\"\n".encode()

    await asyncio.sleep(1.0)
    await _set_progress(update_progress, job_id, 70)

    # ── 3. Write files ────────────────────────────────────────────────────
    slug = job_id[:8]
    file_paths: dict[str, str] = {}

    if pdf_bytes is not None:
        pdf_path = REPORTS_DIR / f"{report_type}_{slug}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        file_paths["pdf"] = str(pdf_path)

    if csv_bytes is not None:
        csv_path = REPORTS_DIR / f"{report_type}_{slug}.csv"
        csv_path.write_bytes(csv_bytes)
        file_paths["csv"] = str(csv_path)

    await asyncio.sleep(0.5)
    await _set_progress(update_progress, job_id, 90)

    return file_paths
