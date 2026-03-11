"""
CareIQ — Analytics Router
==========================
GET  /api/v1/analytics/dashboard          — Top-level KPI summary tiles
GET  /api/v1/analytics/readmission-trends — Readmission rate by dept × month
GET  /api/v1/analytics/department-breakdown — Per-department performance vs benchmark
GET  /api/v1/analytics/risk-distribution  — Risk score distribution (model monitoring)
GET  /api/v1/analytics/los-by-diagnosis   — LOS breakdown by dx_category × insurance
GET  /api/v1/analytics/high-risk-today    — Current high-risk admissions hot list

Required scope: read:analytics
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.cache import ANALYTICS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, require_scope
from api.models import (
    DashboardSummary,
    DepartmentPerformanceRow,
    PaginatedResponse,
    ReadmissionTrendPoint,
)
from warehouse.db import execute_query

router = APIRouter()

_analytics_scope = Depends(require_scope("read:analytics"))


@router.get(
    "/dashboard",
    response_model=DashboardSummary,
    summary="Main dashboard KPI summary tiles",
    description="Returns top-level KPIs: total patients, 30-day admissions, readmission rate, avg LOS, high-risk count.",
)
async def get_dashboard_summary(
    _: TokenUser = _analytics_scope,
) -> DashboardSummary:

    cache_key = "analytics:dashboard:summary"
    cached = await cache_get(cache_key)
    if cached:
        return DashboardSummary(**cached)

    # BUG-007 FIX: wrap sync execute_query in run_in_executor to avoid blocking the
    # async event loop. Full fix = migrate to asyncpg + SQLAlchemy async (see runbook.md).
    import asyncio
    from functools import partial
    loop = asyncio.get_event_loop()

    df = await loop.run_in_executor(None, partial(
        execute_query,
        """
        SELECT
            COUNT(DISTINCT patient_id)                          AS total_patients,
            COUNT(*)                                            AS total_admissions_30d,
            SUM(readmit_30day_flag::INT)                        AS total_readmissions_30d,
            ROUND(AVG(readmit_30day_flag::INT)::NUMERIC * 100, 2) AS avg_readmission_rate_pct,
            ROUND(AVG(length_of_stay_days)::NUMERIC, 2)        AS avg_los_days,
            ROUND(AVG(total_charges)::NUMERIC, 2)              AS avg_cost_usd,
            SUM(total_charges)                                 AS total_cost_30d
        FROM stg_admissions
        WHERE admission_date >= CURRENT_DATE - INTERVAL '30 days'
        """,
        None,
        True,
    ))

    high_risk_df = await loop.run_in_executor(None, partial(
        execute_query,
        "SELECT COUNT(*) AS high_risk_today FROM mv_high_risk_patients_today",
        None,
        True,
    ))

    dept_count_df = await loop.run_in_executor(None, partial(
        execute_query,
        "SELECT COUNT(DISTINCT department) AS dept_count FROM stg_admissions",
        None,
        True,
    ))

    avg_risk_df = await loop.run_in_executor(None, partial(
        execute_query,
        """
        SELECT ROUND(AVG(readmission_risk_score)::NUMERIC, 4) AS avg_risk_score
        FROM fact_predictions
        WHERE predicted_at >= NOW() - INTERVAL '24 hours'
        """,
        None,
        True,
    ))

    row = df.iloc[0].to_dict() if not df.empty else {}
    result = DashboardSummary(
        total_patients=int(row.get("total_patients") or 0),
        total_admissions_30d=int(row.get("total_admissions_30d") or 0),
        total_readmissions_30d=int(row.get("total_readmissions_30d") or 0),  # BUG-012 FIX
        avg_readmission_rate_pct=float(row.get("avg_readmission_rate_pct") or 0),
        avg_los_days=float(row.get("avg_los_days") or 0),
        high_risk_patients_today=int(high_risk_df.iloc[0]["high_risk_today"]) if not high_risk_df.empty else 0,
        avg_risk_score=float(avg_risk_df.iloc[0]["avg_risk_score"] or 0) if not avg_risk_df.empty else 0,
        total_cost_30d=float(row.get("total_cost_30d") or 0),
        department_count=int(dept_count_df.iloc[0]["dept_count"]) if not dept_count_df.empty else 0,
        as_of=datetime.utcnow().isoformat() + "Z",
    )
    await cache_set(cache_key, result.model_dump(), ttl=ANALYTICS_TTL)
    return result


@router.get(
    "/readmission-trends",
    response_model=list[ReadmissionTrendPoint],
    summary="Readmission trends by department × month",
    description=(
        "Returns monthly readmission rates grouped by department and diagnosis category. "
        "Powered by `mv_readmission_rate_by_dept_month` materialized view."
    ),
)
async def get_readmission_trends(
    department: Optional[str] = Query(None),
    months_back: int = Query(12, ge=1, le=36, description="Number of months of history"),
    _: TokenUser = _analytics_scope,
) -> list[ReadmissionTrendPoint]:

    cache_key = f"analytics:trends:{department}:{months_back}"
    cached = await cache_get(cache_key)
    if cached:
        return [ReadmissionTrendPoint(**r) for r in cached]

    params: dict = {"months_back": months_back}
    dept_filter = ""
    if department:
        dept_filter = "AND department_name = :department"
        params["department"] = department

    df = execute_query(
        f"""
        SELECT
            TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start,
            department_name,
            diagnosis_category,
            total_admissions,
            total_readmissions,
            readmission_rate_pct,
            avg_los_days,
            avg_cost_usd
        FROM mv_readmission_rate_by_dept_month
        WHERE period_start >= DATE_TRUNC('month', NOW() - (:months_back || ' months')::INTERVAL)
        {dept_filter}
        ORDER BY period_start DESC, total_admissions DESC
        """,
        params,
        read_only=True,
    )

    result = [ReadmissionTrendPoint(**row) for row in df.to_dict("records")]
    await cache_set(cache_key, [r.model_dump() for r in result], ttl=ANALYTICS_TTL)
    return result


@router.get(
    "/department-breakdown",
    response_model=list[DepartmentPerformanceRow],
    summary="Department performance vs benchmark",
    description=(
        "Returns per-department readmission rate vs CMS benchmark, month-over-month delta, "
        "rolling 3-month average, and CMS star rating (1-5). "
        "Powered by `mart_department_performance` dbt mart."
    ),
)
async def get_department_breakdown(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    _: TokenUser = _analytics_scope,
) -> list[DepartmentPerformanceRow]:

    cache_key = f"analytics:dept_breakdown:{year}:{month}"
    cached = await cache_get(cache_key)
    if cached:
        return [DepartmentPerformanceRow(**r) for r in cached]

    conditions = ["1=1"]
    params: dict = {}
    if year:
        conditions.append("year = :year")
        params["year"] = year
    if month:
        conditions.append("month = :month")
        params["month"] = month
    if not year and not month:
        # Default: current month
        conditions.append("period_start = DATE_TRUNC('month', NOW())")

    where = " AND ".join(conditions)
    df = execute_query(
        f"""
        SELECT
            department_name,
            year, month,
            TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start,
            total_admissions,
            readmission_rate,
            benchmark_readmission_rate,
            vs_benchmark_delta,
            rolling_3m_avg,
            mom_readmission_delta,
            avg_los_days,
            avg_cost_usd,
            cms_star_rating,
            performance_label
        FROM mart_department_performance
        WHERE {where}
        ORDER BY vs_benchmark_delta DESC
        """,
        params,
        read_only=True,
    )

    result = [DepartmentPerformanceRow(**row) for row in df.to_dict("records")]
    await cache_set(cache_key, [r.model_dump() for r in result], ttl=ANALYTICS_TTL)
    return result


@router.get(
    "/risk-distribution",
    response_model=list[dict],
    summary="Risk score distribution (model drift monitoring)",
    description=(
        "Returns daily distribution of ML risk scores per risk tier. "
        "Powered by `mv_risk_score_distribution`. "
        "Use to detect model drift — sudden distribution shift indicates retraining needed."
    ),
)
async def get_risk_distribution(
    days_back: int = Query(30, ge=1, le=90),
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = f"analytics:risk_dist:{days_back}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    df = execute_query(
        """
        SELECT
            TO_CHAR(score_date, 'YYYY-MM-DD') AS score_date,
            risk_tier,
            model_name,
            patient_count,
            avg_risk_score,
            p25_risk_score,
            p75_risk_score
        FROM mv_risk_score_distribution
        WHERE score_date >= CURRENT_DATE - :days_back
        ORDER BY score_date DESC, risk_tier
        """,
        {"days_back": days_back},
        read_only=True,
    )

    result = df.to_dict("records") if not df.empty else []
    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


@router.get(
    "/los-by-diagnosis",
    response_model=list[dict],
    summary="Length of stay by diagnosis category × insurance type",
    description="Powered by `mv_los_by_diagnosis_insurance`. Breaks down LOS and cost by diagnosis and payer mix.",
)
async def get_los_by_diagnosis(
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = "analytics:los_by_diagnosis"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    df = execute_query(
        """
        SELECT
            diagnosis_category,
            insurance_category,
            quarter,
            year,
            admission_count,
            avg_los_days,
            p50_los,
            p90_los,
            avg_total_cost,
            readmission_rate
        FROM mv_los_by_diagnosis_insurance
        ORDER BY year DESC, quarter DESC, avg_los_days DESC
        LIMIT 200
        """,
        read_only=True,
    )

    result = df.to_dict("records") if not df.empty else []
    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result


@router.get(
    "/high-risk-today",
    response_model=list[dict],
    summary="Currently admitted high-risk patients (hot list)",
    description=(
        "Returns currently admitted patients with risk score ≥ 0.65. "
        "Powered by `mv_high_risk_patients_today`. "
        "Refreshed every 4 hours by the OLAP refresh stored procedure."
    ),
)
async def get_high_risk_today(
    department: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    _: TokenUser = _analytics_scope,
) -> list[dict]:

    cache_key = f"analytics:high_risk_today:{department}:{limit}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    dept_filter = ""
    params: dict = {"limit": limit}
    if department:
        dept_filter = "WHERE department_code = :department"
        params["department"] = department

    df = execute_query(
        f"""
        SELECT *
        FROM mv_high_risk_patients_today
        {dept_filter}
        ORDER BY readmission_risk_score DESC
        LIMIT :limit
        """,
        params,
        read_only=True,
    )

    result = df.to_dict("records") if not df.empty else []
    await cache_set(cache_key, result, ttl=ANALYTICS_TTL)
    return result
