"""
CareIQ — Pydantic V2 Shared Request/Response Models
=====================================================
All API request and response shapes live here, shared across routers.
Using Pydantic V2 model_config for strict mode and JSON schema generation.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────────────────────────────────────────
# Base
# ─────────────────────────────────────────────────────────────────────────────

class CareIQBaseModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class PaginatedResponse(CareIQBaseModel):
    total: int = Field(description="Total number of records matching the query")
    page: int = Field(description="Current page number (1-indexed)")
    page_size: int = Field(description="Number of records per page")
    pages: int = Field(description="Total number of pages")
    data: list[Any]


class APIError(CareIQBaseModel):
    error: str
    message: str
    request_id: Optional[str] = None
    details: Optional[Any] = None


# ─────────────────────────────────────────────────────────────────────────────
# Authentication
# ─────────────────────────────────────────────────────────────────────────────

class LoginRequest(CareIQBaseModel):
    email: str = Field(example="clinician@careiq.io")
    password: str = Field(example="CareIQ-Demo-2024!", min_length=8)


class TokenResponse(CareIQBaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds")
    user: "UserProfile"


class RefreshRequest(CareIQBaseModel):
    refresh_token: str


class UserProfile(CareIQBaseModel):
    user_id: str
    email: str
    name: str
    role: str
    department: str
    scopes: list[str]


# ─────────────────────────────────────────────────────────────────────────────
# Patients
# ─────────────────────────────────────────────────────────────────────────────

class PatientSummary(CareIQBaseModel):
    patient_id: str
    age: Optional[int] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    race_ethnicity: Optional[str] = None
    insurance_category: Optional[str] = None
    comorbidity_count: Optional[int] = None
    charlson_comorbidity_index: Optional[float] = None
    risk_cohort: Optional[str] = None
    cluster_name: Optional[str] = None


class AdmissionSummary(CareIQBaseModel):
    admission_id: str
    patient_id: str
    admission_date: Optional[date] = None
    discharge_date: Optional[date] = None
    department: Optional[str] = None
    admission_type: Optional[str] = None
    length_of_stay_days: Optional[float] = None
    icu_flag: Optional[bool] = None
    emergency_flag: Optional[bool] = None
    readmit_30day_flag: Optional[bool] = None
    total_charges: Optional[float] = None
    insurance_category: Optional[str] = None
    primary_diagnosis_category: Optional[str] = None


class PatientDetail(PatientSummary):
    admissions: list[AdmissionSummary] = []
    top_diagnoses: list[str] = []
    prior_admissions_12m: Optional[int] = None
    prior_readmissions_1y: Optional[int] = None
    high_utilizer_flag: Optional[bool] = None
    last_admission_date: Optional[date] = None
    days_since_last_discharge: Optional[int] = None


class PatientSearchRequest(CareIQBaseModel):
    query: Optional[str] = Field(None, description="Patient ID prefix or department filter")
    department: Optional[str] = None
    risk_cohort: Optional[str] = None
    insurance_category: Optional[str] = None
    age_group: Optional[str] = None
    high_utilizer_only: bool = False
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100)


# ─────────────────────────────────────────────────────────────────────────────
# Predictions / Risk Scores
# ─────────────────────────────────────────────────────────────────────────────

RiskTier = Literal["low", "medium", "high", "critical"]


class RiskScoreResponse(CareIQBaseModel):
    patient_id: str
    admission_id: str
    risk_score: float = Field(ge=0.0, le=1.0, description="Readmission probability [0, 1]")
    risk_tier: RiskTier
    risk_tier_color: str
    model_name: str
    model_version: str
    predicted_at: Optional[datetime] = None
    top_features: list["RiskFeature"] = []
    cache_hit: bool = False


class RiskFeature(CareIQBaseModel):
    feature: str
    display_label: str
    value: Any
    shap_value: Optional[float] = None
    direction: Literal["increases_risk", "decreases_risk"]


class BatchScoreRequest(CareIQBaseModel):
    admission_ids: list[str] = Field(
        min_length=1, max_length=200,
        description="List of admission IDs to score (max 200 per batch)"
    )


class BatchScoreResponse(CareIQBaseModel):
    scored: int
    failed: int
    results: list[RiskScoreResponse]


# ─────────────────────────────────────────────────────────────────────────────
# Recommendations / Care Plans
# ─────────────────────────────────────────────────────────────────────────────

class RecommendationItem(CareIQBaseModel):
    priority: int
    category: str
    category_label: str
    category_icon: str
    category_color: str
    action: str
    rationale: str
    evidence_strength: Literal["high", "medium", "low"]
    evidence_grade: str
    evidence_source: str
    clinical_source: str
    reduces_readmission_by_pct: int
    time_sensitivity: str
    responsible_role: str
    icd10_relevance: list[str] = []


class SimilarPatient(CareIQBaseModel):
    patient_id: str
    cluster_name: str
    age: Optional[float] = None
    charlson_cci: Optional[float] = None
    length_of_stay_days: Optional[float] = None
    similarity: float
    outcome: str


class CarePlanResponse(CareIQBaseModel):
    patient_id: str
    admission_id: str
    generated_at: str
    generation_time_ms: float
    risk_score: float
    risk_tier: RiskTier
    risk_tier_color: str
    risk_factors: list[RiskFeature]
    recommendations: list[RecommendationItem]
    recommendation_count: int
    categories_covered: list[str]
    cohort_name: str
    cohort_average_risk: float
    similar_patient_outcomes: list[SimilarPatient]
    cache_hit: bool = False


class AssociationRuleResponse(CareIQBaseModel):
    rule_id: Optional[int] = None
    antecedents: list[str]
    consequent: str
    support: float
    confidence: float
    lift: float
    evidence_count: int
    rule_type: str


# ─────────────────────────────────────────────────────────────────────────────
# Analytics
# ─────────────────────────────────────────────────────────────────────────────

class ReadmissionTrendPoint(CareIQBaseModel):
    period_start: str
    department_name: str
    diagnosis_category: str
    total_admissions: int
    total_readmissions: int
    readmission_rate_pct: float
    avg_los_days: float
    avg_cost_usd: float


class DepartmentPerformanceRow(CareIQBaseModel):
    department_name: str
    year: int
    month: int
    period_start: str
    total_admissions: int
    readmission_rate: float
    benchmark_readmission_rate: float
    vs_benchmark_delta: float
    rolling_3m_avg: Optional[float] = None
    mom_readmission_delta: Optional[float] = None
    avg_los_days: float
    avg_cost_usd: float
    cms_star_rating: int
    performance_label: str


class ClusterProfileResponse(CareIQBaseModel):
    cluster_id: int
    cluster_name: str
    cluster_label: str
    size: int
    size_pct: float
    avg_age: float
    avg_comorbidity_count: float
    avg_cci: float
    avg_risk_score: float
    readmission_rate: float
    avg_los_days: float
    top_comorbidities: list[str]
    dominant_insurance: str
    dominant_age_group: str
    high_utilizer_pct: float
    color_token: str


class DashboardSummary(CareIQBaseModel):
    """
    Top-level KPIs for the main dashboard summary tiles.
    """
    total_patients: int
    total_admissions_30d: int
    total_readmissions_30d: int = 0          # BUG-012 FIX: computed from rate × admissions
    avg_readmission_rate_pct: float
    avg_los_days: float
    high_risk_patients_today: int
    avg_risk_score: float
    total_cost_30d: float                    # BUG-018: kept — displayed in cost KPI tile
    department_count: int
    as_of: str   # ISO timestamp of data freshness
