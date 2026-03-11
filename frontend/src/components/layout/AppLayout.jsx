import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, Users, Activity, BarChart3,
    Settings, ChevronLeft, ChevronRight, Bell, LogOut,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import clsx from 'clsx';

const NAV_ITEMS = [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Patients', to: '/patients', icon: Users },
    { label: 'Risk Queue', to: '/risk-queue', icon: Activity },
    { label: 'Analytics', to: '/analytics', icon: BarChart3 },
];

const ROLE_COLORS = {
    clinician: '#00D4FF',
    care_coordinator: '#10B981',
    analyst: '#F59E0B',
    admin: '#EF4444',
};

export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const sidebarW = collapsed ? '64px' : '240px';

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            {/* ── Sidebar ─────────────────────────────────────────────────────── */}
            <motion.aside
                animate={{ width: sidebarW }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{
                    background: 'var(--bg-sidebar)',
                    borderRight: '1px solid #1F2937',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    flexShrink: 0,
                    zIndex: 10,
                }}
            >
                {/* Logo */}
                <div
                    className="flex items-center gap-3 px-4"
                    style={{ height: '64px', borderBottom: '1px solid #1F2937', overflow: 'hidden' }}
                >
                    {/* Pulse icon */}
                    <div
                        className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center pulse-danger"
                        style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <polyline points="1,8 4,8 5,3 7,13 9,5 11,10 12,8 15,8" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '15px', color: '#F9FAFB', lineHeight: 1.1 }}>CareIQ</p>
                                <p style={{ fontSize: '10px', color: '#4B5563', letterSpacing: '0.05em' }}>CLINICAL INTELLIGENCE</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Nav section label */}
                {!collapsed && (
                    <p className="section-label px-4 pt-5 pb-2">Navigation</p>
                )}

                {/* Nav items */}
                <nav className="flex-1 px-2 space-y-0.5 pt-2 overflow-y-auto">
                    {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) =>
                                clsx('flex items-center gap-3 rounded-xl w-full transition-all duration-150 group', {
                                    'px-3 py-2.5': !collapsed,
                                    'p-3 justify-center': collapsed,
                                })
                            }
                            style={({ isActive }) => ({
                                background: isActive ? 'rgba(0,212,255,0.10)' : 'transparent',
                                borderLeft: isActive && !collapsed ? '2px solid #00D4FF' : '2px solid transparent',
                                color: isActive ? '#00D4FF' : '#9CA3AF',
                            })}
                            title={collapsed ? label : undefined}
                        >
                            {({ isActive }) => (
                                <>
                                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
                                    <AnimatePresence>
                                        {!collapsed && (
                                            <motion.span
                                                initial={{ opacity: 0, width: 0 }}
                                                animate={{ opacity: 1, width: 'auto' }}
                                                exit={{ opacity: 0, width: 0 }}
                                                transition={{ duration: 0.15 }}
                                                style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}
                                            >
                                                {label}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom: user info + logout */}
                <div style={{ borderTop: '1px solid #1F2937', padding: collapsed ? '12px 8px' : '12px 12px' }}>
                    {!collapsed && user && (
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0"
                                style={{ background: `${ROLE_COLORS[user.role] || '#9CA3AF'}20`, color: ROLE_COLORS[user.role] || '#9CA3AF', border: `1px solid ${ROLE_COLORS[user.role] || '#9CA3AF'}40` }}
                            >
                                {user.name?.[0] || '?'}
                            </div>
                            <div className="min-w-0">
                                <p style={{ fontSize: '12px', fontWeight: 600, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                                <p style={{ fontSize: '11px', color: ROLE_COLORS[user.role] || '#9CA3AF', textTransform: 'capitalize' }}>{user.role?.replace('_', ' ')}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 w-full rounded-lg py-2 px-2 transition-colors duration-150"
                        style={{ color: '#4B5563', fontSize: '13px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#4B5563'; e.currentTarget.style.background = 'transparent'; }}
                        title="Sign out"
                    >
                        <LogOut size={16} />
                        {!collapsed && <span>Sign out</span>}
                    </button>
                </div>

                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute top-1/2 -right-3 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{
                        background: '#1C2333', border: '1px solid #1F2937',
                        color: '#9CA3AF', zIndex: 20, transform: 'translateY(-50%)',
                    }}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>
            </motion.aside>

            {/* ── Main content ───────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header
                    style={{
                        height: '64px', background: 'var(--bg-secondary)',
                        borderBottom: '1px solid #1F2937',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0 24px', flexShrink: 0,
                    }}
                >
                    <div>
                        <p style={{ fontSize: '12px', color: '#4B5563', fontFamily: '"JetBrains Mono", monospace' }}>
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Refresh indicator */}
                        <span
                            className="flex items-center gap-1.5"
                            style={{ fontSize: '11px', color: '#4B5563' }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                            Live data
                        </span>
                        {/* Notification bell */}
                        <button
                            className="relative w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--bg-tertiary)', color: '#9CA3AF', transition: 'color 150ms' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#F9FAFB'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; }}
                            aria-label="Notifications"
                        >
                            <Bell size={16} />
                            {/* Unread dot */}
                            <span
                                className="absolute top-1 right-1 w-2 h-2 rounded-full"
                                style={{ background: '#EF4444', border: '1.5px solid var(--bg-secondary)' }}
                            />
                        </button>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto" style={{ padding: '24px' }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ maxWidth: '1440px', margin: '0 auto' }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
