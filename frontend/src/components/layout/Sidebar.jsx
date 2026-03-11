import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, AlertTriangle, Users,
    BarChart2, FileText, Settings, LogOut, ChevronLeft, Database, Bell, ScrollText,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';

/* ─── Nav structure ──────────────────────────────────────────────────────── */
const PRIMARY_NAV = [
    { label: 'Dashboard',  to: '/dashboard',  icon: LayoutDashboard },
    { label: 'Risk Queue', to: '/risk-queue', icon: AlertTriangle, badge: true },
    { label: 'Patients',   to: '/patients',   icon: Users },
];
const ANALYTICS_NAV = [
    { label: 'Analytics',    to: '/analytics',     icon: BarChart2 },
    { label: 'Reports',      to: '/reports',       icon: FileText },
    { label: 'Data Platform',to: '/data-platform', icon: Database, pipelineAlert: true },
    { label: 'Alerts',       to: '/alerts',        icon: Bell,     criticalAlert: true },
    { label: 'Audit Log',    to: '/audit-log',     icon: ScrollText, adminOnly: true },
];

/* ─── Role accent colours ────────────────────────────────────────────────── */
const ROLE_COLOR = {
    clinician:        '#4F46E5',
    care_coordinator: '#059669',
    analyst:          '#D97706',
    admin:            '#DC2626',
};

/* ─── Inline styles ──────────────────────────────────────────────────────── */
const S = {
    sidebar: (w) => ({
        width: w,
        background: 'var(--bg-elevated)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
        transition: 'width 240ms var(--ease-out)',
    }),
    logoArea: {
        height: 54,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        borderBottom: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        flexShrink: 0,
    },
    logoMark: {
        width: 24,
        height: 24,
        borderRadius: 6,
        background: 'var(--accent-primary)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nav: {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '8px 0',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        padding: '14px 16px 4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
    },
    divider: {
        height: 1,
        background: 'var(--border-subtle)',
        margin: '6px 12px',
        flexShrink: 0,
    },
    userCard: {
        padding: '10px 10px',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
    },
    userRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 'var(--radius-md)',
        padding: '6px 6px',
        overflow: 'hidden',
        position: 'relative',
    },
    avatar: (color) => ({
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: `${color}18`,
        color: color,
        border: `1px solid ${color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Mono', monospace",
        fontSize: 12,
        fontWeight: 500,
        flexShrink: 0,
    }),
    collapseBtn: (visible) => ({
        position: 'absolute',
        top: '50%',
        right: -11,
        transform: 'translateY(-50%)',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 20,
        opacity: visible ? 1 : 0,
        transition: 'opacity 150ms, background 150ms',
        boxShadow: 'var(--shadow-sm)',
    }),
};

/* ─── NavItem ───────────────────────────────────────────────────────────── */
function NavItem({ item, collapsed, criticalCount, hasPipelineFailure }) {
    const { label, to, icon: Icon, badge, pipelineAlert, criticalAlert, adminOnly } = item;
    const showBadge = badge && criticalCount > 0;
    const showPipelineAlert = pipelineAlert && hasPipelineFailure;
    const showCriticalBadge = criticalAlert && criticalCount > 0;

    return (
        <NavLink
            to={to}
            style={{ textDecoration: 'none', display: 'block', margin: '1px 6px', position: 'relative' }}
        >
            {({ isActive }) => (
                <div
                    className="nav-item-inner"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: collapsed ? '7px 11px' : '7px 10px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 13.5,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        background: isActive ? 'var(--accent-light)' : 'transparent',
                        transition: 'all var(--t-fast)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                        if (!isActive) {
                            e.currentTarget.style.background = 'var(--bg-sunken)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isActive) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                    }}
                >
                    <Icon
                        size={16}
                        style={{
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                            flexShrink: 0,
                        }}
                    />
                    {!collapsed && (
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {label}
                        </span>
                    )}
                    {!collapsed && showBadge && (
                        <span style={{
                            background: 'var(--accent-primary)',
                            color: '#FFFFFF',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'DM Mono', monospace",
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-pill)',
                            flexShrink: 0,
                        }}>
                            {criticalCount}
                        </span>
                    )}
                    {!collapsed && showPipelineAlert && (
                        <span style={{
                            background: 'var(--risk-high)',
                            color: '#FFFFFF',
                            fontSize: 9,
                            fontWeight: 800,
                            fontFamily: "'DM Mono', monospace",
                            width: 14, height: 14,
                            borderRadius: '50%',
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            !
                        </span>
                    )}
                    {!collapsed && showCriticalBadge && (
                        <span style={{
                            background: 'var(--risk-critical)',
                            color: '#FFFFFF',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'DM Mono', monospace",
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-pill)',
                            flexShrink: 0,
                            minWidth: 18,
                            textAlign: 'center',
                        }}>
                            {criticalCount}
                        </span>
                    )}
                    {!collapsed && adminOnly && (
                        <span style={{
                            background: '#DC2626',
                            color: '#FFFFFF',
                            fontSize: 8.5,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            fontFamily: "'DM Mono', monospace",
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-pill)',
                            flexShrink: 0,
                        }}>
                            ADMIN
                        </span>
                    )}
                    {collapsed && showCriticalBadge && (
                        <span style={{
                            position: 'absolute',
                            top: 4, right: 4,
                            minWidth: 14, height: 14,
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--risk-critical)',
                            color: '#fff',
                            fontSize: 8,
                            fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 3px',
                        }}>
                            {criticalCount}
                        </span>
                    )}
                    {collapsed && showPipelineAlert && (
                        <span style={{
                            position: 'absolute',
                            top: 4, right: 4,
                            width: 6, height: 6,
                            borderRadius: '50%',
                            background: 'var(--risk-high)',
                        }} />
                    )}

                    {/* Collapsed tooltip */}
                    {collapsed && (
                        <div
                            className="nav-tooltip"
                            style={{
                                position: 'absolute',
                                left: 'calc(100% + 10px)',
                                top: '50%',
                                transform: 'translateY(-50%) translateX(-6px)',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-primary)',
                                fontSize: 12,
                                fontWeight: 500,
                                padding: '5px 10px',
                                borderRadius: 'var(--radius-md)',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                                opacity: 0,
                                boxShadow: 'var(--shadow-md)',
                                zIndex: 100,
                                transition: 'opacity var(--t-fast), transform var(--t-fast)',
                            }}
                        >
                            {label}
                        </div>
                    )}
                </div>
            )}
        </NavLink>
    );
}

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
export default function Sidebar({ collapsed, onToggle, criticalCount = 0 }) {
    const { user, logout } = useAuth();
    const [hovered, setHovered] = useState(false);
    // TODO (Phase 7): Fetch real pipeline health and set this via API
    // e.g. fetch('/api/v1/data-platform/pipelines').then(check for any failed status)
    const [hasPipelineAlert, setHasPipelineAlert] = useState(false); // eslint-disable-line no-unused-vars

    const sidebarW = collapsed ? 54 : 216;
    const roleColor = ROLE_COLOR[user?.role] || 'var(--accent-primary)';
    const initial = user?.name?.[0]?.toUpperCase() || '?';

    return (
        <aside
            style={S.sidebar(sidebarW)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* ── Logo ─────────────────────────────────────────────────── */}
            <div style={S.logoArea}>
                <div style={S.logoMark}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <polyline
                            points="0,6 2.5,6 3.5,1 5.5,11 7.5,2 9,8 10,6 12,6"
                            stroke="#FFFFFF"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                {!collapsed && (
                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                        <p style={{
                            fontFamily: "'Instrument Sans', sans-serif",
                            fontSize: 15,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            lineHeight: 1.1,
                            whiteSpace: 'nowrap',
                        }}>
                            CareIQ
                        </p>
                        <p style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            marginTop: 2,
                        }}>
                            Clinical Intelligence
                        </p>
                    </div>
                )}
            </div>

            {/* ── Primary Nav ──────────────────────────────────────────── */}
            <nav style={S.nav}>
                {PRIMARY_NAV.map((item) => (
                    <NavItem
                        key={item.to}
                        item={item}
                        collapsed={collapsed}
                        criticalCount={criticalCount}
                        hasPipelineFailure={false}
                    />
                ))}

                {/* Analytics section */}
                {!collapsed && (
                    <p style={S.sectionLabel}>Analytics</p>
                )}
                {collapsed && <div style={{ height: 12 }} />}

                {ANALYTICS_NAV.map((item) => (
                    <NavItem
                        key={item.to}
                        item={item}
                        collapsed={collapsed}
                        criticalCount={criticalCount}
                        hasPipelineFailure={hasPipelineAlert}
                    />
                ))}

                {/* Divider before settings */}
                <div style={S.divider} />

                {/* TODO (BUG-014 / Phase 7): Settings page not yet implemented.
                    Commented out to avoid confusing redirect to /dashboard. */}
                {/* <NavItem
                    item={{ label: 'Settings', to: '/settings', icon: Settings }}
                    collapsed={collapsed}
                    criticalCount={0}
                /> */}
            </nav>

            {/* ── User Card ────────────────────────────────────────────── */}
            <div style={S.userCard}>
                {!collapsed ? (
                    <div
                        style={S.userRow}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <div style={S.avatar(roleColor)}>{initial}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.3,
                            }}>
                                {user?.name || 'User'}
                            </p>
                            <span style={{
                                display: 'inline-block',
                                fontSize: 11,
                                background: 'var(--bg-sunken)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                borderRadius: 'var(--radius-pill)',
                                padding: '0px 6px',
                                marginTop: 2,
                                textTransform: 'capitalize',
                                whiteSpace: 'nowrap',
                            }}>
                                {user?.role?.replace('_', ' ') || 'User'}
                            </span>
                        </div>
                        <button
                            onClick={logout}
                            title="Sign out"
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                padding: 4,
                                borderRadius: 'var(--radius-sm)',
                                flexShrink: 0,
                                transition: 'color var(--t-fast)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--risk-critical)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            <LogOut size={15} />
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                        <button
                            title={`${user?.name || ''} — Sign out`}
                            onClick={logout}
                            style={{
                                ...S.avatar(roleColor),
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'opacity var(--t-fast)',
                            }}
                        >
                            {initial}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Collapse Toggle ───────────────────────────────────────── */}
            <button
                onClick={onToggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={S.collapseBtn(hovered)}
            >
                <ChevronLeft
                    size={12}
                    style={{
                        transition: 'transform 240ms ease-out',
                        transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                />
            </button>

            {/* Inject hover styles for nav-item tooltips */}
            <style>{`
                .nav-item-inner:hover .nav-tooltip {
                    opacity: 1 !important;
                    transform: translateY(-50%) translateX(0) !important;
                }
            `}</style>
        </aside>
    );
}
