"""
CareIQ — Audit Middleware
==========================
Automatically logs every patient data access to the append-only audit_log table.

Design principle:
  This middleware fires AFTER the response is returned — it uses asyncio.create_task
  so the audit write never adds latency to the client-facing response.

  The audit_log table is APPEND-ONLY. This middleware only ever does INSERTs.
  No UPDATE or DELETE statements ever touch audit_log.

What is logged:
  - Any request that targets /patients/ routes (GET, POST, PUT)
  - The actor (extracted from the JWT token if available)
  - Patient ID extracted from the URL path
  - IP address, User-Agent, and X-Request-ID for traceability

Not logged:
  - /health, /metrics, /docs — infrastructure endpoints
  - /auth/ — login events are logged separately
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from warehouse.db import execute_query

logger = logging.getLogger(__name__)

# Regex to extract patient_id from URLs like /api/v1/patients/PAT-010000/...
_PATIENT_ID_RE = re.compile(r"/patients/([^/]+)")

# Routes that trigger audit logging
_AUDITABLE_PREFIXES = ("/patients/",)

# Routes to skip entirely
_SKIP_PREFIXES = ("/health", "/metrics", "/docs", "/openapi", "/auth/", "/static")


def _extract_patient_id(path: str) -> Optional[str]:
    match = _PATIENT_ID_RE.search(path)
    return match.group(1) if match else None


def _extract_actor(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Return (actor_user_id, actor_role) from request state if auth ran."""
    try:
        user = getattr(request.state, "current_user", None)
        if user and hasattr(user, "user_id"):
            return user.user_id, getattr(user, "role", None)
    except Exception:
        pass
    return None, None


def _map_action(method: str, path: str) -> str:
    if method == "GET":
        return "read"
    if method == "POST":
        return "create"
    if method in ("PUT", "PATCH"):
        return "update"
    if method == "DELETE":
        return "delete"
    return method.lower()


async def _write_audit_event(
    event_type: str,
    actor_user_id: Optional[str],
    actor_role: Optional[str],
    patient_id: Optional[str],
    resource_type: str,
    resource_id: Optional[str],
    action: str,
    ip_address: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> None:
    """
    Fire-and-forget INSERT into audit_log.
    Called via asyncio.create_task() so it never blocks the response path.
    """
    try:
        execute_query(
            """
            INSERT INTO audit_log (
                event_type, actor_user_id, actor_role, patient_id,
                resource_type, resource_id, action,
                ip_address, user_agent, request_id
            ) VALUES (
                :event_type, :actor_user_id, :actor_role, :patient_id,
                :resource_type, :resource_id, :action,
                :ip_address, :user_agent, :request_id
            )
            """,
            {
                "event_type":    event_type,
                "actor_user_id": actor_user_id,
                "actor_role":    actor_role,
                "patient_id":    patient_id,
                "resource_type": resource_type,
                "resource_id":   resource_id,
                "action":        action,
                "ip_address":    ip_address,
                "user_agent":    user_agent,
                "request_id":    request_id,
            },
            read_only=False,
        )
    except Exception as exc:
        # Audit failures must NOT crash the application.
        # Log the error but let the main response through.
        logger.warning("Audit write failed (non-fatal): %s", exc)


class AuditMiddleware(BaseHTTPMiddleware):
    """
    HTTP middleware that fires an async audit log write for every request
    that accesses patient data.

    This middleware:
      1. Checks if the path is auditable (touches /patients/)
      2. Let the request proceed normally (audit does not block)
      3. After the response, schedules an async INSERT to audit_log
         via asyncio.create_task — zero added latency to the client

    Only successful (2xx/3xx) responses are logged. 4xx/5xx errors
    indicate failed access and are tracked separately in error logs.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip non-auditable routes immediately
        should_audit = (
            any(path.startswith(p) for p in _AUDITABLE_PREFIXES)
            and not any(path.startswith(s) for s in _SKIP_PREFIXES)
            and request.method in ("GET", "POST", "PUT", "PATCH")
        )

        response = await call_next(request)

        if should_audit and response.status_code < 400:
            actor_user_id, actor_role = _extract_actor(request)
            patient_id = _extract_patient_id(path)
            request_id = request.headers.get("X-Request-ID")
            ip_address = (
                request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                or getattr(request.client, "host", None)
            )
            user_agent = request.headers.get("User-Agent", "")[:300]
            action = _map_action(request.method, path)

            # Determine resource type from path
            if "/timeline" in path:
                resource_type = "timeline"
            elif "/care-plan" in path or "/recommendations" in path:
                resource_type = "care_plan"
            elif "/predictions" in path:
                resource_type = "prediction"
            else:
                resource_type = "patient"

            # Non-blocking fire-and-forget
            asyncio.create_task(
                _write_audit_event(
                    event_type="patient_data_access",
                    actor_user_id=actor_user_id,
                    actor_role=actor_role,
                    patient_id=patient_id,
                    resource_type=resource_type,
                    resource_id=patient_id,
                    action=action,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    request_id=request_id,
                )
            )

        return response
