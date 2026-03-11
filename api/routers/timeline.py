"""
CareIQ — Timeline & Audit Log Router
=====================================
GET /patients/{patient_id}/timeline        — All events for a patient (newest first)
GET /audit-log                             — Paginated audit log (admin only)
GET /audit-log/patient/{patient_id}        — Patient-scoped audit trail (admin only)
POST /audit-log/export                     — CSV export (admin only)

The audit_log table is APPEND-ONLY. This router never issues UPDATE or DELETE
against it — only SELECT and INSERT (via the audit middleware).

Required scopes:
  - read:analytics for /audit-log endpoints
  - Any authenticated user for /patients/{id}/timeline (own patients)
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from api.cache import ANALYTICS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, require_scope
from warehouse.db import execute_query

router = APIRouter()

_analytics_scope  = Depends(require_scope("read:analytics"))
_any_auth         = Depends(require_scope("read:patients"))


# ─────────────────────────────────────────────────────────────────────────────
# GET /patients/{patient_id}/timeline
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/patients/{patient_id}/timeline",
    response_model=list[dict],
    summary="Patient event timeline — all events newest first",
    description=(
        "Returns the full chronological event history for a patient: "
        "admissions, vitals, risk score changes, alerts, care plan actions, "
        "clinician views, medication changes, and discharges. "
        "Optionally filter by event_type."
    ),
)
async def get_patient_timeline(
    patient_id: str,
    event_type: Optional[str] = Query(None, description="Filter to a specific event type"),
    limit: int = Query(100, ge=1, le=500, description="Max events to return"),
    _: TokenUser = _any_auth,
) -> list[dict]:

    cache_key = f"timeline:{patient_id}:{event_type}:{limit}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        conditions = ["patient_id = :patient_id"]
        params: dict = {"patient_id": patient_id, "limit": limit}

        if event_type:
            conditions.append("event_type = :event_type")
            params["event_type"] = event_type

        where = " AND ".join(conditions)

        df = execute_query(
            f"""
            SELECT
                event_id::text,
                patient_id,
                admission_id,
                event_type,
                event_at,
                title,
                subtitle,
                actor,
                actor_role,
                detail_json
            FROM patient_timeline_events
            WHERE {where}
            ORDER BY event_at DESC
            LIMIT :limit
            """,
            params,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
        # Serialize datetime objects
        for row in result:
            if hasattr(row.get("event_at"), "isoformat"):
                row["event_at"] = row["event_at"].isoformat()
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=60)  # short TTL — events can arrive quickly
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /audit-log
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/audit-log",
    response_model=list[dict],
    summary="Full audit log — admin only",
    description=(
        "Returns the paginated audit log. The audit_log table is APPEND-ONLY — "
        "no records are ever updated or deleted, providing a tamper-evident trail "
        "for HIPAA compliance. Filter by event_type, actor, or patient_id."
    ),
)
async def get_audit_log(
    event_type: Optional[str] = Query(None),
    actor_user_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = f"audit_log:{event_type}:{actor_user_id}:{patient_id}:{limit}:{offset}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        conditions = ["1=1"]
        params: dict = {"limit": limit, "offset": offset}

        if event_type:
            conditions.append("event_type = :event_type")
            params["event_type"] = event_type
        if actor_user_id:
            conditions.append("actor_user_id = :actor_user_id")
            params["actor_user_id"] = actor_user_id
        if patient_id:
            conditions.append("patient_id = :patient_id")
            params["patient_id"] = patient_id

        where = " AND ".join(conditions)

        df = execute_query(
            f"""
            SELECT
                audit_id::text,
                event_at,
                event_type,
                actor_user_id,
                actor_role,
                patient_id,
                resource_type,
                resource_id,
                action,
                ip_address,
                request_id,
                metadata
            FROM audit_log
            WHERE {where}
            ORDER BY event_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
        for row in result:
            if hasattr(row.get("event_at"), "isoformat"):
                row["event_at"] = row["event_at"].isoformat()
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=30)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /audit-log/patient/{patient_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/audit-log/patient/{patient_id}",
    response_model=list[dict],
    summary="Patient-scoped audit trail",
    description="All audit events for a specific patient_id ordered newest-first.",
)
async def get_patient_audit_trail(
    patient_id: str,
    limit: int = Query(100, ge=1, le=500),
    _: TokenUser = _analytics_scope,
) -> list[dict]:
    return await get_audit_log(
        event_type=None,
        actor_user_id=None,
        patient_id=patient_id,
        limit=limit,
        offset=0,
        _=_,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /audit-log/export
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/audit-log/export",
    summary="Export audit log as CSV",
    description="Streams the audit log as a CSV download.",
)
async def export_audit_log(
    event_type: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    limit: int = Query(10000, ge=1, le=100000),
    _: TokenUser = _analytics_scope,
) -> StreamingResponse:

    rows = await get_audit_log(
        event_type=event_type,
        actor_user_id=None,
        patient_id=patient_id,
        limit=limit,
        offset=0,
        _=_,
    )

    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    output.seek(0)
    filename = f"careiq_audit_log_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
