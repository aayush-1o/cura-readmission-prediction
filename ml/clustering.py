"""
CareIQ — Patient Cohort Analyzer (Clustering)
===============================================
Identifies patient clusters for population health management using:
  - KMeans with silhouette-score optimization (auto-select k)
  - UMAP dimensionality reduction for better cluster geometry
  - Automatic cluster naming via dominant feature heuristics
  - Nearest-neighbor "similar patients" lookup

Classes:
    PatientCohortAnalyzer — fit, profile, name, and query patient clusters

Dependencies:
    scikit-learn >= 1.4.0
    umap-learn >= 0.5.6
    pandas, numpy

Output:
    - Cluster assignments saved to patient_clusters table
    - UMAP embeddings saved to ml/artifacts/embeddings/
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

EMBEDDINGS_PATH: Path = Path(os.getenv("EMBEDDINGS_PATH", "./ml/artifacts/embeddings"))
CLUSTER_TABLE: str = "patient_clusters"
RANDOM_SEED: int = 42

# Feature columns used for clustering
CLUSTER_FEATURE_COLS: list[str] = [
    "age",
    "comorbidity_count",
    "charlson_comorbidity_index",
    "has_diabetes",
    "has_hypertension",
    "has_chf",
    "has_copd",
    "has_ckd",
    "has_afib",
    "has_obesity",
    "prior_admissions_12m",
    "prior_admissions_90d",
    "prior_readmissions_1y",
    "prior_icu_stays",
    "high_utilizer_flag",
    "length_of_stay_days",
    "emergency_flag",
    "avg_risk_score",               # if available from fact_predictions
]

# Cluster auto-naming thresholds
NAME_HIGH_AGE: float = 70.0
NAME_HIGH_CCI: float = 4.0
NAME_HIGH_UTIL: float = 2.0         # prior_admissions_12m
NAME_HIGH_READMIT: float = 2.0      # prior_readmissions_1y


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ClusterProfile:
    """Summary statistics and metadata for a single patient cluster."""
    cluster_id: int
    cluster_name: str
    cluster_label: str          # Short human-readable label (for UI chips)
    size: int
    size_pct: float             # Fraction of total patients
    # Key demographic stats
    avg_age: float
    avg_comorbidity_count: float
    avg_cci: float
    avg_risk_score: float
    readmission_rate: float
    avg_los_days: float
    # Dominant characteristics
    top_diagnoses: list[str]
    top_comorbidities: list[str]
    dominant_insurance: str
    dominant_age_group: str
    high_utilizer_pct: float
    # Color token for UI (maps to design system chart colors)
    color_token: str
    # Optional: best interventions for this cohort (linked from association rules)
    recommended_interventions: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Main class
# ─────────────────────────────────────────────────────────────────────────────

class PatientCohortAnalyzer:
    """
    Clusters patients into clinically meaningful cohorts and supports:
    - Optimal k selection via silhouette scores
    - UMAP embedding for 2D visualization
    - Automatic cluster naming
    - Nearest-neighbor "similar patients" lookup

    Usage:
        analyzer = PatientCohortAnalyzer()
        analyzer.load_data(features_df)
        result = analyzer.fit_clusters(n_clusters_range=(3, 10))
        profiles = analyzer.profile_clusters()
        similar = analyzer.get_similar_patients("PAT-XXXX", n=5)
        analyzer.save_assignments()
    """

    def __init__(self) -> None:
        self._features_df: Optional[pd.DataFrame] = None
        self._scaled_features: Optional[np.ndarray] = None
        self._embeddings_2d: Optional[np.ndarray] = None
        self._cluster_labels: Optional[np.ndarray] = None
        self._scaler: Optional[StandardScaler] = None
        self._nn_model: Optional[NearestNeighbors] = None
        self._optimal_k: int = 5
        self._profiles: list[ClusterProfile] = []
        self._patient_ids: Optional[pd.Series] = None

    # ─────────────────────────────────────────────────────────────────────
    # Data loading
    # ─────────────────────────────────────────────────────────────────────

    def load_data(self, features_df: pd.DataFrame) -> None:
        """
        Load the patient feature matrix for clustering.

        Args:
            features_df: DataFrame with patient_id + CLUSTER_FEATURE_COLS.
                         Typically from `int_readmission_features` dbt model,
                         aggregated to one row per patient (latest admission).
        """
        self._features_df = features_df.copy()
        self._patient_ids = features_df["patient_id"] if "patient_id" in features_df.columns else None

        # Select available feature columns (tolerate missing ones)
        available_cols = [col for col in CLUSTER_FEATURE_COLS if col in features_df.columns]
        feature_matrix = features_df[available_cols].copy()

        # Fill missing avg_risk_score with 0 (not yet scored)
        feature_matrix.fillna(0, inplace=True)

        # Scale to zero-mean, unit-variance
        self._scaler = StandardScaler()
        self._scaled_features = self._scaler.fit_transform(feature_matrix)

        logger.info(
            "Loaded %d patients with %d features for clustering.",
            len(features_df), len(available_cols),
        )

    # ─────────────────────────────────────────────────────────────────────
    # Dimensionality reduction
    # ─────────────────────────────────────────────────────────────────────

    def compute_umap_embeddings(
        self,
        n_components: int = 2,
        n_neighbors: int = 15,
        min_dist: float = 0.1,
    ) -> np.ndarray:
        """
        Reduce high-dimensional feature space to 2D using UMAP.

        UMAP preserves both local structure (cluster tightness) and
        global structure (cluster separation) better than PCA or t-SNE
        for mixed-type clinical data.

        Args:
            n_components: Number of output dimensions (2 for visualization).
            n_neighbors: Controls local vs global structure trade-off.
            min_dist: Minimum distance between embedded points.

        Returns:
            (n_patients × n_components) embedding array.
        """
        assert self._scaled_features is not None, "Call load_data() first."

        try:
            import umap
        except ImportError:
            logger.warning(
                "umap-learn not installed. Using PCA fallback. "
                "Install with: pip install umap-learn"
            )
            return self._pca_fallback(n_components)

        logger.info("Computing UMAP embeddings (n_neighbors=%d, min_dist=%.2f)...", n_neighbors, min_dist)
        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            random_state=RANDOM_SEED,
            metric="euclidean",
            n_jobs=-1,
        )
        self._embeddings_2d = reducer.fit_transform(self._scaled_features)
        logger.info("UMAP complete. Embedding shape: %s", self._embeddings_2d.shape)
        return self._embeddings_2d

    def _pca_fallback(self, n_components: int = 2) -> np.ndarray:
        """PCA as a fallback when UMAP is not available."""
        from sklearn.decomposition import PCA
        logger.info("Running PCA dimensionality reduction (fallback).")
        pca = PCA(n_components=n_components, random_state=RANDOM_SEED)
        self._embeddings_2d = pca.fit_transform(self._scaled_features)
        return self._embeddings_2d

    # ─────────────────────────────────────────────────────────────────────
    # Clustering
    # ─────────────────────────────────────────────────────────────────────

    def fit_clusters(
        self,
        n_clusters_range: tuple[int, int] = (3, 10),
        use_embeddings: bool = True,
    ) -> dict[str, Any]:
        """
        Fit KMeans clusters and select optimal k using silhouette score.

        Tries every k in [n_clusters_range[0], n_clusters_range[1]] and
        selects the k that maximizes mean silhouette score.

        Args:
            n_clusters_range: (min_k, max_k) inclusive range to evaluate.
            use_embeddings: If True, cluster on UMAP embeddings (better geometry).
                            If False, cluster on scaled features directly.

        Returns:
            Dict with optimal_k, silhouette_scores, cluster_sizes.
        """
        assert self._scaled_features is not None, "Call load_data() first."

        # Use UMAP embeddings if available and requested
        cluster_input = self._scaled_features
        if use_embeddings:
            if self._embeddings_2d is None:
                self.compute_umap_embeddings()
            cluster_input = self._embeddings_2d   # type: ignore[assignment]

        silhouette_scores: dict[int, float] = {}
        min_k, max_k = n_clusters_range

        logger.info("Evaluating k from %d to %d...", min_k, max_k)
        for k in range(min_k, max_k + 1):
            km = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10)
            labels = km.fit_predict(cluster_input)
            score = silhouette_score(cluster_input, labels, metric="euclidean", sample_size=min(5000, len(cluster_input)))
            silhouette_scores[k] = round(float(score), 4)
            logger.info("  k=%d: silhouette=%.4f", k, score)

        # Select optimal k
        self._optimal_k = max(silhouette_scores, key=silhouette_scores.__getitem__)
        logger.info("Optimal k = %d (silhouette=%.4f)", self._optimal_k, silhouette_scores[self._optimal_k])

        # Final fit with optimal k
        final_km = KMeans(n_clusters=self._optimal_k, random_state=RANDOM_SEED, n_init=20)
        self._cluster_labels = final_km.fit_predict(cluster_input)

        # Fit nearest-neighbor model for similar patient lookup
        self._nn_model = NearestNeighbors(n_neighbors=10, metric="euclidean", n_jobs=-1)
        self._nn_model.fit(cluster_input)

        cluster_sizes = {
            int(k): int((self._cluster_labels == k).sum())
            for k in range(self._optimal_k)
        }
        logger.info("Cluster sizes: %s", cluster_sizes)

        # Save embeddings + labels for visualization
        self._save_embeddings()

        return {
            "optimal_k": self._optimal_k,
            "silhouette_scores": silhouette_scores,
            "best_silhouette": silhouette_scores[self._optimal_k],
            "cluster_sizes": cluster_sizes,
        }

    # ─────────────────────────────────────────────────────────────────────
    # Cluster profiling
    # ─────────────────────────────────────────────────────────────────────

    def profile_clusters(self) -> list[ClusterProfile]:
        """
        Compute summary statistics for each cluster and auto-assign names.

        Returns:
            List of ClusterProfile dataclasses, one per cluster.
        """
        assert self._cluster_labels is not None, "Call fit_clusters() first."
        assert self._features_df is not None

        df = self._features_df.copy()
        df["__cluster_id__"] = self._cluster_labels

        # UI color tokens from the CareIQ design system chart palette
        color_tokens = [
            "var(--chart-1)",   # electric cyan
            "var(--chart-2)",   # emerald
            "var(--chart-3)",   # amber
            "var(--chart-4)",   # violet
            "var(--chart-5)",   # coral
            "var(--chart-6)",   # ice blue
            "var(--chart-7)",   # gold
        ]

        profiles: list[ClusterProfile] = []
        total_patients = len(df)

        for cluster_id in sorted(df["__cluster_id__"].unique()):
            cluster_df = df[df["__cluster_id__"] == cluster_id]
            n = len(cluster_df)

            # --- Compute stats ---
            avg_age = float(cluster_df["age"].mean()) if "age" in cluster_df.columns else 0.0
            avg_cci = float(cluster_df.get("charlson_comorbidity_index", pd.Series([0])).mean())
            avg_comorbidities = float(cluster_df.get("comorbidity_count", pd.Series([0])).mean())
            avg_risk = float(cluster_df.get("avg_risk_score", pd.Series([0])).mean())
            readmit_rate = float(cluster_df.get("readmit_30day_flag", pd.Series([0])).mean())
            avg_los = float(cluster_df.get("length_of_stay_days", pd.Series([0])).mean())
            high_util_pct = float(cluster_df.get("high_utilizer_flag", pd.Series([0])).mean())
            prior_adm = float(cluster_df.get("prior_admissions_12m", pd.Series([0])).mean())
            prior_readmit = float(cluster_df.get("prior_readmissions_1y", pd.Series([0])).mean())

            # Dominant comorbidities
            comorbidity_flags = ["has_diabetes", "has_hypertension", "has_chf",
                                  "has_copd", "has_ckd", "has_afib", "has_obesity"]
            top_comorbidities = sorted(
                [c.replace("has_", "").replace("_", " ").title()
                 for c in comorbidity_flags
                 if c in cluster_df.columns and cluster_df[c].mean() >= 0.3],
                key=lambda c: -cluster_df[f"has_{c.lower().replace(' ', '_')}"].mean()
                              if f"has_{c.lower().replace(' ', '_')}" in cluster_df.columns else 0,
            )[:3]

            # Dominant insurance / age group
            dominant_insurance = (
                cluster_df["insurance_category"].mode()[0]
                if "insurance_category" in cluster_df.columns and len(cluster_df) > 0
                else "Unknown"
            )
            dominant_age_group = (
                cluster_df["age_group"].mode()[0]
                if "age_group" in cluster_df.columns and len(cluster_df) > 0
                else "Unknown"
            )

            # Auto-name
            name, label = self._auto_name_cluster(
                avg_age=avg_age,
                avg_cci=avg_cci,
                prior_admissions=prior_adm,
                prior_readmissions=prior_readmit,
                readmit_rate=readmit_rate,
                top_comorbidities=top_comorbidities,
                cluster_id=cluster_id,
            )

            profiles.append(ClusterProfile(
                cluster_id=int(cluster_id),
                cluster_name=name,
                cluster_label=label,
                size=n,
                size_pct=round(n / total_patients, 4),
                avg_age=round(avg_age, 1),
                avg_comorbidity_count=round(avg_comorbidities, 2),
                avg_cci=round(avg_cci, 2),
                avg_risk_score=round(avg_risk, 4),
                readmission_rate=round(readmit_rate, 4),
                avg_los_days=round(avg_los, 2),
                top_diagnoses=[],               # populated in save/profile step
                top_comorbidities=top_comorbidities,
                dominant_insurance=str(dominant_insurance),
                dominant_age_group=str(dominant_age_group),
                high_utilizer_pct=round(high_util_pct, 4),
                color_token=color_tokens[cluster_id % len(color_tokens)],
            ))

        self._profiles = profiles
        for p in profiles:
            logger.info(
                "Cluster %d: '%s' — n=%d (%.1f%%), avg_age=%.0f, CCI=%.1f, readmit=%.1f%%",
                p.cluster_id, p.cluster_name, p.size,
                p.size_pct * 100, p.avg_age, p.avg_cci, p.readmission_rate * 100,
            )
        return profiles

    @staticmethod
    def _auto_name_cluster(
        avg_age: float,
        avg_cci: float,
        prior_admissions: float,
        prior_readmissions: float,
        readmit_rate: float,
        top_comorbidities: list[str],
        cluster_id: int,
    ) -> tuple[str, str]:
        """
        Assign a descriptive name and short label to a cluster based on dominant features.

        Returns:
            (full_name, short_label) tuple.
        """
        has_chf = any("chf" in c.lower() or "heart failure" in c.lower() for c in top_comorbidities)
        has_copd = any("copd" in c.lower() for c in top_comorbidities)
        has_ckd  = any("ckd" in c.lower() or "kidney" in c.lower() for c in top_comorbidities)
        has_diab = any("diabet" in c.lower() for c in top_comorbidities)

        is_elderly = avg_age >= NAME_HIGH_AGE
        is_high_complexity = avg_cci >= NAME_HIGH_CCI
        is_frequent_user = prior_admissions >= NAME_HIGH_UTIL
        is_high_readmit = prior_readmissions >= NAME_HIGH_READMIT

        if is_elderly and is_high_complexity and is_frequent_user:
            return "Complex Elderly MultiMorbid", "Complex Elderly"
        if is_high_complexity and has_chf and has_ckd:
            return "Cardio-Renal Syndrome", "Cardio-Renal"
        if is_frequent_user and is_high_readmit:
            return "High-Utilization Chronic", "High Utilizer"
        if is_elderly and avg_cci < 2 and prior_admissions <= 1:
            return "Elderly Low-Complexity", "Low-Risk Elderly"
        if avg_age < 50 and avg_cci <= 1 and readmit_rate < 0.10:
            return "Acute Single-Event Young", "Acute Single-Event"
        if has_diab and is_high_complexity:
            return "Diabetic Multimorbid", "Diabetic Multi"
        if has_copd or has_chf:
            return "Chronic Cardiopulmonary", "Cardiopulmonary"
        if not is_elderly and is_high_complexity:
            return "Mid-Age MultiMorbid", "Mid-Age Complex"

        # Generic fallback with cluster number
        return f"Mixed Cohort {cluster_id + 1}", f"Cohort {cluster_id + 1}"

    # ─────────────────────────────────────────────────────────────────────
    # Similar patient lookup
    # ─────────────────────────────────────────────────────────────────────

    def get_similar_patients(
        self,
        patient_id: str,
        n: int = 5,
        only_non_readmitted: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Find n nearest patients in embedding space to the given patient.

        Used in the UI to show: "Similar patients who avoided readmission received..."

        Args:
            patient_id: Business key of the query patient.
            n: Number of similar patients to return.
            only_non_readmitted: If True, only return patients who were NOT readmitted
                                  (used for positive outcome examples).

        Returns:
            List of dicts with patient_id, cluster_name, similarity_distance, readmit_flag.
        """
        assert self._embeddings_2d is not None, "Call fit_clusters() first."
        assert self._patient_ids is not None, "patient_id column required in features_df."

        df = self._features_df.copy()
        df["__cluster_id__"] = self._cluster_labels
        df["__patient_id__"] = self._patient_ids.values

        # Find the query patient's row index
        match = df[df["__patient_id__"] == patient_id]
        if match.empty:
            logger.warning("Patient %s not found in clustering data.", patient_id)
            return []

        query_idx = match.index[0]
        query_embedding = self._embeddings_2d[query_idx : query_idx + 1]

        # Find k+10 neighbors to allow filtering
        n_to_fetch = min(n + 20, len(df) - 1)
        distances, indices = self._nn_model.kneighbors(query_embedding, n_neighbors=n_to_fetch + 1)

        results: list[dict[str, Any]] = []
        for dist, idx in zip(distances[0][1:], indices[0][1:]):   # skip self (distance=0)
            neighbor = df.iloc[idx]
            readmit = bool(neighbor.get("readmit_30day_flag", False))

            if only_non_readmitted and readmit:
                continue

            cluster_id = int(neighbor["__cluster_id__"])
            cluster_name = next(
                (p.cluster_name for p in self._profiles if p.cluster_id == cluster_id),
                f"Cluster {cluster_id}",
            )

            results.append({
                "patient_id": str(neighbor["__patient_id__"]),
                "cluster_id": cluster_id,
                "cluster_name": cluster_name,
                "similarity_distance": round(float(dist), 4),
                "readmitted": readmit,
                "age": float(neighbor.get("age", 0)),
                "charlson_cci": float(neighbor.get("charlson_comorbidity_index", 0)),
                "length_of_stay_days": float(neighbor.get("length_of_stay_days", 0)),
            })

            if len(results) >= n:
                break

        return results

    # ─────────────────────────────────────────────────────────────────────
    # Persistence
    # ─────────────────────────────────────────────────────────────────────

    def save_assignments(self) -> int:
        """
        Persist cluster assignments to the patient_clusters table.

        Returns:
            Number of rows saved.
        """
        assert self._cluster_labels is not None, "Call fit_clusters() first."

        from warehouse.db import bulk_insert_dataframe

        rows = []
        for i, (cluster_id, patient_id) in enumerate(
            zip(self._cluster_labels, self._patient_ids.tolist() if self._patient_ids is not None else range(len(self._cluster_labels)))
        ):
            profile = next(
                (p for p in self._profiles if p.cluster_id == int(cluster_id)),
                None,
            )
            emb_x = float(self._embeddings_2d[i, 0]) if self._embeddings_2d is not None else None
            emb_y = float(self._embeddings_2d[i, 1]) if self._embeddings_2d is not None else None

            rows.append({
                "patient_id": str(patient_id),
                "cluster_id": int(cluster_id),
                "cluster_name": profile.cluster_name if profile else f"Cluster {cluster_id}",
                "cluster_label": profile.cluster_label if profile else f"C{cluster_id}",
                "umap_x": emb_x,
                "umap_y": emb_y,
                "assigned_at": pd.Timestamp.utcnow().isoformat(),
            })

        df = pd.DataFrame(rows)
        n_rows = bulk_insert_dataframe(df, CLUSTER_TABLE, schema="public")
        logger.info("Saved %d cluster assignments to %s.", n_rows, CLUSTER_TABLE)
        return n_rows

    def get_cluster_profiles_as_dict(self) -> list[dict[str, Any]]:
        """Return cluster profiles serialized as JSON-safe dicts."""
        from dataclasses import asdict
        return [asdict(p) for p in self._profiles]

    def _save_embeddings(self) -> None:
        """Save UMAP 2D embeddings + cluster labels to Parquet for visualization."""
        if self._embeddings_2d is None:
            return
        EMBEDDINGS_PATH.mkdir(parents=True, exist_ok=True)
        emb_df = pd.DataFrame(
            self._embeddings_2d,
            columns=["umap_x", "umap_y"],
        )
        if self._patient_ids is not None:
            emb_df["patient_id"] = self._patient_ids.values
        emb_df["cluster_id"] = self._cluster_labels
        output = EMBEDDINGS_PATH / "umap_embeddings.parquet"
        emb_df.to_parquet(output, index=False)
        logger.info("Saved UMAP embeddings to %s", output)


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )

    from warehouse.db import execute_query

    parser = argparse.ArgumentParser(description="CareIQ Patient Cohort Analyzer")
    parser.add_argument("--min-clusters", type=int, default=3)
    parser.add_argument("--max-clusters", type=int, default=8)
    parser.add_argument("--save-db", action="store_true")
    args = parser.parse_args()

    logger.info("Loading features from warehouse...")
    features = execute_query(
        "SELECT * FROM int_readmission_features",
        read_only=True,
    )

    analyzer = PatientCohortAnalyzer()
    analyzer.load_data(features)
    result = analyzer.fit_clusters(n_clusters_range=(args.min_clusters, args.max_clusters))
    profiles = analyzer.profile_clusters()

    logger.info("Clustering complete. Results:\n%s", json.dumps(result, indent=2))
    for p in profiles:
        logger.info(
            "  [C%d] %s — n=%d, readmit=%.1f%%, avg_age=%.0f, CCI=%.1f",
            p.cluster_id, p.cluster_name, p.size,
            p.readmission_rate * 100, p.avg_age, p.avg_cci,
        )

    if args.save_db:
        analyzer.save_assignments()
