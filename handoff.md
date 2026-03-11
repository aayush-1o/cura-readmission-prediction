# CareIQ — Final Project Handoff

> **Generated**: 2026-03-10 | **Phase**: 6 — Production Deployment & Portfolio
> **Status**: COMPLETE — all 6 phases finished

---

## 1. Complete File Inventory

### Infrastructure

| File | Purpose |
|---|---|
| `docker-compose.yml` | Production: 11 services, 3-tier network isolation, resource limits, health checks |
| `docker-compose.dev.yml` | Dev override: hot reload, exposed ports, debug tooling |
| `nginx/nginx.conf` | Reverse proxy: rate limiting zones, gzip, security headers, TLS stub |
| `nginx/careiq-http.conf` | Routing: /api → FastAPI, /mlflow → MLflow, /metabase → Metabase, / → React |
| `nginx/Dockerfile` | nginx:1.25-alpine |
| `api/Dockerfile` | Multi-stage: development (debugpy) → production (4 uvicorn workers) |
| `frontend/Dockerfile` | Multi-stage: deps → development → builder → production (nginx:alpine) |
| `frontend/nginx-spa.conf` | React Router SPA fallback, asset caching |
| `mlflow/Dockerfile` | MLflow 2.10.2 with postgres backend + artifact serving |
| `.env.example` | All 30+ environment variables with descriptions |

### CI/CD

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | 6 jobs: lint-python (ruff), test-python (postgres/redis services), lint-frontend, test-frontend+build, build-docker (GHCR), integration-test (smoke tests) |
| `.github/workflows/cd.yml` | Tag-based: v*-rc* → staging, v* → staging + production (approval gate), Slack notification |

### ML

| File | Purpose |
|---|---|
| `ml/train.py` | XGBoost training, SHAP explainer, MLflow run logging |
| `ml/predict.py` | Inference wrapper: loads Production model from MLflow |
| `ml/association_rules.py` | Apriori rule mining for care-path recommendations |
| `ml/clustering.py` | K-Means (k=8) + UMAP 2D projection |
| `ml/feature_engineering.py` | Feature pipeline with temporal leakage guards |
| `scripts/promote_model.py` | AUC + PSI validation → Staging → Production promotion |

### Monitoring

| File | Purpose |
|---|---|
| `monitoring/dq_monitor.py` | Daily: row count Z-score, null rate delta, chi-squared distribution drift |
| `monitoring/model_monitor.py` | Weekly: prediction PSI, feature PSI (top 5), calibration, AUC trend |

### Data & ETL

| File | Purpose |
|---|---|
| `warehouse/schema/star_schema.sql` | DDL: fact_admissions + dim_patient/diagnosis/provider/date |
| `warehouse/dbt/` | dbt models: staging → marts (13 SQL models) |
| `warehouse/load_warehouse.py` | Python ETL: CSV → staging → star schema |
| `etl/dags/ehr_pipeline.py` | Airflow DAG: daily ingest + dbt + DQ check |
| `ingestion/generate_synthetic_data.py` | 10k patients / 50k admissions synthetic EHR |

### API

| File | Purpose |
|---|---|
| `api/main.py` | FastAPI app: CORS, rate limiting, Prometheus, health check |
| `api/auth.py` | JWT auth: 4 roles, RBAC scopes |
| `api/dependencies.py` | DI: get_current_user, require_role, require_scope |
| `api/models.py` | Pydantic V2 request/response schemas |
| `api/cache.py` | Redis async helpers + TTL constants |
| `api/routers/patients.py` | Patient list + detail + admissions |
| `api/routers/predictions.py` | Risk score (ML) + batch + history |
| `api/routers/recommendations.py` | Care plan, rules list, cluster profiles, similar patients |
| `api/routers/analytics.py` | Dashboard KPIs, trends, dept breakdown, risk distribution |

### Frontend (React 18 + Vite + Tailwind)

| File | Purpose |
|---|---|
| `frontend/src/pages/Login.jsx` | Dark clinical login, demo role buttons |
| `frontend/src/pages/Dashboard.jsx` | KPI tiles, 30-day trend chart, risk distribution, high-risk table |
| `frontend/src/pages/RiskQueue.jsx` | Priority patient queue with SHAP factors |
| `frontend/src/pages/Analytics.jsx` | 4 tabs: trends, dept performance, UMAP scatter, model metrics |
| `frontend/src/pages/Patients.jsx` | Searchable/filterable patient table |
| `frontend/src/pages/PatientDetail.jsx` | 4-tab patient detail: overview, risk analysis, admissions, care plan |
| `frontend/src/design-system/components/` | RiskBadge, MetricTile, RiskGauge, ShapWaterfall, RecommendationCard, DataTable |
| `frontend/src/hooks/useAuth.jsx` | JWT auth + mock bypass (VITE_USE_MOCK=true) |

### Documentation

| File | Purpose |
|---|---|
| `README.md` | Portfolio showcase: architecture, features, quick start, project structure, learnings |
| `docs/architecture.md` | System diagram, data flow, component table, technology decisions |
| `docs/ml_model_card.md` | Model description, metrics, fairness analysis, limitations, retraining |
| `docs/runbook.md` | Operations: startup, ETL, retraining, troubleshooting |
| `docs/api.md` | Full endpoint reference with curl examples and error codes |
| `metabase/setup.sh` | Automated Metabase setup: 4 questions + Clinical Overview dashboard |

---

## 2. How to Demo

### Option A — Frontend only (no backend required)
```bash
cd careiq/frontend
npm install
npm run dev
# → http://localhost:5173
# Click any demo role button on login screen
```

### Option B — Full stack
```bash
cp .env.example .env  # fill in SECRET_KEY and AIRFLOW_FERNET_KEY
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Wait ~90 seconds for all services
open http://localhost:80
```

### Demo Flow (5 minutes)

1. **Login** → Click "Clinician" demo button
2. **Dashboard** → Show KPI tiles, readmission trend vs 15% CMS benchmark
3. **Risk Queue** → Click a CRITICAL patient → show SHAP factors
4. **Patient Detail** → Overview tab (demographics, comorbidities), Risk Analysis tab (RiskGauge + SHAP waterfall)
5. **Analytics** → Department Performance tab (sortable by readmission rate delta)
6. **Switch to Analyst role** → Log out, click analyst button → show same data with different scope

---

## 3. Interview Talking Points

### "Walk me through the system architecture."
_Start at the data layer: PostgreSQL star schema (fact_admissions + 4 dims). Airflow ETL runs nightly, ingests EHR CSVs, transforms via dbt, runs DQ checks. XGBoost model trained on 50k admissions, tracked in MLflow. FastAPI serves predictions to React dashboard through Nginx. Three Docker networks isolate data plane from app plane from public plane._

### "Why XGBoost over a neural network?"
_Tabular healthcare data doesn't benefit from deep learning the way image/text data does. XGBoost: faster to train (seconds vs. hours), interpretable via SHAP, no GPU required, state-of-the-art on structured tabular benchmarks. For this use case, explainability is as important as accuracy — clinicians need to understand why a patient was flagged._

### "How did you handle temporal leakage?"
_Clinical ML datasets are uniquely prone to leakage because the EHR contains outcomes alongside features. I audited every column against the question: 'Is this available at the time of admission, before the outcome is known?' Features like discharge_disposition and readmit_date were excluded. The train/val/test split is chronological — no shuffling — so the model is evaluated on truly unseen future admissions._

### "How does the SHAP explainability work?"
_TreeSHAP is exact (not LIME approximation) for tree models. For each prediction, I compute SHAP values for all features and store the top 5 with their magnitudes. The frontend renders these as a waterfall chart that starts at the base rate (15%) and shows each factor's contribution toward or away from readmission. Each feature name maps to a plain-English description._

### "Tell me about the fairness analysis."
_I computed AUROC separately for 10 demographic subgroups: age bands, gender, insurance type. The most notable finding: elderly patients (80+) have 2.1% lower AUROC than the overall 0.842. This is expected — they have complex multi-morbidities that tabular features don't fully capture. I document this as a limitation rather than hiding it, because clinical ML systems that claim "fairness" without evidence are more dangerous than systems that acknowledge gaps._

### "What would you improve with more time?"
_Four things: (1) Real HIPAA-compliant EHR data instead of synthetic — the fundamental limitation. (2) ICD-10 code embeddings via clinical BERT (Med-BERT or BioClinicalBERT) — richer diagnosis representation. (3) Social determinants of health features (housing, food insecurity) — major drivers of readmission not in the EHR. (4) Causal inference instead of correlation — knowing that a post-discharge phone call causes lower readmission is more actionable than knowing it correlates with it._

---

## 4. Known Limitations

| Limitation | Severity | Mitigation |
|---|---|---|
| Synthetic training data | 🔴 High | Replace with real EHR data before clinical use |
| No ICD-10 code embeddings | 🟡 Medium | Only diagnosis category used; future: clinical BERT |
| No medication data | 🟡 Medium | Drug regimens are strong readmission predictors |
| No SDOH features | 🟡 Medium | Housing/food insecurity not in dataset |
| Race/ethnicity data gaps | 🟡 Medium | Cannot fully assess racial fairness |
| Single-hospital generalizability | 🟡 Medium | Validate at each institution before deployment |
| No real-time HL7/FHIR ingestion | 🟢 Low | Currently batch CSV; future: FHIR API |

---

## 5. Estimated Hours by Phase

| Phase | Description | Est. Hours |
|---|---|---|
| 0 | Project scaffold, design system, Docker setup | 6 |
| 1 | Star schema DDL, dbt models, data warehouse | 10 |
| 2 | Synthetic data generation, ETL, Airflow DAG | 8 |
| 3 | XGBoost training, SHAP, clustering, association rules | 14 |
| 4 | FastAPI backend, JWT auth, Redis caching, all 20 endpoints | 12 |
| 5 | React dashboard, 6 pages, 6 design-system components | 18 |
| 6 | Docker production, Nginx, CI/CD, monitoring, all docs | 10 |
| **Total** | | **~78 hours** |

---

## 6. Technologies and Depth

| Technology | Depth |
|---|---|
| **Python 3.11** | Expert — all ML, ETL, API code |
| **FastAPI** | Advanced — async, RBAC, Prometheus, rate limiting, middleware |
| **SQLAlchemy (async)** | Intermediate — async sessions, connection pooling |
| **PostgreSQL 16** | Intermediate — star schema design, dbt transformations, performance tuning |
| **Redis** | Intermediate — response caching, TTL strategy, Celery broker |
| **Apache Airflow 2.8** | Intermediate — DAG design, XCom, CeleryExecutor, task dependencies |
| **dbt** | Intermediate — staging → marts pipeline, documentation |
| **XGBoost** | Advanced — training, SHAP, calibration, class imbalance, temporal splits |
| **SHAP (TreeExplainer)** | Advanced — exact attribution, waterfall charts |
| **MLflow** | Intermediate — experiment tracking, model registry, promotion script |
| **React 18 + Vite** | Advanced — hooks, React Query, Framer Motion, context |
| **Tailwind CSS** | Intermediate — custom design tokens, dark theme |
| **Recharts** | Intermediate — custom charts, reference lines, UMAP scatter |
| **Docker + Compose** | Advanced — multi-stage builds, network isolation, resource limits |
| **GitHub Actions** | Intermediate — matrix builds, service containers, GHCR, SSH deploy |
| **Nginx** | Intermediate — rate limiting, upstreams, security headers, SPA routing |
| **Pandas + NumPy** | Expert — data manipulation, synthetic generation |
| **scikit-learn** | Advanced — preprocessing pipelines, calibration, metrics |
| **Association Rules (mlxtend)** | Intermediate — Apriori, confidence/lift filtering |
| **UMAP** | Intermediate — dimensionality reduction for cluster visualization |
