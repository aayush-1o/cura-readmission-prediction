# ─── Multi-stage API Dockerfile ───────────────────────────────────────────────
# Stage 1: base       — system deps + non-root user
# Stage 2: development — for docker-compose.dev.yml
# Stage 3: production  — optimized, no dev tools
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS base

# Security: non-root user
RUN groupadd --gid 1001 careiq \
    && useradd --uid 1001 --gid careiq --shell /bin/bash --create-home careiq

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (cached layer — only rebuilt if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ─── Development stage ─────────────────────────────────────────────────────────
FROM base AS development

# Dev extras: debugpy, pytest, watchfiles
RUN pip install --no-cache-dir \
    debugpy \
    pytest \
    pytest-asyncio \
    pytest-cov \
    httpx \
    watchfiles

# Source mounted at runtime via docker-compose volume
COPY --chown=careiq:careiq . .
USER careiq

EXPOSE 8000
EXPOSE 5678

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production stage ──────────────────────────────────────────────────────────
FROM base AS production

# Copy source code
COPY --chown=careiq:careiq . .

USER careiq

# Validate the app can import cleanly
RUN python -c "import api.main; print('Import OK')"

EXPOSE 8000

# 4 uvicorn workers in production; WORKERS env var allows override
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-4} --log-level ${LOG_LEVEL:-warning} --access-log --proxy-headers"]
