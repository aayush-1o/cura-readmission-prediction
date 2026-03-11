/**
 * Mock data for development without a live backend.
 * Set VITE_USE_MOCK=true in .env.local to activate.
 * The API service auto-detects this and returns mock responses.
 */

export const mockDashboard = {
    total_patients: 12847,
    total_admissions_30d: 1423,
    avg_readmission_rate_pct: 14.7,
    avg_los_days: 6.2,
    high_risk_patients_today: 38,
    avg_risk_score: 0.421,
    total_cost_30d: 8_420_000,
    department_count: 12,
    as_of: new Date().toISOString(),
};

export const mockTrends = Array.from({ length: 90 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (89 - i));
    return {
        period_start: d.toISOString().split('T')[0],
        department_name: ['Cardiology', 'Internal Medicine', 'Pulmonology'][i % 3],
        diagnosis_category: ['Cardiovascular', 'Respiratory', 'Infectious'][i % 3],
        total_admissions: 40 + Math.floor(Math.random() * 30),
        total_readmissions: 5 + Math.floor(Math.random() * 8),
        readmission_rate_pct: 12 + Math.random() * 8,
        avg_los_days: 5 + Math.random() * 4,
        avg_cost_usd: 6500 + Math.random() * 2000,
    };
});

export const mockHighRiskPatients = Array.from({ length: 20 }, (_, i) => ({
    patient_id: `PAT-${String(10000 + i).padStart(6, '0')}`,
    admission_id: `ADM-${String(20000 + i).padStart(6, '0')}`,
    age: 55 + i * 2,
    gender: i % 2 === 0 ? 'Male' : 'Female',
    department: ['Cardiology', 'Internal Medicine', 'Pulmonology', 'Nephrology'][i % 4],
    risk_score: 0.95 - i * 0.025,
    risk_tier: i < 5 ? 'critical' : i < 12 ? 'high' : 'medium',
    primary_diagnosis: ['CHF Exacerbation', 'COPD Exacerbation', 'CKD Stage 4', 'Sepsis', 'AKI'][i % 5],
    length_of_stay_days: 2 + i * 0.5,
    top_risk_factors: ['Prior readmissions', 'High CCI', 'ICU stay'],
    top_recommendation: ['Arrange home health', 'Medication reconciliation', 'TCM referral'][i % 3],
    charlson_cci: 4 + (i % 4),
}));

export const mockDepartments = [
    { department_name: 'Cardiology', readmission_rate: 18.2, benchmark_readmission_rate: 15.0, vs_benchmark_delta: 3.2, cms_star_rating: 2, performance_label: 'Below Benchmark', avg_los_days: 7.1, avg_cost_usd: 12400, rolling_3m_avg: 17.8, mom_readmission_delta: -0.4 },
    { department_name: 'Internal Medicine', readmission_rate: 12.1, benchmark_readmission_rate: 14.0, vs_benchmark_delta: -1.9, cms_star_rating: 4, performance_label: 'Above Benchmark', avg_los_days: 5.3, avg_cost_usd: 8200, rolling_3m_avg: 12.4, mom_readmission_delta: -0.3 },
    { department_name: 'Pulmonology', readmission_rate: 21.4, benchmark_readmission_rate: 18.0, vs_benchmark_delta: 3.4, cms_star_rating: 1, performance_label: 'Below Benchmark', avg_los_days: 8.2, avg_cost_usd: 9800, rolling_3m_avg: 20.8, mom_readmission_delta: 0.6 },
    { department_name: 'Nephrology', readmission_rate: 15.6, benchmark_readmission_rate: 16.0, vs_benchmark_delta: -0.4, cms_star_rating: 3, performance_label: 'On Target', avg_los_days: 6.4, avg_cost_usd: 11200, rolling_3m_avg: 15.9, mom_readmission_delta: -0.1 },
    { department_name: 'Orthopedics', readmission_rate: 6.2, benchmark_readmission_rate: 8.0, vs_benchmark_delta: -1.8, cms_star_rating: 5, performance_label: 'Above Benchmark', avg_los_days: 3.1, avg_cost_usd: 14200, rolling_3m_avg: 6.5, mom_readmission_delta: -0.5 },
];

export const mockPatient = {
    patient_id: 'PAT-010042',
    age: 72,
    age_group: '61-75',
    gender: 'Male',
    race_ethnicity: 'White',
    insurance_category: 'Medicare',
    comorbidity_count: 4,
    charlson_comorbidity_index: 6.2,
    risk_cohort: 'T1_CatastrophicRisk',
    cluster_name: 'Complex Elderly MultiMorbid',
    prior_admissions_12m: 3,
    prior_readmissions_1y: 2,
    high_utilizer_flag: true,
    last_admission_date: '2024-10-28',
    days_since_last_discharge: 45,
    top_diagnoses: ['I50.9 — CHF', 'N18.4 — CKD Stage 4', 'E11.9 — Type 2 DM', 'I10 — HTN'],
    admissions: Array.from({ length: 4 }, (_, i) => ({
        admission_id: `ADM-2400${i + 1}`,
        patient_id: 'PAT-010042',
        admission_date: new Date(Date.now() - (i + 1) * 90 * 86400000).toISOString().split('T')[0],
        discharge_date: new Date(Date.now() - (i + 1) * 90 * 86400000 + 7 * 86400000).toISOString().split('T')[0],
        department: 'Cardiology',
        admission_type: i === 0 ? 'Emergency' : 'Elective',
        length_of_stay_days: 5 + i * 2,
        icu_flag: i === 0,
        emergency_flag: i === 0,
        readmit_30day_flag: i < 2,
        total_charges: 18000 + i * 2000,
        insurance_category: 'Medicare',
        primary_diagnosis_category: 'Cardiovascular',
    })),
};

export const mockCarePlan = {
    patient_id: 'PAT-010042',
    admission_id: 'ADM-24001',
    generated_at: new Date().toISOString(),
    generation_time_ms: 42,
    risk_score: 0.82,
    risk_tier: 'critical',
    risk_tier_color: 'var(--status-danger)',
    risk_factors: [
        { feature: 'prior_readmissions_1y', display_label: 'Prior readmissions (1yr)', value: 2, shap_value: 0.28, direction: 'increases_risk' },
        { feature: 'charlson_comorbidity_index', display_label: 'Charlson CCI', value: 6.2, shap_value: 0.21, direction: 'increases_risk' },
        { feature: 'icu_flag', display_label: 'ICU this admission', value: 1, shap_value: 0.18, direction: 'increases_risk' },
        { feature: 'high_utilizer_flag', display_label: 'High utilizer', value: 1, shap_value: 0.15, direction: 'increases_risk' },
        { feature: 'prior_admissions_12m', display_label: 'Prior admissions (12m)', value: 3, shap_value: 0.12, direction: 'increases_risk' },
        { feature: 'has_chf', display_label: 'Congestive heart failure', value: 1, shap_value: 0.10, direction: 'increases_risk' },
        { feature: 'length_of_stay_days', display_label: 'Length of stay', value: 8, shap_value: 0.08, direction: 'increases_risk' },
    ],
    recommendations: [
        { priority: 1, category: 'specialist_referral', category_label: 'Specialist Referral', category_icon: '🩺', category_color: 'var(--accent-primary)', action: 'Refer to heart failure specialty clinic within 14 days of discharge', rationale: 'CHF patients seen in specialty clinic within 14 days have 34% lower 30-day readmission rates.', evidence_strength: 'high', evidence_grade: 'A', evidence_source: 'clinical_library', clinical_source: 'ACC/AHA 2022 Heart Failure Guidelines', reduces_readmission_by_pct: 34, time_sensitivity: 'within_7d', responsible_role: 'physician', icd10_relevance: ['I50.9'] },
        { priority: 2, category: 'discharge_planning', category_label: 'Discharge Planning', category_icon: '🏠', category_color: 'var(--status-success)', action: 'Arrange home health nursing for daily weight monitoring and medication assessment', rationale: 'Daily weight monitoring detects fluid retention before decompensation in CHF patients with 3 prior admissions.', evidence_strength: 'high', evidence_grade: 'A', evidence_source: 'clinical_library', clinical_source: 'ACC/AHA Heart Failure Guidelines 2022', reduces_readmission_by_pct: 28, time_sensitivity: 'before_discharge', responsible_role: 'care_coordinator', icd10_relevance: ['I50.9'] },
        { priority: 3, category: 'medication_management', category_label: 'Medication Management', category_icon: '💊', category_color: 'var(--status-warning)', action: 'Complete pharmacist-led medication reconciliation before discharge', rationale: 'Patient is on multiple medications. Polypharmacy significantly increases adverse drug event risk post-discharge.', evidence_strength: 'high', evidence_grade: 'A', evidence_source: 'clinical_library', clinical_source: 'ISMP; Joint Commission NPSG', reduces_readmission_by_pct: 14, time_sensitivity: 'before_discharge', responsible_role: 'pharmacist', icd10_relevance: [] },
        { priority: 4, category: 'discharge_planning', category_label: 'Discharge Planning', category_icon: '🏠', category_color: 'var(--status-success)', action: 'Assign transitional care nurse for 30-day post-discharge phone follow-up protocol', rationale: 'Patient profile matches Coleman Care Transitions Intervention candidates: high CCI, prior readmission history.', evidence_strength: 'high', evidence_grade: 'A', evidence_source: 'clinical_library', clinical_source: 'Coleman Care Transitions Intervention (JAMA 2006)', reduces_readmission_by_pct: 22, time_sensitivity: 'before_discharge', responsible_role: 'care_coordinator', icd10_relevance: [] },
        { priority: 5, category: 'patient_education', category_label: 'Patient Education', category_icon: '📋', category_color: 'var(--status-info)', action: 'Provide teach-back education on CHF warning signs: sudden weight gain, ankle edema, shortness of breath', rationale: 'Teach-back CHF symptom education reduces 30-day readmission by enabling patients to recognize decompensation early.', evidence_strength: 'high', evidence_grade: 'A', evidence_source: 'clinical_library', clinical_source: 'Teach-to-Goal (TTG) RCT, JAMA 2013', reduces_readmission_by_pct: 21, time_sensitivity: 'before_discharge', responsible_role: 'nurse', icd10_relevance: ['I50.9'] },
    ],
    recommendation_count: 5,
    categories_covered: ['specialist_referral', 'discharge_planning', 'medication_management', 'patient_education'],
    cohort_name: 'Complex Elderly MultiMorbid',
    cohort_average_risk: 0.71,
    similar_patient_outcomes: [
        { patient_id: 'PAT-009821', cluster_name: 'Complex Elderly MultiMorbid', age: 70, charlson_cci: 5.8, length_of_stay_days: 7, similarity: 0.94, outcome: 'No readmission' },
        { patient_id: 'PAT-008345', cluster_name: 'Complex Elderly MultiMorbid', age: 74, charlson_cci: 6.1, length_of_stay_days: 9, similarity: 0.91, outcome: 'No readmission' },
        { patient_id: 'PAT-011203', cluster_name: 'Complex Elderly MultiMorbid', age: 69, charlson_cci: 5.5, length_of_stay_days: 6, similarity: 0.88, outcome: 'No readmission' },
    ],
};

export const mockRiskDistribution = [
    { risk_tier: 'low', patient_count: 612, avg_risk_score: 0.18, score_date: new Date().toISOString().split('T')[0] },
    { risk_tier: 'medium', patient_count: 487, avg_risk_score: 0.49, score_date: new Date().toISOString().split('T')[0] },
    { risk_tier: 'high', patient_count: 198, avg_risk_score: 0.72, score_date: new Date().toISOString().split('T')[0] },
    { risk_tier: 'critical', patient_count: 87, avg_risk_score: 0.89, score_date: new Date().toISOString().split('T')[0] },
];

// 7-day sparkline data for MetricTiles
export const mockSparklines = {
    admissions: [118, 124, 131, 119, 142, 138, 147],
    highRisk: [31, 35, 29, 42, 38, 40, 38],
    readmitRate: [15.1, 14.8, 14.9, 15.2, 14.7, 14.5, 14.7],
    avgRiskScore: [0.43, 0.42, 0.44, 0.41, 0.43, 0.42, 0.42],
};
