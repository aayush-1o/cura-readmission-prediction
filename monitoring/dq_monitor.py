"""
monitoring/dq_monitor.py
─────────────────────────────────────────────────────────────────────────────
CareIQ — Data Quality Monitor
Runs after each ETL pipeline execution.

Checks:
  1. Row count anomaly (Z-score vs 30-day rolling average)
  2. Null rate change (>5% increase is a warning; >20% is critical)
  3. Value distribution drift via chi-squared test on key categoricals

Output:
  reports/dq_report_YYYYMMDD.json

Slack Notification:
  Sends summary webhook message on WARNING or CRITICAL findings.

Usage:
  python monitoring/dq_monitor.py [--date YYYY-MM-DD] [--table TABLE]
─────────────────────────────────────────────────────────────────────────────
"""

import argparse
import json
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from scipy import stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
log = logging.getLogger("dq_monitor")

POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://careiq:changeme@localhost:5432/careiq_warehouse",
).replace("+asyncpg", "")

SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")
REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "reports"))

# Severity thresholds
NULL_RATE_WARN = 0.05       # 5% increase triggers warning
NULL_RATE_CRITICAL = 0.20   # 20% increase triggers critical alert
ROW_COUNT_ZSCORE = 3.0      # >3 std dev from 30-day mean → alert
CHI2_P_THRESHOLD = 0.01     # p < 0.01 → distribution shift


MONITORED_TABLES = {
    "fact_admissions": {
        "date_col": "admit_date",
        "nullable_cols": ["readmit_date", "discharge_date"],
        "required_cols": ["admission_id", "patient_key", "admit_date", "readmit_30day_flag"],
        "categorical_cols": ["insurance_type", "department_code", "discharge_disposition"],
    },
    "dim_patient": {
        "date_col": "created_at",
        "nullable_cols": ["ethnicity"],
        "required_cols": ["patient_key", "patient_id", "gender", "age_at_admission"],
        "categorical_cols": ["gender", "race"],
    },
    "dim_diagnosis": {
        "date_col": "created_at",
        "nullable_cols": [],
        "required_cols": ["diagnosis_key", "icd10_code", "primary_diagnosis"],
        "categorical_cols": ["diagnosis_category"],
    },
}


# ─── Database helpers ─────────────────────────────────────────────────────────

def get_connection():
    import psycopg2
    url = POSTGRES_URL.replace("postgresql+asyncpg", "postgresql")
    return psycopg2.connect(url)


def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    conn = get_connection()
    try:
        return pd.read_sql(sql, conn, params=params)
    finally:
        conn.close()


# ─── Check 1: Row count anomaly ───────────────────────────────────────────────

def check_row_count(table: str, date_col: str, check_date: date) -> dict[str, Any]:
    log.info(f"[{table}] Row count check for {check_date}")

    # Today's count
    today_df = query_df(
        f"SELECT COUNT(*) AS cnt FROM {table} WHERE {date_col}::date = %s", (check_date,)
    )
    today_count = int(today_df["cnt"].iloc[0])

    # Rolling 30-day history
    history_df = query_df(
        f"""
        SELECT {date_col}::date AS day, COUNT(*) AS cnt
        FROM {table}
        WHERE {date_col}::date BETWEEN %s AND %s
        GROUP BY 1
        ORDER BY 1
        """,
        (check_date - timedelta(days=31), check_date - timedelta(days=1)),
    )

    if len(history_df) < 5:
        return {
            "check": "row_count",
            "table": table,
            "status": "skip",
            "reason": f"Insufficient history ({len(history_df)} days)",
            "today_count": today_count,
        }

    hist_counts = history_df["cnt"].values
    mean = float(np.mean(hist_counts))
    std = float(np.std(hist_counts))
    z = float((today_count - mean) / std) if std > 0 else 0.0

    severity = "ok"
    if abs(z) > ROW_COUNT_ZSCORE:
        severity = "critical" if abs(z) > ROW_COUNT_ZSCORE * 1.5 else "warning"

    return {
        "check": "row_count",
        "table": table,
        "date": str(check_date),
        "today_count": today_count,
        "30d_mean": round(mean, 1),
        "30d_std": round(std, 1),
        "z_score": round(z, 2),
        "status": severity,
    }


# ─── Check 2: Null rate change ────────────────────────────────────────────────

def check_null_rates(
    table: str,
    required_cols: list[str],
    nullable_cols: list[str],
    check_date: date,
    date_col: str,
) -> list[dict[str, Any]]:
    log.info(f"[{table}] Null rate check")
    results = []
    all_cols = required_cols + nullable_cols

    # Current null rates
    null_exprs = ", ".join(
        f"SUM(CASE WHEN {c} IS NULL THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) AS {c}_null"
        for c in all_cols
    )
    current_df = query_df(
        f"SELECT {null_exprs} FROM {table} WHERE {date_col}::date = %s", (check_date,)
    )

    # Baseline null rates (30-day prior)
    baseline_df = query_df(
        f"SELECT {null_exprs} FROM {table} WHERE {date_col}::date BETWEEN %s AND %s",
        (check_date - timedelta(days=30), check_date - timedelta(days=1)),
    )

    for col in all_cols:
        current_rate = float(current_df[f"{col}_null"].iloc[0] or 0)
        baseline_rate = float(baseline_df[f"{col}_null"].iloc[0] or 0)
        delta = current_rate - baseline_rate
        is_required = col in required_cols

        if is_required and current_rate > 0:
            severity = "critical"
        elif delta > NULL_RATE_CRITICAL:
            severity = "critical"
        elif delta > NULL_RATE_WARN:
            severity = "warning"
        else:
            severity = "ok"

        results.append({
            "check": "null_rate",
            "table": table,
            "column": col,
            "current_null_rate": round(current_rate, 4),
            "baseline_null_rate": round(baseline_rate, 4),
            "delta": round(delta, 4),
            "required": is_required,
            "status": severity,
        })

    return results


# ─── Check 3: Distribution drift (chi-squared) ───────────────────────────────

def check_distributions(
    table: str,
    categorical_cols: list[str],
    check_date: date,
    date_col: str,
) -> list[dict[str, Any]]:
    log.info(f"[{table}] Distribution drift check")
    results = []

    for col in categorical_cols:
        today_df = query_df(
            f"SELECT {col}, COUNT(*) AS cnt FROM {table} WHERE {date_col}::date = %s GROUP BY 1", (check_date,)
        ).set_index(col)

        baseline_df = query_df(
            f"""
            SELECT {col}, COUNT(*) AS cnt FROM {table}
            WHERE {date_col}::date BETWEEN %s AND %s
            GROUP BY 1
            """,
            (check_date - timedelta(days=30), check_date - timedelta(days=1)),
        ).set_index(col)

        if today_df.empty or baseline_df.empty or len(today_df) < 2:
            continue

        all_cats = today_df.index.union(baseline_df.index)
        today_counts = today_df.reindex(all_cats, fill_value=0)["cnt"].values
        baseline_counts = baseline_df.reindex(all_cats, fill_value=0)["cnt"].values

        # Scale baseline to same total as today
        if baseline_counts.sum() > 0:
            baseline_expected = baseline_counts * (today_counts.sum() / baseline_counts.sum())
        else:
            continue

        # Chi-squared test
        chi2, p_value = stats.chisquare(today_counts + 0.5, f_exp=baseline_expected + 0.5)

        severity = "critical" if p_value < CHI2_P_THRESHOLD else "ok"
        results.append({
            "check": "distribution_drift",
            "table": table,
            "column": col,
            "chi2_statistic": round(float(chi2), 4),
            "p_value": round(float(p_value), 6),
            "status": severity,
        })

    return results


# ─── Slack notification ───────────────────────────────────────────────────────

def send_slack(report: dict, check_date: date) -> None:
    if not SLACK_WEBHOOK:
        return

    total = report["summary"]["total_checks"]
    criticals = report["summary"]["critical"]
    warnings = report["summary"]["warnings"]

    if criticals == 0 and warnings == 0:
        emoji, color = "✅", "#36a64f"
        headline = f"All {total} data quality checks passed"
    elif criticals > 0:
        emoji, color = "🚨", "#ff0000"
        headline = f"{criticals} CRITICAL issue(s) found in {total} checks"
    else:
        emoji, color = "⚠️", "#ff9900"
        headline = f"{warnings} warning(s) in {total} checks"

    failing = [r for r in report["results"] if r["status"] in ("critical", "warning")]
    detail = "\n".join(
        f"  • [{r['status'].upper()}] {r['table']}.{r.get('column', '')} — {r['check']}"
        for r in failing[:10]
    )

    payload = {
        "attachments": [{
            "color": color,
            "title": f"{emoji} CareIQ DQ Monitor — {check_date}",
            "text": f"*{headline}*\n{detail}",
            "footer": "CareIQ Data Quality | Run every ETL cycle",
        }]
    }

    try:
        resp = requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
        resp.raise_for_status()
        log.info("Slack notification sent")
    except Exception as e:
        log.warning(f"Slack notification failed: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_checks(check_date: date, tables: list[str] | None = None) -> dict:
    log.info(f"Starting DQ monitor for date: {check_date}")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    all_results = []
    target_tables = tables or list(MONITORED_TABLES.keys())

    for table_name in target_tables:
        cfg = MONITORED_TABLES.get(table_name)
        if not cfg:
            log.warning(f"No config for table '{table_name}', skipping.")
            continue

        try:
            rc = check_row_count(table_name, cfg["date_col"], check_date)
            all_results.append(rc)

            null_results = check_null_rates(
                table_name, cfg["required_cols"], cfg["nullable_cols"], check_date, cfg["date_col"]
            )
            all_results.extend(null_results)

            if cfg.get("categorical_cols"):
                dist_results = check_distributions(
                    table_name, cfg["categorical_cols"], check_date, cfg["date_col"]
                )
                all_results.extend(dist_results)

        except Exception as e:
            log.error(f"Error checking table '{table_name}': {e}")
            all_results.append({
                "check": "table_error",
                "table": table_name,
                "status": "critical",
                "error": str(e),
            })

    criticals = sum(1 for r in all_results if r["status"] == "critical")
    warnings = sum(1 for r in all_results if r["status"] == "warning")

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "check_date": str(check_date),
        "summary": {
            "total_checks": len(all_results),
            "critical": criticals,
            "warnings": warnings,
            "passed": sum(1 for r in all_results if r["status"] == "ok"),
        },
        "results": all_results,
    }

    report_path = REPORTS_DIR / f"dq_report_{check_date.strftime('%Y%m%d')}.json"
    report_path.write_text(json.dumps(report, indent=2))
    log.info(f"Report written to {report_path}")

    if criticals > 0 or warnings > 0:
        send_slack(report, check_date)

    log.info(
        f"Done. {criticals} critical, {warnings} warnings, "
        f"{report['summary']['passed']} passed."
    )
    return report


def main():
    parser = argparse.ArgumentParser(description="CareIQ Data Quality Monitor")
    parser.add_argument("--date", default=str(date.today()), help="Date to check (YYYY-MM-DD)")
    parser.add_argument("--table", nargs="*", help="Table(s) to check (default: all)")
    args = parser.parse_args()

    check_date = date.fromisoformat(args.date)
    report = run_checks(check_date, tables=args.table)

    # Exit non-zero if critical issues found
    sys.exit(1 if report["summary"]["critical"] > 0 else 0)


if __name__ == "__main__":
    main()
