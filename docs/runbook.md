# CareIQ — Operations Runbook

> **Audience**: DevOps engineers, data engineers, ML engineers  
> **Last Updated**: 2026-03-10

---

## Table of Contents

1. [Starting the Full Stack](#1-starting-the-full-stack)
2. [Running the ETL Pipeline Manually](#2-running-the-etl-pipeline-manually)
3. [Retraining the ML Model](#3-retraining-the-ml-model)
4. [Adding New Departments or Patients](#4-adding-new-departments-or-patients)
5. [Troubleshooting Common Issues](#5-troubleshooting-common-issues)

---

## 1. Starting the Full Stack

### Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Docker Desktop | ≥ 24.0 | `docker --version` |
| Docker Compose | ≥ 2.20 | `docker compose version` |
| Available RAM | ≥ 8 GB | Docker Desktop → Settings → Resources |
| Available Disk | ≥ 10 GB | `df -h` |

### Step 1 — Configure Environment

```bash
cp .env.example .env

# Generate secure values
python3 -c "import secrets; print(secrets.token_hex(32))"  # → SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # → AIRFLOW_FERNET_KEY

# Edit .env with your values
nano .env
```

### Step 2 — Start Core Services

```bash
# Production mode
docker compose up -d

# Development mode (hot reload, all ports exposed)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Step 3 — Initialize Database

```bash
# Run on first startup — loads star schema DDL
docker compose exec postgres psql -U careiq -d careiq_warehouse -f /docker-entrypoint-initdb.d/01_star_schema.sql

# OR if using the warehouse load script
docker compose exec api python warehouse/load_warehouse.py
```

### Step 4 — Verify All Services

```bash
# Check health
docker compose ps

# API health endpoint
curl http://localhost:80/health

# Login test
curl -X POST http://localhost:80/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"analyst@careiq.io","password":"CareIQ-Demo-2024!"}'
```

### Service URLs (development)

| Service | URL | Credentials |
|---|---|---|
| **React UI** | http://localhost:5173 | Click demo role buttons |
| **FastAPI docs** | http://localhost:8000/docs | N/A |
| **Airflow** | http://localhost:8080 | admin / (AIRFLOW_ADMIN_PASSWORD) |
| **MLflow** | http://localhost:5000 | N/A |
| **Metabase** | http://localhost:3001 | admin@careiq.io / CareIQ-Meta-2024! |
| **pgAdmin** | http://localhost:5050 | (PGADMIN_EMAIL / PGADMIN_PASSWORD) |

### Stopping / Cleanup

```bash
# Stop all services (preserves data volumes)
docker compose down

# Stop and remove all data (destructive!)
docker compose down -v

# Remove only a specific service
docker compose stop api && docker compose rm -f api
```

---

## 2. Running the ETL Pipeline Manually

### Via Airflow UI

1. Navigate to http://localhost:8080
2. Find DAG: `careiq_ehr_pipeline`
3. Click **▶ Trigger DAG** → Confirm

### Via Airflow CLI

```bash
# Trigger with default date (today)
docker compose exec airflow-webserver airflow dags trigger careiq_ehr_pipeline

# Trigger with specific date
docker compose exec airflow-webserver airflow dags trigger careiq_ehr_pipeline \
  --conf '{"execution_date": "2026-03-10"}'

# Monitor run status
docker compose exec airflow-webserver airflow dags state careiq_ehr_pipeline 2026-03-10
```

### Run individual pipeline steps

```bash
# 1. Ingest raw CSV (populates staging tables)
docker compose exec api python ingestion/generate_synthetic_data.py --patients 10000

# 2. Load staging → warehouse
docker compose exec api python warehouse/load_warehouse.py

# 3. Run dbt transformations
docker compose exec api bash -c "cd warehouse/dbt && dbt run"

# 4. Run data quality checks
docker compose exec api python monitoring/dq_monitor.py --date $(date +%Y-%m-%d)
```

### Invalidate API cache after ETL

```bash
docker compose exec redis redis-cli KEYS "analytics:*" | xargs docker compose exec redis redis-cli DEL
```

---

## 3. Retraining the ML Model

### Full retraining pipeline

```bash
# 1. Fetch latest data (if not already done via ETL)
docker compose exec api python warehouse/load_warehouse.py

# 2. Run training script (logs to MLflow automatically)
docker compose exec api python ml/train.py \
  --experiment careiq_readmission \
  --n-estimators 500 \
  --max-depth 6

# 3. Review results in MLflow UI
open http://localhost:5000

# 4. Promote best model to Production (after reviewing AUC)
docker compose exec api python scripts/promote_model.py \
  --model-name careiq_readmission_v1 \
  --version <VERSION_NUMBER> \
  --min-auc 0.80

# 5. Restart API to load new model
docker compose restart api
```

### Retrain via Airflow (recommended)

The `ml_retrain_pipeline` DAG handles steps 2–5 automatically:
1. Trigger from Airflow UI
2. It waits for ETL completion (via sensor), then trains, validates, promotes
3. Sends Slack notification on success/failure

### Monitor model performance

```bash
# Run weekly drift check manually
docker compose exec api python monitoring/model_monitor.py \
  --week $(date -v-Mon +%Y-%m-%d)  # macOS
  # OR: --week $(date -d 'last monday' +%Y-%m-%d)  # Linux

# Check report
cat reports/model_monitor_$(date +%Y%m%d).json | python3 -m json.tool
```

---

## 4. Adding New Departments or Patients

### Add a new department

1. Add the department code to `ingestion/generate_synthetic_data.py`:
   ```python
   DEPARTMENTS = ["Cardiology", "Internal Medicine", "Pulmonology", "Nephrology", "YOUR_NEW_DEPT"]
   ```

2. Add to the `dim_provider` reference data in `warehouse/schema/star_schema.sql`

3. Re-run ingestion and dbt:
   ```bash
   docker compose exec api python ingestion/generate_synthetic_data.py
   docker compose exec api bash -c "cd warehouse/dbt && dbt run"
   ```

4. Invalidate analytics cache (new department won't appear until cache expires):
   ```bash
   docker compose exec redis redis-cli KEYS "analytics:*" | xargs docker compose exec redis redis-cli DEL
   ```

### Add real patient data (replacing synthetic data)

1. Place EHR CSV exports in `data/raw/`
2. Verify column names match the expected schema in `etl/dags/ehr_pipeline.py`
3. Trigger the ETL pipeline manually (Step 2 above)
4. The pipeline will validate, transform, and load data into the warehouse

---

## 5. Troubleshooting Common Issues

### API not starting (database connection)

```bash
# Check postgres is healthy
docker compose ps postgres
docker compose logs postgres --tail=20

# Test connection manually
docker compose exec postgres pg_isready -U careiq -d careiq_warehouse
```

**Fix**: Wait for postgres to finish initialization (can take 30–60s on first run).

---

### Airflow tasks failing

```bash
# View task logs
docker compose logs airflow-worker --tail=50

# Clear failed task (re-run from that step)
docker compose exec airflow-webserver airflow tasks clear careiq_ehr_pipeline -t load_staging
```

---

### Redis connection refused

```bash
docker compose ps redis
docker compose restart redis

# Verify
docker compose exec redis redis-cli ping  # → PONG
```

---

### MLflow model not loading in API

```bash
# Check model exists in registry
docker compose exec api python3 -c "
import mlflow
mlflow.set_tracking_uri('http://mlflow:5000')
from mlflow import MlflowClient
client = MlflowClient()
versions = client.get_latest_versions('careiq_readmission_v1', stages=['Production'])
print(versions)
"

# If empty — need to promote a model first (Step 3 above)
```

---

### Frontend shows blank pages (mock mode)

```bash
# Verify .env.local
cat frontend/.env.local
# Must have: VITE_USE_MOCK=true

# Restart Vite dev server
docker compose restart frontend
```

---

### Disk space running out (Docker volumes)

```bash
# Check volume sizes
docker system df -v

# Remove unused images (NOT volumes — would delete data)
docker image prune -f

# Clear old MLflow artifacts (if using local filesystem)
docker compose exec mlflow find /mlflow/artifacts -mtime +90 -delete
```

---

### PostgreSQL slow queries

```bash
# Connect and check slow query log
docker compose exec postgres psql -U careiq -d careiq_warehouse -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;
"

# Check missing indexes
docker compose exec postgres psql -U careiq -d careiq_warehouse -c "
SELECT schemaname, tablename, attname, null_frac, avg_width, correlation
FROM pg_stats
WHERE tablename = 'fact_admissions'
ORDER BY null_frac DESC;
"
```
