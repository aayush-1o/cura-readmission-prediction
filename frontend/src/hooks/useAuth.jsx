import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session from localStorage on mount
    useEffect(() => {
        const token = localStorage.getItem('careiq_access_token');
        const savedUser = localStorage.getItem('careiq_user');
        if (token && savedUser) {
            setUser(JSON.parse(savedUser));
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email, password) => {
        // ── Mock auth bypass (no backend required) ────────────────────────
        if (import.meta.env.VITE_USE_MOCK === 'true') {
            const roleMap = {
                clinician: { name: 'Dr. Sarah Chen', role: 'clinician', scopes: ['patients:read', 'patients:write', 'predictions:read', 'recommendations:read'] },
                coordinator: { name: 'Emily Rodriguez', role: 'care_coordinator', scopes: ['patients:read', 'recommendations:read', 'recommendations:write'] },
                analyst: { name: 'Michael Park', role: 'analyst', scopes: ['patients:read', 'analytics:read'] },
                admin: { name: 'James Wilson', role: 'admin', scopes: ['patients:read', 'patients:write', 'predictions:read', 'recommendations:read', 'analytics:read', 'admin:read'] },
            };
            const prefix = email.split('@')[0];
            const mockUser = roleMap[prefix];
            if (!mockUser) {
                toast.error('Demo: use clinician@, coordinator@, analyst@, or admin@');
                return { success: false };
            }
            const fakeToken = `mock_${prefix}_token`;
            const userData = { ...mockUser, email, user_id: `demo_${prefix}` };
            localStorage.setItem('careiq_access_token', fakeToken);
            localStorage.setItem('careiq_refresh_token', `mock_refresh_${prefix}`);
            localStorage.setItem('careiq_user', JSON.stringify(userData));
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${fakeToken}`;
            setUser(userData);
            toast.success(`Welcome back, ${userData.name}!`);
            return { success: true };
        }
        // ── Real API login ────────────────────────────────────────────────
        try {
            const response = await apiClient.post('/auth/login', { email, password });
            const { access_token, refresh_token, user: userData } = response.data;

            localStorage.setItem('careiq_access_token', access_token);
            localStorage.setItem('careiq_refresh_token', refresh_token);
            localStorage.setItem('careiq_user', JSON.stringify(userData));

            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(userData);
            return { success: true };
        } catch (err) {
            const message = err.response?.data?.detail?.message || 'Invalid credentials.';
            toast.error(message);
            return { success: false, message };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('careiq_access_token');
        localStorage.removeItem('careiq_refresh_token');
        localStorage.removeItem('careiq_user');
        delete apiClient.defaults.headers.common['Authorization'];
        setUser(null);
        toast.success('Signed out successfully.');
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
