# Ingestion Layer

Handles raw EHR data ingestion, PII de-identification, and schema validation.

## Scripts

| Script | Purpose |
|--------|---------|
| `generate_synthetic_data.py` | Generate 10K patients, 50K admissions, and 5 associated datasets |
| `pii_masker.py` | HMAC pseudonymization, date generalization, free-text scrubbing |
| `validate_schema.py` | Schema and data quality validation before staging promotion |

## Quick Start

```bash
pip install -r requirements.txt
python generate_synthetic_data.py       # Creates data/synthetic/*.csv
python validate_schema.py               # Validates schemas
python pii_masker.py                    # De-identifies raw → staging
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNTHETIC_NUM_PATIENTS` | `10000` | Number of patients to generate |
| `SYNTHETIC_NUM_ADMISSIONS` | `50000` | Number of admissions to generate |
| `SYNTHETIC_READMISSION_RATE` | `0.15` | Target readmission rate (15%) |
| `SYNTHETIC_SEED` | `42` | Random seed for reproducibility |
| `PII_HMAC_SECRET` | — | **Required in production** — secret for pseudonymization |
| `DATA_RAW_PATH` | `./data/raw` | Raw data directory |
| `DATA_STAGING_PATH` | `./data/staging` | Staging data directory |
