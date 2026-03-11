import { useEffect, useRef } from 'react';

/**
 * useAlertStream
 * ==============
 * Opens an EventSource connection to /api/v1/alerts/stream.
 * Calls onNewAlert(alert) for each alert in the payload.
 * Calls onHeartbeat() on heartbeat events (optional).
 *
 * EventSource auto-reconnects on disconnect — no manual retry logic needed.
 *
 * Tech decision — SSE vs WebSocket:
 *   - Alerts flow one-way: server → client.
 *   - SSE is a standard HTTP connection, works through load balancers and
 *     proxies without extra configuration, and auto-reconnects natively.
 *   - WebSockets are bidirectional and add unnecessary complexity for
 *     a one-way push use case.
 */
export function useAlertStream(onNewAlert, onHeartbeat) {
    const cbRef      = useRef(onNewAlert);
    const hbRef      = useRef(onHeartbeat);

    // Keep refs up-to-date so we don't recreate the ES on every render
    useEffect(() => { cbRef.current = onNewAlert; }, [onNewAlert]);
    useEffect(() => { hbRef.current = onHeartbeat; }, [onHeartbeat]);

    useEffect(() => {
        const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const token = localStorage.getItem('careiq_access_token');

        // SSE with Authorization is tricky — the EventSource spec doesn't
        // support custom headers. We use a query-param token instead for dev.
        // In production, short-lived session cookies or signed URL tokens are
        // the recommended approach.
        const url = `${BASE}/api/v1/alerts/stream${token ? `?token=${token}` : ''}`;

        let es;
        try {
            es = new EventSource(url);
        } catch {
            // If SSE fails (e.g. backend not running), fail silently in dev
            console.warn('[AlertStream] Could not open SSE connection.');
            return;
        }

        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'alerts' && Array.isArray(data.payload)) {
                    data.payload.forEach((alert) => cbRef.current?.(alert));
                } else if (data.type === 'heartbeat') {
                    hbRef.current?.();
                }
            } catch {
                // Ignore malformed events
            }
        };

        es.onerror = () => {
            // EventSource auto-reconnects — just log the notice
            console.warn('[AlertStream] Stream disconnected, reconnecting...');
        };

        return () => {
            es.close();
        };
    }, []); // Open once, refs handle callback changes
}
