#!/usr/bin/env bash
# metabase/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
# CareIQ — Metabase Automated Setup
#
# Creates:
#   1. PostgreSQL data source connection
#   2. Pre-built questions (readmission rate, high-risk patients, dept leaderboard)
#   3. "Clinical Overview" dashboard with all questions arranged
#
# Prerequisites:
#   - Metabase running at METABASE_URL (default: http://localhost:3000)
#   - PostgreSQL warehouse accessible as configured in .env
#   - curl + jq installed
#
# Usage:
#   ./metabase/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

METABASE_URL="${METABASE_URL:-http://localhost:3000}"
METABASE_ADMIN_EMAIL="${METABASE_ADMIN_EMAIL:-admin@careiq.io}"
METABASE_ADMIN_PASSWORD="${METABASE_ADMIN_PASSWORD:-CareIQ-Meta-2024!}"
METABASE_SITE_NAME="${METABASE_SITE_NAME:-CareIQ Clinical Intelligence}"

PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DB:-careiq_warehouse}"
PG_USER="${POSTGRES_USER:-careiq}"
PG_PASS="${POSTGRES_PASSWORD:-changeme}"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# ─── Wait for Metabase to be ready ───────────────────────────────────────────
log "Waiting for Metabase to start..."
for i in {1..30}; do
    if curl -sf "$METABASE_URL/api/health" | grep -q '"status"'; then
        log "Metabase is ready."
        break
    fi
    [ "$i" -eq 30 ] && fail "Metabase did not start within 150 seconds."
    sleep 5
done

# ─── Initial setup (only if not already set up) ───────────────────────────────
log "Checking if Metabase needs initial setup..."
SETUP_STATUS=$(curl -sf "$METABASE_URL/api/session/properties" | python3 -c "import sys,json; print(json.load(sys.stdin).get('has-user-setup', False))" 2>/dev/null || echo "false")

if [ "$SETUP_STATUS" = "False" ]; then
    log "Running initial Metabase setup..."
    SETUP_TOKEN=$(curl -sf "$METABASE_URL/api/session/properties" | python3 -c "import sys,json; print(json.load(sys.stdin)['setup-token'])")

    curl -sf -X POST "$METABASE_URL/api/setup" \
        -H "Content-Type: application/json" \
        -d "{
            \"token\": \"$SETUP_TOKEN\",
            \"prefs\": {\"site_name\": \"$METABASE_SITE_NAME\", \"allow_tracking\": false},
            \"user\": {
                \"email\": \"$METABASE_ADMIN_EMAIL\",
                \"password\": \"$METABASE_ADMIN_PASSWORD\",
                \"first_name\": \"CareIQ\",
                \"last_name\": \"Admin\",
                \"site_name\": \"$METABASE_SITE_NAME\"
            },
            \"database\": null
        }" > /dev/null
    log "Initial setup complete."
fi

# ─── Authenticate ─────────────────────────────────────────────────────────────
log "Authenticating..."
SESSION=$(curl -sf -X POST "$METABASE_URL/api/session" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$METABASE_ADMIN_EMAIL\", \"password\": \"$METABASE_ADMIN_PASSWORD\"}")

TOKEN=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$TOKEN" ] || fail "Could not authenticate with Metabase."
log "Authenticated. Session token obtained."

H="-H 'X-Metabase-Session: $TOKEN' -H 'Content-Type: application/json'"

mb_get()  { curl -sf -H "X-Metabase-Session: $TOKEN" "$METABASE_URL$1"; }
mb_post() { curl -sf -X POST -H "X-Metabase-Session: $TOKEN" -H "Content-Type: application/json" "$METABASE_URL$1" -d "$2"; }
mb_put()  { curl -sf -X PUT  -H "X-Metabase-Session: $TOKEN" -H "Content-Type: application/json" "$METABASE_URL$1" -d "$2"; }

# ─── Site settings ────────────────────────────────────────────────────────────
log "Configuring site settings..."
mb_put "/api/setting/site-name" "{\"value\": \"$METABASE_SITE_NAME\"}" > /dev/null
mb_put "/api/setting/hide-embed-branding?" "{\"value\": true}" > /dev/null || true

# ─── Create PostgreSQL database connection ────────────────────────────────────
log "Creating database connection to warehousing PostgreSQL..."

# Check if already exists
EXISTING_DB=$(mb_get "/api/database" | python3 -c "
import sys, json
dbs = json.load(sys.stdin)
for d in (dbs.get('data', []) if isinstance(dbs, dict) else dbs):
    if d.get('name') == 'CareIQ Warehouse':
        print(d['id'])
        break
" 2>/dev/null || echo "")

if [ -z "$EXISTING_DB" ]; then
    DB_RESPONSE=$(mb_post "/api/database" "{
        \"name\": \"CareIQ Warehouse\",
        \"engine\": \"postgres\",
        \"details\": {
            \"host\": \"$PG_HOST\",
            \"port\": $PG_PORT,
            \"dbname\": \"$PG_DB\",
            \"user\": \"$PG_USER\",
            \"password\": \"$PG_PASS\",
            \"ssl\": false,
            \"tunnel-enabled\": false
        },
        \"auto_run_queries\": true
    }")
    DB_ID=$(echo "$DB_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    log "Database created with ID: $DB_ID"
else
    DB_ID="$EXISTING_DB"
    log "Database already exists with ID: $DB_ID"
fi

# Wait for metadata sync
log "Waiting for schema sync..."
for i in {1..20}; do
    STATE=$(mb_get "/api/database/$DB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('initial_sync_status', 'pending'))" 2>/dev/null || echo "pending")
    [ "$STATE" = "complete" ] && break
    sleep 5
done
log "Schema sync complete."

# Get table IDs
get_table_id() {
    mb_get "/api/database/$DB_ID/metadata" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data.get('tables', []):
    if t['name'] == '$1':
        print(t['id'])
        break
"
}

FACT_ADM_ID=$(get_table_id "fact_admissions")
log "fact_admissions table ID: $FACT_ADM_ID"

# ─── Create a Collection for CareIQ ──────────────────────────────────────────
log "Creating CareIQ collection..."
COLL_RESPONSE=$(mb_post "/api/collection" "{
    \"name\": \"CareIQ Clinical\",
    \"color\": \"#0EA5E9\",
    \"description\": \"CareIQ clinical overview questions and dashboards\"
}")
COLL_ID=$(echo "$COLL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', 1))")
log "Collection ID: $COLL_ID"

# ─── Question 1: Readmission Rate by Month ────────────────────────────────────
log "Creating question: Readmission Rate by Month..."
Q1=$(mb_post "/api/card" "{
    \"name\": \"Readmission Rate by Month\",
    \"display\": \"line\",
    \"collection_id\": $COLL_ID,
    \"visualization_settings\": {
        \"graph.x_axis.title_text\": \"Month\",
        \"graph.y_axis.title_text\": \"30-Day Readmission Rate\",
        \"graph.colors\": [\"#0EA5E9\"],
        \"graph.show_goal\": true,
        \"graph.goal_value\": 0.15,
        \"graph.goal_label\": \"CMS 15% Benchmark\"
    },
    \"dataset_query\": {
        \"type\": \"native\",
        \"database\": $DB_ID,
        \"native\": {
            \"query\": \"SELECT DATE_TRUNC('month', admit_date)::date AS month, ROUND(AVG(readmit_30day_flag::int)::numeric, 4) AS readmission_rate, COUNT(*) AS total_admissions FROM fact_admissions WHERE admit_date >= NOW() - INTERVAL '12 months' GROUP BY 1 ORDER BY 1\"
        }
    }
}")
Q1_ID=$(echo "$Q1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Question 1 ID: $Q1_ID"

# ─── Question 2: High Risk Patients Today ────────────────────────────────────
log "Creating question: High Risk Patients Today..."
Q2=$(mb_post "/api/card" "{
    \"name\": \"High Risk Patients Today\",
    \"display\": \"table\",
    \"collection_id\": $COLL_ID,
    \"visualization_settings\": {
        \"table.column_formatting\": []
    },
    \"dataset_query\": {
        \"type\": \"native\",
        \"database\": $DB_ID,
        \"native\": {
            \"query\": \"SELECT dp.patient_id, dp.age_at_admission AS age, dp.comorbidity_score AS cci, fa.department_code AS department, dd.primary_diagnosis AS diagnosis, fa.emergency_flag, fa.icu_flag, fa.length_of_stay_days AS los_days FROM fact_admissions fa JOIN dim_patient dp ON fa.patient_key = dp.patient_key JOIN dim_diagnosis dd ON fa.diagnosis_key = dd.diagnosis_key WHERE fa.admit_date::date = CURRENT_DATE AND dp.comorbidity_score >= 4 ORDER BY dp.comorbidity_score DESC LIMIT 50\"
        }
    }
}")
Q2_ID=$(echo "$Q2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Question 2 ID: $Q2_ID"

# ─── Question 3: Department Leaderboard ──────────────────────────────────────
log "Creating question: Department Leaderboard..."
Q3=$(mb_post "/api/card" "{
    \"name\": \"Department Readmission Leaderboard\",
    \"display\": \"bar\",
    \"collection_id\": $COLL_ID,
    \"visualization_settings\": {
        \"graph.x_axis.title_text\": \"Department\",
        \"graph.y_axis.title_text\": \"30-Day Readmission Rate\",
        \"graph.colors\": [\"#0EA5E9\"],
        \"graph.show_goal\": true,
        \"graph.goal_value\": 0.15
    },
    \"dataset_query\": {
        \"type\": \"native\",
        \"database\": $DB_ID,
        \"native\": {
            \"query\": \"SELECT department_code, ROUND(AVG(readmit_30day_flag::int)::numeric, 4) AS readmission_rate, COUNT(*) AS total_admissions FROM fact_admissions WHERE admit_date >= NOW() - INTERVAL '30 days' GROUP BY 1 ORDER BY 2 DESC\"
        }
    }
}")
Q3_ID=$(echo "$Q3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Question 3 ID: $Q3_ID"

# ─── Question 4: Risk Score Distribution ─────────────────────────────────────
log "Creating question: Risk Distribution Today..."
Q4=$(mb_post "/api/card" "{
    \"name\": \"Risk Distribution Today\",
    \"display\": \"pie\",
    \"collection_id\": $COLL_ID,
    \"visualization_settings\": {},
    \"dataset_query\": {
        \"type\": \"native\",
        \"database\": $DB_ID,
        \"native\": {
            \"query\": \"SELECT CASE WHEN comorbidity_score >= 8 THEN 'Critical' WHEN comorbidity_score >= 5 THEN 'High' WHEN comorbidity_score >= 2 THEN 'Medium' ELSE 'Low' END AS risk_tier, COUNT(*) FROM fact_admissions fa JOIN dim_patient dp ON fa.patient_key = dp.patient_key WHERE fa.admit_date::date = CURRENT_DATE GROUP BY 1\"
        }
    }
}")
Q4_ID=$(echo "$Q4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Question 4 ID: $Q4_ID"

# ─── Create Dashboard ─────────────────────────────────────────────────────────
log "Creating Clinical Overview dashboard..."
DASH=$(mb_post "/api/dashboard" "{
    \"name\": \"Clinical Overview\",
    \"description\": \"CareIQ real-time readmission risk intelligence dashboard\",
    \"collection_id\": $COLL_ID,
    \"parameters\": []
}")
DASH_ID=$(echo "$DASH" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Dashboard ID: $DASH_ID"

# Add cards to dashboard with layout positions
mb_post "/api/dashboard/$DASH_ID/cards" "{
    \"cards\": [
        {\"id\": -1, \"card_id\": $Q1_ID, \"row\": 0, \"col\": 0, \"size_x\": 12, \"size_y\": 6},
        {\"id\": -2, \"card_id\": $Q3_ID, \"row\": 0, \"col\": 12, \"size_x\": 6, \"size_y\": 6},
        {\"id\": -3, \"card_id\": $Q4_ID, \"row\": 0, \"col\": 18, \"size_x\": 6, \"size_y\": 6},
        {\"id\": -4, \"card_id\": $Q2_ID, \"row\": 6, \"col\": 0, \"size_x\": 24, \"size_y\": 8}
    ]
}" > /dev/null

log "Dashboard cards added."

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Metabase setup complete!"
echo "═══════════════════════════════════════════════════════"
echo "   URL:        $METABASE_URL"
echo "   Email:      $METABASE_ADMIN_EMAIL"
echo "   Password:   $METABASE_ADMIN_PASSWORD"
echo ""
echo "   Dashboard:  $METABASE_URL/dashboard/$DASH_ID"
echo "═══════════════════════════════════════════════════════"
