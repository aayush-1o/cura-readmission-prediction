"""
CareIQ — Data Platform Router
================================
GET /api/v1/data-platform/pipelines          — List all pipelines + last run status
GET /api/v1/data-platform/pipeline-runs      — Last 30 runs, paginated, filterable
GET /api/v1/data-platform/dq-checks          — All DQ check results
GET /api/v1/data-platform/warehouse-metrics  — Row counts, size, and freshness SLA

Reads from `pipeline_runs` and `dq_check_results` audit tables.
Falls back to empty list gracefully if tables haven't been migrated yet.

Required scope: read:analytics
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.cache import ANALYTICS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, require_scope
from warehouse.db import execute_query

router = APIRouter()

_analytics_scope = Depends(require_scope("read:analytics"))


# ─────────────────────────────────────────────────────────────────────────────
# GET /pipelines
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/pipelines",
    response_model=list[dict],
    summary="All pipelines and their latest run status",
    description=(
        "Returns each pipeline with its most recent run's status, rows processed, "
        "DQ score, and timing. Powered by the `pipeline_runs` audit table."
    ),
)
async def get_pipelines(
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = "data_platform:pipelines"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        df = execute_query(
            """
            WITH latest AS (
                SELECT DISTINCT ON (pipeline_name)
                    pipeline_name,
                    started_at,
                    ended_at,
                    status,
                    rows_in,
                    rows_out,
                    duration_seconds,
                    error_message,
                    triggered_by
                FROM pipeline_runs
                ORDER BY pipeline_name, started_at DESC
            )
            SELECT * FROM latest
            ORDER BY started_at DESC
            """,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
    except Exception:
        # Tables may not exist yet — return empty list so frontend still works
        result = []

    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /pipeline-runs
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/pipeline-runs",
    response_model=list[dict],
    summary="Last 30 pipeline runs across all pipelines",
    description=(
        "Returns the 30 most recent pipeline run records. "
        "Filter by pipeline_name to scope to a specific pipeline. "
        "Include log_output=true to return full log text."
    ),
)
async def get_pipeline_runs(
    pipeline_name: Optional[str] = Query(None, description="Filter to a specific pipeline"),
    limit: int = Query(30, ge=1, le=200, description="Number of runs to return"),
    include_logs: bool = Query(False, description="Include full log_output text"),
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = f"data_platform:runs:{pipeline_name}:{limit}:{include_logs}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        name_filter = ""
        params: dict = {"limit": limit}
        if pipeline_name:
            name_filter = "WHERE pipeline_name = :pipeline_name"
            params["pipeline_name"] = pipeline_name

        log_col = "log_output," if include_logs else ""

        df = execute_query(
            f"""
            SELECT
                run_id,
                pipeline_name,
                started_at,
                ended_at,
                status,
                rows_in,
                rows_out,
                duration_seconds,
                {log_col}
                error_message,
                triggered_by
            FROM pipeline_runs
            {name_filter}
            ORDER BY started_at DESC
            LIMIT :limit
            """,
            params,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /dq-checks
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/dq-checks",
    response_model=list[dict],
    summary="All data quality check results",
    description=(
        "Returns the latest result for every defined DQ check. "
        "Status is pass | warn | fail. Powered by `dq_check_results` table."
    ),
)
async def get_dq_checks(
    table_name: Optional[str] = Query(None, description="Filter to a specific table"),
    status: Optional[str] = Query(None, description="Filter by status: pass | warn | fail"),
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = f"data_platform:dq_checks:{table_name}:{status}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        conditions = ["1=1"]
        params: dict = {}
        if table_name:
            conditions.append("table_name = :table_name")
            params["table_name"] = table_name
        if status:
            conditions.append("status = :status")
            params["status"] = status

        where = " AND ".join(conditions)

        df = execute_query(
            f"""
            WITH latest AS (
                SELECT DISTINCT ON (check_name, table_name)
                    check_id,
                    check_name,
                    table_name,
                    checked_at,
                    status,
                    actual_value,
                    threshold_value,
                    threshold_operator,
                    details
                FROM dq_check_results
                WHERE {where}
                ORDER BY check_name, table_name, checked_at DESC
            )
            SELECT * FROM latest
            ORDER BY
                CASE status WHEN 'fail' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
                check_name
            """,
            params,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /warehouse-metrics
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/warehouse-metrics",
    response_model=dict,
    summary="Current warehouse state: row counts, size, and freshness SLA",
    description=(
        "Returns high-level warehouse health metrics: total rows in fact_admissions, "
        "total DB size, time since last pipeline run, and whether the freshness SLA "
        "is met (< 6 hours since last successful run)."
    ),
)
async def get_warehouse_metrics(
    _: TokenUser = _analytics_scope,
) -> dict:

    cache_key = "data_platform:warehouse_metrics"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        row_count_df = execute_query(
            "SELECT COUNT(*) AS total_rows FROM fact_admissions",
            read_only=True,
        )

        size_df = execute_query(
            """
            SELECT
                pg_size_pretty(pg_database_size(current_database())) AS db_size
            """,
            read_only=True,
        )

        freshness_df = execute_query(
            """
            SELECT
                MAX(ended_at) AS last_successful_run,
                EXTRACT(EPOCH FROM (NOW() - MAX(ended_at))) / 3600 AS hours_since_run
            FROM pipeline_runs
            WHERE status = 'success'
            """,
            read_only=True,
        )

        total_rows = int(row_count_df.iloc[0]["total_rows"]) if not row_count_df.empty else 0
        db_size = str(size_df.iloc[0]["db_size"]) if not size_df.empty else "unknown"
        last_run = str(freshness_df.iloc[0]["last_successful_run"]) if not freshness_df.empty else None
        hours_ago = float(freshness_df.iloc[0]["hours_since_run"] or 999) if not freshness_df.empty else 999
        sla_met = hours_ago < 6

        result = {
            "total_rows_fact_admissions": total_rows,
            "warehouse_size": db_size,
            "last_successful_run": last_run,
            "hours_since_last_run": round(hours_ago, 1),
            "freshness_sla_met": sla_met,
            "freshness_sla_threshold_hours": 6,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        result = {
            "total_rows_fact_admissions": 0,
            "warehouse_size": "unknown",
            "last_successful_run": None,
            "hours_since_last_run": None,
            "freshness_sla_met": False,
            "freshness_sla_threshold_hours": 6,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }

    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /lineage
# ─────────────────────────────────────────────────────────────────────────────

import json
import os

_LINEAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lineage_graph.json")

@router.get(
    "/lineage",
    response_model=dict,
    summary="Data lineage graph: nodes and edges from source → prediction",
    description=(
        "Returns the full lineage graph as JSON, loaded from the static "
        "`api/data/lineage_graph.json` config. Live row counts for warehouse "
        "tables are merged in from the database when available."
    ),
)
async def get_lineage(
    _: TokenUser = _analytics_scope,
) -> dict:

    cache_key = "data_platform:lineage"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Load static lineage graph
    try:
        with open(_LINEAGE_PATH, "r") as f:
            graph = json.load(f)
    except Exception:
        graph = {"nodes": [], "edges": []}

    # Optionally merge in live row counts for warehouse/fact tables
    try:
        live_counts_df = execute_query(
            """
            SELECT
                'fact_admissions' AS tbl, COUNT(*) AS cnt FROM fact_admissions
            UNION ALL
            SELECT 'dim_patient', COUNT(*) FROM dim_patient
            UNION ALL
            SELECT 'fact_predictions', COUNT(*) FROM fact_predictions
            """,
            read_only=True,
        )
        if not live_counts_df.empty:
            live_map = {
                row["tbl"]: int(row["cnt"])
                for _, row in live_counts_df.iterrows()
            }
            for node in graph["nodes"]:
                if node["id"] in live_map:
                    node["rowCount"] = live_map[node["id"]]
                    node["lastUpdated"] = "live"
    except Exception:
        pass  # Static counts from JSON are used as fallback

    graph["as_of"] = datetime.now(timezone.utc).isoformat()
    await cache_set(cache_key, graph, ttl=ANALYTICS_TTL)
    return graph


# ─────────────────────────────────────────────────────────────────────────────
# GET /schema  — Full schema: all tables + columns (static + optional live counts)
# ─────────────────────────────────────────────────────────────────────────────

_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "data", "schema_data.json")


@router.get(
    "/schema",
    response_model=dict,
    summary="All table schemas with column metadata",
    description=(
        "Returns the schema for all 12 tables in the warehouse: column names, "
        "types, nullable flags, index types, and sample values. "
        "Static JSON is loaded from schema_data.json; live row counts are merged "
        "from the database when available."
    ),
)
async def get_schema(
    _: TokenUser = _analytics_scope,
) -> dict:

    cache_key = "data_platform:schema"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        with open(_SCHEMA_PATH, "r") as f:
            schema = json.load(f)
    except Exception:
        schema = {"tables": []}

    # Merge live row counts where possible
    try:
        tables_to_count = ["fact_admissions", "dim_patient", "fact_vitals", "fact_predictions", "audit_log"]
        union_sql = " UNION ALL ".join(
            [f"SELECT '{t}' AS tbl, COUNT(*) AS cnt FROM {t}" for t in tables_to_count]
        )
        live_df = execute_query(union_sql, read_only=True)
        if not live_df.empty:
            live_map = {r["tbl"]: int(r["cnt"]) for _, r in live_df.iterrows()}
            for table in schema.get("tables", []):
                if table["name"] in live_map:
                    table["rowCount"] = live_map[table["name"]]
                    table["rowCountLive"] = True
    except Exception:
        pass

    schema["as_of"] = datetime.now(timezone.utc).isoformat()
    await cache_set(cache_key, schema, ttl=ANALYTICS_TTL)
    return schema


@router.get(
    "/schema/{table_name}",
    response_model=dict,
    summary="Single table schema with sample rows",
    description="Returns the schema for a specific table plus up to 5 sample rows fetched live from the DB.",
)
async def get_table_schema(
    table_name: str,
    _: TokenUser = _analytics_scope,
) -> dict:

    # Allowlist — never interpolate user input into SQL raw
    ALLOWED_TABLES = {
        "fact_admissions", "fact_predictions", "fact_vitals",
        "dim_patient", "dim_diagnosis", "dim_provider", "dim_date",
        "stg_admissions", "stg_patients", "care_path_rules",
        "audit_log", "schema_migrations", "patient_timeline_events",
    }
    if table_name not in ALLOWED_TABLES:
        return {"error": f"Table '{table_name}' not found", "allowed": sorted(ALLOWED_TABLES)}

    cache_key = f"data_platform:schema:{table_name}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        with open(_SCHEMA_PATH, "r") as f:
            all_schema = json.load(f)
        table_meta = next((t for t in all_schema["tables"] if t["name"] == table_name), None)
    except Exception:
        table_meta = None

    sample_rows: list[dict] = []
    try:
        df = execute_query(f"SELECT * FROM {table_name} LIMIT 5", read_only=True)
        if not df.empty:
            sample_rows = df.to_dict("records")
    except Exception:
        pass

    result = {
        "table": table_name,
        "meta": table_meta,
        "sample_rows": sample_rows,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }
    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /migrations  — All schema migrations, newest first
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/migrations",
    response_model=list[dict],
    summary="Schema migration history (newest first)",
    description=(
        "Returns all rows from schema_migrations, ordered by applied_at DESC. "
        "Each record includes the original sql_up, business_reason, and a "
        "SHA256 checksum to verify the migration SQL was not modified post-hoc."
    ),
)
async def get_migrations(
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = "data_platform:migrations"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        df = execute_query(
            """
            SELECT version, name, applied_at, author, description,
                   business_reason, sql_up, breaking_change, rollback_safe,
                   tables_affected, applied_by, checksum
            FROM schema_migrations
            ORDER BY applied_at DESC
            """,
            read_only=True,
        )
        result = df.to_dict("records") if not df.empty else []
        for row in result:
            if hasattr(row.get("applied_at"), "isoformat"):
                row["applied_at"] = row["applied_at"].isoformat()
    except Exception:
        result = []

    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /migrations/{v1}/diff/{v2}  — Schema diff between two versions
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/migrations/{v1}/diff/{v2}",
    response_model=dict,
    summary="Schema diff between two migration versions",
    description=(
        "Returns a structured diff showing tables and columns added, removed, "
        "or modified between version v1 (from) and version v2 (to). "
        "Computes the diff from tables_affected JSONB in schema_migrations."
    ),
)
async def get_migration_diff(
    v1: str,
    v2: str,
    _: TokenUser = _analytics_scope,
) -> dict:

    cache_key = f"data_platform:diff:{v1}:{v2}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        df = execute_query(
            """
            SELECT version, name, applied_at, tables_affected, breaking_change
            FROM schema_migrations
            WHERE version > :v1 AND version <= :v2
            ORDER BY version ASC
            """,
            {"v1": v1, "v2": v2},
            read_only=True,
        )
        migrations_between = df.to_dict("records") if not df.empty else []
        for row in migrations_between:
            if hasattr(row.get("applied_at"), "isoformat"):
                row["applied_at"] = row["applied_at"].isoformat()
    except Exception:
        migrations_between = []

    result = {
        "from_version": v1,
        "to_version": v2,
        "migrations_applied": migrations_between,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }
    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result
