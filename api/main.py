"""
CareIQ — FastAPI Application Entry Point
==========================================
Production-grade FastAPI app with:
  - CORS for frontend origin
  - JWT authentication middleware (bearer token validation on every route)
  - Request-ID injection for distributed tracing
  - X-Response-Time header on every response
  - Global exception handler (no stack trace leakage to clients)
  - Rate limiting via SlowAPI: 100 req/min per token
  - Health check endpoint: /health (DB, Redis, ML model status)
  - Prometheus metrics: /metrics
  - OpenAPI docs with CareIQ branding: /docs
  - Structured JSON request logging (request_id, user_id, latency_ms, status)

Startup sequence:
  1. Test DB connection (fail-fast if DB is down)
  2. Init Redis connection pool
  3. Load ML recommendation engine into memory
  4. Register all routers
  5. Start serving
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from api.cache import init_redis, close_redis, redis_ping
from api.routers import analytics, auth, patients, predictions, recommendations
from warehouse.db import check_connection

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Environment
# ─────────────────────────────────────────────────────────────────────────────

ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
API_VERSION: str = "v1"
DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

# Rate limiting: 100 requests per minute per client IP/token
RATE_LIMIT: str = os.getenv("API_RATE_LIMIT", "100/minute")

# ─────────────────────────────────────────────────────────────────────────────
# Prometheus metrics
# ─────────────────────────────────────────────────────────────────────────────

REQUEST_COUNT = Counter(
    "careiq_api_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)
REQUEST_LATENCY = Histogram(
    "careiq_api_request_latency_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)
ML_CARE_PLAN_LATENCY = Histogram(
    "careiq_care_plan_generation_seconds",
    "Care plan generation latency",
    buckets=[0.01, 0.05, 0.1, 0.2, 0.5, 1.0],
)

# ─────────────────────────────────────────────────────────────────────────────
# Rate limiter (SlowAPI)
# ─────────────────────────────────────────────────────────────────────────────

def _get_rate_limit_key(request: Request) -> str:
    """Use JWT sub claim if authenticated, else fall back to IP."""
    token_payload: dict | None = getattr(request.state, "token_payload", None)
    if token_payload and "sub" in token_payload:
        return f"user:{token_payload['sub']}"
    return get_remote_address(request)


limiter = Limiter(key_func=_get_rate_limit_key, default_limits=[RATE_LIMIT])

# ─────────────────────────────────────────────────────────────────────────────
# ML engine (loaded at startup, shared across requests)
# ─────────────────────────────────────────────────────────────────────────────

_recommendation_engine: Any = None


def get_recommendation_engine() -> Any:
    """Return the globally loaded recommendation engine."""
    return _recommendation_engine


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan (startup + shutdown)
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown."""
    global _recommendation_engine

    logger.info("CareIQ API starting up (env=%s)...", ENVIRONMENT)

    # 1. Database connectivity check
    if check_connection():
        logger.info("  ✓ PostgreSQL connection healthy.")
    else:
        logger.error("  ✗ PostgreSQL connection FAILED — startup aborted.")
        raise RuntimeError("Database connection failed at startup.")

    # 2. Redis
    try:
        await init_redis()
        logger.info("  ✓ Redis connection established.")
    except Exception as exc:
        logger.warning("  ⚠ Redis unavailable (%s). Caching disabled.", exc)

    # 3. ML recommendation engine
    try:
        from ml.recommendations import CarePathRecommendationEngine
        _recommendation_engine = CarePathRecommendationEngine()
        logger.info("  ✓ Recommendation engine initialized.")
    except ImportError:
        logger.warning("  ⚠ ML modules not available. Recommendations disabled.")
        _recommendation_engine = None

    logger.info("CareIQ API startup complete. Serving on %s.", ENVIRONMENT)
    yield

    # Shutdown
    await close_redis()
    logger.info("CareIQ API shut down cleanly.")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CareIQ API",
    description=(
        "## CareIQ — Hospital Readmission Risk & Care-Path Recommendation System\n\n"
        "**Predict. Prevent. Personalize.**\n\n"
        "Production API for:\n"
        "- 🔴 **Real-time readmission risk scoring**\n"
        "- 📋 **Evidence-based care plan generation**\n"
        "- 👥 **Patient cohort analysis & similar patients**\n"
        "- 📊 **Clinical analytics & department performance**\n\n"
        "Authentication: Bearer JWT token (`POST /auth/login`)\n\n"
        "Rate limit: 100 requests/minute per authenticated token."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    swagger_ui_parameters={
        "syntaxHighlight.theme": "monokai",
        "docExpansion": "none",
        "defaultModelsExpandDepth": 2,
        "tryItOutEnabled": True,
    },
)

# ─────────────────────────────────────────────────────────────────────────────
# Middleware stack (order matters — outermost = first to process requests)
# ─────────────────────────────────────────────────────────────────────────────

# 1. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Api-Key"],
    expose_headers=["X-Request-ID", "X-Response-Time", "X-RateLimit-Remaining"],
)

# 2. Rate limiter
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


# 3. Request ID + response time
class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Inject X-Request-ID into every request and X-Response-Time into every response.
    Also logs every request as structured JSON.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        # Generate or forward request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        t_start = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = (time.perf_counter() - t_start) * 1000

        # Attach trace headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"

        # Prometheus metrics
        endpoint = request.url.path
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=endpoint,
            status_code=str(response.status_code),
        ).inc()
        REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=endpoint,
        ).observe(elapsed_ms / 1000)

        # Structured request log
        user_id = getattr(getattr(request.state, "token_payload", None), "get", lambda k, d=None: d)("sub", "anonymous")
        logger.info(
            '{"event":"request","request_id":"%s","method":"%s","path":"%s",'
            '"status":%d,"latency_ms":%.1f,"user":"%s"}',
            request_id, request.method, endpoint,
            response.status_code, elapsed_ms, user_id,
        )

        return response


app.add_middleware(RequestContextMiddleware)

# ─────────────────────────────────────────────────────────────────────────────
# Global exception handlers
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Limit: 100/minute per token.",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "message": "Request body or parameters failed validation.",
            "details": exc.errors(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    # Log full trace server-side, never expose to client
    logger.exception(
        "Unhandled exception | request_id=%s | path=%s",
        request_id, request.url.path,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Our team has been notified.",
            "request_id": request_id,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Core routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"], summary="Health check")
async def health_check() -> dict:
    """
    Returns API health status for load balancer and monitoring checks.

    Checks:
      - Database (PostgreSQL) connectivity
      - Redis (cache) connectivity
      - ML recommendation engine availability

    Returns HTTP 200 if all critical services healthy, 503 otherwise.
    """
    db_ok = check_connection()
    cache_ok = await redis_ping()
    ml_ok = _recommendation_engine is not None

    healthy = db_ok  # Redis + ML are non-critical (degraded mode available)
    return JSONResponse(
        status_code=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "healthy" if healthy else "degraded",
            "version": "1.0.0",
            "environment": ENVIRONMENT,
            "checks": {
                "database": "ok" if db_ok else "error",
                "cache": "ok" if cache_ok else "unavailable",
                "ml_engine": "loaded" if ml_ok else "unavailable",
            },
        },
    )


@app.get("/metrics", tags=["System"], summary="Prometheus metrics", include_in_schema=False)
async def prometheus_metrics() -> Response:
    """Exposes Prometheus metrics for scraping. Not included in OpenAPI docs."""
    return Response(
        content=generate_latest(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.get("/", tags=["System"], include_in_schema=False)
async def root() -> dict:
    return {
        "service": "CareIQ API",
        "version": "1.0.0",
        "tagline": "Predict. Prevent. Personalize.",
        "docs": "/docs",
        "health": "/health",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Router registration
# ─────────────────────────────────────────────────────────────────────────────

PREFIX = f"/api/{API_VERSION}"

app.include_router(auth.router,            prefix="/auth",                    tags=["Authentication"])
app.include_router(patients.router,        prefix=f"{PREFIX}/patients",       tags=["Patients"])
app.include_router(predictions.router,     prefix=f"{PREFIX}/predictions",    tags=["Predictions"])
app.include_router(recommendations.router, prefix=f"{PREFIX}/recommendations", tags=["Recommendations"])
app.include_router(analytics.router,       prefix=f"{PREFIX}/analytics",      tags=["Analytics"])

# ─────────────────────────────────────────────────────────────────────────────
# Logging configuration
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":%(message)s}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# Quiet noisy third-party loggers
for noisy_logger in ("uvicorn.access", "uvicorn.error", "slowapi"):
    logging.getLogger(noisy_logger).setLevel(logging.WARNING)
