import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import RiskQueue from './pages/RiskQueue.jsx';
import Analytics from './pages/Analytics.jsx';
import DataPlatform from './pages/DataPlatform.jsx';
import Alerts from './pages/Alerts.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Reports from './pages/Reports.jsx';

function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth();
    // Also check localStorage directly — handles the case where we just wrote
    // a token (login) before the AuthContext re-render has propagated.
    const hasToken = !!localStorage.getItem('careiq_access_token');
    if (isLoading) return null;
    if (!isAuthenticated && !hasToken) return <Navigate to="/login" replace />;
    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <AppLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Navigate to="/dashboard" replace />} />
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="patients" element={<Patients />} />
                        <Route path="patients/:patientId" element={<PatientDetail />} />
                        <Route path="risk-queue" element={<RiskQueue />} />
                        <Route path="analytics" element={<Analytics />} />
                        <Route path="data-platform" element={<DataPlatform />} />
                        <Route path="alerts"        element={<Alerts />} />
                        <Route path="audit-log"     element={<AuditLog />} />
                        <Route path="reports"       element={<Reports />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
