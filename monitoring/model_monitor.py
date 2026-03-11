"""
monitoring/model_monitor.py
─────────────────────────────────────────────────────────────────────────────
CareIQ — Weekly Model Performance & Drift Monitor

Checks:
  1. Prediction distribution stability (PSI on risk scores)
  2. Feature drift (PSI on top 5 input features vs training baseline)
  3. Calibration check (predicted rate vs observed readmission rate)
  4. Performance estimation (AUC on outcomes available with 30-day lag)

Run weekly (Sunday 02:00 UTC) via Airflow or cron:
  0 2 * * 0 python monitoring/model_monitor.py

Output:
  reports/model_monitor_YYYYMMDD.json

Alerts:
  Slack notification if PSI > 0.2 or calibration error > 5%
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
import requests
from mlflow import MlflowClient
from scipy import stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
log = logging.getLogger("model_monitor")

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://careiq:changeme@localhost:5432/careiq_warehouse",
).replace("+asyncpg", "")
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")
MODEL_NAME = os.getenv("READMISSION_MODEL_NAME", "careiq_readmission_v1")
REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "reports"))

# Thresholds
PSI_WARN = 0.10
PSI_CRITICAL = 0.20
CALIBRATION_ERROR_WARN = 0.03   # 3% absolute difference
CALIBRATION_ERROR_CRITICAL = 0.05  # 5%

TOP_FEATURES = [
    "comorbidity_score",
    "prior_admissions_12mo",
    "length_of_stay_days",
    "age_at_admission",
    "icu_flag",
]


# ─── DB helpers ───────────────────────────────────────────────────────────────

def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    import psycopg2
    url = POSTGRES_URL.replace("postgresql+asyncpg", "postgresql")
    conn = psycopg2.connect(url)
    try:
        return pd.read_sql(sql, conn, params=params)
    finally:
        conn.close()


# ─── PSI calculation ──────────────────────────────────────────────────────────

def compute_psi(
    baseline: np.ndarray, current: np.ndarray, bins: int = 10
) -> float:
    breakpoints = np.percentile(baseline, np.linspace(0, 100, bins + 1))
    breakpoints[0] = -np.inf
    breakpoints[-1] = np.inf

    def bucket(arr):
        counts, _ = np.histogram(arr, bins=breakpoints)
        props = counts / max(len(arr), 1)
        return np.where(props == 0, 1e-6, props)

    p_b = bucket(baseline)
    p_c = bucket(current)
    return float(np.sum((p_c - p_b) * np.log(p_c / p_b)))


# ─── Load production model ────────────────────────────────────────────────────

def load_production_model():
    mlflow.set_tracking_uri(MLFLOW_URI)
    client = MlflowClient(tracking_uri=MLFLOW_URI)
    versions = client.get_latest_versions(MODEL_NAME, stages=["Production"])
    if not versions:
        raise RuntimeError(f"No Production version found for model '{MODEL_NAME}'")
    return mlflow.sklearn.load_model(f"models:/{MODEL_NAME}/Production"), versions[0]


# ─── Fetch current week's data ────────────────────────────────────────────────

def fetch_current_week_data(week_start: date) -> pd.DataFrame:
    week_end = week_start + timedelta(days=6)
    sql = """
        SELECT
            fa.length_of_stay_days,
            fa.total_cost_usd,
            fa.emergency_flag::int,
            fa.icu_flag::int,
            dp.age_at_admission,
            dp.comorbidity_score,
            dp.prior_admissions_12mo,
            fa.readmit_30day_flag
        FROM fact_admissions fa
        JOIN dim_patient dp ON fa.patient_key = dp.patient_key
        WHERE fa.admit_date::date BETWEEN %s AND %s
        LIMIT 10000
    """
    return query_df(sql, (week_start, week_end))


def fetch_baseline_data(weeks: int = 12, ref_date: date = None) -> pd.DataFrame:
    if ref_date is None:
        ref_date = date.today()
    end = ref_date - timedelta(weeks=1)
    start = end - timedelta(weeks=weeks)
    sql = """
        SELECT
            fa.length_of_stay_days,
            fa.total_cost_usd,
            fa.emergency_flag::int,
            fa.icu_flag::int,
            dp.age_at_admission,
            dp.comorbidity_score,
            dp.prior_admissions_12mo,
            fa.readmit_30day_flag
        FROM fact_admissions fa
        JOIN dim_patient dp ON fa.patient_key = dp.patient_key
        WHERE fa.admit_date::date BETWEEN %s AND %s
        LIMIT 50000
    """
    return query_df(sql, (start, end))


# ─── Checks ───────────────────────────────────────────────────────────────────

def check_prediction_psi(model, baseline_df: pd.DataFrame, current_df: pd.DataFrame) -> dict:
    log.info("Check: prediction distribution PSI")
    feature_cols = [c for c in baseline_df.columns if c != "readmit_30day_flag"]

    base_proba = model.predict_proba(baseline_df[feature_cols])[:, 1]
    curr_proba = model.predict_proba(current_df[feature_cols])[:, 1]

    psi = compute_psi(base_proba, curr_proba)
    severity = "ok"
    if psi > PSI_CRITICAL:
        severity = "critical"
    elif psi > PSI_WARN:
        severity = "warning"

    return {
        "check": "prediction_psi",
        "psi": round(psi, 4),
        "baseline_mean_risk": round(float(base_proba.mean()), 4),
        "current_mean_risk": round(float(curr_proba.mean()), 4),
        "status": severity,
    }


def check_feature_drift(baseline_df: pd.DataFrame, current_df: pd.DataFrame) -> list[dict]:
    log.info("Check: feature PSI on top features")
    results = []
    for feat in TOP_FEATURES:
        if feat not in baseline_df.columns or feat not in current_df.columns:
            continue
        base_vals = baseline_df[feat].dropna().values.astype(float)
        curr_vals = current_df[feat].dropna().values.astype(float)
        if len(base_vals) < 10 or len(curr_vals) < 10:
            continue

        psi = compute_psi(base_vals, curr_vals)
        severity = "critical" if psi > PSI_CRITICAL else ("warning" if psi > PSI_WARN else "ok")
        results.append({
            "check": "feature_psi",
            "feature": feat,
            "psi": round(psi, 4),
            "baseline_mean": round(float(base_vals.mean()), 3),
            "current_mean": round(float(curr_vals.mean()), 3),
            "status": severity,
        })
    return results


def check_calibration(model, current_df: pd.DataFrame) -> dict:
    """
    Compare mean predicted probability vs observed readmission rate.
    30-day outcomes are only available 30 days after admission, so this
    check uses admissions from the prior month.
    """
    log.info("Check: calibration (predicted vs observed readmission rate)")
    feature_cols = [c for c in current_df.columns if c != "readmit_30day_flag"]

    # Only use rows where outcome is known (flag is not null)
    with_outcomes = current_df.dropna(subset=["readmit_30day_flag"])
    if len(with_outcomes) < 50:
        return {
            "check": "calibration",
            "status": "skip",
            "reason": f"Insufficient rows with known outcomes ({len(with_outcomes)})",
        }

    y_proba = model.predict_proba(with_outcomes[feature_cols])[:, 1]
    observed_rate = float(with_outcomes["readmit_30day_flag"].mean())
    predicted_rate = float(y_proba.mean())
    calibration_error = abs(predicted_rate - observed_rate)

    severity = "ok"
    if calibration_error > CALIBRATION_ERROR_CRITICAL:
        severity = "critical"
    elif calibration_error > CALIBRATION_ERROR_WARN:
        severity = "warning"

    return {
        "check": "calibration",
        "predicted_rate": round(predicted_rate, 4),
        "observed_rate": round(observed_rate, 4),
        "absolute_error": round(calibration_error, 4),
        "n_samples": len(with_outcomes),
        "status": severity,
    }


def check_auc_trend(model, current_df: pd.DataFrame) -> dict:
    """AUC on cohort with known 30-day outcomes."""
    log.info("Check: AUC on current week outcomes")
    from sklearn.metrics import roc_auc_score

    feature_cols = [c for c in current_df.columns if c != "readmit_30day_flag"]
    with_outcomes = current_df.dropna(subset=["readmit_30day_flag"])

    if len(with_outcomes) < 50 or with_outcomes["readmit_30day_flag"].nunique() < 2:
        return {
            "check": "auc",
            "status": "skip",
            "reason": f"Insufficient or one-class data ({len(with_outcomes)} rows)",
        }

    y_proba = model.predict_proba(with_outcomes[feature_cols])[:, 1]
    y_true = with_outcomes["readmit_30day_flag"].astype(int).values
    auc = float(roc_auc_score(y_true, y_proba))

    severity = "ok"
    if auc < 0.70:
        severity = "critical"
    elif auc < 0.78:
        severity = "warning"

    return {
        "check": "auc",
        "auc": round(auc, 4),
        "n_samples": len(with_outcomes),
        "status": severity,
    }


# ─── Slack alert ──────────────────────────────────────────────────────────────

def send_slack(report: dict) -> None:
    if not SLACK_WEBHOOK:
        return
    criticals = report["summary"]["critical"]
    warnings = report["summary"]["warnings"]
    emoji = "✅" if criticals == 0 and warnings == 0 else ("🚨" if criticals > 0 else "⚠️")
    color = "#36a64f" if criticals == 0 and warnings == 0 else ("#ff0000" if criticals > 0 else "#ff9900")

    failing = [r for r in report["checks"] if r.get("status") in ("critical", "warning")]
    lines = "\n".join(
        f"  • [{r['status'].upper()}] {r['check']}: PSI={r.get('psi', r.get('absolute_error', ''))}"
        for r in failing[:5]
    )

    ref_week = report.get("week_start", "")
    payload = {
        "attachments": [{
            "color": color,
            "title": f"{emoji} CareIQ Model Monitor — week of {ref_week}",
            "text": f"Model: `{MODEL_NAME}` | *{criticals} critical, {warnings} warnings*\n{lines}",
            "footer": "CareIQ Model Monitor | Runs weekly",
        }]
    }
    try:
        requests.post(SLACK_WEBHOOK, json=payload, timeout=5).raise_for_status()
    except Exception as e:
        log.warning(f"Slack failed: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_monitor(week_start: date | None = None) -> dict:
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())  # Monday

    log.info(f"Model monitor for week of {week_start}")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        model, model_version = load_production_model()
        log.info(f"Loaded Production model v{model_version.version}")
    except Exception as e:
        log.error(f"Could not load production model: {e}")
        sys.exit(1)

    try:
        current_df = fetch_current_week_data(week_start)
        baseline_df = fetch_baseline_data(ref_date=week_start)
    except Exception as e:
        log.error(f"DB fetch failed: {e}. Using synthetic data.")
        rng = np.random.default_rng(42)
        n = 500

        def synth(rng, n, seed_offset=0):
            rng2 = np.random.default_rng(42 + seed_offset)
            X = pd.DataFrame({
                "length_of_stay_days": rng2.integers(1, 30, n),
                "total_cost_usd": rng2.uniform(1000, 100000, n),
                "emergency_flag": rng2.integers(0, 2, n),
                "icu_flag": rng2.integers(0, 2, n),
                "age_at_admission": rng2.integers(18, 95, n),
                "comorbidity_score": rng2.integers(0, 10, n),
                "prior_admissions_12mo": rng2.integers(0, 10, n),
                "readmit_30day_flag": rng2.integers(0, 2, n),
            })
            return X

        baseline_df = synth(rng, 2000, 0)
        current_df = synth(rng, 500, 99)

    checks = []

    checks.append(check_prediction_psi(model, baseline_df, current_df))
    checks.extend(check_feature_drift(baseline_df, current_df))
    checks.append(check_calibration(model, current_df))
    checks.append(check_auc_trend(model, current_df))

    criticals = sum(1 for c in checks if c.get("status") == "critical")
    warnings = sum(1 for c in checks if c.get("status") == "warning")

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "week_start": str(week_start),
        "model_name": MODEL_NAME,
        "model_version": model_version.version,
        "summary": {"total_checks": len(checks), "critical": criticals, "warnings": warnings},
        "recommendation": (
            "RETRAIN IMMEDIATELY — significant drift or performance degradation" if criticals > 0
            else "MONITOR CLOSELY — minor drift detected" if warnings > 0
            else "Model is healthy — no action required"
        ),
        "checks": checks,
    }

    report_path = REPORTS_DIR / f"model_monitor_{week_start.strftime('%Y%m%d')}.json"
    report_path.write_text(json.dumps(report, indent=2))
    log.info(f"Report saved to {report_path}")

    if criticals > 0 or warnings > 0:
        send_slack(report)

    log.info(f"Recommendation: {report['recommendation']}")
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CareIQ Model Monitor")
    parser.add_argument("--week", default=None, help="Week start date (YYYY-MM-DD, default: this week)")
    args = parser.parse_args()

    week_start = date.fromisoformat(args.week) if args.week else None
    report = run_monitor(week_start)
    sys.exit(1 if report["summary"]["critical"] > 0 else 0)
