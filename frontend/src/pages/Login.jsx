import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const DEMO_CREDENTIALS = {
    Clinician:   { email: 'dr.chen@hospital.org',    password: 'demo' },
    Analyst:     { email: 'analyst@hospital.org',    password: 'demo' },
    'Care Coord.': { email: 'coord@hospital.org',    password: 'demo' },
    Admin:       { email: 'admin@hospital.org',      password: 'demo' },
};

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        await new Promise((r) => setTimeout(r, 600));
        setLoading(false);
        navigate('/');
    };

    const loginAsDemo = async (role) => {
        const creds = DEMO_CREDENTIALS[role];
        setLoading(true);
        await new Promise((r) => setTimeout(r, 400));
        setLoading(false);
        toast.success(`Signed in as ${role} (demo)`);
        navigate('/');
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-base)',
        }}>
            {/* ── LEFT: decorative indigo panel ─────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #4F46E5 100%)',
                padding: 48,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Grid pattern overlay */}
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.08,
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    pointerEvents: 'none',
                }} />

                {/* Logo */}
                <div style={{ position: 'relative' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '10px 16px',
                    }}>
                        <div style={{ width: 10, height: 10, background: 'white', borderRadius: 2 }} />
                        <span style={{
                            color: 'white',
                            fontWeight: 700,
                            fontSize: 16,
                            fontFamily: "'Instrument Sans', sans-serif",
                        }}>
                            CareIQ
                        </span>
                    </div>
                </div>

                {/* Headline */}
                <div style={{ position: 'relative' }}>
                    <h2 style={{
                        fontFamily: "'Instrument Serif', serif",
                        fontSize: 38,
                        fontWeight: 400,
                        color: 'white',
                        lineHeight: 1.2,
                        marginBottom: 16,
                        letterSpacing: '-0.02em',
                    }}>
                        Predict risk.<br />
                        Prevent readmission.<br />
                        Personalize care.
                    </h2>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                        Clinical intelligence for the teams that can't afford to miss a high-risk patient.
                    </p>
                </div>

                {/* Stats row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3,1fr)',
                    gap: 1,
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    position: 'relative',
                }}>
                    {[
                        { value: '84%', label: 'AUC-ROC'    },
                        { value: '50k', label: 'Admissions'  },
                        { value: '<1s', label: 'Inference'   },
                    ].map((s) => (
                        <div key={s.label} style={{ padding: 14, textAlign: 'center' }}>
                            <p style={{
                                fontFamily: "'DM Mono', monospace",
                                fontSize: 22, fontWeight: 600,
                                color: 'white', lineHeight: 1,
                            }}>
                                {s.value}
                            </p>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                {s.label}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── RIGHT: form ───────────────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 48,
            }}>
                <div style={{ width: '100%', maxWidth: 380 }}>
                    <h1 style={{
                        fontFamily: "'Instrument Serif', serif",
                        fontSize: 28,
                        fontWeight: 400,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                        letterSpacing: '-0.01em',
                    }}>
                        Welcome back
                    </h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
                        Sign in to your CareIQ workspace
                    </p>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Email */}
                        <div>
                            <label className="t-label" style={{ display: 'block', marginBottom: 6 }}>
                                Email address
                            </label>
                            <input
                                className="input"
                                type="email"
                                placeholder="dr.chen@hospital.org"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="t-label" style={{ display: 'block', marginBottom: 6 }}>
                                Password
                            </label>
                            <input
                                className="input"
                                type="password"
                                placeholder="••••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ justifyContent: 'center', padding: '10px', marginTop: 4, opacity: loading ? 0.7 : 1 }}
                        >
                            {loading ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 12, margin: '20px 0',
                        color: 'var(--text-muted)', fontSize: 11,
                        letterSpacing: '0.08em',
                    }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                        OR TRY DEMO
                        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                    </div>

                    {/* Demo role buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {Object.keys(DEMO_CREDENTIALS).map((role) => (
                            <button
                                key={role}
                                className="btn btn-ghost"
                                disabled={loading}
                                onClick={() => loginAsDemo(role)}
                                style={{ fontSize: 12, justifyContent: 'center' }}
                            >
                                {role}
                            </button>
                        ))}
                    </div>

                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
                        Synthetic data only · No real patient information
                    </p>
                </div>
            </div>
        </div>
    );
}
