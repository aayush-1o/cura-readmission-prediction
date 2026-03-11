FROM python:3.11-slim

RUN pip install --no-cache-dir mlflow==2.10.2 psycopg2-binary boto3

# Create artifact store directory
RUN mkdir -p /mlflow/artifacts /mlflow/models

# Non-root user
RUN useradd --uid 1001 --create-home mlflow
RUN chown -R mlflow:mlflow /mlflow
USER mlflow

WORKDIR /mlflow

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl --fail http://localhost:5000/health || exit 1

# MLFLOW_BACKEND_STORE_URI and MLFLOW_ARTIFACT_ROOT set via docker-compose env
CMD ["sh", "-c", \
    "mlflow server \
    --backend-store-uri ${MLFLOW_BACKEND_STORE_URI} \
    --default-artifact-root ${MLFLOW_ARTIFACT_ROOT:-/mlflow/artifacts} \
    --host 0.0.0.0 \
    --port 5000 \
    --workers ${MLFLOW_WORKERS:-2} \
    --serve-artifacts"]
