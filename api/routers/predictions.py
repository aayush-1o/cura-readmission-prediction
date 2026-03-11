"""
CareIQ — Predictions Router
============================
GET  /api/v1/predictions/{admission_id}     — Single risk score + SHAP factors
POST /api/v1/predictions/batch              — Batch risk scoring (max 200)
GET  /api/v1/predictions/{admission_id}/history — Score history over time

Required scope: read:predictions
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from api.cache import PREDICTIONS_TTL, cache_get, cache_set
from api.dependencies import TokenUser, get_current_user, require_scope, get_recommendation_engine
from api.models import (
    BatchScoreRequest,
    BatchScoreResponse,
    RiskScoreResponse,
    RiskFeature,
)
from warehouse.db import execute_query

router = APIRouter()

_prediction_scope = Depends(require_scope("read:predictions"))

RISK_TIER_THRESHOLDS = {
    "low":      (0.00, 0.35),
    "medium":   (0.35, 0.65),
    "high":     (0.65, 0.80),
    "critical": (0.80, 1.01),
}
RISK_TIER_COLORS = {
    "low":      "var(--color-success)",
    "medium":   "var(--color-warning)",
    "high":     "var(--color-danger)",
    "critical": "var(--color-danger-bright)",
}


def _score_to_tier(score: float) -> str:
    for tier, (lo, hi) in RISK_TIER_THRESHOLDS.items():
        if lo <= score < hi:
            return tier
    return "low"


@router.get(
    "/{admission_id}",
    response_model=RiskScoreResponse,
    summary="Get readmission risk score for an admission",
    description=(
        "Returns the latest risk score for the specified admission, including "
        "SHAP-based top risk factors. Cached for 1 hour.\n\n"
        "If no model prediction exists yet, falls back to rule-based heuristic scoring."
    ),
)
async def get_risk_score(
    admission_id: str,
    _: TokenUser = _prediction_scope,
    engine=Depends(get_recommendation_engine),
) -> RiskScoreResponse:

    cache_key = f"prediction:{admission_id}"
    cached = await cache_get(cache_key)
    if cached:
        r = RiskScoreResponse(**cached)
        r = r.model_copy(update={"cache_hit": True})
        return r

    # Try DB first (scored by batch job)
    score_df = execute_query(
        """
        SELECT
            fp.admission_id,
            dp.patient_id,
            fp.readmission_risk_score,
            fp.risk_tier,
            fp.model_name,
            fp.model_version,
            fp.predicted_at,
            fp.top_features
        FROM fact_predictions fp
        JOIN dim_patient dp USING (patient_key)
        JOIN fact_admissions fa USING (admission_key)
        WHERE fa.admission_id = :admission_id
        ORDER BY fp.predicted_at DESC
        LIMIT 1
        """,
        {"admission_id": admission_id},
        read_only=True,
    )

    if not score_df.empty:
        row = score_df.iloc[0].to_dict()
        risk_score = float(row.get("readmission_risk_score") or 0.5)
        risk_tier = row.get("risk_tier") or _score_to_tier(risk_score)

        import json
        raw_features = row.get("top_features") or {}
        if isinstance(raw_features, str):
            raw_features = json.loads(raw_features)

        top_features = [
            RiskFeature(
                feature=k,
                display_label=k.replace("_", " ").title(),
                value=v,
                shap_value=None,
                direction="increases_risk" if v else "decreases_risk",
            )
            for k, v in (raw_features.items() if isinstance(raw_features, dict) else [])
        ][:8]

        result = RiskScoreResponse(
            patient_id=str(row.get("patient_id", "")),
            admission_id=admission_id,
            risk_score=risk_score,
            risk_tier=risk_tier,
            risk_tier_color=RISK_TIER_COLORS.get(risk_tier, ""),
            model_name=str(row.get("model_name", "xgboost_readmission_v1")),
            model_version=str(row.get("model_version", "1.0.0")),
            predicted_at=row.get("predicted_at"),
            top_features=top_features,
        )
        await cache_set(cache_key, result.model_dump(), ttl=PREDICTIONS_TTL)
        return result

    # Fallback: heuristic from features
    features_df = execute_query(
        """
        SELECT *
        FROM int_readmission_features
        WHERE admission_id = :admission_id
        LIMIT 1
        """,
        {"admission_id": admission_id},
        read_only=True,
    )

    if features_df.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "admission_not_found", "admission_id": admission_id},
        )

    feat = features_df.iloc[0].to_dict()
    # Simple heuristic: CCI × 0.05 + prior_readmissions × 0.12 + high_utilizer × 0.10
    heuristic_score = min(
        0.95,
        float(feat.get("charlson_comorbidity_index", 0) or 0) * 0.05
        + float(feat.get("prior_readmissions_1y", 0) or 0) * 0.12
        + float(feat.get("high_utilizer_flag", 0) or 0) * 0.10
        + float(feat.get("prior_admissions_12m", 0) or 0) * 0.04
        + float(feat.get("icu_flag", 0) or 0) * 0.08
        + 0.10,   # base rate
    )
    tier = _score_to_tier(heuristic_score)

    risk_factors = _heuristic_factors(feat)
    result = RiskScoreResponse(
        patient_id=str(feat.get("patient_id", "")),
        admission_id=admission_id,
        risk_score=round(heuristic_score, 4),
        risk_tier=tier,
        risk_tier_color=RISK_TIER_COLORS.get(tier, ""),
        model_name="heuristic_fallback",
        model_version="1.0.0",
        predicted_at=None,
        top_features=risk_factors,
    )
    await cache_set(cache_key, result.model_dump(), ttl=PREDICTIONS_TTL)
    return result


@router.post(
    "/batch",
    response_model=BatchScoreResponse,
    summary="Batch risk scoring for multiple admissions",
    description="Score up to 200 admissions in a single request. Results are non-blocking — already-scored admissions return cached results.",
)
async def batch_score(
    body: BatchScoreRequest,
    _: TokenUser = _prediction_scope,
    engine=Depends(get_recommendation_engine),
) -> BatchScoreResponse:

    results = []
    failed = 0

    for admission_id in body.admission_ids:
        try:
            score = await get_risk_score(
                admission_id=admission_id,
                _=_,  # type: ignore[arg-type]
                engine=engine,
            )
            results.append(score)
        except HTTPException:
            failed += 1
            continue

    return BatchScoreResponse(
        scored=len(results),
        failed=failed,
        results=results,
    )


@router.get(
    "/{admission_id}/history",
    response_model=list[dict],
    summary="Score history over time for an admission",
    description="Returns all risk scores recorded for this admission (tracks model drift / score changes).",
)
async def get_score_history(
    admission_id: str,
    _: TokenUser = _prediction_scope,
) -> list[dict]:

    df = execute_query(
        """
        SELECT
            fp.readmission_risk_score,
            fp.risk_tier,
            fp.model_name,
            fp.model_version,
            fp.predicted_at
        FROM fact_predictions fp
        JOIN fact_admissions fa USING (admission_key)
        WHERE fa.admission_id = :admission_id
        ORDER BY fp.predicted_at ASC
        """,
        {"admission_id": admission_id},
        read_only=True,
    )

    if df.empty:
        return []
    return df.to_dict("records")


# ─── Internal helper ─────────────────────────────────────────────────────────

def _heuristic_factors(feat: dict) -> list[RiskFeature]:
    """Simple non-SHAP risk factor list from raw features."""
    IMPORTANT = [
        ("prior_readmissions_1y",        "Prior readmissions (1yr)",    0.12),
        ("charlson_comorbidity_index",   "Charlson CCI",                0.05),
        ("high_utilizer_flag",           "High utilizer",               0.10),
        ("prior_admissions_12m",         "Prior admissions (12m)",      0.04),
        ("icu_flag",                     "ICU this admission",          0.08),
        ("comorbidity_count",            "Comorbidity count",           0.03),
        ("length_of_stay_days",          "Length of stay",              0.02),
    ]
    out = []
    for col, label, weight in IMPORTANT:
        val = feat.get(col, 0) or 0
        if val:
            out.append(RiskFeature(
                feature=col,
                display_label=label,
                value=val,
                shap_value=round(float(val) * weight, 4),
                direction="increases_risk",
            ))
    return out[:6]
