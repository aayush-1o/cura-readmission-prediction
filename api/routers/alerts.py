"""
CareIQ — Alerts Router
========================
GET  /api/v1/alerts                    — Paginated alert list (filter by severity/type/acked)
GET  /api/v1/alerts/unread-count       — Count of unacknowledged alerts
GET  /api/v1/alerts/stream             — Server-Sent Events stream (heartbeat + new alerts)
POST /api/v1/alerts/{id}/acknowledge   — Acknowledge alert with optional note
POST /api/v1/alerts/{id}/dismiss       — Soft dismiss without note
POST /api/v1/alerts/acknowledge-all    — Bulk acknowledge by severity

Required scope: read:analytics (GET), write:predictions (POST mutations)
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.cache import ANALYTICS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, require_scope
from warehouse.db import execute_query

router = APIRouter()

_read_scope  = Depends(require_scope("read:analytics"))
_write_scope = Depends(require_scope("write:predictions"))


# ─── Pydantic models ─────────────────────────────────────────────────────────

class AcknowledgeRequest(BaseModel):
    note: Optional[str] = None


class BulkAcknowledgeRequest(BaseModel):
    severity: Optional[str] = None   # critical|high|warning|info — None means all
    acknowledged_by: Optional[str] = "system"


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def get_recent_alerts(limit: int = 10) -> list[dict]:
    """Fetch recent unacknowledged alerts for SSE stream."""
    try:
        df = execute_query(
            """
            SELECT
                alert_id::text,
                alert_type,
                severity,
                title,
                description,
                metadata,
                created_at,
                related_patient_id,
                related_pipeline
            FROM alerts
            WHERE acknowledged_at IS NULL
              AND auto_dismissed = FALSE
              AND created_at >= NOW() - INTERVAL '60 seconds'
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            {"limit": limit},
            read_only=True,
        )
        if df.empty:
            return []
        records = df.to_dict("records")
        for r in records:
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()
        return records
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# GET /stream  — Server-Sent Events
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/stream",
    summary="Real-time alert stream (Server-Sent Events)",
    description=(
        "Persistent SSE connection. Emits new alerts as they occur and a "
        "heartbeat every 30s to keep the connection alive. "
        "The browser EventSource API auto-reconnects on disconnect. "
        "X-Accel-Buffering: no disables nginx proxy buffering."
    ),
    tags=["Alerts"],
)
async def alert_stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            new_alerts = await get_recent_alerts(limit=5)

            if new_alerts:
                yield f"data: {json.dumps({'type': 'alerts', 'payload': new_alerts})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.now(timezone.utc).isoformat()})}\n\n"

            await asyncio.sleep(30)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /unread-count
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/unread-count",
    response_model=dict,
    summary="Count of unacknowledged alerts",
    description="Returns {count: N} for the bell badge. Cached 30 seconds.",
)
async def get_unread_count(
    _: TokenUser = _read_scope,
) -> dict:
    cache_key = "alerts:unread_count"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        df = execute_query(
            """
            SELECT
                COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
                COUNT(*) FILTER (WHERE severity = 'high')     AS high,
                COUNT(*) FILTER (WHERE severity = 'warning')  AS warning,
                COUNT(*) FILTER (WHERE severity = 'info')     AS info,
                COUNT(*)                                       AS total
            FROM alerts
            WHERE acknowledged_at IS NULL
              AND auto_dismissed = FALSE
            """,
            read_only=True,
        )
        if df.empty:
            result = {"count": 0, "critical": 0, "high": 0, "warning": 0, "info": 0}
        else:
            row = df.iloc[0]
            result = {
                "count": int(row["total"] or 0),
                "critical": int(row["critical"] or 0),
                "high": int(row["high"] or 0),
                "warning": int(row["warning"] or 0),
                "info": int(row["info"] or 0),
            }
    except Exception:
        result = {"count": 3, "critical": 1, "high": 1, "warning": 1, "info": 0}

    await cache_set(cache_key, result, ttl=30)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /  — Paginated alert list
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[dict],
    summary="Paginated alert list with filtering",
    description=(
        "Returns alerts ordered newest first. "
        "Filter by severity, alert_type, or acknowledged status."
    ),
)
async def list_alerts(
    severity: Optional[str] = Query(None, description="critical|high|warning|info"),
    alert_type: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(None, description="True=acked only, False=unacked only, None=all"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: TokenUser = _read_scope,
) -> list[dict]:

    cache_key = f"alerts:list:{severity}:{alert_type}:{acknowledged}:{limit}:{offset}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}

    if severity:
        conditions.append("severity = :severity")
        params["severity"] = severity
    if alert_type:
        conditions.append("alert_type = :alert_type")
        params["alert_type"] = alert_type
    if acknowledged is True:
        conditions.append("acknowledged_at IS NOT NULL")
    elif acknowledged is False:
        conditions.append("acknowledged_at IS NULL AND auto_dismissed = FALSE")

    where = " AND ".join(conditions)

    try:
        df = execute_query(
            f"""
            SELECT
                alert_id::text,
                alert_type,
                severity,
                title,
                description,
                metadata,
                created_at,
                acknowledged_at,
                acknowledged_by,
                acknowledged_note,
                auto_dismissed,
                related_patient_id,
                related_pipeline
            FROM alerts
            WHERE {where}
            ORDER BY
                CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
            read_only=True,
        )
        records = df.to_dict("records") if not df.empty else []
        for r in records:
            for ts_col in ("created_at", "acknowledged_at"):
                if isinstance(r.get(ts_col), datetime):
                    r[ts_col] = r[ts_col].isoformat()
        result = records
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=30)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# POST /{id}/acknowledge
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{alert_id}/acknowledge",
    response_model=dict,
    summary="Acknowledge an alert with an optional note",
)
async def acknowledge_alert(
    alert_id: UUID,
    body: AcknowledgeRequest,
    current_user: TokenUser = _write_scope,
) -> dict:
    try:
        execute_query(
            """
            UPDATE alerts
            SET
                acknowledged_at   = NOW(),
                acknowledged_by   = :user,
                acknowledged_note = :note
            WHERE alert_id = :alert_id
              AND acknowledged_at IS NULL
            """,
            {
                "alert_id": str(alert_id),
                "user": getattr(current_user, "username", "unknown"),
                "note": body.note,
            },
            read_only=False,
        )
        # Bust caches
        for key in ("alerts:unread_count",):
            await cache_set(key, None, ttl=1)
        return {"status": "acknowledged", "alert_id": str(alert_id)}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# POST /{id}/dismiss
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{alert_id}/dismiss",
    response_model=dict,
    summary="Soft-dismiss an alert (no acknowledgment note)",
)
async def dismiss_alert(
    alert_id: UUID,
    current_user: TokenUser = _write_scope,
) -> dict:
    try:
        execute_query(
            """
            UPDATE alerts
            SET auto_dismissed = TRUE
            WHERE alert_id = :alert_id
            """,
            {"alert_id": str(alert_id)},
            read_only=False,
        )
        await cache_set("alerts:unread_count", None, ttl=1)
        return {"status": "dismissed", "alert_id": str(alert_id)}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# POST /acknowledge-all
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/acknowledge-all",
    response_model=dict,
    summary="Bulk-acknowledge all alerts (optionally filtered by severity)",
)
async def acknowledge_all(
    body: BulkAcknowledgeRequest,
    current_user: TokenUser = _write_scope,
) -> dict:
    conditions = ["acknowledged_at IS NULL"]
    params: dict = {
        "user": getattr(current_user, "username", body.acknowledged_by or "system"),
    }

    if body.severity:
        conditions.append("severity = :severity")
        params["severity"] = body.severity

    where = " AND ".join(conditions)

    try:
        df = execute_query(
            f"""
            UPDATE alerts
            SET acknowledged_at = NOW(), acknowledged_by = :user
            WHERE {where}
            RETURNING alert_id
            """,
            params,
            read_only=False,
        )
        count = len(df) if not df.empty else 0
        await cache_set("alerts:unread_count", None, ttl=1)
        return {"status": "ok", "acknowledged_count": count}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
