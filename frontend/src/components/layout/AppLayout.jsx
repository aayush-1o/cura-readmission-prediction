import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();

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
                criticalCount={4}
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
                <TopBar unreadCount={1} />

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
