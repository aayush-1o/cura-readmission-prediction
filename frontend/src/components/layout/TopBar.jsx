import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';

/* ─── Route → page meta ──────────────────────────────────────────────────── */
const PAGE_META = {
    '/dashboard':  { title: 'Clinical Overview',       subtitle: 'Real-time readmission intelligence' },
    '/patients':   { title: 'Patient Registry',         subtitle: 'Active admissions and care history' },
    '/risk-queue': { title: 'Risk Queue',               subtitle: 'Prioritised high-risk patient worklist' },
    '/analytics':  { title: 'Analytics',                subtitle: 'Department performance and model metrics' },
    '/reports':    { title: 'Reports',                  subtitle: 'Scheduled and on-demand clinical reports' },
    '/settings':   { title: 'Settings',                 subtitle: 'System configuration and preferences' },
};

function getPageMeta(pathname) {
    // Exact match first, then prefix match (e.g. /patients/:id)
    if (PAGE_META[pathname]) return PAGE_META[pathname];
    const prefix = Object.keys(PAGE_META).find((k) => k !== '/' && pathname.startsWith(k));
    return prefix ? PAGE_META[prefix] : { title: 'CareIQ', subtitle: '' };
}

/* ─── TopBar ─────────────────────────────────────────────────────────────── */
export default function TopBar({ unreadCount = 1 }) {
    const { pathname } = useLocation();
    const { title, subtitle } = getPageMeta(pathname);

    const [searchOpen, setSearchOpen] = useState(false);
    const [bellHover, setBellHover] = useState(false);
    const [searchHover, setSearchHover] = useState(false);

    return (
        <header
            style={{
                height: 54,
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                flexShrink: 0,
                gap: 16,
            }}
        >
            {/* ── Left: page title ─────────────────────────────────────── */}
            <div style={{ minWidth: 0 }}>
                <p style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: "'Instrument Sans', sans-serif",
                }}>
                    {title}
                </p>
                {subtitle && (
                    <p style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginTop: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {subtitle}
                    </p>
                )}
            </div>

            {/* ── Right: actions ───────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

                {/* Search button */}
                <button
                    aria-label="Search"
                    onMouseEnter={() => setSearchHover(true)}
                    onMouseLeave={() => setSearchHover(false)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: searchHover ? 'var(--bg-sunken)' : 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        fontFamily: "'Instrument Sans', sans-serif",
                        transition: 'all var(--t-fast)',
                    }}
                >
                    <Search size={14} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Search
                        <kbd style={{
                            fontSize: 10,
                            background: 'var(--bg-sunken)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 4,
                            padding: '0 4px',
                            color: 'var(--text-muted)',
                            fontFamily: "'DM Mono', monospace",
                            lineHeight: '16px',
                        }}>
                            ⌘K
                        </kbd>
                    </span>
                </button>

                {/* Live indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--risk-low-bg)',
                    border: '1px solid var(--risk-low-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 10px',
                    flexShrink: 0,
                }}>
                    <div
                        className="pulse-dot"
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--risk-low)',
                            flexShrink: 0,
                        }}
                    />
                    <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--risk-low)',
                        letterSpacing: '0.05em',
                    }}>
                        LIVE
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                        · 2m ago
                    </span>
                </div>

                {/* Notification bell */}
                <button
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                    onMouseEnter={() => setBellHover(true)}
                    onMouseLeave={() => setBellHover(false)}
                    style={{
                        position: 'relative',
                        width: 34,
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: bellHover ? 'var(--bg-sunken)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        color: bellHover ? 'var(--text-primary)' : 'var(--text-muted)',
                        transition: 'all var(--t-fast)',
                    }}
                >
                    <Bell size={17} />
                    {unreadCount > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 6,
                            height: 6,
                            background: 'var(--risk-critical)',
                            borderRadius: '50%',
                            border: '1.5px solid var(--bg-elevated)',
                        }} />
                    )}
                </button>
            </div>
        </header>
    );
}
