import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Calendar, Clock, Download, CheckSquare, ChevronRight } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';
import RiskBadge from '../design-system/components/RiskBadge.jsx';
import RiskGauge from '../design-system/components/RiskGauge.jsx';
import ShapWaterfall from '../design-system/components/ShapWaterfall.jsx';
import RecommendationCard from '../design-system/components/RecommendationCard.jsx';
import { usePatient, useCarePlan } from '../services/hooks.js';
import { mockCarePlan } from '../services/mockData.js';

const TABS = ['Overview', 'Risk Analysis', 'Admissions', 'Care Plan'];

const TOOLTIP_STYLE = {
    contentStyle: { background: '#1C2333', border: '1px solid #1F2937', borderRadius: '8px', color: '#F9FAFB', fontSize: '12px' },
};

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

    if (patientLoading) return <PatientDetailSkeleton />;
    if (!patient) return (
        <div className="text-center py-24" style={{ color: '#4B5563' }}>
            <p style={{ fontSize: '18px' }}>Patient not found.</p>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Back + header */}
            <div>
                <button
                    className="flex items-center gap-1.5 mb-4"
                    style={{ color: '#9CA3AF', fontSize: '13px', transition: 'color 150ms' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#F9FAFB'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; }}
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft size={15} /> Back
                </button>

                <div
                    className="card flex flex-wrap items-start justify-between gap-4"
                    style={{ borderRadius: '14px' }}
                >
                    <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00D4FF', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: '16px' }}
                        >
                            {patient.patient_id?.[4] || 'P'}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '22px', color: '#F9FAFB' }}>
                                    {patient.patient_id}
                                </h1>
                                <RiskBadge tier={plan?.risk_tier || 'high'} size="md" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                {[
                                    patient.age && `${patient.age}yo`,
                                    patient.gender,
                                    patient.insurance_category,
                                    patient.cluster_name,
                                ].filter(Boolean).map((v, i) => (
                                    <span
                                        key={i}
                                        style={{
                                            fontSize: '12px', padding: '2px 10px', borderRadius: '9999px',
                                            background: '#1C2333', border: '1px solid #1F2937', color: '#9CA3AF',
                                        }}
                                    >
                                        {v}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '20px', fontWeight: 600, color: '#00D4FF' }}>
                                {patient.prior_admissions_12m ?? '—'}
                            </p>
                            <p style={{ fontSize: '11px', color: '#9CA3AF' }}>Admits (12m)</p>
                        </div>
                        <div className="text-center">
                            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '20px', fontWeight: 600, color: '#F59E0B' }}>
                                {patient.charlson_comorbidity_index?.toFixed(1) ?? '—'}
                            </p>
                            <p style={{ fontSize: '11px', color: '#9CA3AF' }}>CCI Score</p>
                        </div>
                        <div className="text-center">
                            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '20px', fontWeight: 600, color: '#EF4444' }}>
                                {patient.prior_readmissions_1y ?? '—'}
                            </p>
                            <p style={{ fontSize: '11px', color: '#9CA3AF' }}>Readmits (1yr)</p>
                        </div>
                        {patient.high_utilizer_flag && (
                            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600 }}>
                                HIGH UTILIZER
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div
                className="flex gap-0.5"
                style={{ background: '#111827', borderRadius: '10px', padding: '4px', border: '1px solid #1F2937', width: 'fit-content' }}
            >
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '7px 18px',
                            borderRadius: '7px',
                            fontSize: '13px',
                            fontWeight: tab === t ? 600 : 400,
                            color: tab === t ? '#F9FAFB' : '#9CA3AF',
                            background: tab === t ? '#1C2333' : 'transparent',
                            transition: 'all 150ms ease',
                            border: tab === t ? '1px solid #1F2937' : '1px solid transparent',
                        }}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    {tab === 'Overview' && <OverviewTab patient={patient} carePlan={plan} />}
                    {tab === 'Risk Analysis' && <RiskAnalysisTab carePlan={plan} isLoading={planLoading} />}
                    {tab === 'Admissions' && <AdmissionsTab patient={patient} />}
                    {tab === 'Care Plan' && <CarePlanTab carePlan={plan} isLoading={planLoading} signed={signed} onSign={() => setSigned(!signed)} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

// ── Tab components ─────────────────────────────────────────────────────────

function OverviewTab({ patient, carePlan }) {
    return (
        <div className="grid grid-cols-3 gap-4">
            {/* Demographics */}
            <div className="card">
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={15} color="#00D4FF" /> Demographics
                </h3>
                <dl className="space-y-3">
                    {[
                        ['Patient ID', patient.patient_id],
                        ['Age', patient.age ? `${patient.age} years` : '—'],
                        ['Gender', patient.gender || '—'],
                        ['Race / Ethnicity', patient.race_ethnicity || '—'],
                        ['Insurance', patient.insurance_category || '—'],
                        ['Department', patient.admissions?.[0]?.department || '—'],
                    ].map(([label, value]) => (
                        <div key={label} className="flex justify-between items-start gap-2">
                            <dt style={{ fontSize: '12px', color: '#9CA3AF', flexShrink: 0 }}>{label}</dt>
                            <dd
                                style={{
                                    fontSize: '12px', fontWeight: 500, color: '#F9FAFB', textAlign: 'right',
                                    fontFamily: label === 'Patient ID' ? '"JetBrains Mono", monospace' : 'inherit',
                                    color: label === 'Patient ID' ? '#00D4FF' : '#F9FAFB',
                                }}
                            >
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            {/* Current Admission */}
            <div className="card">
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={15} color="#00D4FF" /> Current Admission
                </h3>
                {patient.admissions?.[0] ? (
                    <dl className="space-y-3">
                        {[
                            ['Admission ID', patient.admissions[0].admission_id],
                            ['Type', patient.admissions[0].admission_type || '—'],
                            ['Admitted', patient.admissions[0].admission_date || '—'],
                            ['LOS', patient.admissions[0].length_of_stay_days ? `${patient.admissions[0].length_of_stay_days.toFixed(1)} days` : '—'],
                            ['ICU', patient.admissions[0].icu_flag ? 'Yes' : 'No'],
                            ['Emergency', patient.admissions[0].emergency_flag ? 'Yes' : 'No'],
                        ].map(([label, value]) => (
                            <div key={label} className="flex justify-between items-start gap-2">
                                <dt style={{ fontSize: '12px', color: '#9CA3AF', flexShrink: 0 }}>{label}</dt>
                                <dd style={{
                                    fontSize: '12px', fontWeight: 500, textAlign: 'right',
                                    fontFamily: label === 'Admission ID' ? '"JetBrains Mono", monospace' : 'inherit',
                                    color: label === 'Admission ID' ? '#00D4FF'
                                        : (label === 'ICU' || label === 'Emergency') && value === 'Yes' ? '#F59E0B' : '#F9FAFB',
                                }}>
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p style={{ fontSize: '13px', color: '#4B5563' }}>No active admission.</p>
                )}
            </div>

            {/* Comorbidities */}
            <div className="card">
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={15} color="#00D4FF" /> Comorbidities
                </h3>
                <div className="space-y-2">
                    {(patient.top_diagnoses || ['No diagnosis data available']).map((dx, i) => (
                        <div
                            key={i}
                            style={{ padding: '8px 12px', background: '#1C2333', borderRadius: '7px', border: '1px solid #1F2937' }}
                        >
                            <p style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: '#9CA3AF' }}>{dx}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid #1F2937' }}>
                    <div className="flex justify-between">
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Comorbidity count</span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#F59E0B', fontWeight: 600 }}>{patient.comorbidity_count ?? '—'}</span>
                    </div>
                    <div className="flex justify-between mt-2">
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Risk cohort</span>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{patient.risk_cohort?.replace(/T\d_/, '') || '—'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RiskAnalysisTab({ carePlan, isLoading }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                {/* Gauge */}
                <div className="card flex flex-col items-center justify-center py-8">
                    <RiskGauge score={carePlan?.risk_score || 0.5} size={260} isLoading={isLoading} />
                </div>

                {/* SHAP waterfall */}
                <div className="card">
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px' }}>
                        Risk Factor Analysis
                    </h3>
                    <ShapWaterfall factors={carePlan?.risk_factors || []} isLoading={isLoading} />
                </div>
            </div>

            {/* Similar patients */}
            {carePlan?.similar_patient_outcomes?.length > 0 && (
                <div className="card">
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '4px' }}>
                        Similar Patient Outcomes
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
                        Nearest patients in cohort "{carePlan.cohort_name}" with positive outcomes
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        {carePlan.similar_patient_outcomes.map((sp, i) => (
                            <motion.div
                                key={sp.patient_id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.08 }}
                                style={{ padding: '12px', background: '#1C2333', borderRadius: '8px', border: '1px solid #1F2937' }}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: '#00D4FF' }}>{sp.patient_id}</span>
                                    <span style={{ fontSize: '10px', color: '#10B981', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                                        {Math.round(sp.similarity * 100)}% similar
                                    </span>
                                </div>
                                <p style={{ fontSize: '11px', color: '#10B981', fontWeight: 600 }}>{sp.outcome}</p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
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

function AdmissionsTab({ patient }) {
    const admissions = patient?.admissions || [];
    return (
        <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '16px' }}>
                Admission History
            </h3>
            {admissions.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#4B5563' }}>No admission history available.</p>
            ) : (
                <div className="space-y-2">
                    {admissions.map((adm, i) => (
                        <motion.div
                            key={adm.admission_id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            style={{
                                padding: '14px 16px', borderRadius: '9px',
                                background: i === 0 ? 'rgba(0,212,255,0.05)' : '#1C2333',
                                border: `1px solid ${i === 0 ? 'rgba(0,212,255,0.2)' : '#1F2937'}`,
                                display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '16px', alignItems: 'center',
                            }}
                        >
                            <div>
                                {i === 0 && <span style={{ fontSize: '10px', color: '#00D4FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</span>}
                                <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#00D4FF' }}>{adm.admission_id}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '13px', color: '#F9FAFB' }}>{adm.primary_diagnosis_category || adm.department}</p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>{adm.admission_date} – {adm.discharge_date || 'present'}</p>
                            </div>
                            <div className="text-right">
                                <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '14px', fontWeight: 600, color: '#F9FAFB' }}>
                                    {adm.length_of_stay_days?.toFixed(1)}d
                                </p>
                                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>LOS</p>
                            </div>
                            <div>
                                {adm.readmit_30day_flag !== undefined && (
                                    <span style={{
                                        fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                        background: adm.readmit_30day_flag ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                        color: adm.readmit_30day_flag ? '#EF4444' : '#10B981',
                                    }}>
                                        {adm.readmit_30day_flag ? 'Readmitted' : 'No readmit'}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CarePlanTab({ carePlan, isLoading, signed, onSign }) {
    if (isLoading || !carePlan) return (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Risk summary banner */}
            <div
                style={{
                    padding: '16px 20px', borderRadius: '10px',
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                }}
            >
                <div className="flex items-center gap-3">
                    <RiskBadge tier={carePlan.risk_tier} size="md" />
                    <p style={{ fontSize: '14px', color: '#F9FAFB', fontWeight: 500 }}>
                        {Math.round((carePlan.risk_score || 0) * 100)}% predicted readmission probability
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        Generated: {carePlan.generated_at ? format(new Date(carePlan.generated_at), 'MMM d, h:mm a') : '—'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {carePlan.generation_time_ms?.toFixed(0)}ms
                    </span>
                    <button className="btn-ghost py-1.5 px-3" style={{ fontSize: '12px' }}>
                        <Download size={13} /> Export PDF
                    </button>
                </div>
            </div>

            {/* Recommendations */}
            <div className="relative space-y-2">
                {(carePlan.recommendations || []).map((rec, i) => (
                    <RecommendationCard key={i} rec={rec} index={i} />
                ))}
            </div>

            {/* Evidence summary */}
            <div className="card">
                <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    <span style={{ color: '#F9FAFB', fontWeight: 500 }}>Based on:</span> {' '}
                    Similar patient cohort "{carePlan.cohort_name}" (avg risk {Math.round((carePlan.cohort_average_risk || 0) * 100)}%) ·
                    {' '}{carePlan.similar_patient_outcomes?.length || 0} similar patient outcomes ·
                    {' '}{carePlan.recommendation_count || 0} evidence-based recommendations
                </p>
            </div>

            {/* Clinician sign-off */}
            <div
                style={{ padding: '16px 20px', borderRadius: '10px', background: '#111827', border: '1px solid #1F2937', display: 'flex', alignItems: 'center', gap: '12px' }}
            >
                <button
                    onClick={onSign}
                    className="flex items-center gap-2"
                    style={{ color: signed ? '#10B981' : '#9CA3AF', fontSize: '14px', fontWeight: 500, transition: 'color 150ms' }}
                >
                    <CheckSquare size={18} color={signed ? '#10B981' : '#4B5563'} />
                    {signed ? 'Care plan reviewed and signed' : 'Clinician sign-off — mark as reviewed'}
                </button>
            </div>
        </div>
    );
}

function PatientDetailSkeleton() {
    return (
        <div className="space-y-5">
            <div className="skeleton h-8 w-24" />
            <div className="card h-28 skeleton" />
            <div className="skeleton h-10 w-72" />
            <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
            </div>
        </div>
    );
}
