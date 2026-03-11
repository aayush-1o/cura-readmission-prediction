"""
CareIQ — JWT Authentication & RBAC
=====================================
Handles JWT token creation, validation, and role-based access control.

Roles and their scopes:
  clinician        → read:patients, read:predictions, read:care-plans
  care_coordinator → read:patients, read:predictions, read:care-plans,
                     write:care-plans, read:clusters
  analyst          → read:patients, read:analytics, read:predictions,
                     read:clusters, read:rules
  admin            → all scopes + write:users, read:audit

Token structure:
  {
    "sub": "user_id",
    "email": "user@hospital.org",
    "role": "clinician",
    "department": "CARD",
    "scopes": ["read:patients", "read:predictions", "read:care-plans"],
    "iat": 1710000000,
    "exp": 1710086400   # 24h default
  }
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

JWT_SECRET_KEY: str = os.environ.get(
    "SECRET_KEY",
    "CHANGEME-replace-with-256bit-random-in-production",
)
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─────────────────────────────────────────────────────────────────────────────
# Role → Scopes mapping
# ─────────────────────────────────────────────────────────────────────────────

ROLE_SCOPES: dict[str, list[str]] = {
    "clinician": [
        "read:patients",
        "read:predictions",
        "read:care-plans",
    ],
    "care_coordinator": [
        "read:patients",
        "read:predictions",
        "read:care-plans",
        "write:care-plans",
        "read:clusters",
        "read:analytics",
    ],
    "analyst": [
        "read:patients",
        "read:predictions",
        "read:analytics",
        "read:clusters",
        "read:rules",
        "read:audit",
    ],
    "admin": [
        "read:patients",
        "read:predictions",
        "read:care-plans",
        "write:care-plans",
        "read:analytics",
        "read:clusters",
        "read:rules",
        "read:audit",
        "write:users",
        "admin:all",
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# Demo user registry (replace with DB lookup in production)
# ─────────────────────────────────────────────────────────────────────────────
# Passwords are bcrypt-hashed. These are demo credentials:
#   clinician@careiq.io     / CareIQ-Demo-2024!
#   coordinator@careiq.io   / CareIQ-Demo-2024!
#   analyst@careiq.io       / CareIQ-Demo-2024!
#   admin@careiq.io         / CareIQ-Admin-2024!

_DEMO_HASH = "$2b$12$yFl5Q7X.nHG1zTZ.WL3LOu1FoWdFhM.2YB.IIaUJrT8Y5dHQPIREK"  # pragma: no cover

DEMO_USERS: dict[str, dict] = {
    "clinician@careiq.io": {
        "user_id": "usr_001",
        "email": "clinician@careiq.io",
        "name": "Dr. Sarah Chen",
        "role": "clinician",
        "department": "CARD",
        "hashed_password": _DEMO_HASH,
        "is_active": True,
    },
    "coordinator@careiq.io": {
        "user_id": "usr_002",
        "email": "coordinator@careiq.io",
        "name": "Maria Gonzalez",
        "role": "care_coordinator",
        "department": "IMED",
        "hashed_password": _DEMO_HASH,
        "is_active": True,
    },
    "analyst@careiq.io": {
        "user_id": "usr_003",
        "email": "analyst@careiq.io",
        "name": "James Park",
        "role": "analyst",
        "department": "ANALYTICS",
        "hashed_password": _DEMO_HASH,
        "is_active": True,
    },
    "admin@careiq.io": {
        "user_id": "usr_004",
        "email": "admin@careiq.io",
        "name": "System Admin",
        "role": "admin",
        "department": "IT",
        "hashed_password": _DEMO_HASH,
        "is_active": True,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# Password utilities
# ─────────────────────────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a bcrypt password hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(plain_password: str) -> str:
    """Hash a password with bcrypt (cost factor 12)."""
    return pwd_context.hash(plain_password)


# ─────────────────────────────────────────────────────────────────────────────
# Token creation
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    email: str,
    role: str,
    department: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        user_id: Unique user identifier.
        email: User email address.
        role: User role (clinician | care_coordinator | analyst | admin).
        department: Department code (e.g. 'CARD', 'IMED').
        expires_delta: Custom expiry; defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Encoded JWT string.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "department": department,
        "scopes": ROLE_SCOPES.get(role, []),
        "token_type": "access",
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, email: str) -> str:
    """
    Create a long-lived JWT refresh token (7 days default).

    Refresh tokens carry minimal claims — only sub + email + token_type.
    They cannot be used to access protected routes directly.

    Args:
        user_id: Unique user identifier.
        email: User email.

    Returns:
        Encoded refresh JWT string.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "token_type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


# ─────────────────────────────────────────────────────────────────────────────
# Token validation
# ─────────────────────────────────────────────────────────────────────────────

class TokenExpiredError(Exception):
    """Raised when a JWT has expired."""


class TokenInvalidError(Exception):
    """Raised when a JWT is malformed or has an invalid signature."""


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT access token.

    Args:
        token: Raw JWT string.

    Returns:
        Decoded payload dict with sub, role, scopes, etc.

    Raises:
        TokenExpiredError: If the token has expired.
        TokenInvalidError: If the token is invalid.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("token_type") != "access":
            raise TokenInvalidError("Not an access token.")
        return payload
    except ExpiredSignatureError:
        raise TokenExpiredError("Access token has expired.")
    except JWTError as exc:
        raise TokenInvalidError(f"Invalid token: {exc}")


def decode_refresh_token(token: str) -> dict:
    """
    Decode and validate a JWT refresh token.

    Args:
        token: Raw JWT string.

    Returns:
        Decoded payload with sub and email.

    Raises:
        TokenExpiredError: If the refresh token has expired.
        TokenInvalidError: If the token is invalid.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("token_type") != "refresh":
            raise TokenInvalidError("Not a refresh token.")
        return payload
    except ExpiredSignatureError:
        raise TokenExpiredError("Refresh token has expired. Please log in again.")
    except JWTError as exc:
        raise TokenInvalidError(f"Invalid refresh token: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# User lookup
# ─────────────────────────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    """
    Look up a user by email.

    In production: replace DEMO_USERS with a DB query:
        SELECT * FROM auth.users WHERE email = :email AND is_active = TRUE

    Args:
        email: User's email address.

    Returns:
        User dict or None if not found.
    """
    return DEMO_USERS.get(email.lower())


def get_user_by_id(user_id: str) -> Optional[dict]:
    """
    Look up a user by their user_id.

    Args:
        user_id: User's unique identifier.

    Returns:
        User dict or None if not found.
    """
    for user in DEMO_USERS.values():
        if user["user_id"] == user_id:
            return user
    return None


def authenticate_user(email: str, password: str) -> Optional[dict]:
    """
    Validate credentials and return the user record if valid.

    Args:
        email: User's email.
        password: Plain-text password to verify.

    Returns:
        User dict if credentials are valid, None otherwise.
    """
    user = get_user_by_email(email)
    if not user:
        return None
    if not user.get("is_active"):
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user
