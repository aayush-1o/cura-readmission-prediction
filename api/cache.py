"""
CareIQ — Redis Cache Helpers
==============================
Thin async Redis wrapper using aioredis (redis.asyncio).

Provides:
  - init_redis()           — Create connection pool at startup
  - close_redis()          — Close pool at shutdown
  - redis_ping()           — Health check
  - cache_get(key)         — Async get with JSON deserialization
  - cache_set(key, value)  — Async set with TTL + JSON serialization
  - cache_delete(key)      — Async delete one key
  - cache_delete_pattern() — Async delete by glob pattern (patient invalidation)
  - get_redis_client()     — Return the shared client

TTL constants (seconds):
  CARE_PLAN_TTL     4 hours  — care plans don't change during a stay
  PATIENT_TTL       15 min   — patient detail (may be updated intra-day)
  ANALYTICS_TTL     30 min   — dashboard aggregates
  PREDICTIONS_TTL   1 hour   — risk scores stable within an admission
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_MAX_CONNECTIONS: int = int(os.getenv("REDIS_MAX_CONNECTIONS", "20"))
CACHE_KEY_PREFIX: str = "careiq:"

# TTL constants (seconds)
CARE_PLAN_TTL: int = 4 * 3600       # 4 hours
PATIENT_TTL: int = 15 * 60          # 15 minutes
ANALYTICS_TTL: int = 30 * 60        # 30 minutes
PREDICTIONS_TTL: int = 1 * 3600     # 1 hour
CLUSTER_TTL: int = 12 * 3600        # 12 hours (clusters refresh once daily)

# ─────────────────────────────────────────────────────────────────────────────
# Client singleton
# ─────────────────────────────────────────────────────────────────────────────

_redis_client: Optional[Any] = None


async def init_redis() -> None:
    """Initialize the async Redis connection pool. Called at startup."""
    global _redis_client
    import redis.asyncio as aioredis  # type: ignore[import]

    _redis_client = aioredis.from_url(
        REDIS_URL,
        max_connections=REDIS_MAX_CONNECTIONS,
        decode_responses=True,
        encoding="utf-8",
    )
    # Test connection immediately
    await _redis_client.ping()
    logger.info("Redis connected: %s (max_connections=%d)", REDIS_URL, REDIS_MAX_CONNECTIONS)


async def close_redis() -> None:
    """Close Redis connection pool. Called at shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("Redis connection closed.")


async def redis_ping() -> bool:
    """Return True if Redis is reachable."""
    if _redis_client is None:
        return False
    try:
        return await _redis_client.ping()
    except Exception:
        return False


def get_redis_client() -> Optional[Any]:
    """Return the shared Redis client. None if not initialized."""
    return _redis_client


# ─────────────────────────────────────────────────────────────────────────────
# Cache operations
# ─────────────────────────────────────────────────────────────────────────────

def _key(raw_key: str) -> str:
    """Prepend the namespace prefix."""
    return f"{CACHE_KEY_PREFIX}{raw_key}"


async def cache_get(key: str) -> Optional[Any]:
    """
    Get a cached value by key.

    Args:
        key: Cache key (without prefix).

    Returns:
        Deserialized Python object, or None on miss/error.
    """
    if _redis_client is None:
        return None
    try:
        raw = await _redis_client.get(_key(key))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Cache GET failed for key=%s: %s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int = PATIENT_TTL) -> bool:
    """
    Store a value in the cache with a TTL.

    Args:
        key: Cache key (without prefix).
        value: JSON-serializable Python object.
        ttl: Time-to-live in seconds.

    Returns:
        True on success, False on error.
    """
    if _redis_client is None:
        return False
    try:
        serialized = json.dumps(value, default=str)
        await _redis_client.setex(_key(key), ttl, serialized)
        return True
    except Exception as exc:
        logger.warning("Cache SET failed for key=%s: %s", key, exc)
        return False


async def cache_delete(key: str) -> bool:
    """Delete a single cache key."""
    if _redis_client is None:
        return False
    try:
        await _redis_client.delete(_key(key))
        return True
    except Exception as exc:
        logger.warning("Cache DELETE failed for key=%s: %s", key, exc)
        return False


async def cache_delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching a glob pattern.

    Used to invalidate all cache entries for a patient when data changes:
        cache_delete_pattern("patient:PAT-123:*")

    Args:
        pattern: Redis glob pattern (without prefix).

    Returns:
        Number of keys deleted.
    """
    if _redis_client is None:
        return 0
    try:
        full_pattern = _key(pattern)
        keys = await _redis_client.keys(full_pattern)
        if keys:
            deleted = await _redis_client.delete(*keys)
            logger.info("Cache invalidated %d keys matching '%s'", deleted, pattern)
            return int(deleted)
        return 0
    except Exception as exc:
        logger.warning("Cache DELETE PATTERN failed for pattern=%s: %s", pattern, exc)
        return 0


async def cache_get_or_set(
    key: str,
    factory,
    ttl: int = PATIENT_TTL,
) -> Any:
    """
    Get from cache or compute and store the value.

    Args:
        key: Cache key.
        factory: Async callable that produces the value on cache miss.
        ttl: Cache TTL in seconds.

    Returns:
        Cached or freshly computed value.
    """
    cached = await cache_get(key)
    if cached is not None:
        return cached

    value = await factory() if callable(factory) else factory
    await cache_set(key, value, ttl=ttl)
    return value
