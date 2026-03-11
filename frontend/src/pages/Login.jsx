import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Login() {
    const { login, isAuthenticated } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        await login(email, password);
        setLoading(false);
    };

    // Quick-fill demo credentials
    const fillDemo = (role) => {
        const CREDS = {
            clinician: { email: 'clinician@careiq.io', pw: 'CareIQ-Demo-2024!' },
            analyst: { email: 'analyst@careiq.io', pw: 'CareIQ-Demo-2024!' },
            coordinator: { email: 'coordinator@careiq.io', pw: 'CareIQ-Demo-2024!' },
            admin: { email: 'admin@careiq.io', pw: 'CareIQ-Admin-2024!' },
        };
        const c = CREDS[role];
        if (c) { setEmail(c.email); setPassword(c.pw); }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
            style={{ background: '#0A0F1C' }}
        >
            {/* Animated mesh gradient background */}
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    background: 'radial-gradient(ellipse 80% 50% at 20% 40%, rgba(0,212,255,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 80% 70%, rgba(59,130,246,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 50% 10%, rgba(16,185,129,0.08) 0%, transparent 50%)',
                    animation: 'none',
                }}
            />

            {/* Subtle grid overlay */}
            <div
                className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: 'linear-gradient(#1F2937 1px, transparent 1px), linear-gradient(90deg, #1F2937 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Login card */}
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="relative w-full max-w-md"
            >
                <div
                    style={{
                        background: 'rgba(17,24,39,0.95)',
                        border: '1px solid #1F2937',
                        borderRadius: '16px',
                        padding: '40px',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
                        backdropFilter: 'blur(20px)',
                    }}
                >
                    {/* Logo + tagline */}
                    <div className="flex flex-col items-center mb-8">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                            style={{
                                background: 'rgba(0,212,255,0.1)',
                                border: '1px solid rgba(0,212,255,0.3)',
                                boxShadow: '0 0 20px rgba(0,212,255,0.2)',
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <polyline points="2,12 6,12 8,4 11,20 14,7 17,15 19,12 22,12" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h1
                            style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '24px', color: '#F9FAFB', marginBottom: '4px' }}
                        >
                            CareIQ
                        </h1>
                        <p style={{ fontSize: '13px', color: '#9CA3AF', letterSpacing: '0.05em' }}>
                            Predict. Prevent. Personalize.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label
                                htmlFor="email"
                                style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#9CA3AF', marginBottom: '6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                            >
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input"
                                placeholder="clinician@hospital.org"
                                required
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label
                                htmlFor="password"
                                style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#9CA3AF', marginBottom: '6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                            >
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pr-10"
                                    placeholder="••••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(!showPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2"
                                    style={{ color: '#4B5563', transition: 'color 150ms' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#9CA3AF'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#4B5563'; }}
                                    aria-label={showPw ? 'Hide password' : 'Show password'}
                                >
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Sign in button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full justify-center py-3 mt-2"
                            style={{ width: '100%', marginTop: '8px' }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Signing in…
                                </>
                            ) : 'Sign in to CareIQ'}
                        </button>
                    </form>

                    {/* Demo access */}
                    <div style={{ marginTop: '24px' }}>
                        <p
                            className="section-label text-center mb-3"
                            style={{ color: '#4B5563' }}
                        >
                            Demo Access
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { role: 'clinician', label: 'Clinician' },
                                { role: 'coordinator', label: 'Care Coord.' },
                                { role: 'analyst', label: 'Analyst' },
                                { role: 'admin', label: 'Admin' },
                            ].map(({ role, label }) => (
                                <button
                                    key={role}
                                    type="button"
                                    onClick={() => fillDemo(role)}
                                    className="btn-ghost py-2 text-xs justify-center"
                                    style={{ fontSize: '12px' }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom notice */}
                <p
                    className="text-center mt-4"
                    style={{ fontSize: '11px', color: '#4B5563' }}
                >
                    CareIQ Clinical Intelligence Platform · HIPAA-compliant · All data is de-identified
                </p>
            </motion.div>
        </div>
    );
}
