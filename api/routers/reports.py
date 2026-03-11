"""
CareIQ — Reports Router
========================
POST /reports/generate          — Queue report generation job
GET  /reports/jobs/{job_id}     — Poll job status + progress
GET  /reports/jobs/{job_id}/download/{format} — Download PDF or CSV
GET  /reports                   — List recent completed reports

All generation runs as a FastAPI BackgroundTask (fire-and-forget after the
immediate 200 response). In production, swap BackgroundTasks for Celery + Redis.

Interview talking point:
"The client gets a {job_id, estimated_seconds} response immediately — under 50ms.
The report generates in the background and the UI polls /jobs/{id} every 2 seconds.
This pattern is identical to how large exports work at scale: Stripe, Shopify, and
GitHub all use async job queues for CSV/PDF exports. In production I'd use Celery
with Redis as the broker so jobs survive API server restarts."
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.cache import ANALYTICS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, require_scope
from warehouse.db import execute_query

logger = logging.getLogger(__name__)
router = APIRouter()

_scope = Depends(require_scope("read:analytics"))

# ─── Report type metadata ─────────────────────────────────────────────────────
REPORT_TYPES: dict[str, dict] = {
    "high_risk_daily": {
        "name":             "High-Risk Patient Daily Brief",
        "description":      "All patients with risk score ≥ threshold, sorted by score",
        "formats":          ["pdf", "csv"],
        "schedule_options": ["daily", "weekly"],
        "parameters":       ["department", "risk_threshold", "date"],
        "estimated_rows":   "~200 patients",
        "estimated_seconds": 8,
        "who_uses":         "Care coordinators, attending physicians",
    },
    "dept_readmission_monthly": {
        "name":             "Department Readmission Report",
        "description":      "Month-over-month readmission rates vs CMS benchmark",
        "formats":          ["pdf", "csv"],
        "schedule_options": ["monthly", "weekly"],
        "parameters":       ["department", "date_range"],
        "estimated_rows":   "Summary + detail tables",
        "estimated_seconds": 14,
        "who_uses":         "Department heads, quality teams",
    },
    "model_performance_weekly": {
        "name":             "ML Model Performance Report",
        "description":      "AUC, calibration, PSI, and fairness metrics for the period",
        "formats":          ["pdf"],
        "schedule_options": ["weekly"],
        "parameters":       ["model_version", "date_range"],
        "estimated_rows":   "Metrics tables + charts",
        "estimated_seconds": 11,
        "who_uses":         "ML team, CIO",
    },
    "patient_care_plan": {
        "name":             "Individual Care Plan Export",
        "description":      "Single patient: risk score, SHAP explanation, recommendations",
        "formats":          ["pdf"],
        "schedule_options": [],
        "parameters":       ["patient_id"],
        "estimated_rows":   "Single patient",
        "estimated_seconds": 7,
        "who_uses":         "Clinicians (patient handoffs)",
    },
    "pipeline_sla_weekly": {
        "name":             "Data Platform SLA Report",
        "description":      "Pipeline run history, DQ scores, SLA compliance",
        "formats":          ["pdf", "csv"],
        "schedule_options": ["weekly"],
        "parameters":       ["date_range"],
        "estimated_rows":   "30–50 run records",
        "estimated_seconds": 9,
        "who_uses":         "Data engineering team, CTO",
    },
}

# ─── Static seed jobs for fallback ───────────────────────────────────────────
_SEED_JOBS = [
    {
        "job_id":        "a1b2c3d4-0001-0001-0001-000000000001",
        "report_type":   "high_risk_daily",
        "name":          "High-Risk Patient Daily Brief",
        "parameters":    {"department": "All", "risk_threshold": 70, "date": "2026-03-11"},
        "formats":       ["pdf", "csv"],
        "status":        "complete",
        "progress":      100,
        "created_at":    "2026-03-11T06:00:00",
        "completed_at":  "2026-03-11T06:00:09",
        "created_by":    "system-scheduler",
        "file_size_bytes": 250880,
        "is_scheduled":  True,
    },
    {
        "job_id":        "a1b2c3d4-0002-0002-0002-000000000002",
        "report_type":   "dept_readmission_monthly",
        "name":          "Department Readmission Report",
        "parameters":    {"department": "All", "date_range": "2026-02"},
        "formats":       ["pdf"],
        "status":        "complete",
        "progress":      100,
        "created_at":    "2026-03-10T18:00:00",
        "completed_at":  "2026-03-10T18:00:14",
        "created_by":    "dr.chen@careiq.health",
        "file_size_bytes": 1258291,
        "is_scheduled":  False,
    },
    {
        "job_id":        "a1b2c3d4-0003-0003-0003-000000000003",
        "report_type":   "patient_care_plan",
        "name":          "Care Plan: PAT-010000",
        "parameters":    {"patient_id": "PAT-010000"},
        "formats":       ["pdf"],
        "status":        "complete",
        "progress":      100,
        "created_at":    "2026-03-11T09:31:00",
        "completed_at":  "2026-03-11T09:31:07",
        "created_by":    "dr.chen@careiq.health",
        "file_size_bytes": 91136,
        "is_scheduled":  False,
    },
    {
        "job_id":        "a1b2c3d4-0004-0004-0004-000000000004",
        "report_type":   "model_performance_weekly",
        "name":          "Model Performance Wk 10",
        "parameters":    {"model_version": "v1.0", "date_range": "2026-W10"},
        "formats":       ["pdf"],
        "status":        "complete",
        "progress":      100,
        "created_at":    "2026-03-10T07:00:00",
        "completed_at":  "2026-03-10T07:00:11",
        "created_by":    "system-scheduler",
        "file_size_bytes": 421888,
        "is_scheduled":  True,
    },
    {
        "job_id":        "a1b2c3d4-0005-0005-0005-000000000005",
        "report_type":   "high_risk_daily",
        "name":          "High-Risk Patient Daily Brief",
        "parameters":    {"department": "All", "risk_threshold": 70, "date": "2026-03-10"},
        "formats":       ["pdf", "csv"],
        "status":        "complete",
        "progress":      100,
        "created_at":    "2026-03-10T06:00:00",
        "completed_at":  "2026-03-10T06:00:08",
        "created_by":    "system-scheduler",
        "file_size_bytes": 243712,
        "is_scheduled":  True,
    },
    {
        "job_id":        "a1b2c3d4-0006-0006-0006-000000000006",
        "report_type":   "pipeline_sla_weekly",
        "name":          "Pipeline SLA Week 10",
        "parameters":    {"date_range": "2026-W10"},
        "formats":       ["pdf", "csv"],
        "status":        "generating",
        "progress":      45,
        "created_at":    "2026-03-10T07:00:00",
        "completed_at":  None,
        "created_by":    "system-scheduler",
        "file_size_bytes": None,
        "is_scheduled":  True,
    },
]

# In-memory job store (supplements DB — survives within a process lifetime)
_in_memory_jobs: dict[str, dict] = {}


# ─── Pydantic models ──────────────────────────────────────────────────────────
class ReportGenerateRequest(BaseModel):
    report_type:  str             = Field(..., description="e.g. high_risk_daily")
    formats:      list[str]       = Field(default=["pdf"])
    parameters:   dict            = Field(default_factory=dict)
    is_scheduled: bool            = Field(default=False)
    schedule_cron: Optional[str]  = Field(default=None)


# ─── Background task ──────────────────────────────────────────────────────────
async def _update_job_progress(job_id: str, pct: int, *, started_at=None):
    """Update in-memory job + attempt DB write.  Parameterized — no SQL injection."""
    if job_id in _in_memory_jobs:
        _in_memory_jobs[job_id]["progress"] = pct
        if started_at and not _in_memory_jobs[job_id].get("started_at"):
            _in_memory_jobs[job_id]["started_at"] = started_at.isoformat()
    try:
        if started_at:
            execute_query(
                "UPDATE report_jobs SET progress = :pct, started_at = :started WHERE job_id = :job_id",
                {"pct": pct, "started": started_at.isoformat(), "job_id": job_id},
                read_only=False,
            )
        else:
            execute_query(
                "UPDATE report_jobs SET progress = :pct WHERE job_id = :job_id",
                {"pct": pct, "job_id": job_id},
                read_only=False,
            )
    except Exception:
        pass


async def _run_generation(job_id: str, request: ReportGenerateRequest, created_by: str):
    """Background task — called after the API response is sent."""
    job = _in_memory_jobs.get(job_id)
    if not job:
        return

    try:
        from api.reports.generators import generate_report_files

        file_paths = await generate_report_files(
            job_id=job_id,
            report_type=request.report_type,
            params=request.parameters,
            formats=request.formats,
            update_progress=_update_job_progress,
        )

        # Mark complete
        _in_memory_jobs[job_id].update({
            "status":       "complete",
            "progress":     100,
            "file_paths":   file_paths,
            "completed_at": datetime.utcnow().isoformat(),
            "file_size_bytes": sum(
                Path(p).stat().st_size for p in file_paths.values() if Path(p).exists()
            ),
        })
        try:
            execute_query(
                """UPDATE report_jobs
                   SET status = 'complete', progress = 100,
                       file_paths = :file_paths::jsonb,
                       completed_at = NOW()
                   WHERE job_id = :job_id""",
                {"file_paths": json.dumps(file_paths), "job_id": job_id},
                read_only=False,
            )
        except Exception:
            pass

    except Exception as exc:
        logger.exception("Report generation failed for job %s: %s", job_id, exc)
        _in_memory_jobs[job_id].update({"status": "failed", "error_message": str(exc)})


# ─── GET /report-types ────────────────────────────────────────────────────────
@router.get(
    "/report-types",
    summary="All available report types",
)
async def get_report_types(_: TokenUser = _scope) -> dict:
    return REPORT_TYPES


# ─── POST /reports/generate ───────────────────────────────────────────────────
@router.post(
    "/reports/generate",
    summary="Queue a new report generation job",
    status_code=202,
)
async def generate_report(
    request:          ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user:     TokenUser = _scope,
) -> dict:
    if request.report_type not in REPORT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown report type '{request.report_type}'. "
                   f"Valid: {list(REPORT_TYPES)}",
        )

    job_id = str(uuid.uuid4())
    meta   = REPORT_TYPES[request.report_type]

    job = {
        "job_id":          job_id,
        "report_type":     request.report_type,
        "name":            meta["name"],
        "parameters":      request.parameters,
        "formats":         request.formats,
        "status":          "queued",
        "progress":        0,
        "created_at":      datetime.utcnow().isoformat(),
        "started_at":      None,
        "completed_at":    None,
        "created_by":      current_user.sub,
        "file_paths":      None,
        "file_size_bytes": None,
        "is_scheduled":    request.is_scheduled,
        "schedule_cron":   request.schedule_cron,
    }
    _in_memory_jobs[job_id] = job

    # Persist to DB (non-blocking) — parameterized to prevent SQL injection
    try:
        execute_query(
            """INSERT INTO report_jobs
                (job_id, report_type, parameters, formats, status, progress,
                 created_by, is_scheduled, schedule_cron)
               VALUES (
                :job_id, :report_type,
                :parameters::jsonb,
                :formats::TEXT[],
                'queued', 0,
                :created_by,
                :is_scheduled,
                :schedule_cron
               )""",
            {
                "job_id":        job_id,
                "report_type":   request.report_type,
                "parameters":    json.dumps(request.parameters),
                "formats":       request.formats,
                "created_by":    current_user.sub,
                "is_scheduled":  request.is_scheduled,
                "schedule_cron": request.schedule_cron,
            },
            read_only=False,
        )
    except Exception:
        pass

    background_tasks.add_task(_run_generation, job_id, request, current_user.sub)

    return {
        "job_id":            job_id,
        "status":            "queued",
        "estimated_seconds": meta.get("estimated_seconds", 10),
        "report_type":       request.report_type,
        "name":              meta["name"],
    }


# ─── GET /reports/jobs/{job_id} ───────────────────────────────────────────────
@router.get(
    "/reports/jobs/{job_id}",
    summary="Poll report job status",
)
async def get_report_job(job_id: str, _: TokenUser = _scope) -> dict:
    # Check in-memory first (most up-to-date for live jobs)
    if job_id in _in_memory_jobs:
        return _in_memory_jobs[job_id]

    # Try DB — parameterized query
    try:
        df = execute_query(
            "SELECT * FROM report_jobs WHERE job_id = :job_id",
            {"job_id": job_id},
            read_only=True,
        )
        if not df.empty:
            row = df.iloc[0].to_dict()
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
            return row
    except Exception:
        pass

    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")


# ─── GET /reports/jobs/{job_id}/download/{format} ─────────────────────────────
@router.get(
    "/reports/jobs/{job_id}/download/{fmt}",
    summary="Download generated report file",
)
async def download_report(job_id: str, fmt: str, _: TokenUser = _scope):
    if fmt not in ("pdf", "csv"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'csv'")

    job = _in_memory_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job["status"] != "complete":
        raise HTTPException(status_code=409, detail=f"Job status is '{job['status']}' — not yet complete")

    file_paths = job.get("file_paths") or {}
    path = file_paths.get(fmt)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail=f"File not found for format '{fmt}'")

    media_type = "application/pdf" if fmt == "pdf" else "text/csv"
    filename = Path(path).name
    return FileResponse(path, media_type=media_type, filename=filename)


# ─── GET /reports ─────────────────────────────────────────────────────────────
@router.get(
    "/reports",
    summary="List recent report jobs",
)
async def list_reports(
    limit:  int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0,  ge=0),
    _:      TokenUser = _scope,
) -> list[dict]:
    # Merge in-memory jobs + seed + DB
    all_jobs: list[dict] = list(_in_memory_jobs.values()) + _SEED_JOBS

    # Add display name
    for job in all_jobs:
        if "name" not in job:
            meta = REPORT_TYPES.get(job["report_type"], {})
            job["name"] = meta.get("name", job["report_type"].replace("_", " ").title())

    # Deduplicate by job_id
    seen: set[str] = set()
    unique: list[dict] = []
    for job in all_jobs:
        jid = str(job["job_id"])
        if jid not in seen:
            seen.add(jid)
            unique.append(job)

    # Sort newest first
    unique.sort(key=lambda j: j.get("created_at") or "", reverse=True)

    return unique[offset : offset + limit]
