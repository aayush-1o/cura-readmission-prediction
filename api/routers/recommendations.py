"""
CareIQ — Recommendations Router
=================================
POST /api/v1/recommendations/care-plan/{patient_id}/{admission_id}
     → Full care plan: risk_score, risk_factors, ranked recommendations,
       cohort context, similar patient outcomes

GET  /api/v1/recommendations/rules
     → Paginated association rules (filterable by type, sortable by lift)

GET  /api/v1/recommendations/clusters/profiles
     → All cluster profiles (for scatter viz + cohort summary panel)

GET  /api/v1/recommendations/patients/{patient_id}/similar
     → Similar non-readmitted patients (nearest neighbors)

Required scopes:
  read:care-plans  — care plan + similar patients
  read:clusters    — cluster profiles
  read:rules       — association rules
"""

from __future__ import annotations

import math
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.cache import CARE_PLAN_TTL, CLUSTER_TTL, cache_get, cache_set
from api.dependencies import (
    TokenUser,
    get_recommendation_engine,
    require_scope,
)
from api.models import (
    AssociationRuleResponse,
    CarePlanResponse,
    ClusterProfileResponse,
    PaginatedResponse,
    SimilarPatient,
)
from warehouse.db import execute_query

router = APIRouter()


@router.post(
    "/care-plan/{patient_id}/{admission_id}",
    response_model=CarePlanResponse,
    summary="Generate complete care plan for a patient admission",
    description=(
        "Synthesizes SHAP risk factors, association rules, and evidence library into "
        "a ranked list of care-path recommendations across 6 categories.\n\n"
        "Cached per patient+admission for 4 hours. Invalidated when new model "
        "predictions are written for the same admission.\n\n"
        "**Performance**: P95 < 200ms (warm cache: <20ms)."
    ),
)
async def generate_care_plan(
    patient_id: str,
    admission_id: str,
    _: TokenUser = Depends(require_scope("read:care-plans")),
    engine=Depends(get_recommendation_engine),
) -> CarePlanResponse:

    cache_key = f"care_plan:{patient_id}:{admission_id}"
    cached = await cache_get(cache_key)
    if cached:
        return CarePlanResponse(**{**cached, "cache_hit": True})

    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "ml_engine_unavailable",
                "message": "Recommendation engine is not loaded. Run ml/train.py first.",
            },
        )

    care_plan = engine.generate_care_plan(
        patient_id=patient_id,
        admission_id=admission_id,
    )

    await cache_set(cache_key, care_plan, ttl=CARE_PLAN_TTL)
    return CarePlanResponse(**care_plan)


@router.get(
    "/rules",
    response_model=PaginatedResponse,
    summary="List mined association rules",
    description="Returns association rules from the care_path_rules table. Filter by rule type, sort by lift.",
)
async def list_rules(
    rule_type: Optional[Literal["diagnosis_association", "intervention_effectiveness"]] = Query(None),
    min_lift: float = Query(1.0, ge=1.0),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: TokenUser = Depends(require_scope("read:rules")),
) -> PaginatedResponse:

    cache_key = f"rules:list:{rule_type}:{min_lift}:{page}:{page_size}"
    cached = await cache_get(cache_key)
    if cached:
        return PaginatedResponse(**cached)

    conditions = ["is_active = TRUE", "lift >= :min_lift"]
    params: dict = {"min_lift": min_lift}
    if rule_type:
        conditions.append("rule_type = :rule_type")
        params["rule_type"] = rule_type

    where = " AND ".join(conditions)

    count_df = execute_query(
        f"SELECT COUNT(*) AS total FROM care_path_rules WHERE {where}", params, read_only=True
    )
    total = int(count_df["total"].iloc[0]) if not count_df.empty else 0

    offset = (page - 1) * page_size
    df = execute_query(
        f"""
        SELECT rule_id, antecedent_items, consequent_item, support,
               confidence, lift, evidence_count, rule_type
        FROM care_path_rules
        WHERE {where}
        ORDER BY lift DESC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": page_size, "offset": offset},
        read_only=True,
    )

    rules = []
    for row in df.to_dict("records"):
        import json
        antecedents = row.get("antecedent_items") or []
        if isinstance(antecedents, str):
            antecedents = json.loads(antecedents)
        rules.append(AssociationRuleResponse(
            rule_id=row.get("rule_id"),
            antecedents=antecedents,
            consequent=row["consequent_item"],
            support=row["support"],
            confidence=row["confidence"],
            lift=row["lift"],
            evidence_count=row["evidence_count"],
            rule_type=row["rule_type"],
        ).model_dump())

    result = PaginatedResponse(
        total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if page_size else 1,
        data=rules,
    )
    await cache_set(cache_key, result.model_dump(), ttl=CLUSTER_TTL)
    return result


@router.get(
    "/clusters/profiles",
    response_model=list[ClusterProfileResponse],
    summary="Get all patient cluster profiles",
    description=(
        "Returns profiles for all KMeans patient clusters: name, size, avg CCI, "
        "readmission rate, UMAP color, and dominant features. Powers the cohort overview panel."
    ),
)
async def get_cluster_profiles(
    _: TokenUser = Depends(require_scope("read:clusters")),
    engine=Depends(get_recommendation_engine),
) -> list[ClusterProfileResponse]:

    cache_key = "clusters:profiles"
    cached = await cache_get(cache_key)
    if cached:
        return [ClusterProfileResponse(**p) for p in cached]

    # Aggregate cluster stats from patient_clusters + feature tables
    df = execute_query(
        """
        SELECT
            pc.cluster_id,
            pc.cluster_name,
            pc.cluster_label,
            COUNT(*) AS size,
            ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER (), 4) AS size_pct,
            ROUND(AVG(p.age)::NUMERIC, 1) AS avg_age,
            ROUND(AVG(p.comorbidity_count)::NUMERIC, 2) AS avg_comorbidity_count,
            ROUND(AVG(cci.charlson_comorbidity_index)::NUMERIC, 2) AS avg_cci,
            ROUND(AVG(a.readmit_30day_flag::INT)::NUMERIC, 4) AS readmission_rate,
            ROUND(AVG(a.length_of_stay_days)::NUMERIC, 2) AS avg_los_days,
            0.0 AS avg_risk_score,
            '' AS dominant_insurance,
            '' AS dominant_age_group,
            0.0 AS high_utilizer_pct,
            '' AS color_token
        FROM patient_clusters pc
        LEFT JOIN stg_patients p ON p.patient_id = pc.patient_id
        LEFT JOIN int_comorbidity_scores cci ON cci.patient_id = pc.patient_id
        LEFT JOIN mart_patient_risk_cohorts prc ON prc.patient_id = pc.patient_id
        LEFT JOIN stg_admissions a ON a.admission_id = prc.latest_admission_id
        GROUP BY pc.cluster_id, pc.cluster_name, pc.cluster_label
        ORDER BY pc.cluster_id
        """,
        read_only=True,
    )

    # Fallback: if no clusters in DB yet, return profiles from in-memory engine
    if df.empty and engine is not None and hasattr(engine, "_cluster_analyzer"):
        ca = engine._cluster_analyzer
        if ca and ca._profiles:
            profiles = ca.get_cluster_profiles_as_dict()
            await cache_set(cache_key, profiles, ttl=CLUSTER_TTL)
            return [ClusterProfileResponse(**p) for p in profiles]
        return []

    CHART_COLORS = [
        "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
        "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
    ]

    profiles = []
    for i, row in enumerate(df.to_dict("records")):
        row["color_token"] = CHART_COLORS[i % len(CHART_COLORS)]
        row["top_comorbidities"] = []
        row["recommended_interventions"] = []
        profiles.append(ClusterProfileResponse(**row))

    await cache_set(cache_key, [p.model_dump() for p in profiles], ttl=CLUSTER_TTL)
    return profiles


@router.get(
    "/patients/{patient_id}/similar",
    response_model=list[SimilarPatient],
    summary="Find similar patients who avoided readmission",
    description=(
        "Returns the n nearest patients in UMAP embedding space who were NOT readmitted. "
        "Used in UI as: 'Similar patients who avoided readmission received...' context card."
    ),
)
async def get_similar_patients(
    patient_id: str,
    n: int = Query(5, ge=1, le=20),
    _: TokenUser = Depends(require_scope("read:clusters")),
    engine=Depends(get_recommendation_engine),
) -> list[SimilarPatient]:

    if engine is None:
        return []

    try:
        ca = engine._cluster_analyzer
        if ca is None:
            return []
        similar = ca.get_similar_patients(patient_id=patient_id, n=n, only_non_readmitted=True)
        return [SimilarPatient(**s) for s in similar]
    except Exception:
        return []
