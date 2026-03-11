/**
 * SchemaRegistry.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Three-section Schema Registry tab for the Data Platform page:
 *
 *  1. Schema Browser     — Table list (left) + column detail (right)
 *  2. Migration History  — Vertical timeline, click to expand each migration
 *  3. Schema Diff        — Select two versions, see a git-diff-style comparison
 *
 * All data is static (matches DB seed in 013_schema_migrations.sql +
 * frontend/src/data/schema_data.json) so the component works without a live DB.
 */

import { useState } from 'react';
import {
    Table2, GitCommitHorizontal, GitCompare,
    ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle,
    Database, Code2, RefreshCw, Diff,
} from 'lucide-react';
import schemaData from "../../data/schema_data.json";

/* ─── Static migration data (matches 013_schema_migrations.sql seed) ──────── */
const MIGRATIONS = [
    {
        version: '006',
        name: 'add_audit_infrastructure',
        applied_at: '2025-01-10 09:00',
        author: 'platform-team',
        description: 'Add HIPAA-compliant audit log (append-only), pipeline_runs, and dq_check_results tables',
        business_reason: 'HIPAA Security Rule §164.312(b) requires audit controls for all PHI access. audit_log is append-only — no UPDATE or DELETE ever touches it. Not rollback-safe: you cannot un-create a HIPAA audit trail.',
        breaking_change: false,
        rollback_safe: false,
        tables_created: ['audit_log', 'pipeline_runs', 'dq_check_results'],
        columns_added: [],
        sql_up: `CREATE TABLE audit_log (
  audit_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at      TIMESTAMP   NOT NULL    DEFAULT NOW(),
  event_type    VARCHAR(50) NOT NULL,
  actor_user_id VARCHAR(100),
  actor_role    VARCHAR(50),
  patient_id    VARCHAR(50),
  resource_type VARCHAR(50),
  resource_id   VARCHAR(100),
  action        VARCHAR(50) NOT NULL,
  ip_address    VARCHAR(45),
  user_agent    VARCHAR(300),
  request_id    VARCHAR(100),
  metadata      JSONB       DEFAULT '{}'::JSONB
  -- NO updated_at. NO deleted_at. APPEND-ONLY.
);
CREATE INDEX idx_audit_event_at ON audit_log(event_at DESC);
CREATE INDEX idx_audit_patient  ON audit_log(patient_id, event_at DESC);`,
    },
    {
        version: '005',
        name: 'add_care_path_rules',
        applied_at: '2024-10-20 16:00',
        author: 'ml-team',
        description: 'Add association rules table for care-path recommendation engine',
        business_reason: 'The recommendation engine (Apriori algorithm) requires persisted rules with confidence/lift scores for real-time lookup. Rules are re-mined monthly from fact_admissions.',
        breaking_change: false,
        rollback_safe: true,
        tables_created: ['care_path_rules'],
        columns_added: [],
        sql_up: `CREATE TABLE care_path_rules (
  rule_id      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  antecedent   JSONB   NOT NULL,
  consequent   JSONB   NOT NULL,
  support      NUMERIC(6,4),
  confidence   NUMERIC(6,4),
  lift         NUMERIC(8,4),
  cohort_label VARCHAR(50),
  mined_at     TIMESTAMP NOT NULL
);`,
    },
    {
        version: '004',
        name: 'add_charlson_index',
        applied_at: '2024-10-15 11:00',
        author: 'data-team',
        description: 'Add Charlson Comorbidity Index column to dim_patient — required for ML feature set v2',
        business_reason: 'CCI is the #2 most predictive feature per SHAP analysis (avg SHAP value: 0.18). Adding it to the warehouse enables it as an ML training input. Backward compatible — NULL for historical patients.',
        breaking_change: false,
        rollback_safe: true,
        tables_created: [],
        columns_added: [{ table: 'dim_patient', column: 'charlson_comorbidity_index', type: 'NUMERIC(5,2)' }],
        sql_up: `ALTER TABLE dim_patient
  ADD COLUMN charlson_comorbidity_index NUMERIC(5,2);

COMMENT ON COLUMN dim_patient.charlson_comorbidity_index IS
  'Charlson Comorbidity Index — predicts 10-year survival based on comorbidities.
   NULL for patients admitted before 2024-10-15.';`,
    },
    {
        version: '003',
        name: 'add_ml_predictions',
        applied_at: '2024-10-02 09:00',
        author: 'ml-team',
        description: 'Add predictions table to store ML model outputs and SHAP feature importance values',
        business_reason: 'XGBoost v1.0 model requires a persistent store for predictions + SHAP values. Downstream: care plan recommendations are generated from this table.',
        breaking_change: false,
        rollback_safe: true,
        tables_created: ['fact_predictions'],
        columns_added: [],
        sql_up: `CREATE TABLE fact_predictions (
  prediction_id UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_key   INT       NOT NULL,
  admission_key INT,
  model_version VARCHAR(20) NOT NULL,
  predicted_at  TIMESTAMP NOT NULL,
  risk_score    NUMERIC(5,4) NOT NULL,
  risk_tier     VARCHAR(20),
  shap_values   JSONB,
  cohort_label  VARCHAR(50)
);
CREATE INDEX idx_pred_patient ON fact_predictions(patient_key, predicted_at DESC);`,
    },
    {
        version: '002',
        name: 'add_fact_vitals',
        applied_at: '2024-09-08 14:30',
        author: 'data-team',
        description: 'Add time-series vitals table for anomaly detection pipeline',
        business_reason: 'Anomaly detection model requires HR, BP, SpO₂, Temp as a continuous time series. Adding fact_vitals enables sub-daily granularity not possible with admission-level data.',
        breaking_change: false,
        rollback_safe: true,
        tables_created: ['fact_vitals'],
        columns_added: [],
        sql_up: `CREATE TABLE fact_vitals (
  vital_id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_key      INT       NOT NULL REFERENCES dim_patient(patient_key),
  admission_key    INT       REFERENCES fact_admissions(admission_id),
  recorded_at      TIMESTAMP NOT NULL,
  heart_rate_bpm   NUMERIC,
  bp_systolic      INT,
  bp_diastolic     INT,
  spo2_pct         NUMERIC,
  temp_fahrenheit  NUMERIC
);
CREATE INDEX idx_vitals_patient ON fact_vitals(patient_key, recorded_at DESC);`,
    },
    {
        version: '001',
        name: 'initial_star_schema',
        applied_at: '2024-09-01 10:00',
        author: 'data-team',
        description: 'Initial star schema: fact_admissions + 4 dimension tables',
        business_reason: null,
        breaking_change: false,
        rollback_safe: true,
        tables_created: ['fact_admissions', 'dim_patient', 'dim_diagnosis', 'dim_provider', 'dim_date'],
        columns_added: [],
        sql_up: `CREATE TABLE dim_patient   (...);
CREATE TABLE dim_diagnosis  (...);
CREATE TABLE dim_provider   (...);
CREATE TABLE dim_date       (...);
CREATE TABLE fact_admissions (
  admission_id        UUID    PRIMARY KEY,
  patient_key         INT     NOT NULL REFERENCES dim_patient(patient_key),
  diagnosis_key       INT     REFERENCES dim_diagnosis(diagnosis_key),
  provider_key        INT     REFERENCES dim_provider(provider_key),
  date_key            INT     NOT NULL REFERENCES dim_date(date_key),
  admit_date          DATE    NOT NULL,
  discharge_date      DATE,
  readmit_30day_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  length_of_stay_days INT,
  total_cost_usd      NUMERIC,
  discharge_disp      VARCHAR,
  drg_code            VARCHAR,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);`,
    },
];

/* ─── Diff data for each pair of versions ──────────────────────────────────── */
// Pre-computed diffs between every milestone version
const DIFFS = {
    '001→006': [
        { type: 'context', text: 'dim_patient' },
        { type: 'context', text: '  patient_key       INT       NOT NULL   PK' },
        { type: 'context', text: '  patient_id        VARCHAR   NOT NULL' },
        { type: 'context', text: '  age_group         VARCHAR' },
        { type: 'context', text: '  gender            VARCHAR' },
        { type: 'add',     text: '+ charlson_comorbidity_index  NUMERIC    -- added v004' },
        { type: 'context', text: '  has_diabetes      BOOLEAN' },
        { type: 'context', text: '  has_hypertension  BOOLEAN' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ fact_vitals                             -- added v002' },
        { type: 'add',     text: '+   vital_id         UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   patient_key      INT       NOT NULL   FK, IDX' },
        { type: 'add',     text: '+   recorded_at      TIMESTAMP NOT NULL   IDX' },
        { type: 'add',     text: '+   heart_rate_bpm   NUMERIC' },
        { type: 'add',     text: '+   bp_systolic      INT' },
        { type: 'add',     text: '+   spo2_pct         NUMERIC' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ fact_predictions                        -- added v003' },
        { type: 'add',     text: '+   prediction_id   UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   patient_key     INT       NOT NULL   FK, IDX' },
        { type: 'add',     text: '+   risk_score      NUMERIC   NOT NULL' },
        { type: 'add',     text: '+   shap_values     JSONB' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ care_path_rules                         -- added v005' },
        { type: 'add',     text: '+   rule_id         UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   confidence      NUMERIC' },
        { type: 'add',     text: '+   lift            NUMERIC' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ audit_log                               -- added v006' },
        { type: 'add',     text: '+   audit_id        UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   event_at        TIMESTAMP NOT NULL   IDX' },
        { type: 'add',     text: '+   event_type      VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   actor_user_id   VARCHAR' },
        { type: 'add',     text: '+   patient_id      VARCHAR               IDX' },
        { type: 'add',     text: '+   action          VARCHAR   NOT NULL' },
    ],
    '003→006': [
        { type: 'context', text: 'dim_patient' },
        { type: 'context', text: '  patient_key       INT       NOT NULL   PK' },
        { type: 'context', text: '  patient_id        VARCHAR   NOT NULL' },
        { type: 'context', text: '  age_group         VARCHAR' },
        { type: 'context', text: '  gender            VARCHAR' },
        { type: 'add',     text: '+ charlson_comorbidity_index  NUMERIC    -- added v004' },
        { type: 'context', text: '  has_diabetes      BOOLEAN' },
        { type: 'context', text: '  has_hypertension  BOOLEAN' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ care_path_rules                         -- added v005' },
        { type: 'add',     text: '+   rule_id         UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   confidence      NUMERIC' },
        { type: 'add',     text: '+   lift            NUMERIC' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ audit_log                               -- added v006' },
        { type: 'add',     text: '+   audit_id        UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   event_at        TIMESTAMP NOT NULL   IDX' },
        { type: 'add',     text: '+   event_type      VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   patient_id      VARCHAR               IDX' },
        { type: 'add',     text: '+   action          VARCHAR   NOT NULL' },
    ],
    '004→006': [
        { type: 'context', text: 'dim_patient  (no new columns)' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ care_path_rules                         -- added v005' },
        { type: 'add',     text: '+   rule_id         UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   antecedent      JSONB     NOT NULL' },
        { type: 'add',     text: '+   consequent      JSONB     NOT NULL' },
        { type: 'add',     text: '+   confidence      NUMERIC' },
        { type: 'add',     text: '+   lift            NUMERIC' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ audit_log                               -- added v006' },
        { type: 'add',     text: '+   audit_id        UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   event_at        TIMESTAMP NOT NULL' },
        { type: 'add',     text: '+   event_type      VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   action          VARCHAR   NOT NULL' },
    ],
    '005→006': [
        { type: 'context', text: '(care_path_rules already exists)' },
        { type: 'context', text: '' },
        { type: 'add',     text: '+ audit_log                               -- added v006' },
        { type: 'add',     text: '+   audit_id        UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   event_at        TIMESTAMP NOT NULL   IDX' },
        { type: 'add',     text: '+   event_type      VARCHAR   NOT NULL   IDX' },
        { type: 'add',     text: '+   actor_user_id   VARCHAR               IDX' },
        { type: 'add',     text: '+   patient_id      VARCHAR               IDX' },
        { type: 'add',     text: '+   resource_type   VARCHAR' },
        { type: 'add',     text: '+   action          VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   ip_address      VARCHAR' },
        { type: 'add',     text: '+   metadata        JSONB     DEFAULT {}' },
        { type: 'add',     text: '+' },
        { type: 'add',     text: '+ pipeline_runs                           -- added v006' },
        { type: 'add',     text: '+   run_id          UUID      NOT NULL   PK' },
        { type: 'add',     text: '+   pipeline_name   VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   status          VARCHAR   NOT NULL' },
        { type: 'add',     text: '+   started_at      TIMESTAMP NOT NULL' },
        { type: 'add',     text: '+   rows_processed  INT' },
    ],
};

/* ─── Type color badge ──────────────────────────────────────────────────────── */
const TYPE_COLORS = {
    UUID:      { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
    INT:       { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
    NUMERIC:   { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    DATE:      { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
    TIMESTAMP: { bg: '#FEF9C3', color: '#854D0E', border: '#FDE047' },
    VARCHAR:   { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    BOOLEAN:   { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
    TEXT:      { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    JSONB:     { bg: '#FCF4FF', color: '#9333EA', border: '#E9D5FF' },
};

function TypeBadge({ type }) {
    const baseType = type.split('(')[0].toUpperCase();
    const c = TYPE_COLORS[baseType] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
    return (
        <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10.5, fontWeight: 600,
            color: c.color, background: c.bg, border: `1px solid ${c.border}`,
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            flexShrink: 0,
        }}>
            {type}
        </span>
    );
}

function IndexBadge({ index }) {
    if (!index) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
    const isPK = index.includes('PK');
    const isFK = index.includes('FK');
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            color: isPK ? '#7C3AED' : isFK ? '#2563EB' : '#475569',
            background: isPK ? '#F5F3FF' : isFK ? '#EFF6FF' : '#F1F5F9',
            border: `1px solid ${isPK ? '#DDD6FE' : isFK ? '#BFDBFE' : '#CBD5E1'}`,
            padding: '1px 6px', borderRadius: 'var(--radius-pill)',
        }}>
            {index}
        </span>
    );
}

/* ─── Section 1: Schema Browser ─────────────────────────────────────────────── */
function SchemaBrowser() {
    const [selectedTable, setSelectedTable] = useState(schemaData.tables[0]);

    const LAYER_COLORS = {
        WAREHOUSE: { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
        'ML/AI':   { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
        STAGING:   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
        SOURCE:    { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
    };

    return (
        <div style={{ display: 'flex', gap: 14, minHeight: 500 }}>
            {/* Left: Table list */}
            <div className="card" style={{ width: 220, flexShrink: 0, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                        TABLES ({schemaData.tables.length})
                    </span>
                </div>
                <div style={{ overflowY: 'auto' }}>
                    {schemaData.tables.map(table => {
                        const isSelected = table.name === selectedTable.name;
                        const lc = LAYER_COLORS[table.layer] || LAYER_COLORS.STAGING;
                        return (
                            <div
                                key={table.name}
                                onClick={() => setSelectedTable(table)}
                                style={{
                                    padding: '9px 14px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--accent-light)' : 'transparent',
                                    borderLeft: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    transition: 'background var(--t-fast)',
                                    borderBottom: '1px solid var(--border-subtle)',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div>
                                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)', fontWeight: isSelected ? 700 : 500 }}>
                                        {table.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: lc.color, marginTop: 1 }}>{table.layer}</div>
                                </div>
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: 'var(--text-muted)' }}>
                                    {table.rowCount?.toLocaleString()}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right: Column browser */}
            <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {selectedTable.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {selectedTable.description} · {selectedTable.rowCount?.toLocaleString()} rows
                        </div>
                    </div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', padding: '3px 10px', borderRadius: 'var(--radius-pill)' }}>
                        {selectedTable.columns.length} columns
                    </span>
                </div>

                {/* Column table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-base)' }}>
                                {['COLUMN', 'TYPE', 'NULLABLE', 'INDEX', 'SAMPLE VALUES'].map(h => (
                                    <th key={h} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '8px 14px', textAlign: 'left', fontFamily: "'DM Mono', monospace", borderBottom: '1px solid var(--border-subtle)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {selectedTable.columns.map((col, i) => (
                                <tr key={col.name} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-base)' }}>
                                    <td style={{ padding: '9px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                                                {col.name}
                                            </span>
                                            {col.added_in && (
                                                <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1px 5px', borderRadius: 99 }}>
                                                    +{col.added_in}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '9px 14px' }}><TypeBadge type={col.type} /></td>
                                    <td style={{ padding: '9px 14px' }}>
                                        <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: col.nullable ? 'var(--text-muted)' : 'var(--risk-critical)' }}>
                                            {col.nullable ? 'YES' : 'NO'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '9px 14px' }}><IndexBadge index={col.index} /></td>
                                    <td style={{ padding: '9px 14px' }}>
                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: 'var(--text-muted)' }}>
                                            {col.sample?.slice(0, 2).map((s, si) => (
                                                <span key={si}>
                                                    <span style={{ color: s === null || s === 'null' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                                        {s === null ? 'NULL' : `"${s.length > 18 ? s.slice(0, 18) + '…' : s}"`}
                                                    </span>
                                                    {si === 0 && ' · '}
                                                </span>
                                            ))}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─── Section 2: Migration History ─────────────────────────────────────────── */
function MigrationHistory() {
    const [expanded, setExpanded] = useState({});
    const [showSQL, setShowSQL] = useState({});
    const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }));
    const toggleSQL = id => setShowSQL(p => ({ ...p, [id]: !p[id] }));

    return (
        <div style={{ position: 'relative', paddingLeft: 48 }}>
            {/* Vertical timeline line */}
            <div style={{ position: 'absolute', left: 18, top: 8, bottom: 8, width: 2, background: 'var(--border-default)' }} />

            {MIGRATIONS.map((m, idx) => {
                const isOpen = !!expanded[m.version];
                const isSQLOpen = !!showSQL[m.version];

                return (
                    <div key={m.version} style={{ position: 'relative', marginBottom: idx < MIGRATIONS.length - 1 ? 16 : 0 }}>
                        {/* Dot on vertical line */}
                        <div style={{
                            position: 'absolute', left: -37,
                            width: 14, height: 14,
                            background: m.rollback_safe ? 'var(--accent-primary)' : '#DC2626',
                            border: '2px solid var(--bg-elevated)',
                            borderRadius: '50%',
                            top: 14,
                            zIndex: 1,
                        }} />

                        {/* Version badge on line */}
                        <div style={{
                            position: 'absolute', left: -48,
                            top: 11, fontSize: 9, fontWeight: 800,
                            fontFamily: "'DM Mono', monospace",
                            color: 'var(--text-muted)',
                        }}>
                            v{m.version}
                        </div>

                        {/* Card */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* Header row — always visible */}
                            <div
                                onClick={() => toggle(m.version)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px', cursor: 'pointer',
                                    background: isOpen ? 'var(--accent-light)' : 'var(--bg-elevated)',
                                    transition: 'background var(--t-fast)',
                                }}
                            >
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: 'var(--text-muted)', width: 108, flexShrink: 0 }}>
                                    {m.applied_at}
                                </span>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {m.description.split(':')[0].split('—')[0].trim().slice(0, 60)}
                                </span>
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                                    {m.author}
                                </span>
                                {!m.rollback_safe && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', padding: '1px 7px', borderRadius: 'var(--radius-pill)', flexShrink: 0 }}>
                                        NOT ROLLBACK-SAFE
                                    </span>
                                )}
                                {isOpen ? <ChevronUp size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                            </div>

                            {/* Expanded detail */}
                            {isOpen && (
                                <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Description */}
                                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {m.description}
                                    </p>

                                    {/* Business reason */}
                                    {m.business_reason && (
                                        <div style={{ padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-md)' }}>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                                                BUSINESS REASON
                                            </p>
                                            <p style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.6 }}>{m.business_reason}</p>
                                        </div>
                                    )}

                                    {/* Metadata row */}
                                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                        {m.tables_created.length > 0 && (
                                            <div>
                                                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>TABLES CREATED</p>
                                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                    {m.tables_created.map(t => (
                                                        <span key={t} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {m.columns_added.length > 0 && (
                                            <div>
                                                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>COLUMNS ADDED</p>
                                                {m.columns_added.map(c => (
                                                    <span key={c.column} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--accent-primary)', background: 'var(--accent-light)', border: '1px solid var(--accent-mid)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                                                        {c.table}.{c.column} ({c.type})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>SAFETY</p>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <span style={{ fontSize: 10.5, color: m.breaking_change ? '#DC2626' : '#059669', fontWeight: 600 }}>
                                                    {m.breaking_change ? '⚠ Breaking' : '✓ Non-breaking'}
                                                </span>
                                                <span style={{ fontSize: 10.5, color: m.rollback_safe ? '#059669' : '#DC2626', fontWeight: 600 }}>
                                                    · {m.rollback_safe ? '✓ Rollback safe' : '✗ Not rollback safe'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SQL toggle */}
                                    <button
                                        onClick={() => toggleSQL(m.version)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '5px 12px', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-secondary)', width: 'fit-content' }}
                                    >
                                        <Code2 size={12} />
                                        {isSQLOpen ? 'Hide SQL' : 'View sql_up'}
                                    </button>
                                    {isSQLOpen && (
                                        <pre style={{
                                            margin: 0, padding: '12px 16px', background: '#0F172A', borderRadius: 'var(--radius-md)',
                                            fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: '#E2E8F0',
                                            lineHeight: 1.75, overflowX: 'auto', whiteSpace: 'pre', border: '1px solid #1E293B',
                                        }}>
                                            {m.sql_up}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Section 3: Schema Diff View ───────────────────────────────────────────── */
function SchemaDiffView() {
    const VERSIONS = ['001', '002', '003', '004', '005', '006'];
    const [fromV, setFromV] = useState('001');
    const [toV, setToV] = useState('006');
    const [shown, setShown] = useState(true);

    const diffKey = `${fromV}→${toV}`;
    const diffLines = DIFFS[diffKey] || (() => {
        const reversedKey = `${toV}→${fromV}`;
        if (DIFFS[reversedKey]) {
            return DIFFS[reversedKey].map(l => ({
                ...l,
                type: l.type === 'add' ? 'remove' : l.type,
                text: l.type === 'add' ? l.text.replace(/^\+/, '-') : l.text,
            }));
        }
        return [{ type: 'context', text: 'No diff data for this version pair. Try 001→006, 003→006, 004→006, or 005→006.' }];
    })();

    const addCount = diffLines.filter(l => l.type === 'add').length;
    const removeCount = diffLines.filter(l => l.type === 'remove').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Diff controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Compare</span>
                <select value={fromV} onChange={e => { setFromV(e.target.value); setShown(false); setTimeout(() => setShown(true), 50); }}
                    style={{ height: 34, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: "'DM Mono', monospace", padding: '0 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    {VERSIONS.map(v => <option key={v} value={v}>v{v} — {MIGRATIONS.find(m => m.version === v)?.name.replace(/_/g, ' ')}</option>)}
                </select>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>→</span>
                <select value={toV} onChange={e => { setToV(e.target.value); setShown(false); setTimeout(() => setShown(true), 50); }}
                    style={{ height: 34, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: "'DM Mono', monospace", padding: '0 10px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    {VERSIONS.map(v => <option key={v} value={v}>v{v} — {MIGRATIONS.find(m => m.version === v)?.name.replace(/_/g, ' ')}</option>)}
                </select>

                {/* Stats */}
                {addCount > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 9px', borderRadius: 'var(--radius-pill)', fontFamily: "'DM Mono', monospace" }}>+{addCount} additions</span>}
                {removeCount > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', padding: '2px 9px', borderRadius: 'var(--radius-pill)', fontFamily: "'DM Mono', monospace" }}>−{removeCount} removals</span>}
            </div>

            {/* Diff output */}
            {shown && (
                <div style={{ background: '#0F172A', borderRadius: 'var(--radius-lg)', border: '1px solid #1E293B', overflow: 'hidden' }}>
                    {/* Diff header */}
                    <div style={{ padding: '8px 16px', background: '#1E293B', borderBottom: '1px solid #334155', fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#94A3B8', display: 'flex', gap: 12 }}>
                        <span>--- schema_v{fromV}</span>
                        <span>+++ schema_v{toV}</span>
                    </div>
                    {/* Lines */}
                    <div style={{ padding: '10px 0', overflowX: 'auto' }}>
                        {diffLines.map((line, i) => {
                            const isAdd = line.type === 'add';
                            const isRemove = line.type === 'remove';
                            return (
                                <div key={i} style={{
                                    padding: '1px 16px',
                                    background: isAdd ? 'rgba(34,197,94,0.12)' : isRemove ? 'rgba(239,68,68,0.12)' : 'transparent',
                                    borderLeft: isAdd ? '2px solid #22C55E' : isRemove ? '2px solid #EF4444' : '2px solid transparent',
                                    marginLeft: 0,
                                }}>
                                    <span style={{
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: 12,
                                        color: isAdd ? '#86EFAC' : isRemove ? '#FCA5A5' : '#94A3B8',
                                        whiteSpace: 'pre',
                                    }}>
                                        {line.text || ' '}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Explainer */}
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Green lines (+)</strong> are schema additions.
                {' '}<strong>Red lines (−)</strong> are removals.
                {' '}Context lines (no prefix) show unchanged columns for reference.
                {' '}The diff is computed from the <code style={{ fontFamily: "'DM Mono', monospace", background: 'var(--bg-sunken)', padding: '0 4px', borderRadius: 4 }}>tables_affected</code> metadata stored in each migration record.
            </p>
        </div>
    );
}

/* ─── Main export ───────────────────────────────────────────────────────────── */
const SCHEMA_SECTIONS = [
    { id: 'browser',    label: 'Schema Browser',    Icon: Table2 },
    { id: 'migrations', label: 'Migration History',  Icon: GitCommitHorizontal },
    { id: 'diff',       label: 'Schema Diff',        Icon: Diff },
];

export default function SchemaRegistry() {
    const [activeSection, setActiveSection] = useState('browser');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Intro banner */}
            <div className="card" style={{ padding: '14px 18px', background: '#faf5ff', border: '1px solid #e9d5ff', display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
                <Database size={16} style={{ color: '#7C3AED', flexShrink: 0, marginTop: 1 }} />
                <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#4C1D95', marginBottom: 3 }}>
                        Schema Registry & Migration History
                    </p>
                    <p style={{ fontSize: 12, color: '#5B21B6', lineHeight: 1.6 }}>
                        Browse live table schemas, trace how the warehouse evolved over 6 migrations, and diff any two versions.
                        {' '}Each migration captures a <code style={{ fontFamily: "'DM Mono', monospace", background: '#DDD6FE', padding: '0 3px', borderRadius: 3 }}>business_reason</code> field —
                        the WHY behind every schema change, invaluable when debugging data issues months later.
                    </p>
                </div>
            </div>

            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: 1, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', padding: 3, width: 'fit-content', border: '1px solid var(--border-subtle)' }}>
                {SCHEMA_SECTIONS.map(({ id, label, Icon }) => {
                    const active = activeSection === id;
                    return (
                        <button key={id} onClick={() => setActiveSection(id)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 14px', borderRadius: 'var(--radius-sm)',
                            background: active ? 'var(--bg-elevated)' : 'transparent',
                            border: active ? '1px solid var(--border-default)' : '1px solid transparent',
                            boxShadow: active ? 'var(--shadow-sm)' : 'none',
                            fontSize: 12, fontWeight: active ? 700 : 500,
                            color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif",
                            transition: 'all var(--t-fast)',
                        }}>
                            <Icon size={12} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Section content */}
            {activeSection === 'browser'    && <SchemaBrowser />}
            {activeSection === 'migrations' && <MigrationHistory />}
            {activeSection === 'diff'       && <SchemaDiffView />}
        </div>
    );
}
