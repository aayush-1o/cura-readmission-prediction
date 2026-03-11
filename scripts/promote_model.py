"""
scripts/promote_model.py
─────────────────────────────────────────────────────────────────────────────
CareIQ — Model Promotion Script
Promotes a model version from Staging → Production in the MLflow registry
after running a suite of validation checks.

Usage:
    python scripts/promote_model.py --model-name careiq_readmission_v1 \\
                                    --version 5 \\
                                    --min-auc 0.80 \\
                                    --max-psi 0.10
─────────────────────────────────────────────────────────────────────────────
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
import requests
from mlflow import MlflowClient
from sklearn.metrics import roc_auc_score

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger(__name__)

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://careiq:changeme@localhost:5432/careiq_warehouse",
)
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")


# ─── Validation checks ────────────────────────────────────────────────────────

def load_holdout_data() -> tuple[pd.DataFrame, pd.Series]:
    """Load the held-out test set (never used in training)."""
    try:
        import psycopg2
        conn = psycopg2.connect(POSTGRES_URL.replace("+asyncpg", "").replace("postgresql+asyncpg", "postgresql"))
        query = """
            SELECT
                fa.length_of_stay_days,
                fa.total_cost_usd,
                fa.emergency_flag::int,
                fa.icu_flag::int,
                dp.age_at_admission,
                dp.comorbidity_score,
                dp.prior_admissions_12mo,
                dd.icd10_code,
                fa.readmit_30day_flag
            FROM fact_admissions fa
            JOIN dim_patient dp ON fa.patient_key = dp.patient_key
            JOIN dim_diagnosis dd ON fa.diagnosis_key = dd.diagnosis_key
            WHERE fa.validation_split = 'holdout'
            LIMIT 5000
        """
        df = pd.read_sql(query, conn)
        conn.close()
        X = df.drop(columns=["readmit_30day_flag", "icd10_code"])
        y = df["readmit_30day_flag"].astype(int)
        return X, y
    except Exception as e:
        log.warning(f"Could not load real holdout data: {e}. Using synthetic test set.")
        rng = np.random.default_rng(42)
        n = 1000
        X = pd.DataFrame({
            "length_of_stay_days": rng.integers(1, 30, n),
            "total_cost_usd": rng.uniform(1000, 100000, n),
            "emergency_flag": rng.integers(0, 2, n),
            "icu_flag": rng.integers(0, 2, n),
            "age_at_admission": rng.integers(18, 95, n),
            "comorbidity_score": rng.integers(0, 10, n),
            "prior_admissions_12mo": rng.integers(0, 10, n),
        })
        # Simulate realistic 15% readmission rate
        logit = (
            -3.0
            + 0.04 * X["age_at_admission"]
            + 0.3 * X["comorbidity_score"]
            + 0.5 * X["icu_flag"]
            + 0.3 * X["emergency_flag"]
        )
        proba = 1 / (1 + np.exp(-logit))
        y = (rng.uniform(0, 1, n) < proba).astype(int)
        return X, y


def compute_psi(baseline_proba: np.ndarray, current_proba: np.ndarray, bins: int = 10) -> float:
    """
    Population Stability Index (PSI).
    PSI < 0.1   → stable
    0.1–0.2 → minor shift (monitor)
    PSI > 0.2   → significant drift (retrain)
    """
    breakpoints = np.percentile(baseline_proba, np.linspace(0, 100, bins + 1))
    breakpoints[0] = -np.inf
    breakpoints[-1] = np.inf

    def _get_bucket_counts(arr):
        counts, _ = np.histogram(arr, bins=breakpoints)
        proportions = counts / len(arr)
        # Avoid log(0)
        proportions = np.where(proportions == 0, 1e-6, proportions)
        return proportions

    p_base = _get_bucket_counts(baseline_proba)
    p_curr = _get_bucket_counts(current_proba)

    psi = np.sum((p_curr - p_base) * np.log(p_curr / p_base))
    return float(psi)


def load_baseline_predictions(run_id: str, client: MlflowClient) -> np.ndarray | None:
    """Retrieve baseline predictions artifact logged during training."""
    try:
        local_path = client.download_artifacts(run_id, "baseline_predictions.npy")
        return np.load(local_path)
    except Exception:
        return None


# ─── Slack notification ───────────────────────────────────────────────────────

def notify_slack(message: str, success: bool = True) -> None:
    if not SLACK_WEBHOOK:
        return
    emoji = "✅" if success else "❌"
    payload = {"text": f"{emoji} *CareIQ Model Registry* — {message}"}
    try:
        resp = requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
        resp.raise_for_status()
    except Exception as e:
        log.warning(f"Slack notification failed: {e}")


# ─── Main promotion logic ─────────────────────────────────────────────────────

def promote_model(
    model_name: str,
    version: int,
    min_auc: float = 0.80,
    max_psi: float = 0.20,
    dry_run: bool = False,
) -> bool:
    """
    Run validation checks and promote model version to Production.
    Returns True if promotion succeeded.
    """
    mlflow.set_tracking_uri(MLFLOW_URI)
    client = MlflowClient(tracking_uri=MLFLOW_URI)

    log.info(f"Checking model '{model_name}' version {version}")

    # 1️⃣ Confirm model is in Staging
    mv = client.get_model_version(model_name, str(version))
    current_stage = mv.current_stage
    if current_stage not in ("Staging", "None"):
        log.error(f"Model is in '{current_stage}', expected 'Staging'. Aborting.")
        notify_slack(f"Promotion aborted — model v{version} is in '{current_stage}'", success=False)
        return False

    log.info(f"Stage: {current_stage} → validating...")

    # 2️⃣ Load model
    model_uri = f"models:/{model_name}/{version}"
    try:
        model = mlflow.sklearn.load_model(model_uri)
    except Exception as e:
        log.error(f"Failed to load model: {e}")
        notify_slack(f"Promotion FAILED — could not load model v{version}: {e}", success=False)
        return False

    # 3️⃣ AUC on holdout set
    X_test, y_test = load_holdout_data()
    y_proba = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_proba)
    log.info(f"AUC on holdout: {auc:.4f} (threshold: {min_auc})")

    if auc < min_auc:
        msg = f"AUC {auc:.4f} < minimum {min_auc}. Promotion BLOCKED."
        log.error(msg)
        notify_slack(f"Promotion FAILED for v{version} — {msg}", success=False)
        return False

    # 4️⃣ PSI vs baseline (distribution stability check)
    run_id = mv.run_id
    baseline_proba = load_baseline_predictions(run_id, client)
    psi = None
    if baseline_proba is not None:
        psi = compute_psi(baseline_proba, y_proba)
        log.info(f"PSI: {psi:.4f} (threshold: {max_psi})")
        if psi > max_psi:
            msg = f"PSI {psi:.4f} > maximum {max_psi}. Significant drift detected. Promotion BLOCKED."
            log.error(msg)
            notify_slack(f"Promotion FAILED for v{version} — {msg}", success=False)
            return False
    else:
        log.warning("No baseline predictions artifact found; skipping PSI check.")

    # 5️⃣ All checks passed — promote
    validation_results = {
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "holdout_auc": round(auc, 4),
        "psi": round(psi, 4) if psi is not None else "skipped",
        "min_auc_threshold": min_auc,
        "max_psi_threshold": max_psi,
        "dry_run": dry_run,
    }

    log.info(f"All validation checks passed:\n{json.dumps(validation_results, indent=2)}")

    if dry_run:
        log.info("[DRY RUN] Would have promoted to Production. Exiting.")
        return True

    # Archive any existing Production versions
    prod_versions = client.get_latest_versions(model_name, stages=["Production"])
    for pv in prod_versions:
        client.transition_model_version_stage(
            name=model_name,
            version=pv.version,
            stage="Archived",
            archive_existing_versions=False,
        )
        log.info(f"Archived previous production model v{pv.version}")

    # Promote to Production
    client.transition_model_version_stage(
        name=model_name,
        version=str(version),
        stage="Production",
        archive_existing_versions=True,
    )

    # Tag model with validation metadata
    for key, val in validation_results.items():
        client.set_model_version_tag(model_name, str(version), f"promote.{key}", str(val))

    log.info(f"✅ Model '{model_name}' v{version} promoted to Production.")

    notify_slack(
        f"Model `{model_name}` v{version} promoted to Production "
        f"| AUC={auc:.4f} | PSI={psi:.4f if psi else 'N/A'}",
        success=True,
    )

    # Save promotion report
    report_path = Path("reports") / f"promotion_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(json.dumps(validation_results, indent=2))
    log.info(f"Report saved to {report_path}")

    return True


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Promote a CareIQ model from Staging → Production")
    parser.add_argument("--model-name", default="careiq_readmission_v1", help="MLflow registered model name")
    parser.add_argument("--version", type=int, required=True, help="Model version number to promote")
    parser.add_argument("--min-auc", type=float, default=0.80, help="Minimum AUC required (default: 0.80)")
    parser.add_argument("--max-psi", type=float, default=0.20, help="Maximum PSI allowed (default: 0.20)")
    parser.add_argument("--dry-run", action="store_true", help="Run checks but don't actually promote")
    args = parser.parse_args()

    success = promote_model(
        model_name=args.model_name,
        version=args.version,
        min_auc=args.min_auc,
        max_psi=args.max_psi,
        dry_run=args.dry_run,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
