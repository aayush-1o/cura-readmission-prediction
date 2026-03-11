"""
CareIQ — FastAPI Dependency Injection
=======================================
Shared FastAPI dependencies used across routers:

  get_current_user         — Validates Bearer JWT, injects TokenUser
  require_role(...)        — Role guard factory (raises 403 if wrong role)
  require_scope(...)       — Scope guard factory (raises 403 if missing scope)
  get_db_session           — Yields a transactional SQLAlchemy session
  get_redis                — Yields the shared Redis client
  get_engine               — Returns the recommendation engine singleton

Usage example in a router:
    @router.get("/patients/{id}")
    async def get_patient(
        patient_id: str,
        user: TokenUser = Depends(get_current_user),
        _: None = Depends(require_scope("read:patients")),
    ):
        ...
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.auth import (
    TokenExpiredError,
    TokenInvalidError,
    decode_access_token,
)

# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TokenUser:
    """Parsed, validated JWT payload injected into route handlers."""
    user_id: str
    email: str
    role: str
    department: str
    scopes: list[str]


# ─────────────────────────────────────────────────────────────────────────────
# Security scheme
# ─────────────────────────────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(
    scheme_name="JWT Bearer",
    description="Pass JWT access token as: `Authorization: Bearer <token>`",
    auto_error=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# Core auth dependency
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> TokenUser:
    """
    Validate the Bearer JWT and return the parsed user.

    Injects into the request as a TokenUser dataclass.
    Raises HTTP 401 on invalid/expired token.
    """
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_expired", "message": "Access token has expired. Please refresh."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except TokenInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_invalid", "message": str(exc)},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenUser(
        user_id=payload["sub"],
        email=payload.get("email", ""),
        role=payload.get("role", ""),
        department=payload.get("department", ""),
        scopes=payload.get("scopes", []),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Role guards
# ─────────────────────────────────────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """
    Dependency factory: require the user to have one of the specified roles.

    Usage:
        Depends(require_role("admin", "analyst"))

    Raises HTTP 403 if the user's role is not in allowed_roles.
    """
    async def _guard(user: TokenUser = Depends(get_current_user)) -> TokenUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_role",
                    "message": f"Role '{user.role}' is not authorized for this endpoint.",
                    "required_roles": list(allowed_roles),
                },
            )
        return user
    return _guard


def require_scope(*required_scopes: str):
    """
    Dependency factory: require the user token to include a specific scope.

    Usage:
        Depends(require_scope("read:patients"))

    Raises HTTP 403 if any required scope is missing from the token.
    """
    async def _guard(user: TokenUser = Depends(get_current_user)) -> TokenUser:
        missing = [s for s in required_scopes if s not in user.scopes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_scope",
                    "message": f"Token is missing required scopes: {missing}",
                    "required_scopes": list(required_scopes),
                },
            )
        return user
    return _guard


# ─────────────────────────────────────────────────────────────────────────────
# Database session dependency
# ─────────────────────────────────────────────────────────────────────────────

def get_db():
    """
    Yield a transactional SQLAlchemy session.

    Commits on success, rolls back on exception.
    """
    from warehouse.db import session_scope
    with session_scope() as session:
        yield session


# ─────────────────────────────────────────────────────────────────────────────
# Redis dependency
# ─────────────────────────────────────────────────────────────────────────────

async def get_redis() -> Optional[Any]:
    """
    Return the shared Redis client (or None if Redis is unavailable).

    Routers must handle None gracefully (disabled caching).
    """
    from api.cache import get_redis_client
    return get_redis_client()


# ─────────────────────────────────────────────────────────────────────────────
# ML engine dependency
# ─────────────────────────────────────────────────────────────────────────────

def get_recommendation_engine() -> Optional[Any]:
    """
    Return the globally loaded CarePathRecommendationEngine.

    Returns None if ML modules weren't loaded at startup (graceful degradation).
    """
    from api.main import get_recommendation_engine as _get
    return _get()
