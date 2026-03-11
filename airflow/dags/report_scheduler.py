"""
report_scheduler.py — Airflow DAG for scheduled report generation
===================================================================
Reads report_jobs WHERE is_scheduled = TRUE and schedule_cron matches
the current time window, then triggers report generation for each.

Schedule: every 5 minutes (Airflow checks each job's cron expression
and fires only the ones that match the current window).

Interview talking point:
"This DAG bridges the Airflow scheduler with the FastAPI report queue.
I preferred this architecture over putting cron logic inside FastAPI because
Airflow already handles scheduling, retries, and alerting. The DAG just calls
the same POST /reports/generate endpoint the UI uses — no special scheduler path."
"""

from __future__ import annotations

from datetime import datetime, timezone

from airflow import DAG
from airflow.operators.python import PythonOperator

import requests

API_BASE = "http://localhost:8000/api/v1"
SYSTEM_TOKEN = "{{ var.value.SYSTEM_API_TOKEN }}"   # stored in Airflow Variables


def _should_run_now(cron_expr: str, now: datetime) -> bool:
    """Very simple cron check (minute, hour, *, *, *). Use croniter in production."""
    try:
        parts = cron_expr.strip().split()
        if len(parts) < 2:
            return False
        minute_field, hour_field = parts[0], parts[1]
        m_match = minute_field == "*" or int(minute_field) == now.minute
        h_match = hour_field   == "*" or int(hour_field)   == now.hour
        return m_match and h_match
    except Exception:
        return False


def trigger_scheduled_reports(**context):
    """
    1. Fetch all scheduled job templates from the DB via API
    2. Check each cron expression against current UTC time
    3. POST /reports/generate for each matching job
    """
    now = datetime.now(timezone.utc)
    headers = {"Authorization": f"Bearer {SYSTEM_TOKEN}"}

    # Fetch scheduled templates
    try:
        resp = requests.get(f"{API_BASE}/reports", params={"limit": 100}, headers=headers, timeout=10)
        resp.raise_for_status()
        all_jobs = resp.json()
    except Exception as exc:
        print(f"[report_scheduler] Failed to fetch jobs: {exc}")
        return

    scheduled = [j for j in all_jobs if j.get("is_scheduled") and j.get("schedule_cron")]
    print(f"[report_scheduler] Found {len(scheduled)} scheduled report config(s)")

    triggered = 0
    for job in scheduled:
        cron = job["schedule_cron"]
        if not _should_run_now(cron, now):
            continue

        payload = {
            "report_type":   job["report_type"],
            "formats":       job.get("formats", ["pdf"]),
            "parameters":    job.get("parameters", {}),
            "is_scheduled":  True,
            "schedule_cron": cron,
        }
        try:
            r = requests.post(
                f"{API_BASE}/reports/generate",
                json=payload,
                headers=headers,
                timeout=15,
            )
            r.raise_for_status()
            result = r.json()
            print(f"[report_scheduler] Triggered {job['report_type']} → job_id={result['job_id']}")
            triggered += 1
        except Exception as exc:
            print(f"[report_scheduler] Failed to trigger {job['report_type']}: {exc}")

    print(f"[report_scheduler] Done. {triggered} job(s) triggered.")


with DAG(
    dag_id="report_scheduler",
    description="Trigger scheduled CareIQ reports based on cron expressions stored in report_jobs",
    schedule_interval="*/5 * * * *",   # check every 5 minutes
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["careiq", "reports"],
) as dag:

    trigger = PythonOperator(
        task_id="trigger_scheduled_reports",
        python_callable=trigger_scheduled_reports,
    )
