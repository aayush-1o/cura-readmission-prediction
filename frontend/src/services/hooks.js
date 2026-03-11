import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { api } from './api.js';
import {
    mockDashboard, mockTrends, mockHighRiskPatients,
    mockDepartments, mockRiskDistribution, mockSparklines,
} from './mockData.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function mockify(data, delay = 0) {
    return new Promise((resolve) => setTimeout(() => resolve({ data }), delay));
}

// ─── Analytics hooks ─────────────────────────────────────────────────────────

export function useDashboardSummary() {
    return useQuery({
        queryKey: ['analytics', 'dashboard'],
        queryFn: async () => {
            if (USE_MOCK) return (await mockify(mockDashboard)).data;
            const res = await api.getDashboardSummary();
            return res.data;
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function useReadmissionTrends(params = {}) {
    return useQuery({
        queryKey: ['analytics', 'trends', params],
        queryFn: async () => {
            if (USE_MOCK) return (await mockify(mockTrends)).data;
            const res = await api.getReadmissionTrends(params);
            return res.data;
        },
    });
}

export function useDepartmentBreakdown(params = {}) {
    return useQuery({
        queryKey: ['analytics', 'departments', params],
        queryFn: async () => {
            if (USE_MOCK) return (await mockify(mockDepartments)).data;
            const res = await api.getDepartmentBreakdown(params);
            return res.data;
        },
    });
}

export function useRiskDistribution(params = {}) {
    return useQuery({
        queryKey: ['analytics', 'risk-distribution', params],
        queryFn: async () => {
            if (USE_MOCK) return (await mockify(mockRiskDistribution)).data;
            const res = await api.getRiskDistribution(params);
            return res.data;
        },
    });
}

export function useHighRiskToday(params = {}) {
    return useQuery({
        queryKey: ['analytics', 'high-risk-today', params],
        queryFn: async () => {
            if (USE_MOCK) return (await mockify(mockHighRiskPatients)).data;
            const res = await api.getHighRiskToday(params);
            return res.data;
        },
        refetchInterval: 60 * 1000, // poll every 60s
    });
}

export function useSparklines() {
    return { data: mockSparklines, isLoading: false };
}


// ─── Patient hooks ────────────────────────────────────────────────────────────
// NOTE: keepPreviousData was removed in @tanstack/react-query v5.
// Use placeholderData: keepPreviousData (imported at top of file) instead.

export function usePatients(params = {}) {
    return useQuery({
        queryKey: ['patients', 'list', params],
        queryFn: async () => {
            if (USE_MOCK) {
                const { mockPatients } = await import('./mockData.js').catch(() => ({ mockPatients: [] }));
                return { data: mockPatients || [], total: 100, page: 1, page_size: 25, pages: 4 };
            }
            const res = await api.listPatients(params);
            return res.data;
        },
        placeholderData: keepPreviousData,
    });
}

export function usePatient(patientId) {
    return useQuery({
        queryKey: ['patients', patientId],
        queryFn: async () => {
            if (USE_MOCK) {
                const { mockPatient } = await import('./mockData.js');
                return { ...mockPatient, patient_id: patientId };
            }
            const res = await api.getPatient(patientId);
            return res.data;
        },
        enabled: !!patientId,
    });
}

// ─── Prediction hooks ─────────────────────────────────────────────────────────

export function useRiskScore(admissionId) {
    return useQuery({
        queryKey: ['predictions', admissionId],
        queryFn: async () => {
            if (USE_MOCK) {
                return {
                    patient_id: 'PAT-010042',
                    admission_id: admissionId,
                    risk_score: 0.82,
                    risk_tier: 'critical',
                    risk_tier_color: 'var(--status-danger)',
                    model_name: 'xgboost_readmission_v1',
                    model_version: '1.0.0',
                    top_features: [],
                };
            }
            const res = await api.getRiskScore(admissionId);
            return res.data;
        },
        enabled: !!admissionId,
    });
}

// ─── Care plan hooks ──────────────────────────────────────────────────────────

export function useCarePlan(patientId, admissionId) {
    return useQuery({
        queryKey: ['recommendations', 'care-plan', patientId, admissionId],
        queryFn: async () => {
            if (USE_MOCK) {
                const { mockCarePlan } = await import('./mockData.js');
                return mockCarePlan;
            }
            const res = await api.getCarePlan(patientId, admissionId);
            return res.data;
        },
        enabled: !!patientId && !!admissionId,
    });
}

export function useClusterProfiles() {
    return useQuery({
        queryKey: ['recommendations', 'clusters'],
        queryFn: async () => {
            if (USE_MOCK) return [];
            const res = await api.getClusterProfiles();
            return res.data;
        },
        staleTime: 30 * 60 * 1000,
    });
}

// ─── Reports hooks ────────────────────────────────────────────────────────────

export function useReports(params = {}) {
    return useQuery({
        queryKey: ['reports', 'list', params],
        queryFn: async () => {
            if (USE_MOCK) {
                // Return the same seed data in mock mode
                const { default: SEED } = await import('../pages/Reports.jsx').catch(() => ({ default: null }));
                // Fallback: inline seed so hook works independently of Reports.jsx
                return [
                    { job_id: 'a1b2c3d4-0001', report_type: 'high_risk_daily',         name: 'High-Risk Patient Daily Brief',  created_at: '2026-03-11T06:00:00', status: 'complete', progress: 100, file_size_bytes: 250880,  formats: ['pdf', 'csv'], is_seed: true },
                    { job_id: 'a1b2c3d4-0002', report_type: 'dept_readmission_monthly', name: 'Department Readmission Report',  created_at: '2026-03-10T18:00:00', status: 'complete', progress: 100, file_size_bytes: 1258291, formats: ['pdf'],        is_seed: true },
                    { job_id: 'a1b2c3d4-0003', report_type: 'patient_care_plan',        name: 'Care Plan: PAT-010000',          created_at: '2026-03-11T09:31:00', status: 'complete', progress: 100, file_size_bytes: 91136,   formats: ['pdf'],        is_seed: true },
                    { job_id: 'a1b2c3d4-0004', report_type: 'model_performance_weekly', name: 'Model Performance Wk 10',       created_at: '2026-03-10T07:00:00', status: 'complete', progress: 100, file_size_bytes: 421888,  formats: ['pdf'],        is_seed: true },
                    { job_id: 'a1b2c3d4-0005', report_type: 'high_risk_daily',         name: 'High-Risk Patient Daily Brief',  created_at: '2026-03-10T06:00:00', status: 'complete', progress: 100, file_size_bytes: 243712,  formats: ['pdf', 'csv'], is_seed: true },
                    { job_id: 'a1b2c3d4-0006', report_type: 'pipeline_sla_weekly',     name: 'Pipeline SLA Week 10',           created_at: '2026-03-10T07:00:00', status: 'generating', progress: 45, file_size_bytes: null,  formats: ['pdf', 'csv'], is_seed: true },
                ];
            }
            const res = await api.listReports(params);
            return res.data;
        },
        refetchInterval: 30 * 1000, // refresh every 30s to catch newly completed jobs
        staleTime: 10 * 1000,
    });
}
