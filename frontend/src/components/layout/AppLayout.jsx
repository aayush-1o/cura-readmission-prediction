import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import { useAlertStream } from '../../hooks/useAlertStream.js';

/* ─── Static mock alerts that seed AppLayout before the API is available ─── */
const INITIAL_ALERTS = [
    {
        alert_id: 'a1',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010000 admitted to Cardiology with risk score 95%',
        created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010000', related_pipeline: null,
    },
    {
        alert_id: 'a2',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010001 admitted to Cardiology with risk score 91%',
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010001', related_pipeline: null,
    },
    {
        alert_id: 'a3',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010007 risk increased from 45% to 77% in last 6h',
        created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010007', related_pipeline: null,
    },
    {
        alert_id: 'a4',
        alert_type: 'vital_anomaly',
        severity: 'high',
        title: 'Vital Sign Anomaly',
        description: 'PAT-010003: SpO₂ = 88% (expected 95–100%)',
        created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: 'PAT-010003', related_pipeline: null,
    },
    {
        alert_id: 'a5',
        alert_type: 'pipeline_failure',
        severity: 'warning',
        title: 'Pipeline Failed',
        description: 'Data Quality Monitor failed at 05:00. 0 rows processed.',
        created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: null, related_pipeline: 'Data Quality Monitor',
    },
    {
        alert_id: 'a6',
        alert_type: 'sla_breach',
        severity: 'warning',
        title: 'Data Freshness SLA Breach',
        description: 'fact_admissions has not been updated in 7h (SLA: 6h)',
        created_at: new Date(Date.now() - 55 * 60_000).toISOString(),
        acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
        related_patient_id: null, related_pipeline: 'EHR Ingestion',
    },
    {
        alert_id: 'a7',
        alert_type: 'new_critical_admission',
        severity: 'critical',
        title: 'New Critical Admission',
        description: 'PAT-010002 admitted to ICU with risk score 98%',
        created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 1.75 * 3600_000).toISOString(),
        acknowledged_by: 'dr.chen',
        acknowledged_note: 'Escalated to attending. Care team assigned.',
        related_patient_id: 'PAT-010002', related_pipeline: null,
    },
    {
        alert_id: 'a8',
        alert_type: 'risk_score_spike',
        severity: 'high',
        title: 'Risk Score Spike',
        description: 'PAT-010012 risk increased from 38% to 72% in last 6h',
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        acknowledged_at: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
        acknowledged_by: 'coordinator.rodriguez',
        acknowledged_note: 'Patient reassigned to high-risk bed. Family notified.',
        related_patient_id: 'PAT-010012', related_pipeline: null,
    },
];

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const [alerts, setAlerts] = useState(INITIAL_ALERTS);

    // ── SSE: surface new real-time alerts as toasts ──────────────────────────
    const handleNewAlert = useCallback((newAlert) => {
        // Deduplicate by alert_id
        setAlerts((prev) => {
            if (prev.some((a) => a.alert_id === newAlert.alert_id)) return prev;
            return [newAlert, ...prev];
        });
        // Show toast notification
        const icon = newAlert.severity === 'critical' ? '🚨' :
                     newAlert.severity === 'high'     ? '⚠️' : '⚡';
        toast(
            `${icon} ${newAlert.title}`,
            {
                duration: 6000,
                style: {
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    fontSize: 13,
                    padding: '10px 14px',
                    boxShadow: 'var(--shadow-lg)',
                },
            }
        );
    }, []);

    // Attach SSE stream (auto-reconnects on disconnect)
    useAlertStream(handleNewAlert);

    // ── Dismiss handler (optimistic local state) ─────────────────────────────
    const handleDismiss = useCallback((alertId) => {
        setAlerts((prev) =>
            prev.map((a) =>
                a.alert_id === alertId
                    ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: 'user' }
                    : a
            )
        );
    }, []);

    // ── Mark all read ────────────────────────────────────────────────────────
    const handleMarkAllRead = useCallback(() => {
        setAlerts((prev) =>
            prev.map((a) =>
                a.acknowledged_at
                    ? a
                    : { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: 'user' }
            )
        );
    }, []);

    const unreadCount = alerts.filter((a) => !a.acknowledged_at).length;

    return (
        <div
            style={{
                display: 'flex',
                height: '100vh',
                overflow: 'hidden',
                background: 'var(--bg-base)',
            }}
        >
            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <Sidebar
                collapsed={collapsed}
                onToggle={() => setCollapsed((c) => !c)}
                criticalCount={unreadCount}
            />

            {/* ── Main content ───────────────────────────────────────────── */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minWidth: 0,
                }}
            >
                <TopBar
                    alerts={alerts}
                    onDismissAlert={handleDismiss}
                    onMarkAllRead={handleMarkAllRead}
                />

                <main
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '24px',
                        background: 'var(--bg-base)',
                    }}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            style={{ maxWidth: 1440, margin: '0 auto' }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
