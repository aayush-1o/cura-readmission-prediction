import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, User, Calendar, Activity, CheckSquare,
    LogIn, AlertTriangle, Target, TrendingUp, CheckCircle,
    Bell, Eye, Plus, Pill, LogOut, RefreshCw, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import { usePatient, useCarePlan } from '../services/hooks.js';
import { mockCarePlan } from '../services/mockData.js';

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
const TABS = ['Overview', 'Timeline', 'Risk Analysis', 'Admissions', 'Care Plan'];

/* ─── Inline ShapWaterfall ───────────────────────────────────────────────── */
function ShapWaterfall({ factors = [] }) {
    if (factors.length === 0) return (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>No factor data available.</p>
    );

    // Build cumulative totals from base 15%
    let running = 15.0;
    const enriched = factors.map((f) => {
        const delta = (f.shap_value ?? 0) * 100;
        running += delta;
        return { ...f, delta, cumulative: Math.min(running, 100).toFixed(1) };
    });

    const maxShap = Math.max(...factors.map((f) => Math.abs(f.shap_value ?? 0)));

    return (
        <div style={{ padding: '0 4px' }}>
            {/* Base rate */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', marginBottom: 8,
            }}>
                <span className="t-mono" style={{ width: 180, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                    Base rate
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                <span className="t-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                    15.0%
                </span>
            </div>

            {enriched.map((f, i) => {
                const isRisk = f.direction === 'increases_risk';
                const pct = Math.max((Math.abs(f.shap_value ?? 0) / maxShap) * 60, 4);
                const color = isRisk ? 'var(--risk-high)' : 'var(--risk-low)';
                const bgColor = isRisk ? 'var(--risk-high-bg)' : 'var(--risk-low-bg)';

                return (
                    <div
                        key={i}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 1fr 80px',
                            gap: 12,
                            alignItems: 'center',
                            padding: '7px 0',
                            borderBottom: i < enriched.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        }}
                    >
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
                            {f.display_label ?? f.feature}
                        </span>

                        <div style={{
                            height: 24, background: 'var(--bg-sunken)',
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isRisk ? 'flex-start' : 'flex-end',
                        }}>
                            <div style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: bgColor,
                                border: `1px solid ${color}33`,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isRisk ? 'flex-end' : 'flex-start',
                                padding: '0 6px',
                                transition: `width 700ms cubic-bezier(0.4,0,0.2,1) ${i * 60}ms`,
                            }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                                    {isRisk ? '+' : '-'}{(Math.abs(f.shap_value ?? 0) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>

                        <span className="t-mono" style={{
                            fontSize: 12, fontWeight: 600,
                            color: isRisk ? 'var(--risk-high)' : 'var(--risk-low)',
                            textAlign: 'right',
                        }}>
                            {f.cumulative}%
                        </span>
                    </div>
                );
            })}

            {/* Final score */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderTop: '2px solid var(--border-default)', marginTop: 8,
            }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Predicted Risk Score
                </span>
                <span className="t-mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--risk-critical)' }}>
                    {enriched[enriched.length - 1]?.cumulative ?? '—'}%
                </span>
            </div>
        </div>
    );
}

/* ─── PatientDetail ──────────────────────────────────────────────────────── */
export default function PatientDetail() {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [tab, setTab] = useState('Overview');
    const [signed, setSigned] = useState(false);

    const { data: patient, isLoading: patientLoading } = usePatient(patientId);
    const latestAdmission = patient?.admissions?.[0];
    const { data: carePlan, isLoading: planLoading } = useCarePlan(
        patientId, latestAdmission?.admission_id
    );
    const plan = carePlan || mockCarePlan;
    const riskPct = Math.round((plan?.risk_score ?? 0) * 100);

    if (patientLoading) return <PatientDetailSkeleton />;
    if (!patient) return (
        <div style={{ textAlign: 'center', padding: '96px 24px' }}>
            <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Patient not found.</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Header card ──────────────────────────────────────────── */}
            <div className="card card-accent-top" style={{ padding: '20px 24px' }}>
                {/* Back */}
                <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px', marginBottom: 12 }}
                    onClick={() => navigate(-1)}
                >
                    ← Risk Queue
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    {/* Left */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                            {/* Avatar */}
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'var(--accent-light)',
                                border: '1px solid var(--accent-mid)',
                                color: 'var(--accent-primary)',
                                fontFamily: "'DM Mono', monospace",
                                fontSize: 14, fontWeight: 500,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {patient.patient_id?.[4] || 'P'}
                            </div>
                            <span className="t-mono" style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>
                                {patient.patient_id}
                            </span>
                            <RiskBadge tier={plan?.risk_tier || 'high'} />
                            <span className="t-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--risk-critical)' }}>
                                {riskPct}%
                            </span>
                        </div>

                        {/* Attribute pills */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                            {[
                                patient.age && `Age: ${patient.age}`,
                                patient.gender,
                                patient.insurance_category,
                                latestAdmission?.department,
                                latestAdmission?.length_of_stay_days && `LOS: ${latestAdmission.length_of_stay_days.toFixed(0)}d`,
                                latestAdmission?.icu_flag && 'ICU',
                                patient.high_utilizer_flag && 'High Utilizer',
                            ].filter(Boolean).map((attr) => (
                                <span key={attr} style={{
                                    fontSize: 12, color: 'var(--text-secondary)',
                                    background: 'var(--bg-sunken)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-pill)',
                                    padding: '3px 10px',
                                }}>
                                    {attr}
                                </span>
                            ))}
                        </div>

                        {/* Diagnoses */}
                        {patient.top_diagnoses?.length > 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {patient.top_diagnoses.slice(0, 3).join(' · ')}
                            </p>
                        )}
                    </div>

                    {/* Right: stat boxes + export */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        {[
                            { label: 'Admits (12m)', value: patient.prior_admissions_12m ?? '—', color: 'var(--accent-primary)' },
                            { label: 'CCI Score',    value: patient.charlson_comorbidity_index?.toFixed(1) ?? '—', color: 'var(--risk-high)' },
                            { label: 'Readmits (1yr)', value: patient.prior_readmissions_1y ?? '—', color: 'var(--risk-critical)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <p className="t-mono" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</p>
                            </div>
                        ))}
                        <button className="btn btn-primary" style={{ gap: 6, marginLeft: 8 }}>
                            <FileText size={14} /> Export
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tab nav ──────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', gap: 0,
                borderBottom: '1px solid var(--border-subtle)',
            }}>
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '10px 18px',
                            fontSize: 13,
                            fontWeight: tab === t ? 600 : 500,
                            color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                            borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            marginBottom: -1,
                            background: 'none',
                            border: 'none',
                            borderBottomStyle: 'solid',
                            borderBottomWidth: 2,
                            borderBottomColor: tab === t ? 'var(--accent-primary)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'all var(--t-fast)',
                            fontFamily: "'Instrument Sans', sans-serif",
                        }}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    {tab === 'Overview'      && <OverviewTab patient={patient} />}
                    {tab === 'Timeline'      && <TimelineTab patientId={patientId} />}
                    {tab === 'Risk Analysis' && <RiskAnalysisTab carePlan={plan} isLoading={planLoading} />}
                    {tab === 'Admissions'    && <AdmissionsTab patient={patient} />}
                    {tab === 'Care Plan'     && <CarePlanTab carePlan={plan} isLoading={planLoading} signed={signed} onSign={() => setSigned(!signed)} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

/* ─── Timeline Tab ───────────────────────────────────────────────────────── */

// Event type config: icon component + color
const EVENT_CONFIG = {
    admission:                  { Icon: LogIn,         color: 'var(--accent-primary)' },
    vital_recorded:             { Icon: Activity,      color: 'var(--text-muted)' },
    vital_anomaly:              { Icon: AlertTriangle, color: 'var(--risk-high)' },
    risk_score_updated:         { Icon: Target,        color: 'var(--accent-primary)' },
    risk_score_spike:           { Icon: TrendingUp,    color: 'var(--risk-critical)' },
    care_plan_created:          { Icon: FileText,      color: 'var(--risk-low)' },
    recommendation_acknowledged:{ Icon: CheckCircle,  color: 'var(--risk-low)' },
    alert_triggered:            { Icon: Bell,          color: 'var(--risk-high)' },
    clinician_viewed:           { Icon: Eye,           color: 'var(--text-muted)' },
    diagnosis_added:            { Icon: Plus,          color: 'var(--accent-primary)' },
    medication_changed:         { Icon: Pill,          color: 'var(--risk-medium)' },
    discharge:                  { Icon: LogOut,        color: 'var(--risk-low)' },
    readmission:                { Icon: RefreshCw,     color: 'var(--risk-critical)' },
};

// Static events matching DB seed (newest first)
const MOCK_EVENTS = [
    { id: 'e01', event_at: '2026-03-11T09:15:00', event_type: 'risk_score_spike',    title: 'Risk Score Spike Detected',  subtitle: 'Score jumped 82% → 95% (↑13%)', detail: { 'Triggered by': 'Nightly ML batch scoring', 'Model': 'XGBoost v1.0', 'Previous': '82%', 'New': '95%' } },
    { id: 'e02', event_at: '2026-03-11T09:15:00', event_type: 'alert_triggered',     title: 'Alert Triggered',             subtitle: '"Risk Score Spike" — sent to Care Coordinator queue', detail: { 'Alert type': 'risk_score_spike', 'Severity': 'Critical', 'Sent to': 'Care Coordinator queue' } },
    { id: 'e03', event_at: '2026-03-11T08:00:00', event_type: 'vital_anomaly',       title: 'Vital Anomaly Detected',      subtitle: 'SpO₂ 94% — below threshold (< 95%)', detail: { 'HR': '98 bpm', 'BP': '142/88', 'SpO₂': '94%  ⚠ Below threshold', 'Temp': '98.7°F' } },
    { id: 'e04', event_at: '2026-03-11T08:00:00', event_type: 'vital_recorded',      title: 'Vitals Recorded',             subtitle: 'HR 98 bpm · BP 142/88 · SpO₂ 94%', detail: { 'HR': '98 bpm', 'BP': '142/88', 'SpO₂': '94%', 'Temp': '98.7°F' } },
    { id: 'e05', event_at: '2026-03-11T07:45:00', event_type: 'clinician_viewed',    title: 'Patient Record Viewed',       subtitle: 'Dr. Sarah Chen reviewed full profile', detail: { 'Actor': 'Dr. Sarah Chen', 'Duration': '312 seconds', 'Sections': 'Overview, Risk Analysis, Care Plan' } },
    { id: 'e06', event_at: '2026-03-11T07:30:00', event_type: 'medication_changed',  title: 'Medication Order Updated',    subtitle: 'Furosemide 40mg IV — added', detail: { 'Medication': 'Furosemide 40mg', 'Route': 'IV', 'Frequency': 'BID', 'Reason': 'Fluid overload management', 'Ordered by': 'Dr. Sarah Chen' } },
    { id: 'e07', event_at: '2026-03-10T14:30:00', event_type: 'recommendation_acknowledged', title: 'Care Plan Action Completed', subtitle: 'Recommendation #1 marked complete', detail: { 'Item': 'Arrange home health follow-up', 'Note': 'Home health arranged for discharge (est. Mar 14)', 'Acknowledged by': 'Dr. Sarah Chen' } },
    { id: 'e08', event_at: '2026-03-10T11:00:00', event_type: 'vital_recorded',      title: 'Vitals Recorded',             subtitle: 'HR 91 bpm · BP 138/84 · SpO₂ 96%', detail: { 'HR': '91 bpm', 'BP': '138/84', 'SpO₂': '96%', 'Temp': '99.1°F' } },
    { id: 'e09', event_at: '2026-03-10T10:00:00', event_type: 'diagnosis_added',     title: 'Secondary Diagnosis Added',   subtitle: 'Acute kidney injury (N17.9) — moderate', detail: { 'ICD-10': 'N17.9', 'Description': 'Acute kidney injury, unspecified', 'Severity': 'Moderate', 'Creatinine': '1.8 mg/dL', 'Added by': 'Dr. Sarah Chen' } },
    { id: 'e10', event_at: '2026-03-10T06:00:00', event_type: 'risk_score_updated',  title: 'Risk Score Updated',          subtitle: 'Score: 78% → 82% (↑4%)', detail: { 'Previous': '78%', 'New': '82%', 'Delta': '+4%', 'Model': 'XGBoost v1.0', 'Job': 'ml_batch_scoring_20260310' } },
    { id: 'e11', event_at: '2026-03-09T16:00:00', event_type: 'care_plan_created',   title: 'Care Plan Generated',         subtitle: '5 evidence-based recommendations created', detail: { 'Recommendations': '5', 'Model': 'XGBoost v1.0', 'Cohort': 'CHF + AKI — High Risk', 'Generation time': '342ms' } },
    { id: 'e12', event_at: '2026-03-09T15:00:00', event_type: 'risk_score_updated',  title: 'Initial Risk Score Computed', subtitle: 'Score: 71% · Risk tier: HIGH', detail: { 'Score': '71%', 'Risk tier': 'HIGH', 'Cohort': 'T4_CHF_AKI_High', 'Model': 'XGBoost v1.0' } },
    { id: 'e13', event_at: '2026-03-09T14:30:00', event_type: 'vital_recorded',      title: 'Admission Vitals Recorded',   subtitle: 'HR 104 bpm · BP 158/96 · SpO₂ 90%', detail: { 'HR': '104 bpm', 'BP': '158/96', 'SpO₂': '90%', 'Temp': '99.8°F', 'Recorded by': 'Admissions nursing' } },
    { id: 'e14', event_at: '2026-03-09T14:00:00', event_type: 'admission',           title: 'Patient Admitted',             subtitle: 'Cardiology · CHF Exacerbation', detail: { 'Department': 'Cardiology', 'Type': 'Emergency', 'Primary diagnosis': 'CHF Exacerbation', 'ICD-10': 'I50.30', 'Provider': 'Dr. Sarah Chen', 'Initial risk estimate': '71%' } },
];

// Group events by calendar day
function groupByDay(events) {
    const groups = [];
    let currentDate = null;
    let currentGroup = null;
    for (const e of events) {
        const day = e.event_at.slice(0, 10);
        if (day !== currentDate) {
            currentDate = day;
            currentGroup = { date: day, events: [] };
            groups.push(currentGroup);
        }
        currentGroup.events.push(e);
    }
    return groups;
}

function dayLabel(dateStr) {
    const today     = '2026-03-11';
    const yesterday = '2026-03-10';
    if (dateStr === today)     return 'TODAY — March 11, 2026';
    if (dateStr === yesterday) return 'YESTERDAY — March 10, 2026';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function TimelineTab() {
    const [expanded, setExpanded] = useState({});
    const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    const groups = groupByDay(MOCK_EVENTS);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Info banner */}
            <div style={{ padding: '10px 14px', background: 'var(--accent-light)', border: '1px solid var(--accent-mid)', borderRadius: 'var(--radius-md)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'var(--accent-primary)' }}>
                    <strong>Patient event timeline</strong> — every admission, vital reading, risk score change, alert, and care plan action in chronological order. Click any event to expand details.
                </p>
            </div>

            {/* Timeline */}
            <div style={{ position: 'relative', paddingLeft: 32 }}>
                {/* Vertical connector line */}
                <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />

                {groups.map(group => (
                    <div key={group.date}>
                        {/* Day group header */}
                        <div style={{ position: 'relative', padding: '14px 0 10px' }}>
                            <span style={{
                                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
                                textTransform: 'uppercase', color: 'var(--text-muted)',
                                fontFamily: "'DM Mono', monospace",
                                background: 'var(--bg-base)', paddingRight: 12,
                                position: 'relative', zIndex: 1,
                            }}>
                                {dayLabel(group.date)}
                            </span>
                        </div>

                        {/* Events */}
                        {group.events.map((event) => {
                            const cfg = EVENT_CONFIG[event.event_type] || { Icon: Activity, color: 'var(--text-muted)' };
                            const { Icon, color } = cfg;
                            const isOpen = !!expanded[event.id];
                            const time = event.event_at.slice(11, 16);

                            return (
                                <div
                                    key={event.id}
                                    style={{ position: 'relative', paddingLeft: 28, paddingBottom: 18 }}
                                >
                                    {/* Icon dot on the line */}
                                    <div style={{
                                        position: 'absolute', left: -9,
                                        width: 20, height: 20,
                                        background: 'var(--bg-elevated)',
                                        border: `2px solid ${color}`,
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        zIndex: 1,
                                    }}>
                                        <Icon size={9} style={{ color }} />
                                    </div>

                                    {/* Content */}
                                    <div
                                        onClick={() => toggle(event.id)}
                                        style={{
                                            background: 'var(--bg-elevated)',
                                            border: `1px solid ${isOpen ? color + '44' : 'var(--border-subtle)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            transition: 'all var(--t-fast)',
                                            boxShadow: isOpen ? `0 0 0 2px ${color}18` : 'none',
                                        }}
                                    >
                                        {/* Title row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{time}</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{event.title}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 7px', background: 'var(--bg-sunken)', borderRadius: 99, border: '1px solid var(--border-subtle)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                                                {event.event_type.replace(/_/g, ' ')}
                                            </span>
                                        </div>

                                        {/* Subtitle */}
                                        {event.subtitle && (
                                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginLeft: 52 }}>
                                                {event.subtitle}
                                            </p>
                                        )}

                                        {/* Expanded detail */}
                                        {isOpen && event.detail && (
                                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 52 }}>
                                                {Object.entries(event.detail).map(([k, v]) => (
                                                    <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', width: 120, flexShrink: 0 }}>{k}</span>
                                                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: ['HR','BP','SpO₂','Temp','Creatinine','Score','New','Previous','Delta'].includes(k) ? "'DM Mono', monospace" : 'inherit' }}>{v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Overview Tab ───────────────────────────────────────────────────────── */
function OverviewTab({ patient }) {
    const latestAdm = patient?.admissions?.[0];

    const infoCard = (title, icon, rows) => (
        <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                {icon}
                {title}
            </h3>
            <dl style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(([label, value, mono]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <dt style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</dt>
                        <dd style={{
                            fontSize: 12, fontWeight: 500,
                            color: 'var(--text-primary)',
                            textAlign: 'right',
                            fontFamily: mono ? "'DM Mono', monospace" : 'inherit',
                        }}>
                            {value ?? '—'}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {infoCard('Demographics', <User size={15} color="var(--accent-primary)" />, [
                ['Patient ID',     patient.patient_id, true],
                ['Age',            patient.age ? `${patient.age} years` : null],
                ['Gender',         patient.gender],
                ['Race / Ethnicity', patient.race_ethnicity],
                ['Insurance',      patient.insurance_category],
                ['Department',     latestAdm?.department],
            ])}

            {infoCard('Current Admission', <Calendar size={15} color="var(--accent-primary)" />, [
                ['Admission ID',   latestAdm?.admission_id, true],
                ['Type',           latestAdm?.admission_type],
                ['Admitted',       latestAdm?.admission_date],
                ['LOS',            latestAdm?.length_of_stay_days ? `${latestAdm.length_of_stay_days.toFixed(1)} days` : null],
                ['ICU',            latestAdm?.icu_flag ? 'Yes' : 'No'],
                ['Emergency',      latestAdm?.emergency_flag ? 'Yes' : 'No'],
            ])}

            <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={15} color="var(--accent-primary)" />
                    Comorbidities
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(patient.top_diagnoses || ['No diagnosis data']).map((dx, i) => (
                        <div key={i} style={{
                            padding: '7px 12px',
                            background: 'var(--bg-sunken)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <p className="t-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dx}</p>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comorbidity count</span>
                        <span className="t-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--risk-high)' }}>
                            {patient.comorbidity_count ?? '—'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Risk cohort</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {patient.risk_cohort?.replace(/T\d_/, '') || '—'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Risk Analysis Tab ──────────────────────────────────────────────────── */
function RiskAnalysisTab({ carePlan, isLoading }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Model info card */}
                <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h3 className="t-heading">Model Output</h3>
                    {[
                        ['Risk Score',    `${Math.round((carePlan?.risk_score ?? 0) * 100)}%`],
                        ['Risk Tier',     carePlan?.risk_tier ?? '—'],
                        ['Model',         carePlan?.model_name ?? '—'],
                        ['Model Version', carePlan?.model_version ?? '—'],
                        ['Cohort',        carePlan?.cohort_name ?? '—'],
                        ['Cohort Avg Risk', carePlan?.cohort_average_risk ? `${Math.round(carePlan.cohort_average_risk * 100)}%` : '—'],
                    ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                            <span className="t-mono" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
                        </div>
                    ))}
                </div>

                {/* SHAP waterfall */}
                <div className="card" style={{ padding: 20 }}>
                    <h3 className="t-heading" style={{ marginBottom: 16 }}>Risk Factor Analysis</h3>
                    {isLoading
                        ? <div className="skeleton" style={{ height: 200 }} />
                        : <ShapWaterfall factors={carePlan?.risk_factors ?? []} />
                    }
                </div>
            </div>

            {/* Similar patients */}
            {carePlan?.similar_patient_outcomes?.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                    <h3 className="t-heading">Similar Patient Outcomes</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 16 }}>
                        Nearest patients in cohort "{carePlan.cohort_name}" with positive outcomes
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        {carePlan.similar_patient_outcomes.map((sp, i) => (
                            <motion.div
                                key={sp.patient_id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.08 }}
                                style={{
                                    padding: 14,
                                    background: 'var(--bg-sunken)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-subtle)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span className="t-mono" style={{ fontSize: 11, color: 'var(--accent-primary)' }}>
                                        {sp.patient_id}
                                    </span>
                                    <span style={{
                                        fontSize: 10, color: 'var(--risk-low)',
                                        background: 'var(--risk-low-bg)',
                                        border: '1px solid var(--risk-low-border)',
                                        borderRadius: 'var(--radius-pill)',
                                        padding: '1px 6px',
                                    }}>
                                        {Math.round(sp.similarity * 100)}% similar
                                    </span>
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--risk-low)', fontWeight: 600 }}>{sp.outcome}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                    Age {sp.age?.toFixed(0)} · CCI {sp.charlson_cci?.toFixed(1)} · LOS {sp.length_of_stay_days?.toFixed(1)}d
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Admissions Tab ─────────────────────────────────────────────────────── */
function AdmissionsTab({ patient }) {
    const admissions = patient?.admissions || [];
    return (
        <div className="card" style={{ padding: 20 }}>
            <h3 className="t-heading" style={{ marginBottom: 16 }}>Admission History</h3>
            {admissions.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No admission history.</p>
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {admissions.map((adm, i) => (
                            <motion.div
                                key={adm.admission_id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.06 }}
                                style={{
                                    padding: '14px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    background: i === 0 ? 'var(--accent-light)' : 'var(--bg-sunken)',
                                    border: `1px solid ${i === 0 ? 'var(--accent-mid)' : 'var(--border-subtle)'}`,
                                    display: 'grid',
                                    gridTemplateColumns: 'auto 1fr auto auto',
                                    gap: 16,
                                    alignItems: 'center',
                                }}
                            >
                                <div>
                                    {i === 0 && (
                                        <span style={{ fontSize: 10, color: 'var(--accent-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 2 }}>
                                            Current
                                        </span>
                                    )}
                                    <span className="t-mono" style={{ fontSize: 12, color: 'var(--accent-primary)' }}>
                                        {adm.admission_id}
                                    </span>
                                </div>
                                <div>
                                    <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                        {adm.primary_diagnosis_category || adm.department}
                                    </p>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {adm.admission_date} – {adm.discharge_date || 'present'}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="t-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {adm.length_of_stay_days?.toFixed(1)}d
                                    </span>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>LOS</p>
                                </div>
                                <div>
                                    {adm.readmit_30day_flag !== undefined && (
                                        <span style={{
                                            fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 600,
                                            background: adm.readmit_30day_flag ? 'var(--risk-critical-bg)' : 'var(--risk-low-bg)',
                                            color: adm.readmit_30day_flag ? 'var(--risk-critical)' : 'var(--risk-low)',
                                            border: `1px solid ${adm.readmit_30day_flag ? 'var(--risk-critical-border)' : 'var(--risk-low-border)'}`,
                                        }}>
                                            {adm.readmit_30day_flag ? 'Readmitted' : 'No readmit'}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )
            }
        </div>
    );
}

/* ─── Care Plan Tab ──────────────────────────────────────────────────────── */
function CarePlanTab({ carePlan, isLoading, signed, onSign }) {
    if (isLoading || !carePlan) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-md)' }} />
            ))}
        </div>
    );

    const riskPct = Math.round((carePlan.risk_score ?? 0) * 100);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Risk banner */}
            <div style={{
                background: 'var(--risk-critical-bg)',
                border: '1px solid var(--risk-critical-border)',
                borderLeft: '4px solid var(--risk-critical)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
            }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--risk-critical)', marginBottom: 4 }}>
                    {riskPct}% readmission risk — {carePlan.risk_tier ?? 'Unknown'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    This patient is in the top 4% of risk scores today. Immediate care coordination recommended.
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Generated: {carePlan.generated_at ? format(new Date(carePlan.generated_at), 'MMM d, h:mm a') : '—'} · {carePlan.generation_time_ms?.toFixed(0)}ms
                </p>
            </div>

            {/* Recommendation cards */}
            {(carePlan.recommendations || []).map((rec, i) => {
                const gradeA = rec.evidence_grade === 'A';
                return (
                    <div
                        key={i}
                        className="card"
                        style={{
                            padding: '18px 20px',
                            borderLeft: `3px solid ${gradeA ? 'var(--risk-low)' : rec.evidence_grade === 'B' ? 'var(--risk-medium)' : 'var(--border-default)'}`,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Priority circle */}
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%',
                                    background: 'var(--accent-primary)', color: '#FFFFFF',
                                    fontSize: 11, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'DM Mono, monospace',
                                    flexShrink: 0,
                                }}>
                                    {i + 1}
                                </div>
                                <span className="t-micro">{rec.category_label}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{
                                    fontSize: 10, fontWeight: 700,
                                    background: gradeA ? 'var(--risk-low-bg)' : 'var(--bg-sunken)',
                                    color: gradeA ? 'var(--risk-low)' : 'var(--text-muted)',
                                    border: `1px solid ${gradeA ? 'var(--risk-low-border)' : 'var(--border-subtle)'}`,
                                    borderRadius: 'var(--radius-pill)',
                                    padding: '2px 8px',
                                }}>
                                    Grade {rec.evidence_grade}
                                </span>
                                <span style={{
                                    fontSize: 10, fontWeight: 600,
                                    background: 'var(--accent-light)',
                                    color: 'var(--accent-primary)',
                                    border: '1px solid var(--accent-mid)',
                                    borderRadius: 'var(--radius-pill)',
                                    padding: '2px 8px',
                                }}>
                                    {rec.time_sensitivity?.replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>

                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                            {rec.action}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {rec.rationale}
                        </p>

                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
                        }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Responsible: {rec.responsible_role?.replace(/_/g, ' ')} ·{' '}
                                <span style={{ color: 'var(--risk-low)', fontWeight: 600 }}>
                                    −{rec.reduces_readmission_by_pct}% readmission risk
                                </span>
                            </span>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                                Mark Complete ✓
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Evidence summary */}
            <div className="card" style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Based on:</span>{' '}
                    Cohort "{carePlan.cohort_name}" (avg risk {Math.round((carePlan.cohort_average_risk ?? 0) * 100)}%) ·{' '}
                    {carePlan.similar_patient_outcomes?.length ?? 0} similar patient outcomes ·{' '}
                    {carePlan.recommendation_count ?? 0} evidence-based recommendations
                </p>
            </div>

            {/* Clinician sign-off */}
            <div style={{
                padding: '14px 18px', borderRadius: 'var(--radius-md)',
                background: signed ? 'var(--risk-low-bg)' : 'var(--bg-sunken)',
                border: `1px solid ${signed ? 'var(--risk-low-border)' : 'var(--border-subtle)'}`,
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all var(--t-base)',
            }}>
                <button
                    onClick={onSign}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        color: signed ? 'var(--risk-low)' : 'var(--text-secondary)',
                        fontSize: 14, fontWeight: 500,
                        background: 'none', border: 'none', cursor: 'pointer',
                        transition: 'color var(--t-fast)',
                        fontFamily: "'Instrument Sans', sans-serif",
                    }}
                >
                    <CheckSquare size={18} color={signed ? 'var(--risk-low)' : 'var(--text-muted)'} />
                    {signed ? 'Care plan reviewed and signed ✓' : 'Clinician sign-off — mark as reviewed'}
                </button>
            </div>
        </div>
    );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function PatientDetailSkeleton() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton" style={{ height: 8, width: 80, borderRadius: 4 }} />
            <div className="card skeleton" style={{ height: 130 }} />
            <div style={{ display: 'flex', gap: 4 }}>
                {[80, 90, 80, 80].map((w, i) => (
                    <div key={i} className="skeleton" style={{ height: 36, width: w, borderRadius: 6 }} />
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 220, borderRadius: 12 }} />
                ))}
            </div>
        </div>
    );
}
