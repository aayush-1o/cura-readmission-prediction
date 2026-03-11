"""
CareIQ — Patients Router
=========================
GET  /api/v1/patients                       — Paginated patient list with filters
GET  /api/v1/patients/{patient_id}          — Full patient detail + admission history
GET  /api/v1/patients/{patient_id}/admissions — Admission history for a patient
GET  /api/v1/patients/search               — Full-text search (patient_id prefix)

Required scope: read:patients
"""

from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.cache import PATIENT_TTL, cache_get, cache_set
from api.dependencies import TokenUser, get_current_user, require_scope
from api.models import (
    AdmissionSummary,
    PaginatedResponse,
    PatientDetail,
    PatientSearchRequest,
    PatientSummary,
)
from warehouse.db import execute_query

router = APIRouter()

# ─── Scope guard (declared once, reused) ─────────────────────────────────────
_patient_scope = Depends(require_scope("read:patients"))


@router.get(
    "",
    response_model=PaginatedResponse,
    summary="List patients with filters",
    description=(
        "Returns a paginated list of patients. Supports filtering by department, "
        "risk cohort, insurance, age group, and high-utilizer flag."
    ),
)
async def list_patients(
    department: Optional[str] = Query(None, description="Filter by department code"),
    risk_cohort: Optional[str] = Query(None, description="T1_CatastrophicRisk | T2_HighRisk | T3_ModerateRisk | T4_LowRisk"),
    insurance_category: Optional[str] = Query(None),
    age_group: Optional[str] = Query(None, description="18-30 | 31-45 | 46-60 | 61-75 | 76+"),
    high_utilizer_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: TokenUser = _patient_scope,
) -> PaginatedResponse:

    cache_key = f"patients:list:{department}:{risk_cohort}:{insurance_category}:{age_group}:{high_utilizer_only}:{page}:{page_size}"
    cached = await cache_get(cache_key)
    if cached:
        return PaginatedResponse(**cached)

    # Build dynamic SQL
    conditions = ["1=1"]
    params: dict = {}

    if department:
        conditions.append("p.department = :department")
        params["department"] = department

    if risk_cohort:
        conditions.append("prc.risk_cohort = :risk_cohort")
        params["risk_cohort"] = risk_cohort

    if insurance_category:
        conditions.append("p.insurance_category = :insurance_category")
        params["insurance_category"] = insurance_category

    if age_group:
        conditions.append("p.age_group = :age_group")
        params["age_group"] = age_group

    if high_utilizer_only:
        conditions.append("ph.high_utilizer_flag = TRUE")

    where_clause = " AND ".join(conditions)

    # Count total
    count_sql = f"""
        SELECT COUNT(DISTINCT p.patient_id) AS total
        FROM stg_patients p
        LEFT JOIN mart_patient_risk_cohorts prc ON prc.patient_id = p.patient_id
        LEFT JOIN int_patient_history ph ON ph.admission_id = prc.latest_admission_id
        WHERE {where_clause}
    """
    count_df = execute_query(count_sql, params, read_only=True)
    total = int(count_df["total"].iloc[0]) if not count_df.empty else 0

    # Paginated query
    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT
            p.patient_id,
            p.age,
            p.age_group,
            p.gender,
            p.race_ethnicity,
            p.insurance_category,
            p.comorbidity_count,
            cci.charlson_comorbidity_index,
            prc.risk_cohort,
            pc.cluster_name
        FROM stg_patients p
        LEFT JOIN int_comorbidity_scores cci ON cci.patient_id = p.patient_id
        LEFT JOIN mart_patient_risk_cohorts prc ON prc.patient_id = p.patient_id
        LEFT JOIN int_patient_history ph ON ph.admission_id = prc.latest_admission_id
        LEFT JOIN patient_clusters pc ON pc.patient_id = p.patient_id
        WHERE {where_clause}
        ORDER BY prc.risk_cohort_rank ASC NULLS LAST, p.patient_id
        LIMIT :limit OFFSET :offset
    """
    params.update({"limit": page_size, "offset": offset})
    df = execute_query(data_sql, params, read_only=True)

    patients = [PatientSummary(**row) for row in df.to_dict("records")]
    pages = math.ceil(total / page_size) if page_size else 1

    result = PaginatedResponse(
        total=total, page=page, page_size=page_size, pages=pages,
        data=[p.model_dump() for p in patients],
    )
    await cache_set(cache_key, result.model_dump(), ttl=PATIENT_TTL)
    return result


@router.get(
    "/{patient_id}",
    response_model=PatientDetail,
    summary="Get full patient detail with admission history",
)
async def get_patient(
    patient_id: str,
    _: TokenUser = _patient_scope,
) -> PatientDetail:

    cache_key = f"patient:{patient_id}:detail"
    cached = await cache_get(cache_key)
    if cached:
        return PatientDetail(**cached)

    # Patient demographics + CCI + risk cohort
    patient_df = execute_query(
        """
        SELECT
            p.patient_id, p.age, p.age_group, p.gender, p.race_ethnicity,
            p.insurance_category, p.comorbidity_count,
            cci.charlson_comorbidity_index,
            prc.risk_cohort,
            pc.cluster_name,
            ph.prior_admissions_12m, ph.prior_readmissions_1y,
            ph.high_utilizer_flag, ph.days_since_last_discharge,
            prc.latest_admission_date AS last_admission_date
        FROM stg_patients p
        LEFT JOIN int_comorbidity_scores cci  ON cci.patient_id = p.patient_id
        LEFT JOIN mart_patient_risk_cohorts prc ON prc.patient_id = p.patient_id
        LEFT JOIN int_patient_history ph ON ph.admission_id = prc.latest_admission_id
        LEFT JOIN patient_clusters pc ON pc.patient_id = p.patient_id
        WHERE p.patient_id = :patient_id
        LIMIT 1
        """,
        {"patient_id": patient_id},
        read_only=True,
    )

    if patient_df.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "patient_not_found", "patient_id": patient_id},
        )

    # Admission history
    admissions_df = execute_query(
        """
        SELECT
            admission_id, patient_id, admission_date, discharge_date,
            department, admission_type, length_of_stay_days,
            icu_flag, emergency_flag, readmit_30day_flag, total_charges,
            insurance_category, primary_diagnosis_category
        FROM stg_admissions
        WHERE patient_id = :patient_id
        ORDER BY admission_date DESC
        LIMIT 20
        """,
        {"patient_id": patient_id},
        read_only=True,
    )

    patient_row = patient_df.iloc[0].to_dict()
    admissions = [AdmissionSummary(**row) for row in admissions_df.to_dict("records")]

    result = PatientDetail(
        **patient_row,
        admissions=admissions,
    )
    await cache_set(cache_key, result.model_dump(), ttl=PATIENT_TTL)
    return result


@router.get(
    "/{patient_id}/admissions",
    response_model=list[AdmissionSummary],
    summary="Get admission history for a patient",
)
async def get_patient_admissions(
    patient_id: str,
    limit: int = Query(10, ge=1, le=50),
    _: TokenUser = _patient_scope,
) -> list[AdmissionSummary]:

    df = execute_query(
        """
        SELECT
            admission_id, patient_id, admission_date, discharge_date,
            department, admission_type, length_of_stay_days,
            icu_flag, emergency_flag, readmit_30day_flag, total_charges,
            insurance_category, primary_diagnosis_category
        FROM stg_admissions
        WHERE patient_id = :patient_id
        ORDER BY admission_date DESC
        LIMIT :limit
        """,
        {"patient_id": patient_id, "limit": limit},
        read_only=True,
    )

    if df.empty:
        raise HTTPException(status_code=404, detail="Patient not found or no admissions.")

    return [AdmissionSummary(**row) for row in df.to_dict("records")]
