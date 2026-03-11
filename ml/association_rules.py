"""
CareIQ — Association Rule Mining (Care-Path Recommendations)
=============================================================
Mines Apriori association rules from historical admission data to discover:

  1. Diagnosis co-occurrence patterns (which conditions cluster together)
  2. Intervention effectiveness rules (which procedures correlate with
     non-readmission in similar patients)

These rules form the evidence base for the recommendation engine.

Classes:
    CarePathRuleMiner — mines, scores, serves, and persists rules

Dependencies:
    mlxtend >= 0.23.0
    pandas, numpy, sqlalchemy (from warehouse.db)

Background reading:
    Agrawal & Srikant, 1994 — original Apriori paper
    Confidence = P(consequent | antecedent)
    Lift       = confidence / P(consequent alone) — values >1 are meaningful
    Conviction = (1 - P(c)) / (1 - confidence)   — directional strength
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

from warehouse.db import bulk_insert_dataframe, execute_query

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

RULES_TABLE: str = "care_path_rules"
RULES_OUTPUT_PATH: Path = Path(os.getenv("RULES_OUTPUT_PATH", "./ml/artifacts/rules"))

# Default mining parameters (overridable via env)
DEFAULT_MIN_SUPPORT: float = float(os.getenv("RULES_MIN_SUPPORT", "0.01"))       # 1%
DEFAULT_MIN_CONFIDENCE: float = float(os.getenv("RULES_MIN_CONFIDENCE", "0.30")) # 30%
DEFAULT_MIN_LIFT: float = float(os.getenv("RULES_MIN_LIFT", "1.1"))              # Slightly above chance
TOP_N_RECOMMENDATIONS: int = 5


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AssociationRule:
    """A single mined association rule with all metrics."""
    rule_id: Optional[int]
    antecedents: frozenset[str]
    consequent: str
    support: float
    confidence: float
    lift: float
    conviction: float
    evidence_count: int
    rule_type: str          # 'diagnosis_association' | 'intervention_effectiveness'
    created_at: datetime


@dataclass
class Recommendation:
    """A single care-path recommendation for a patient."""
    action: str
    rationale: str
    confidence: float
    lift: float
    evidence_count: int
    rule_type: str
    antecedents_matched: list[str]
    priority_score: float   # lift × confidence × log(evidence_count)


# ─────────────────────────────────────────────────────────────────────────────
# Main class
# ─────────────────────────────────────────────────────────────────────────────

class CarePathRuleMiner:
    """
    Mines association rules from admission histories to generate care-path recommendations.

    Two rule types are mined:
      - diagnosis_association: What diagnoses co-occur (→ risk flags)
      - intervention_effectiveness: What procedures correlate with non-readmission

    Usage:
        miner = CarePathRuleMiner()
        miner.load_data()
        dx_rules = miner.mine_diagnosis_associations()
        intv_rules = miner.mine_intervention_effectiveness()
        miner.save_rules_to_db()
        recs = miner.get_recommendations_for_patient(
            diagnosis_codes=["I50.9", "E11.9"],
            risk_factors=["has_chf", "high_utilizer"]
        )
    """

    def __init__(self) -> None:
        self._admissions_df: Optional[pd.DataFrame] = None
        self._diagnoses_df: Optional[pd.DataFrame] = None
        self._procedures_df: Optional[pd.DataFrame] = None
        self._dx_rules: Optional[pd.DataFrame] = None        # mined diagnosis rules
        self._intv_rules: Optional[pd.DataFrame] = None      # mined intervention rules
        self._all_rules: list[AssociationRule] = []

    # ─────────────────────────────────────────────────────────────────────
    # Data loading
    # ─────────────────────────────────────────────────────────────────────

    def load_data(
        self,
        admissions_df: Optional[pd.DataFrame] = None,
        diagnoses_df: Optional[pd.DataFrame] = None,
        procedures_df: Optional[pd.DataFrame] = None,
    ) -> None:
        """
        Load admission, diagnosis, and procedure data.

        Accepts pre-loaded DataFrames (for testing / offline mode) or fetches
        from the data warehouse via SQLAlchemy.

        Args:
            admissions_df: Pre-loaded admissions DataFrame.
            diagnoses_df: Pre-loaded diagnoses DataFrame (one row per code per admission).
            procedures_df: Pre-loaded procedures DataFrame.
        """
        if admissions_df is not None:
            self._admissions_df = admissions_df
            self._diagnoses_df = diagnoses_df
            self._procedures_df = procedures_df
            logger.info("Loaded data from provided DataFrames.")
            return

        logger.info("Fetching data from warehouse...")
        self._admissions_df = execute_query(
            """
            SELECT
                fa.admission_id,
                fa.patient_key,
                fa.readmit_30day_flag,
                fa.length_of_stay_days,
                da.discharge_disposition_key
            FROM fact_admissions fa
            """,
            read_only=True,
        )
        self._diagnoses_df = execute_query(
            """
            SELECT
                bad.admission_id,
                dd.icd10_code,
                dd.category AS diagnosis_category,
                bad.diagnosis_type
            FROM bridge_admission_diagnoses bad
            JOIN dim_diagnosis dd ON bad.diagnosis_key = dd.diagnosis_key
            JOIN fact_admissions fa ON bad.admission_key = fa.admission_key
            """,
            read_only=True,
        )
        self._procedures_df = execute_query(
            """
            SELECT bap.admission_id, dp.cpt_code, dp.procedure_category
            FROM bridge_admission_procedures bap
            JOIN dim_procedure dp ON bap.procedure_key = dp.procedure_key
            """,
            read_only=True,
        )
        logger.info(
            "Loaded %d admissions, %d diagnoses, %d procedures.",
            len(self._admissions_df),
            len(self._diagnoses_df) if self._diagnoses_df is not None else 0,
            len(self._procedures_df) if self._procedures_df is not None else 0,
        )

    # ─────────────────────────────────────────────────────────────────────
    # Transaction encoding helper
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_transaction_matrix(
        baskets: list[list[str]],
    ) -> tuple[pd.DataFrame, list[str]]:
        """
        Convert a list of item baskets into a boolean one-hot DataFrame for Apriori.

        Args:
            baskets: List of admission baskets (each basket = list of item strings).

        Returns:
            (one_hot_df, column_names) tuple.
        """
        te = TransactionEncoder()
        te_array = te.fit_transform(baskets)
        df = pd.DataFrame(te_array, columns=te.columns_)
        return df, list(te.columns_)

    # ─────────────────────────────────────────────────────────────────────
    # Task 1: Diagnosis association rules
    # ─────────────────────────────────────────────────────────────────────

    def mine_diagnosis_associations(
        self,
        min_support: float = DEFAULT_MIN_SUPPORT,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
        min_lift: float = DEFAULT_MIN_LIFT,
    ) -> pd.DataFrame:
        """
        Mine association rules between diagnosis codes across admissions.

        Basket = one admission's set of ICD-10 codes.
        Example rule: {I50.9, E11.9} → {N18.5} (CHF+Diabetes → CKD)
          support=0.04, confidence=0.55, lift=3.2

        Args:
            min_support: Minimum fraction of admissions containing the itemset.
            min_confidence: Min P(consequent | antecedent).
            min_lift: Min lift threshold (>1 = positively correlated).

        Returns:
            DataFrame of rules with support, confidence, lift, conviction metrics.
        """
        assert self._diagnoses_df is not None, "Call load_data() first."

        logger.info(
            "Mining diagnosis associations (min_support=%.3f, min_confidence=%.2f)...",
            min_support, min_confidence,
        )

        # Build baskets: one basket per admission, items = ICD-10 codes
        baskets: list[list[str]] = (
            self._diagnoses_df
            .groupby("admission_id")["icd10_code"]
            .apply(list)
            .tolist()
        )
        logger.info("  Built %d baskets (admissions with diagnoses).", len(baskets))

        one_hot, _ = self._build_transaction_matrix(baskets)

        # Run Apriori frequent itemset mining
        frequent_itemsets = apriori(
            one_hot,
            min_support=min_support,
            use_colnames=True,
            max_len=4,          # Max 4 diagnoses in the antecedent
            verbose=0,
        )
        logger.info("  Found %d frequent itemsets.", len(frequent_itemsets))

        if frequent_itemsets.empty:
            logger.warning("No frequent itemsets found. Try lowering min_support.")
            return pd.DataFrame()

        # Generate association rules
        rules = association_rules(
            frequent_itemsets,
            metric="confidence",
            min_threshold=min_confidence,
        )
        rules = rules[rules["lift"] >= min_lift].copy()

        # Add metadata
        rules["rule_type"] = "diagnosis_association"
        rules["evidence_count"] = (rules["support"] * len(baskets)).round().astype(int)
        rules["consequent"] = rules["consequents"].apply(
            lambda x: list(x)[0] if len(x) == 1 else str(list(x))
        )
        rules["antecedent_items"] = rules["antecedents"].apply(lambda x: sorted(list(x)))

        # Compute conviction (directional strength)
        rules["conviction"] = rules.apply(
            lambda r: (
                (1 - r["consequent support"]) / (1 - r["confidence"])
                if r["confidence"] < 1.0 else np.inf
            ),
            axis=1,
        )

        logger.info(
            "  Mined %d diagnosis association rules (lift >= %.1f).",
            len(rules), min_lift,
        )
        self._dx_rules = rules
        self._all_rules.extend(self._rules_df_to_dataclass(rules, "diagnosis_association"))
        return rules

    # ─────────────────────────────────────────────────────────────────────
    # Task 2: Intervention effectiveness rules
    # ─────────────────────────────────────────────────────────────────────

    def mine_intervention_effectiveness(
        self,
        min_support: float = 0.005,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    ) -> pd.DataFrame:
        """
        Mine rules linking diagnoses + procedures to non-readmission outcomes.

        Basket construction:
          - Only admissions where readmit_30day_flag = FALSE (successful outcomes)
          - Items = ICD-10 codes + CPT codes + 'NO_READMIT' (outcome sentinel)
          - Rules with consequent='NO_READMIT' represent effective care paths

        Example rule:
          {I50.9, 93306 (echo), home_health_referral} → NO_READMIT
          confidence=0.78, lift=2.1

        Args:
            min_support: Lower threshold since procedure combinations are rarer.
            min_confidence: Minimum confidence for effectiveness rules.

        Returns:
            DataFrame of intervention effectiveness rules.
        """
        assert self._admissions_df is not None, "Call load_data() first."

        logger.info(
            "Mining intervention effectiveness rules (min_support=%.4f)...", min_support
        )

        # Filter to successful outcomes only
        successful_adm_ids = set(
            self._admissions_df[
                self._admissions_df["readmit_30day_flag"] == False
            ]["admission_id"].tolist()
        )

        baskets: list[list[str]] = []

        # Combine diagnoses + procedures into one basket per admission
        for adm_id in successful_adm_ids:
            items: list[str] = []

            if self._diagnoses_df is not None:
                dx_items = self._diagnoses_df[
                    self._diagnoses_df["admission_id"] == adm_id
                ]["icd10_code"].tolist()
                items.extend([f"DX:{code}" for code in dx_items])

            if self._procedures_df is not None:
                proc_items = self._procedures_df[
                    self._procedures_df["admission_id"] == adm_id
                ]["cpt_code"].tolist()
                items.extend([f"CPT:{code}" for code in proc_items])

            # Sentinel item indicating successful outcome (no readmission)
            items.append("NO_READMIT")

            if len(items) >= 2:
                baskets.append(items)

        logger.info(
            "  Built %d baskets from successful (non-readmitted) admissions.", len(baskets)
        )

        if not baskets:
            logger.warning("No successful admissions found.")
            return pd.DataFrame()

        one_hot, columns = self._build_transaction_matrix(baskets)

        frequent_itemsets = apriori(
            one_hot,
            min_support=min_support,
            use_colnames=True,
            max_len=5,
            verbose=0,
        )

        if frequent_itemsets.empty:
            logger.warning("No frequent itemsets found for intervention rules.")
            return pd.DataFrame()

        rules = association_rules(
            frequent_itemsets,
            metric="confidence",
            min_threshold=min_confidence,
        )

        # Keep only rules where the consequent is the outcome sentinel
        rules = rules[
            rules["consequents"].apply(lambda x: "NO_READMIT" in x)
        ].copy()

        rules["rule_type"] = "intervention_effectiveness"
        rules["evidence_count"] = (rules["support"] * len(baskets)).round().astype(int)
        rules["consequent"] = "NO_READMIT"
        rules["antecedent_items"] = rules["antecedents"].apply(lambda x: sorted(list(x)))

        rules["conviction"] = rules.apply(
            lambda r: (
                (1 - r["consequent support"]) / (1 - r["confidence"])
                if r["confidence"] < 1.0 else np.inf
            ),
            axis=1,
        )

        logger.info(
            "  Mined %d intervention effectiveness rules.", len(rules)
        )
        self._intv_rules = rules
        self._all_rules.extend(self._rules_df_to_dataclass(rules, "intervention_effectiveness"))
        return rules

    # ─────────────────────────────────────────────────────────────────────
    # Recommendations for a specific patient
    # ─────────────────────────────────────────────────────────────────────

    def get_recommendations_for_patient(
        self,
        diagnosis_codes: list[str],
        risk_factors: list[str],
        n: int = TOP_N_RECOMMENDATIONS,
    ) -> list[dict[str, Any]]:
        """
        Match a patient's profile against mined rules and return ranked recommendations.

        Matching logic:
          1. Find all intervention_effectiveness rules where every antecedent item is
             present in the patient's profile (diagnosis_codes + risk_factors)
          2. Score each rule: priority = lift × confidence × log1p(evidence_count)
          3. Return top-N ranked, de-duplicated recommendations

        Args:
            diagnosis_codes: List of ICD-10 codes for this patient (e.g. ['I50.9', 'E11.9']).
            risk_factors: List of risk factor strings (e.g. ['high_utilizer', 'has_ckd']).
            n: Number of recommendations to return.

        Returns:
            List of recommendation dicts with action, rationale, confidence etc.
        """
        patient_items: set[str] = (
            {f"DX:{code}" for code in diagnosis_codes}
            | {f"RISK:{factor}" for factor in risk_factors}
        )

        matched: list[Recommendation] = []

        for rule in self._all_rules:
            if rule.rule_type != "intervention_effectiveness":
                continue

            # Check if all antecedent items are present in patient's profile
            antecedent_items_set = rule.antecedents - frozenset(["NO_READMIT"])
            overlap = antecedent_items_set & patient_items

            if not overlap:
                continue

            # Partial match scoring: more overlap = better; require ≥50% overlap
            overlap_ratio = len(overlap) / max(len(antecedent_items_set), 1)
            if overlap_ratio < 0.5:
                continue

            priority_score = (
                rule.lift
                * rule.confidence
                * overlap_ratio
                * np.log1p(rule.evidence_count)
            )

            action_items = sorted(
                item for item in antecedent_items_set if item.startswith("CPT:")
            )
            action_str = (
                f"Apply intervention bundle: {', '.join(action_items)}"
                if action_items
                else "Continue current care protocols"
            )

            matched.append(Recommendation(
                action=action_str,
                rationale=(
                    f"In {rule.evidence_count} similar patients with "
                    f"{[i.replace('DX:','') for i in overlap]}, "
                    f"this care path reduced readmission (confidence={rule.confidence:.0%}, "
                    f"lift={rule.lift:.2f}x vs baseline)."
                ),
                confidence=rule.confidence,
                lift=rule.lift,
                evidence_count=rule.evidence_count,
                rule_type=rule.rule_type,
                antecedents_matched=sorted(overlap),
                priority_score=priority_score,
            ))

        # Sort by priority score and deduplicate
        matched.sort(key=lambda r: r.priority_score, reverse=True)
        seen_actions: set[str] = set()
        unique_recs: list[Recommendation] = []
        for rec in matched:
            if rec.action not in seen_actions:
                unique_recs.append(rec)
                seen_actions.add(rec.action)
            if len(unique_recs) >= n:
                break

        return [
            {
                "action": rec.action,
                "rationale": rec.rationale,
                "confidence": round(rec.confidence, 4),
                "lift": round(rec.lift, 4),
                "evidence_count": rec.evidence_count,
                "rule_type": rec.rule_type,
                "antecedents_matched": rec.antecedents_matched,
                "priority_score": round(rec.priority_score, 4),
            }
            for rec in unique_recs
        ]

    # ─────────────────────────────────────────────────────────────────────
    # Persistence
    # ─────────────────────────────────────────────────────────────────────

    def save_rules_to_db(self) -> int:
        """
        Persist all mined rules to the `care_path_rules` table.

        Returns:
            Number of rules inserted.
        """
        if not self._all_rules:
            logger.warning("No rules to save. Run mining methods first.")
            return 0

        rows = []
        for rule in self._all_rules:
            rows.append({
                "antecedent_items": json.dumps(sorted(list(rule.antecedents))),
                "consequent_item": rule.consequent,
                "support": round(rule.support, 6),
                "confidence": round(rule.confidence, 6),
                "lift": round(rule.lift, 6),
                "conviction": round(min(rule.conviction, 999.99), 6) if not np.isinf(rule.conviction) else 999.99,
                "evidence_count": rule.evidence_count,
                "rule_type": rule.rule_type,
                "created_at": rule.created_at.isoformat(),
            })

        df = pd.DataFrame(rows)
        n_rows = bulk_insert_dataframe(df, RULES_TABLE, schema="public")
        logger.info("Saved %d rules to %s.", n_rows, RULES_TABLE)
        return n_rows

    def save_rules_to_parquet(self, version: str = "latest") -> Path:
        """
        Export all rules to Parquet for offline analysis.

        Args:
            version: Version label for the output filename.

        Returns:
            Path to the saved Parquet file.
        """
        RULES_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
        output_path = RULES_OUTPUT_PATH / f"care_path_rules_{version}.parquet"
        all_rows = []

        for rule in self._all_rules:
            all_rows.append({
                "antecedents": sorted(list(rule.antecedents)),
                "consequent": rule.consequent,
                "support": rule.support,
                "confidence": rule.confidence,
                "lift": rule.lift,
                "conviction": rule.conviction if not np.isinf(rule.conviction) else 999.99,
                "evidence_count": rule.evidence_count,
                "rule_type": rule.rule_type,
            })

        pd.DataFrame(all_rows).to_parquet(output_path, index=False, compression="snappy")
        logger.info("Rules saved to %s (%d rules).", output_path, len(all_rows))
        return output_path

    def get_top_rules_by_lift(self, n: int = 10, rule_type: Optional[str] = None) -> list[dict]:
        """
        Return the top-N rules by lift score, optionally filtered by type.

        Args:
            n: Number of rules to return.
            rule_type: Optional filter ('diagnosis_association' | 'intervention_effectiveness').

        Returns:
            List of rule dicts sorted by lift descending.
        """
        rules = self._all_rules
        if rule_type:
            rules = [r for r in rules if r.rule_type == rule_type]
        top_rules = sorted(rules, key=lambda r: r.lift, reverse=True)[:n]
        return [
            {
                "antecedents": sorted(list(r.antecedents)),
                "consequent": r.consequent,
                "support": round(r.support, 6),
                "confidence": round(r.confidence, 4),
                "lift": round(r.lift, 4),
                "evidence_count": r.evidence_count,
                "rule_type": r.rule_type,
            }
            for r in top_rules
        ]

    # ─────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _rules_df_to_dataclass(
        rules_df: pd.DataFrame,
        rule_type: str,
    ) -> list[AssociationRule]:
        """Convert a mlxtend rules DataFrame into AssociationRule dataclasses."""
        result: list[AssociationRule] = []
        now = datetime.utcnow()

        for _, row in rules_df.iterrows():
            consequent_set = row["consequents"]
            consequent_str = list(consequent_set)[0] if len(consequent_set) == 1 else str(list(consequent_set))
            result.append(AssociationRule(
                rule_id=None,
                antecedents=frozenset(row["antecedents"]),
                consequent=consequent_str,
                support=float(row["support"]),
                confidence=float(row["confidence"]),
                lift=float(row["lift"]),
                conviction=float(row["conviction"]) if not np.isinf(row.get("conviction", 0)) else 999.99,
                evidence_count=int(row.get("evidence_count", 0)),
                rule_type=rule_type,
                created_at=now,
            ))
        return result


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )

    parser = argparse.ArgumentParser(description="CareIQ Association Rule Miner")
    parser.add_argument("--min-support", type=float, default=DEFAULT_MIN_SUPPORT)
    parser.add_argument("--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE)
    parser.add_argument("--save-db", action="store_true", help="Persist rules to PostgreSQL")
    args = parser.parse_args()

    miner = CarePathRuleMiner()
    miner.load_data()

    dx_rules = miner.mine_diagnosis_associations(
        min_support=args.min_support,
        min_confidence=args.min_confidence,
    )
    intv_rules = miner.mine_intervention_effectiveness(
        min_support=args.min_support / 2,   # Lower bar for procedures
    )

    top_rules = miner.get_top_rules_by_lift(n=10)
    logger.info("Top 10 rules by lift:\n%s", pd.DataFrame(top_rules).to_string())

    miner.save_rules_to_parquet()

    if args.save_db:
        n = miner.save_rules_to_db()
        logger.info("Saved %d rules to database.", n)
