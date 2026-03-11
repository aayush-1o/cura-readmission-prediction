import axios from 'axios';
import toast from 'react-hot-toast';

// ─── Axios instance ──────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: inject token ──────────────────────────────────────
apiClient.interceptors.request.use((config) => {
    if (import.meta.env.DEV) {
        console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
});

// ─── Response interceptor: token refresh on 401 ─────────────────────────────
let refreshing = false;
let queue = [];

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
            if (refreshing) {
                return new Promise((resolve) => {
                    queue.push(() => resolve(apiClient(original)));
                });
            }
            original._retry = true;
            refreshing = true;

            try {
                const refreshToken = localStorage.getItem('careiq_refresh_token');
                if (!refreshToken) throw new Error('No refresh token');

                const res = await axios.post(`${BASE_URL}/auth/refresh`, {
                    refresh_token: refreshToken,
                });

                const { access_token, refresh_token: newRefresh } = res.data;
                localStorage.setItem('careiq_access_token', access_token);
                localStorage.setItem('careiq_refresh_token', newRefresh);
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

                queue.forEach((fn) => fn());
                queue = [];
                return apiClient(original);
            } catch {
                toast.error('Session expired. Please sign in again.');
                localStorage.clear();
                window.location.href = '/login';
            } finally {
                refreshing = false;
            }
        }

        // Parse error to user-friendly message
        const message =
            error.response?.data?.detail?.message ||
            error.response?.data?.message ||
            error.message ||
            'An unexpected error occurred.';

        if (error.response?.status === 403) {
            toast.error(`Access denied: ${message}`);
        } else if (error.response?.status >= 500) {
            toast.error('Server error. Please try again in a moment.');
        }

        return Promise.reject(error);
    }
);

// ─── API functions ───────────────────────────────────────────────────────────

export const api = {
    // Analytics
    getDashboardSummary: () => apiClient.get('/api/v1/analytics/dashboard'),
    getReadmissionTrends: (params) => apiClient.get('/api/v1/analytics/readmission-trends', { params }),
    getDepartmentBreakdown: (params) => apiClient.get('/api/v1/analytics/department-breakdown', { params }),
    getRiskDistribution: (params) => apiClient.get('/api/v1/analytics/risk-distribution', { params }),
    getLOSByDiagnosis: () => apiClient.get('/api/v1/analytics/los-by-diagnosis'),
    getHighRiskToday: (params) => apiClient.get('/api/v1/analytics/high-risk-today', { params }),

    // Patients
    listPatients: (params) => apiClient.get('/api/v1/patients', { params }),
    getPatient: (id) => apiClient.get(`/api/v1/patients/${id}`),
    getPatientAdmissions: (id, params) => apiClient.get(`/api/v1/patients/${id}/admissions`, { params }),

    // Predictions
    getRiskScore: (admissionId) => apiClient.get(`/api/v1/predictions/${admissionId}`),
    batchScore: (admissionIds) => apiClient.post('/api/v1/predictions/batch', { admission_ids: admissionIds }),

    // Recommendations
    getCarePlan: (patientId, admissionId) =>
        apiClient.post(`/api/v1/recommendations/care-plan/${patientId}/${admissionId}`),
    getAssociationRules: (params) => apiClient.get('/api/v1/recommendations/rules', { params }),
    getClusterProfiles: () => apiClient.get('/api/v1/recommendations/clusters/profiles'),
    getSimilarPatients: (patientId, n = 5) =>
        apiClient.get(`/api/v1/recommendations/patients/${patientId}/similar`, { params: { n } }),

    // Reports
    listReports: (params) => apiClient.get('/api/v1/reports', { params }),
    generateReport: (body) => apiClient.post('/api/v1/reports/generate', body),
    getReportJob: (jobId) => apiClient.get(`/api/v1/reports/jobs/${jobId}`),
    downloadReport: (jobId, fmt) => apiClient.get(`/api/v1/reports/jobs/${jobId}/download/${fmt}`, { responseType: 'blob' }),
};
