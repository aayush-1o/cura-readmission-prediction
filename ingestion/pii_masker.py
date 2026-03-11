"""
CareIQ — PII Masker / Anonymizer
==================================
Applies PII de-identification to EHR data before it moves from the raw
landing zone to the staging layer. Preserves analytical utility while
removing or masking all patient-identifiable information.

Masking strategies applied:
  - Names           → deterministic pseudonymized IDs (HMAC-SHA256)
  - SSN             → **** masked, last 4 retained
  - Phone numbers   → stripped to area code (XXX-***-****)
  - Addresses       → replaced with zip-code-only representation
  - Email addresses → replaced with domain-only token
  - Dates of birth  → generalized to year of birth only (k-anonymity)
  - Free-text notes → regex-based scrubbing for name/SSN/phone patterns

Usage:
    python pii_masker.py --input data/raw/patients.csv --output data/staging/patients.csv
    python pii_masker.py  # Processes all known PII-bearing files
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional

import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Secret key used for HMAC-based pseudonymization. Must be kept secure.
# Never log or print this value.
HMAC_SECRET: bytes = os.getenv("PII_HMAC_SECRET", "change_me_before_production").encode()

RAW_DIR: Path = Path(os.getenv("DATA_RAW_PATH", "./data/raw"))
STAGING_DIR: Path = Path(os.getenv("DATA_STAGING_PATH", "./data/staging"))

# Filenames that contain PII fields and their masking configuration
PII_FIELD_MAP: dict[str, dict[str, str]] = {
    "patients.csv": {
        "first_name": "pseudonymize",
        "last_name": "pseudonymize",
        "full_name": "pseudonymize",
        "ssn": "mask_ssn",
        "phone": "mask_phone",
        "address": "mask_address",
        "email": "mask_email",
        "date_of_birth": "generalize_year",
    },
    "admissions.csv": {
        # Admissions don't normally carry raw PII if patients.csv is the source
        # but provider NPIs should be pseudonymized
        "attending_physician_name": "pseudonymize",
    },
    "notes.csv": {
        "note_text": "scrub_freetext",
    },
}

# Regexes used by the free-text scrubber
_FREETEXT_PATTERNS: list[tuple[str, str]] = [
    # SSN: 123-45-6789 or 123456789
    (r"\b\d{3}-\d{2}-\d{4}\b", "[SSN-REDACTED]"),
    (r"\b\d{9}\b", "[SSN-REDACTED]"),
    # Phone: (555) 123-4567 or 555-123-4567 or 5551234567
    (r"\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}", "[PHONE-REDACTED]"),
    # Email
    (r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", "[EMAIL-REDACTED]"),
    # Common name-pattern prefix (Mr./Mrs./Dr. Lastname)
    (r"\b(Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+\b", "[NAME-REDACTED]"),
    # MRN patterns
    (r"\bMRN[\s:]?\d{6,10}\b", "[MRN-REDACTED]"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("careiq.ingestion.pii_masker")

# Audit log: records WHAT was masked, never the actual values
audit_logger = logging.getLogger("careiq.pii_audit")
_audit_handler = logging.FileHandler("pii_masking_audit.log")
_audit_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
audit_logger.addHandler(_audit_handler)
audit_logger.setLevel(logging.INFO)

# ─────────────────────────────────────────────────────────────────────────────
# Masking primitives
# ─────────────────────────────────────────────────────────────────────────────


def pseudonymize(value: str) -> str:
    """
    Replace a PII value with a deterministic pseudonym using HMAC-SHA256.

    The same input always produces the same ANON-prefix token, preserving
    referential integrity across datasets without exposing the original value.

    Args:
        value: The original PII string (name, ID, etc.).

    Returns:
        An anonymized token like "ANON-A3F9C2B1".
    """
    if not value or str(value).strip() in ("", "nan"):
        return "ANON-UNKNOWN"
    digest = hmac.new(HMAC_SECRET, str(value).encode(), hashlib.sha256).hexdigest()
    return f"ANON-{digest[:8].upper()}"


def mask_ssn(value: str) -> str:
    """
    Mask SSN, retaining only the last 4 digits.

    Args:
        value: Raw SSN string (formats: XXX-XX-XXXX or XXXXXXXXX).

    Returns:
        Masked format like "***-**-6789".
    """
    digits = re.sub(r"\D", "", str(value))
    if len(digits) == 9:
        return f"***-**-{digits[-4:]}"
    return "***-**-****"


def mask_phone(value: str) -> str:
    """
    Mask phone number, retaining only the area code.

    Args:
        value: Raw phone number string.

    Returns:
        Masked format like "555-***-****".
    """
    digits = re.sub(r"\D", "", str(value))
    if len(digits) >= 10:
        return f"{digits[:3]}-***-****"
    return "***-***-****"


def mask_address(value: str) -> str:
    """
    Replace a street address with a "[ADDRESS REDACTED]" placeholder.

    The associated zip_code field is retained separately for geographic analysis.

    Args:
        value: Raw address string.

    Returns:
        Standardized placeholder string.
    """
    return "[ADDRESS REDACTED]"


def mask_email(value: str) -> str:
    """
    Replace email with domain-only token, masking the local part.

    Args:
        value: Raw email address.

    Returns:
        Token like "@hospital.com" or "[EMAIL REDACTED]".
    """
    match = re.search(r"@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})", str(value))
    if match:
        return f"@{match.group(1)}"
    return "[EMAIL REDACTED]"


def generalize_year(value: str) -> str:
    """
    Generalize a date of birth to year only for k-anonymity.

    Args:
        value: Date string in any common format (YYYY-MM-DD, MM/DD/YYYY, etc.).

    Returns:
        4-digit year string, or "UNKNOWN" if parsing fails.
    """
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return str(pd.to_datetime(value, format=fmt).year)
        except (ValueError, TypeError):
            continue
    return "UNKNOWN"


def scrub_freetext(value: str) -> str:
    """
    Apply regex-based PII scrubbing to a free-text string.

    Scans for SSNs, phone numbers, emails, and name patterns and
    replaces them with redaction tokens.

    Args:
        value: Raw clinical note or free-text field.

    Returns:
        Scrubbed text with PII replaced by tokens.
    """
    text = str(value)
    for pattern, replacement in _FREETEXT_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Masking dispatcher
# ─────────────────────────────────────────────────────────────────────────────

_MASKING_FUNCTIONS = {
    "pseudonymize": pseudonymize,
    "mask_ssn": mask_ssn,
    "mask_phone": mask_phone,
    "mask_address": mask_address,
    "mask_email": mask_email,
    "generalize_year": generalize_year,
    "scrub_freetext": scrub_freetext,
}


def mask_dataframe(
    df: pd.DataFrame,
    field_config: dict[str, str],
    filename: str,
) -> tuple[pd.DataFrame, dict[str, int]]:
    """
    Apply PII masking to a DataFrame according to its field configuration.

    Args:
        df: Input DataFrame with raw PII fields.
        field_config: Mapping of column_name → masking_strategy.
        filename: Source filename (for audit logging).

    Returns:
        Tuple of (masked DataFrame, audit counts per field).
    """
    masked_df = df.copy()
    audit_counts: dict[str, int] = {}

    for column, strategy in field_config.items():
        if column not in masked_df.columns:
            logger.debug("Column '%s' not present in %s — skipping.", column, filename)
            continue

        masking_fn = _MASKING_FUNCTIONS.get(strategy)
        if masking_fn is None:
            raise ValueError(f"Unknown masking strategy '{strategy}' for column '{column}'.")

        non_null_count = masked_df[column].notna().sum()
        masked_df[column] = masked_df[column].apply(
            lambda val: masking_fn(str(val)) if pd.notna(val) else val
        )
        audit_counts[column] = int(non_null_count)

        # Audit log: records field name and count — NEVER the values
        audit_logger.info(
            "MASKED file=%s column=%s strategy=%s count=%d",
            filename,
            column,
            strategy,
            non_null_count,
        )

    return masked_df, audit_counts


# ─────────────────────────────────────────────────────────────────────────────
# File processing
# ─────────────────────────────────────────────────────────────────────────────


def process_file(
    input_path: Path,
    output_path: Path,
    field_config: dict[str, str],
) -> dict[str, int]:
    """
    Load a CSV, apply PII masking, and write the result to the staging path.

    Args:
        input_path: Absolute path to the raw CSV file.
        output_path: Absolute path for the masked output CSV.
        field_config: PII field masking configuration.

    Returns:
        Audit count dictionary (field → number of records masked).

    Raises:
        FileNotFoundError: If the input file does not exist.
        ValueError: If an unknown masking strategy is encountered.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    logger.info("Processing: %s", input_path.name)
    df = pd.read_csv(input_path, low_memory=False)
    logger.info("  Loaded %d rows, %d columns.", len(df), len(df.columns))

    masked_df, audit_counts = mask_dataframe(df, field_config, input_path.name)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    masked_df.to_csv(output_path, index=False)
    logger.info("  Written to: %s", output_path)

    return audit_counts


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────


def build_argument_parser() -> argparse.ArgumentParser:
    """Build and return the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="CareIQ PII Masker — de-identify patient data for staging.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Input CSV file path (overrides default batch processing).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output CSV file path (required when --input is provided).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration without writing any files.",
    )
    return parser


def run_batch_processing(dry_run: bool = False) -> None:
    """
    Process all known PII-bearing files from raw to staging directory.

    Args:
        dry_run: If True, validate config and log intent without writing files.
    """
    logger.info("Starting batch PII masking: %s → %s", RAW_DIR, STAGING_DIR)

    total_audit: dict[str, dict[str, int]] = {}
    for filename, field_config in PII_FIELD_MAP.items():
        input_path = RAW_DIR / filename
        output_path = STAGING_DIR / filename

        if not input_path.exists():
            logger.warning("Skipping %s — file not found in %s", filename, RAW_DIR)
            continue

        if dry_run:
            logger.info("[DRY RUN] Would mask %s with fields: %s", filename, list(field_config.keys()))
            continue

        try:
            audit_counts = process_file(input_path, output_path, field_config)
            total_audit[filename] = audit_counts
        except (FileNotFoundError, ValueError) as exc:
            logger.error("Failed to process %s: %s", filename, exc)

    if not dry_run:
        logger.info("Batch complete. Summary:")
        for fname, counts in total_audit.items():
            logger.info("  %s: %s", fname, counts)


def main(argv: Optional[list[str]] = None) -> None:
    """CLI entrypoint for the PII masker."""
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    if args.input and not args.output:
        parser.error("--output is required when --input is provided.")

    if args.input:
        filename = args.input.name
        config = PII_FIELD_MAP.get(filename, {})
        if not config:
            logger.warning(
                "No PII configuration found for '%s'. "
                "Processing with empty config (no fields will be masked).",
                filename,
            )
        process_file(args.input, args.output, config)
    else:
        run_batch_processing(dry_run=args.dry_run)


if __name__ == "__main__":
    main(sys.argv[1:])
