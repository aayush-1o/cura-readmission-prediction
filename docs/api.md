# CareIQ — API Reference

> **Base URL (development)**: `http://localhost:8000`  
> **Base URL (production)**: `https://your-domain.com/api`  
> **OpenAPI Docs**: `{base_url}/docs`

---

## Authentication

All endpoints except `/health`, `/metrics`, and `/auth/login` require a JWT Bearer token.

### Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyst@careiq.io",
    "password": "CareIQ-Demo-2024!"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "analyst@careiq.io",
    "email": "analyst@careiq.io",
    "role": "analyst",
    "scopes": ["read:patients", "read:predictions", "read:analytics", "read:clusters", "read:rules"]
  }
}
```

### Using the Token

```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# All subsequent requests:
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/...
```

### Refresh Token

```bash
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

---

## Demo Credentials

| Email | Password | Role | Scopes |
|---|---|---|---|
| `clinician@careiq.io` | `CareIQ-Demo-2024!` | clinician | read:patients, read:predictions, read:care-plans |
| `coordinator@careiq.io` | `CareIQ-Demo-2024!` | care_coordinator | + write:care-plans, read:clusters, read:analytics |
| `analyst@careiq.io` | `CareIQ-Demo-2024!` | analyst | read:patients, read:predictions, read:analytics, read:clusters, read:rules |
| `admin@careiq.io` | `CareIQ-Admin-2024!` | admin | all scopes |

---

## Endpoints

### Health & Diagnostics

#### `GET /health`

```bash
curl http://localhost:8000/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-03-10T17:32:00Z",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "ml_model": "ok"
  }
}
```

#### `GET /metrics`

Prometheus-format metrics. Example:
```
# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",endpoint="/api/v1/analytics/dashboard",le="0.1"} 142
```

---

### Analytics

#### `GET /api/v1/analytics/dashboard`

Dashboard KPIs. Scope: `read:analytics`. Cache: 30 minutes.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/analytics/dashboard
```

```json
{
  "total_admissions_30d": 1842,
  "readmission_rate_30d": 0.142,
  "readmission_rate_change": -0.018,
  "high_risk_count": 127,
  "avg_los_days": 4.2,
  "avg_risk_score": 0.38,
  "cache_hit": false
}
```

#### `GET /api/v1/analytics/readmission-trends`

Monthly trend data. Query params: `?months=12`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/analytics/readmission-trends?months=12"
```

```json
[
  {"month": "2026-01-01", "rate": 0.148, "admissions": 1823, "department": "Cardiology"},
  {"month": "2026-01-01", "rate": 0.131, "admissions": 1642, "department": "Internal Medicine"}
]
```

#### `GET /api/v1/analytics/department-breakdown`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/analytics/department-breakdown
```

```json
[
  {
    "department": "Cardiology",
    "readmission_rate": 0.183,
    "benchmark_delta": 0.033,
    "avg_los": 5.2,
    "avg_cost": 18400
  }
]
```

#### `GET /api/v1/analytics/risk-distribution`

```json
{"low": 0.42, "medium": 0.31, "high": 0.19, "critical": 0.08}
```

#### `GET /api/v1/analytics/high-risk-today`

Patients scored ≥ HIGH threshold admitted today.

```json
[
  {
    "patient_id": "PAT-001234",
    "risk_score": 0.87,
    "risk_tier": "critical",
    "department": "Cardiology",
    "primary_diagnosis": "Congestive Heart Failure",
    "top_factors": ["High CCI (8)", "ICU admission", "3 prior admissions"]
  }
]
```

---

### Patients

#### `GET /api/v1/patients`

Paginated patient list. Scope: `read:patients`. Cache: 15 minutes.

Query params:
- `page` (default: 1)
- `page_size` (default: 25, max: 100)
- `department` — filter by department code
- `risk_tier` — `low|medium|high|critical`
- `search` — search patient ID or name

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/patients?page=1&page_size=25&risk_tier=high"
```

```json
{
  "data": [
    {
      "patient_id": "PAT-001234",
      "age": 72,
      "gender": "M",
      "comorbidity_score": 7,
      "prior_admissions_12mo": 3,
      "department": "Cardiology",
      "primary_diagnosis": "CHF",
      "current_risk_score": 0.82
    }
  ],
  "total": 342,
  "page": 1,
  "page_size": 25
}
```

#### `GET /api/v1/patients/{patient_id}`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/patients/PAT-001234
```

Full patient record with demographics, comorbidities, and admission history.

#### `GET /api/v1/patients/{patient_id}/admissions`

All admissions for a patient, ordered by date descending.

---

### Predictions

#### `GET /api/v1/predictions/{admission_id}`

Risk prediction for a specific admission. Scope: `read:predictions`. Cache: 1 hour.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/predictions/ADM-00081234
```

```json
{
  "admission_id": "ADM-00081234",
  "patient_id": "PAT-001234",
  "risk_score": 0.847,
  "risk_tier": "critical",
  "risk_percentile": 94,
  "top_features": [
    {"feature": "comorbidity_score", "value": 8, "shap_value": 0.31, "direction": "increasing"},
    {"feature": "prior_admissions_12mo", "value": 3, "shap_value": 0.22, "direction": "increasing"},
    {"feature": "icu_flag", "value": true, "shap_value": 0.18, "direction": "increasing"},
    {"feature": "length_of_stay_days", "value": 11, "shap_value": 0.14, "direction": "increasing"},
    {"feature": "age_at_admission", "value": 72, "shap_value": 0.09, "direction": "increasing"}
  ],
  "model_version": "4",
  "predicted_at": "2026-03-10T09:15:00Z"
}
```

#### `POST /api/v1/predictions/batch`

Batch score multiple admissions. Scope: `read:predictions`.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8000/api/v1/predictions/batch \
  -d '{"admission_ids": ["ADM-001", "ADM-002", "ADM-003"]}'
```

---

### Recommendations

#### `POST /api/v1/recommendations/care-plan/{patient_id}/{admission_id}`

Generate care plan for a patient. Scope: `read:care-plans`. Cache: 4 hours.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/recommendations/care-plan/PAT-001234/ADM-00081234
```

```json
{
  "patient_id": "PAT-001234",
  "recommendations": [
    {
      "category": "Discharge Planning",
      "priority": "high",
      "action": "Arrange skilled nursing facility placement",
      "rationale": "3 prior admissions + high CCI suggest patient cannot safely return home",
      "evidence_level": "B"
    },
    {
      "category": "Cardiology Follow-up",
      "priority": "high",
      "action": "Schedule cardiology follow-up within 7 days of discharge",
      "rationale": "CHF patients have significantly lower readmission rates with early follow-up",
      "evidence_level": "A"
    }
  ],
  "similar_patients": [...]
}
```

---

## Error Codes

| Status | Code | Meaning |
|---|---|---|
| 401 | `INVALID_TOKEN` | Token missing, expired, or malformed |
| 401 | `TOKEN_EXPIRED` | Access token expired — use refresh endpoint |
| 403 | `INSUFFICIENT_SCOPE` | Role lacks required scope for this endpoint |
| 404 | `PATIENT_NOT_FOUND` | Patient ID doesn't exist |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests — wait and retry |
| 500 | `INTERNAL_ERROR` | Server error — details logged, not exposed |

All errors return:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Retry after 60 seconds.",
  "request_id": "req_abc123"
}
```

---

## Rate Limits

- **Authenticated endpoints**: 100 requests/minute per token
- **Batch prediction**: 10 requests/minute
- **Auth endpoints**: 10 requests/minute per IP (brute-force protection)
- **Headers returned**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
