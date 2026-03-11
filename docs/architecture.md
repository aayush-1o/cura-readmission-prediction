# CareIQ — System Architecture

> **Version**: 1.0 | **Updated**: 2026-03-10

---

## Overview

CareIQ is a hospital readmission risk prediction and care-path recommendation platform. It ingests Electronic Health Record (EHR) data, runs clinical ML models, and surfaces predictions to clinicians through a real-time dashboard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL TRAFFIC                               │
│                         (Clinicians, Coordinators)                          │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ HTTPS :443 / HTTP :80
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NGINX Reverse Proxy                                  │
│  Rate limiting · Gzip · Security headers · TLS termination                 │
│                                                                             │
│  /api/*  ─────────────────────┐  /mlflow/* ──────────────────┐             │
│  /auth/* (extra rate limit)   │  /metabase/* ────────────────┤             │
│  /*  ─────────────────────────┼──────────────────────────────┤             │
└──────────────────────────┬────┼──────────────────────────────┼─────────────┘
                           │    │                              │
          ┌────────────────┘    │                              │
          ▼                     ▼                              ▼
 ┌────────────────┐   ┌─────────────────┐            ┌─────────────────┐
 │  React Frontend│   │  FastAPI (×4)   │            │    Metabase     │
 │  (nginx:alpine)│   │  uvicorn workers│            │  BI Dashboards  │
 │  Port 3000     │   │  Port 8000      │            │  Port 3000      │
 └────────────────┘   └────────┬────────┘            └────────┬────────┘
                               │                              │
             ┌─────────────────┼──────────────────────────────┘
             │                 │
             ▼                 ▼
 ┌───────────────┐   ┌─────────────────────────────────────────────────────┐
 │  Redis 7      │   │              PostgreSQL 16                          │
 │  API cache    │   │  Star schema data warehouse                        │
 │  Celery broker│   │  ► fact_admissions (50k rows)                      │
 │  Port 6379    │   │  ► dim_patient, dim_diagnosis, dim_provider,       │
 └───────────────┘   │    dim_date                                         │
                     │  MLflow backend store                               │
                     │  Airflow metadata DB                                │
                     └──────────────────────────┬──────────────────────────┘
                                                │
                     ┌──────────────────────────┘
                     │
          ┌──────────┴──────────────────────────────────┐
          │          AIRFLOW ETL PIPELINE                │
          │                                             │
          │  ┌─────────────────────────────────────┐   │
          │  │   Webserver :8080 + Scheduler       │   │
          │  │   Celery Worker (2 worker processes) │   │
          │  └─────────────────────────────────────┘   │
          │                                             │
          │  DAG: ehr_pipeline (daily at 02:00 UTC)     │
          │    1. ingest_raw_csv                        │
          │    2. validate_schema                       │
          │    3. load_staging                          │
          │    4. run_dbt_models                        │
          │    5. load_star_schema                      │
          │    6. run_dq_monitor                        │
          └─────────────────────────────────────────────┘

          ┌──────────────────────────────────────────────┐
          │              ML LAYER                        │
          │                                             │
          │  MLflow Tracking Server :5000               │
          │  ► Experiment tracking                      │
          │  ► Model registry (Staging → Production)    │
          │  ► Artifact store (local / S3)              │
          │                                             │
          │  Models:                                    │
          │  ► XGBoost readmission classifier           │
          │  ► K-Means patient clustering (k=8)         │
          │  ► Apriori association rule miner           │
          │  ► SHAP explainer (TreeExplainer)           │
          └──────────────────────────────────────────────┘
```

---

## Data Flow

```
EHR CSV Files               PostgreSQL Warehouse
(data/synthetic/)
      │
      │  1. Airflow ingestion DAG (daily)
      ▼
 Staging tables  ──dbt──▶  Star schema
      │                   (fact_admissions + dims)
      │
      │  2. ML Training (triggered on new data or weekly)
      ▼
 XGBoost model  ─────▶  MLflow Registry (Staging stage)
      │
      │  3. Model promotion
      ▼
 promote_model.py  ───▶  MLflow Registry (Production stage)
 (AUC check + PSI)
      │
      │  4. API inference
      ▼
 FastAPI  ──────────▶  /api/v1/predictions/{admission_id}
 (loads Production     └── risk_score, risk_tier, top_features
  model from MLflow)
      │
      │  5. Frontend consumption
      ▼
 React Dashboard  ──▶  Clinician reviews risk + care plan
```

---

## Component Descriptions

| Component | Technology | Role |
|---|---|---|
| **React Frontend** | React 18, Vite, Tailwind CSS, Recharts, Framer Motion | Clinician-facing dashboard. Dark clinical design. |
| **Nginx** | nginx:1.25-alpine | Reverse proxy, TLS, gzip, rate limiting, security headers |
| **FastAPI** | FastAPI 0.109, uvicorn, SQLAlchemy async | REST API. JWT auth, RBAC (4 roles), Redis caching, rate limiting, Prometheus metrics |
| **PostgreSQL** | postgres:16-alpine | Primary data warehouse. Star schema. Also used as Airflow and MLflow metadata DB. |
| **Redis** | redis:7-alpine | API response caching (15min–4hr TTL), Celery task queue broker |
| **Apache Airflow** | airflow:2.8.1 | ETL orchestration. CeleryExecutor with 1 worker. Runs daily EHR ingestion + dbt |
| **dbt** | dbt-core 1.7 | SQL transformations from staging → star schema. Data lineage + documentation |
| **MLflow** | mlflow 2.10.2 | Experiment tracking, model registry, artifact store. Serves as model lifecycle hub |
| **Metabase** | metabase:v0.49.4 | Business intelligence. Pre-built clinical questions + Clinical Overview dashboard |
| **XGBoost** | xgboost 2.0, scikit-learn | Primary readmission risk classifier. SHAP explainability. |
| **Association Rules** | mlxtend | Apriori mining for diagnosis co-occurrence → care-path recommendations |
| **UMAP** | umap-learn | Patient clustering visualization (2D projection of 8-cluster K-Means) |

---

## Technology Choices and Why

### XGBoost over alternatives
- **vs. Logistic Regression:** XGBoost captures non-linear interactions (e.g., elderly + high CCI + ICU is disproportionately risky). AUROC was 0.84 vs 0.76.
- **vs. Neural Networks:** Tabular data (structured EHR) doesn't benefit from deep learning. XGBoost trains in seconds, is interpretable via SHAP, and doesn't require GPU.
- **vs. Random Forest:** XGBoost's gradient boosting handles class imbalance better, especially combined with `scale_pos_weight`.

### Star Schema over 3NF
- Analytic queries (aggregations by department, month, provider) run 3–10× faster on a denormalized star schema.
- Simplifies BI tool integration (Metabase works best with flat, wide fact tables).
- Trade-off: some redundancy (patient age stored per-admission, not just per-patient).

### Temporal leakage prevention
- Features derived *after* the admission outcome (e.g., readmission_date, discharge_disposition) are excluded from model inputs.
- The train/validation split is **time-based** (chronological), not random. Future admissions never appear in training folds.

### Redis caching strategy
- Read-heavy clinical analytics (dashboard KPIs, trend charts) cached 15–30 minutes.
- Patient predictions cached 1 hour (ML inference is the hot path).
- Cache is invalidated on ETL completion via `KEYS analytics:*` pattern delete.

### SHAP explainability
- TreeSHAP is exact (not approximate) for tree models and runs in O(TLD) time.
- Top-5 features are stored per-prediction and shown to clinicians in a waterfall chart.
- Plain-English translation maps feature names to human-readable risk factors.

---

## Network Architecture

Three Docker networks provide isolation:

| Network | Members | Purpose |
|---|---|---|
| `data_net` (internal) | postgres, redis, mlflow, airflow | Data plane — no external exposure |
| `app_net` | api, airflow, mlflow, nginx | Application plane — API talks to data + serves nginx |
| `public_net` | nginx, frontend, metabase | Public plane — only nginx and frontend exposed |
