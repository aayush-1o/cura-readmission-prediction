<div align="center">

# 🏥 CareIQ
### *Predict. Prevent. Personalize.*

**A production-grade hospital readmission risk & care-path recommendation platform built for clinical teams that prioritize both outcomes and explainability.**

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0-FF6600?logo=xgboost&logoColor=white)](https://xgboost.ai)
[![MLflow](https://img.shields.io/badge/MLflow-2.10-0194E2?logo=mlflow&logoColor=white)](https://mlflow.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Apache Airflow](https://img.shields.io/badge/Airflow-2.8-017CEE?logo=apacheairflow&logoColor=white)](https://airflow.apache.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)

**[Live Demo →](#)** &nbsp;|&nbsp; **[API Docs →](docs/api.md)** &nbsp;|&nbsp; **[Architecture →](docs/architecture.md)** &nbsp;|&nbsp; **[Model Card →](docs/ml_model_card.md)**

</div>

---

## What is CareIQ?

Hospitals lose millions annually to preventable readmissions. CareIQ gives clinicians a real-time risk score for every admitted patient — explained in plain English — along with AI-generated care-path recommendations backed by association rule mining on historical outcomes.

> Built as a portfolio project demonstrating full-stack ML engineering from raw EHR data to production dashboard.

---

## Architecture Diagram

```
                        EXTERNAL TRAFFIC
                              │
                    ┌─────────▼─────────┐
                    │  Nginx (gateway)  │  Rate limiting · TLS · Gzip
                    └────┬──────┬───────┘
                         │      │
              ┌──────────▼──┐ ┌─▼────────────┐
              │  React UI   │ │  FastAPI ×4  │  JWT auth · Redis cache
              │  (Vite SPA) │ │  uvicorn     │  Prometheus metrics
              └─────────────┘ └──────┬───────┘
                                     │
             ┌───────────────────────┼──────────────────────┐
             │                       │                      │
     ┌───────▼──────┐    ┌───────────▼──────┐     ┌────────▼──────┐
     │  PostgreSQL  │    │  Redis           │     │  MLflow       │
     │  Star Schema │    │  Cache + Celery  │     │  Model Reg.   │
     │  50k rows    │    │  Broker          │     │  + Artifacts  │
     └──────────────┘    └──────────────────┘     └───────────────┘
             │
     ┌───────▼──────────────────────────────────────────────┐
     │                 AIRFLOW ETL PIPELINE                 │
     │  daily: CSV ingest → dbt transform → DQ checks       │
     └──────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. 🎯 ML Risk Stratification (AUROC 0.84)
XGBoost classifier trained on 50,000 synthetic admissions. Outputs a calibrated probability with a risk tier (low/medium/high/critical). Features are carefully selected to avoid temporal data leakage — a common mistake in clinical ML.

### 2. 🔍 SHAP Explainability + Plain-English Translation
Every prediction shows the top 5 risk factors as a waterfall chart with values like "High CCI (8) → +31% risk". TreeSHAP is exact for tree models and runs in milliseconds at inference time.

### 3. 🤖 Association Rule–Driven Care Paths
Apriori algorithm mines diagnosis co-occurrence patterns from historical admissions. Rules like "CHF + CKD → SNF placement (confidence: 0.73, lift: 2.1)" are translated into actionable recommendations.

### 4. 🏗️ Production-Grade Star Schema
PostgreSQL data warehouse with `fact_admissions` (50k rows) and 4 dimension tables. Time-based grain on `dim_date` for trend queries. dbt models handle staging → presenting layer with full lineage tracking.

### 5. 📊 Real-Time Clinical Dashboard
React 18 + Recharts dashboard with live KPI tiles, 30-day readmission trend vs CMS 15% benchmark, UMAP patient clustering scatter plot, and department performance leaderboard. Dark clinical theme designed for ICU lighting conditions.

### 6. 🔒 JWT Role-Based Access Control
4 roles (clinician, care_coordinator, analyst, admin) with fine-grained scopes. Clinicians see patient and prediction data only; analysts get analytics and audit access; care coordinators can write care plans.

---

## Technical Highlights

| Topic | Implementation |
|---|---|
| **Temporal leakage** | Train/val/test split is **time-based** (chronological). Features requiring knowledge of discharge (discharge_disposition, readmit_date) are explicitly excluded. |
| **SHAP explainability** | TreeSHAP (exact, not approximate) via `shap.TreeExplainer`. Values stored per-prediction in DB and surfaced as waterfall chart in frontend. |
| **Fairness monitoring** | AUROC computed by age group, gender, insurance type quarterly. Thresholds: flag if any group drops >5% below overall. |
| **Class imbalance** | XGBoost `scale_pos_weight = 5.67` (85:15 ratio). Operating threshold tuned to maximize recall over precision (missing high-risk is costlier than false alarms). |
| **Star schema design** | Fact table at admission grain (not patient grain) allows accurate COUNT DISTINCT, LOS averages, and time-series trends without fan-out joins. |
| **Rule → recommendation** | Association rules mined from admissions where readmit_30day=False (successful outcomes). Rules filtered by confidence >0.3, lift >1.5 before serving. |

---

## Quick Start

> Requires: Docker Desktop 24+, 8GB RAM, 10GB disk

```bash
# 1. Clone and configure
git clone https://github.com/YOUR_USERNAME/careiq.git
cd careiq
cp .env.example .env   # Edit SECRET_KEY and AIRFLOW_FERNET_KEY

# 2. Start all services (≈2 minutes first run)
docker compose up -d

# 3. Open the dashboard
open http://localhost:80
# Click any demo role button on the login screen
```

That's it. No database setup — the star schema DDL runs automatically on postgres startup.

### Development Mode (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Frontend: http://localhost:5173 (Vite HMR)
# API: http://localhost:8000/docs (Swagger UI)
# Airflow: http://localhost:8080
# MLflow: http://localhost:5000
```

---

## Screenshots

| Login | Dashboard |
|---|---|
| ![Login — dark clinical design with demo role buttons](#) | ![Dashboard — KPI tiles, 30-day trend, risk distribution](#) |

| Risk Queue | Patient Detail |
|---|---|
| ![Risk Queue — prioritized patient list with SHAP factors](#) | ![Patient Detail — risk gauge, care plan, SHAP waterfall](#) |

---

## Project Structure

```
careiq/
├── data/
│   └── synthetic/        # 10,000 patients, 50,000 admissions (auto-generated)
├── ingestion/
│   ├── generate_synthetic_data.py   # Generates clinically realistic CSVs
│   └── validate_schema.py           # Pandera schema validation
├── warehouse/
│   ├── schema/
│   │   └── star_schema.sql          # DDL: fact_admissions + 4 dims
│   ├── dbt/                         # Staging → presenting transformations
│   │   ├── models/staging/          # stg_patients, stg_admissions, stg_diagnoses
│   │   └── models/marts/            # Fact tables + dims
│   └── load_warehouse.py            # Python ETL script
├── ml/
│   ├── train.py                     # XGBoost training + MLflow logging
│   ├── predict.py                   # Inference wrapper + SHAP
│   ├── association_rules.py         # Apriori rule mining (mlxtend)
│   ├── clustering.py                # K-Means (k=8) + UMAP projection
│   └── requirements.txt
├── etl/
│   └── dags/
│       └── ehr_pipeline.py          # Airflow DAG (daily 02:00 UTC)
├── api/
│   ├── main.py                      # FastAPI app, middleware, lifespan
│   ├── auth.py                      # JWT creation/validation
│   ├── dependencies.py              # DI: get_current_user, require_role
│   ├── cache.py                     # Redis async helpers
│   ├── models.py                    # Pydantic V2 request/response models
│   ├── routers/
│   │   ├── patients.py
│   │   ├── predictions.py
│   │   ├── recommendations.py
│   │   └── analytics.py
│   ├── Dockerfile                   # Multi-stage: dev + production
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── design-system/components/  # RiskBadge, MetricTile, RiskGauge,
│   │   │                              #   ShapWaterfall, RecommendationCard,
│   │   │                              #   DataTable
│   │   ├── pages/                     # Login, Dashboard, RiskQueue,
│   │   │                              #   Analytics, Patients, PatientDetail
│   │   ├── components/layout/         # AppLayout (collapsible sidebar)
│   │   ├── hooks/                     # useAuth (JWT + mock bypass)
│   │   └── services/                  # api.js, mockData.js, hooks.js
│   ├── Dockerfile                     # Multi-stage: dev + builder + nginx
│   └── package.json
├── nginx/
│   ├── nginx.conf                   # Rate limiting, gzip, security headers
│   ├── careiq-http.conf             # Routing rules (API, MLflow, Metabase, SPA)
│   └── Dockerfile
├── mlflow/
│   └── Dockerfile                   # MLflow 2.10 with postgres backend
├── monitoring/
│   ├── dq_monitor.py                # Data quality: row counts, null rates, drift
│   └── model_monitor.py             # Weekly PSI + calibration + AUC trend
├── scripts/
│   └── promote_model.py             # MLflow Staging → Production promotion
├── metabase/
│   └── setup.sh                     # Automated Metabase setup (4 questions + dashboard)
├── docs/
│   ├── architecture.md              # System design + component descriptions
│   ├── ml_model_card.md             # Model card: metrics, fairness, limitations
│   ├── runbook.md                   # How to operate the system
│   └── api.md                       # Full API reference with curl examples
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Lint, test, build, integration tests
│       └── cd.yml                   # Tag-based deploy: staging + production
├── docker-compose.yml               # Production (3-tier network isolation)
├── docker-compose.dev.yml           # Dev override (hot reload, all ports)
└── .env.example                     # All env vars with descriptions
```

---

## What I Learned

**Temporal leakage is subtle and dangerous.** I initially included `discharge_disposition` as a feature — it's one of the strongest predictors of readmission. Then realized: we can't know if someone goes to a nursing facility vs. home until *after* they've been discharged. Including it would give the model "future knowledge." The fix was an explicit feature audit with a column-level policy: only include data available at time of *admission*.

**Star schemas dramatically outperform 3NF for analytics.** My first attempt used fully normalized tables. A query for "readmission rate by department by month" required 4 joins and took 800ms. After remodeling as a star schema, the same query runs in 45ms. The trade-off (data redundancy) is acceptable for a read-heavy analytics workload.

**SMOTE can introduce its own bias.** I initially used SMOTE to address class imbalance. After implementing fairness analysis, I noticed the model performing significantly worse on elderly patients (80+). Investigation showed SMOTE was synthesizing "average" minority-class patients that didn't match the distribution of elderly high-risk patients well. Switched to XGBoost's native `scale_pos_weight` — simpler and more honest.

**Redis cache invalidation is a first-class concern.** Without a cache invalidation strategy, the dashboard would show stale KPIs for hours after ETL. Designed an event-driven invalidation: ETL completion triggers `KEYS analytics:*` pattern delete. This was more complex to implement than the cache itself but critical for data freshness.

**MLflow model registry adds significant operational value.** Without it, I was manually tracking which `.pkl` file was in production. Now model promotion is a gated, auditable process: AUC check → PSI check → archive old version → promote → log tag. Each production deployment has a full audit trail.

---

## Estimated Effort

| Phase | Work | Est. Hours |
|---|---|---|
| Phase 0 | Project scaffold, design system | 6h |
| Phase 1 | Star schema, data warehouse, dbt | 10h |
| Phase 2 | Data ingestion, ETL, Airflow | 8h |
| Phase 3 | ML: XGBoost, SHAP, clustering, rules | 14h |
| Phase 4 | FastAPI backend, JWT auth, caching | 12h |
| Phase 5 | React dashboard, all 6 pages | 18h |
| Phase 6 | Docker, CI/CD, monitoring, docs | 10h |
| **Total** | | **~78 hours** |

---

## License

MIT — see [LICENSE](LICENSE)
