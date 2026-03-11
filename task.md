# Phase 6 Task Checklist

## Docker & Infrastructure
- [x] docker-compose.yml (production-grade, all services, health checks, resource limits, network isolation)
- [x] docker-compose.dev.yml (override for hot-reload, debug ports)
- [x] api/Dockerfile (multi-stage, non-root user)
- [x] frontend/Dockerfile (multi-stage: build + nginx serve)
- [x] nginx/nginx.conf (reverse proxy, gzip, security headers, rate limiting)
- [x] nginx/Dockerfile

## CI/CD
- [x] .github/workflows/ci.yml (lint, test, build, integration test)
- [x] .github/workflows/cd.yml (staging + prod deploy with approval gate)

## MLflow
- [x] mlflow/Dockerfile
- [x] scripts/promote_model.py

## Monitoring
- [x] monitoring/dq_monitor.py (data quality checks + Slack alerts)
- [x] monitoring/model_monitor.py (PSI drift detection)

## Documentation
- [x] docs/architecture.md
- [x] docs/ml_model_card.md
- [x] docs/runbook.md
- [x] docs/api.md

## Portfolio
- [x] README.md (rewritten as showcase piece)
- [x] .env.example (updated with MLflow, Slack, GHCR vars)
- [x] metabase/setup.sh
- [x] scripts/promote_model.py

## Final
- [x] handoff.md (final project summary)
