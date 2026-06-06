import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setAuthToken } from '../api/client';
import { authService } from '../services/authService';
import { AuthSession, AuthUser } from '../types/auth';

const SESSION_KEY = 'home-security-session';

type AuthContextValue = {
    user: AuthUser | null;
    initializing: boolean;
    authenticating: boolean;
    login: (email: string, password: string, remember?: boolean) => Promise<void>;
    signup: (name: string, email: string, password: string, remember?: boolean) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<AuthSession | null>(null);
    const [initializing, setInitializing] = useState(true);
    const [authenticating, setAuthenticating] = useState(false);

    const saveSession = useCallback(async (nextSession: AuthSession, remember = true) => {
        setAuthToken(nextSession.token);
        setSession(nextSession);
        if (remember) {
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        } else {
            await AsyncStorage.removeItem(SESSION_KEY);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        async function restoreSession() {
            try {
                const stored = await AsyncStorage.getItem(SESSION_KEY);
                if (!stored) return;

                const parsed = JSON.parse(stored) as AuthSession;
                setAuthToken(parsed.token);
                const user = await authService.me();

                if (mounted) {
                    setSession({ token: parsed.token, user });
                    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ token: parsed.token, user }));
                }
            } catch {
                setAuthToken(null);
                await AsyncStorage.removeItem(SESSION_KEY);
                if (mounted) setSession(null);
            } finally {
                if (mounted) setInitializing(false);
            }
        }

        restoreSession();

        return () => {
            mounted = false;
        };
    }, []);

    const login = useCallback(
        async (email: string, password: string, remember = true) => {
            setAuthenticating(true);
            try {
                await saveSession(await authService.login(email, password), remember);
            } finally {
                setAuthenticating(false);
            }
        },
        [saveSession]
    );

    const signup = useCallback(
        async (name: string, email: string, password: string, remember = true) => {
            setAuthenticating(true);
            try {
                await saveSession(await authService.signup(name, email, password), remember);
            } finally {
                setAuthenticating(false);
            }
        },
        [saveSession]
    );

    const logout = useCallback(async () => {
        setAuthToken(null);
        setSession(null);
        await AsyncStorage.removeItem(SESSION_KEY);
    }, []);

    const value = useMemo(
        () => ({
            user: session?.user ?? null,
            initializing,
            authenticating,
            login,
            signup,
            logout,
        }),
        [session, initializing, authenticating, login, signup, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider');
    }
    return context;
}
