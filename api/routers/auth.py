"""
CareIQ — Auth Router
====================
POST /auth/login   → access_token + refresh_token
POST /auth/refresh → new access_token from refresh_token
GET  /auth/me      → current user profile
POST /auth/logout  → client-side (stateless JWT — tell client to drop tokens)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from api.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ROLE_SCOPES,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_user_by_id,
    TokenExpiredError,
    TokenInvalidError,
)
from api.dependencies import TokenUser, get_current_user
from api.models import LoginRequest, RefreshRequest, TokenResponse, UserProfile

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email + password",
    description=(
        "Authenticate with email and password. Returns a JWT access token (60min default) "
        "and a refresh token (7 days).\n\n"
        "**Demo credentials**:\n"
        "- `clinician@careiq.io` / `CareIQ-Demo-2024!`\n"
        "- `coordinator@careiq.io` / `CareIQ-Demo-2024!`\n"
        "- `analyst@careiq.io` / `CareIQ-Demo-2024!`\n"
        "- `admin@careiq.io` / `CareIQ-Admin-2024!`"
    ),
)
async def login(body: LoginRequest) -> TokenResponse:
    user = authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_credentials",
                "message": "Incorrect email or password.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        user_id=user["user_id"],
        email=user["email"],
        role=user["role"],
        department=user["department"],
    )
    refresh_token = create_refresh_token(
        user_id=user["user_id"],
        email=user["email"],
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserProfile(
            user_id=user["user_id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            department=user["department"],
            scopes=ROLE_SCOPES.get(user["role"], []),
        ),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange refresh token for new access token",
)
async def refresh_token(body: RefreshRequest) -> TokenResponse:
    try:
        payload = decode_refresh_token(body.refresh_token)
    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "refresh_token_expired", "message": "Please log in again."},
        )
    except TokenInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "refresh_token_invalid", "message": str(exc)},
        )

    user = get_user_by_id(payload["sub"])
    if not user or not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "user_not_found", "message": "User account not found or deactivated."},
        )

    new_access = create_access_token(
        user_id=user["user_id"],
        email=user["email"],
        role=user["role"],
        department=user["department"],
    )
    new_refresh = create_refresh_token(
        user_id=user["user_id"],
        email=user["email"],
    )

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserProfile(
            user_id=user["user_id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            department=user["department"],
            scopes=ROLE_SCOPES.get(user["role"], []),
        ),
    )


@router.get(
    "/me",
    response_model=UserProfile,
    summary="Get current authenticated user profile",
)
async def get_me(user: TokenUser = Depends(get_current_user)) -> UserProfile:
    full_user = get_user_by_id(user.user_id)
    if not full_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserProfile(
        user_id=full_user["user_id"],
        email=full_user["email"],
        name=full_user["name"],
        role=full_user["role"],
        department=full_user["department"],
        scopes=ROLE_SCOPES.get(full_user["role"], []),
    )


@router.post(
    "/logout",
    summary="Logout (client-side token invalidation)",
    description=(
        "Stateless JWT — the server has no session state to clear. "
        "The client must delete both tokens from storage on receipt of this 200 response."
    ),
)
async def logout(_: TokenUser = Depends(get_current_user)) -> dict:
    return {"message": "Logged out successfully. Please delete your tokens client-side."}
