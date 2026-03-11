"""
CareIQ — Database Connection Layer
====================================
SQLAlchemy engine factory with connection pooling, retry logic,
query timing, and optional read-replica routing.

Usage:
    from warehouse.db import get_engine, session_scope, execute_query

    # Transactional writes
    with session_scope() as session:
        session.execute(text("INSERT INTO ..."), {"key": "val"})

    # Read-only queries returning DataFrames
    df = execute_query("SELECT * FROM vw_high_risk_patients_current LIMIT 100")
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Generator, Optional

import pandas as pd
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Primary (read-write) connection string
_PRIMARY_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://careiq:careiq@localhost:5432/careiq_warehouse",
)

# Optional read replica (e.g. for heavy analytical queries, Metabase)
_REPLICA_URL: Optional[str] = os.getenv("DATABASE_REPLICA_URL")

# Feature flag: route SELECT-only sessions to the read replica
USE_READ_REPLICA: bool = os.getenv("USE_READ_REPLICA", "false").lower() == "true"

# Connection pool settings
POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))
POOL_MAX_OVERFLOW: int = int(os.getenv("DB_POOL_MAX_OVERFLOW", "20"))
POOL_TIMEOUT_SECONDS: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE_SECONDS: int = int(os.getenv("DB_POOL_RECYCLE", "1800"))  # 30 min

# Retry settings for transient connection failures
MAX_RETRY_ATTEMPTS: int = int(os.getenv("DB_MAX_RETRIES", "3"))
RETRY_DELAY_SECONDS: float = float(os.getenv("DB_RETRY_DELAY", "2.0"))

# ─────────────────────────────────────────────────────────────────────────────
# Engine factory
# ─────────────────────────────────────────────────────────────────────────────

_engine_primary: Optional[Engine] = None
_engine_replica: Optional[Engine] = None


def _create_engine_with_pool(
    connection_url: str,
    pool_size: int = POOL_SIZE,
    max_overflow: int = POOL_MAX_OVERFLOW,
) -> Engine:
    """
    Create a SQLAlchemy engine with a configured QueuePool.

    Args:
        connection_url: Database connection URL.
        pool_size: Number of persistent connections to maintain.
        max_overflow: Additional connections beyond pool_size allowed temporarily.

    Returns:
        Configured SQLAlchemy Engine.
    """
    engine = create_engine(
        connection_url,
        poolclass=QueuePool,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=POOL_TIMEOUT_SECONDS,
        pool_recycle=POOL_RECYCLE_SECONDS,
        pool_pre_ping=True,         # Check connection health before each use
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
        connect_args={
            "connect_timeout": 10,
            "application_name": "careiq_api",
            "options": "-c statement_timeout=60000",  # 60s query timeout
        },
    )
    _register_query_timing_listener(engine)
    logger.info("Database engine created: %s (pool_size=%d)", connection_url.split("@")[-1], pool_size)
    return engine


def _register_query_timing_listener(engine: Engine) -> None:
    """
    Register SQLAlchemy event listeners to log slow queries.

    Queries exceeding SLOW_QUERY_THRESHOLD_MS are logged as warnings.
    """
    slow_threshold_ms: int = int(os.getenv("DB_SLOW_QUERY_MS", "1000"))

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(
        conn: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool
    ) -> None:
        conn.info.setdefault("query_start_time", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(
        conn: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool
    ) -> None:
        total_ms = (time.perf_counter() - conn.info["query_start_time"].pop()) * 1000
        if total_ms >= slow_threshold_ms:
            logger.warning(
                "SLOW QUERY (%.0fms): %s",
                total_ms,
                statement[:200].replace("\n", " "),
            )
        else:
            logger.debug("Query completed in %.1fms", total_ms)


def get_engine(read_only: bool = False) -> Engine:
    """
    Return the appropriate SQLAlchemy engine (primary or replica).

    Engines are lazily initialized and cached as module-level singletons.

    Args:
        read_only: If True and a replica URL is configured, return the
                   read replica engine.

    Returns:
        Configured SQLAlchemy Engine.
    """
    global _engine_primary, _engine_replica

    if read_only and USE_READ_REPLICA and _REPLICA_URL:
        if _engine_replica is None:
            _engine_replica = _create_engine_with_pool(_REPLICA_URL, pool_size=5, max_overflow=10)
        return _engine_replica

    if _engine_primary is None:
        _engine_primary = _create_engine_with_pool(_PRIMARY_URL)
    return _engine_primary


def dispose_engines() -> None:
    """
    Close all pooled connections. Call on application shutdown.
    """
    global _engine_primary, _engine_replica
    if _engine_primary:
        _engine_primary.dispose()
        logger.info("Primary database engine disposed.")
    if _engine_replica:
        _engine_replica.dispose()
        logger.info("Replica database engine disposed.")


# ─────────────────────────────────────────────────────────────────────────────
# Session factory
# ─────────────────────────────────────────────────────────────────────────────

def _make_session_factory(read_only: bool = False) -> sessionmaker:
    """Return a sessionmaker bound to the appropriate engine."""
    return sessionmaker(
        bind=get_engine(read_only=read_only),
        autocommit=False,
        autoflush=True,
        expire_on_commit=False,
    )


@contextmanager
def session_scope(read_only: bool = False) -> Generator[Session, None, None]:
    """
    Provide a transactional database session with automatic commit/rollback.

    Example:
        with session_scope() as session:
            session.execute(text("UPDATE ..."), {"id": 1})

    Args:
        read_only: If True, routes to the read replica if configured.

    Yields:
        SQLAlchemy Session.

    Raises:
        Exception: Re-raises any exception after rolling back the transaction.
    """
    SessionLocal = _make_session_factory(read_only=read_only)
    session = SessionLocal()
    try:
        yield session
        if not read_only:
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ─────────────────────────────────────────────────────────────────────────────
# Query helpers
# ─────────────────────────────────────────────────────────────────────────────


def execute_query(
    sql: str,
    parameters: Optional[dict[str, Any]] = None,
    read_only: bool = True,
) -> pd.DataFrame:
    """
    Execute a parameterized SQL query and return results as a DataFrame.

    Always uses parameterized queries to prevent SQL injection.

    Args:
        sql: SQL query string. Use :param_name placeholders.
        parameters: Dict of query parameters (e.g. {"limit": 100}).
        read_only: Routes to replica if available (default True for safety).

    Returns:
        pandas DataFrame with query results.

    Example:
        df = execute_query(
            "SELECT * FROM vw_admission_full WHERE admit_year = :year",
            {"year": 2024},
        )
    """
    engine = get_engine(read_only=read_only)
    start_time = time.perf_counter()
    try:
        with engine.connect() as conn:
            result = pd.read_sql(
                text(sql),
                con=conn,
                params=parameters or {},
            )
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        logger.info("execute_query returned %d rows in %.0fms", len(result), elapsed_ms)
        return result
    except Exception as exc:
        logger.error("Query failed: %s | SQL: %s", exc, sql[:300])
        raise


def execute_with_retry(
    sql: str,
    parameters: Optional[dict[str, Any]] = None,
    max_attempts: int = MAX_RETRY_ATTEMPTS,
    delay_seconds: float = RETRY_DELAY_SECONDS,
) -> None:
    """
    Execute a non-returning SQL statement (INSERT, UPDATE, DELETE) with retry.

    Retries on transient OperationalError (e.g. connection reset, timeout).

    Args:
        sql: Parameterized SQL statement.
        parameters: Dict of bind parameters.
        max_attempts: Maximum retry attempts.
        delay_seconds: Seconds to wait between retries (exponential backoff applied).

    Raises:
        OperationalError: After all retry attempts are exhausted.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            with session_scope() as session:
                session.execute(text(sql), parameters or {})
            return
        except OperationalError as exc:
            if attempt == max_attempts:
                logger.error(
                    "Query failed after %d attempts: %s", max_attempts, exc
                )
                raise
            wait = delay_seconds * (2 ** (attempt - 1))  # Exponential backoff
            logger.warning(
                "OperationalError on attempt %d/%d. Retrying in %.1fs: %s",
                attempt, max_attempts, wait, exc,
            )
            time.sleep(wait)


def bulk_insert_dataframe(
    df: pd.DataFrame,
    table_name: str,
    schema: str = "public",
    if_exists: str = "append",
    chunksize: int = 5000,
) -> int:
    """
    Efficiently bulk-insert a DataFrame into a PostgreSQL table.

    Uses pandas to_sql with SQLAlchemy COPY-style insertion.

    Args:
        df: DataFrame to insert.
        table_name: Target table name.
        schema: Target schema (default 'public').
        if_exists: Action if table exists: 'append', 'replace', 'fail'.
        chunksize: Rows per batch (default 5,000).

    Returns:
        Number of rows inserted.

    Raises:
        ValueError: If the table does not exist and if_exists='fail'.
    """
    if df.empty:
        logger.warning("bulk_insert_dataframe: empty DataFrame, nothing to insert.")
        return 0

    engine = get_engine(read_only=False)
    start_time = time.perf_counter()

    try:
        df.to_sql(
            name=table_name,
            schema=schema,
            con=engine,
            if_exists=if_exists,
            index=False,
            chunksize=chunksize,
            method="multi",
        )
    except Exception as exc:
        logger.error("bulk_insert_dataframe failed on %s.%s: %s", schema, table_name, exc)
        raise

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        "bulk_insert_dataframe: %d rows → %s.%s in %.0fms (%.0f rows/sec)",
        len(df), schema, table_name, elapsed_ms, len(df) / (elapsed_ms / 1000) if elapsed_ms else 0,
    )
    return len(df)


def check_connection() -> bool:
    """
    Verify the database connection is healthy.

    Returns:
        True if connection succeeds, False otherwise.
    """
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("Database connection check failed: %s", exc)
        return False
