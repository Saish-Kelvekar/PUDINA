import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UserRole, AuthState } from '@/types';
import { apiClient } from '@/api/api';

const AuthContext = createContext<{
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  requireRole: (allowed: UserRole[]) => boolean;
} | null>(null);

const clearSession = () => {
  localStorage.removeItem('tv_token');
  localStorage.removeItem('tv_user');
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isAuthenticated: false, isLoading: true });

  useEffect(() => {
    const token = localStorage.getItem('tv_token');
    const userStr = localStorage.getItem('tv_user');
    if (!token || !userStr) {
      clearSession();
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }
    let cached = null;
    try {
      cached = JSON.parse(userStr);
    } catch {
      clearSession();
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }
    // Show the cached session immediately, then confirm the token with the backend.
    setState({ user: cached, isAuthenticated: true, isLoading: false });
    apiClient
      .me()
      .then((user) => {
        if (user) {
          localStorage.setItem('tv_user', JSON.stringify(user));
          setState({ user, isAuthenticated: true, isLoading: false });
        }
      })
      .catch((err) => {
        // 401 = expired/invalid token (the API client already redirects). Network errors keep the session.
        if (err?.status === 401 || err?.status === 404) {
          clearSession();
          setState({ user: null, isAuthenticated: false, isLoading: false });
        }
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await apiClient.login(email, password);
    localStorage.setItem('tv_token', token);
    localStorage.setItem('tv_user', JSON.stringify(user));
    setState({ user, isAuthenticated: true, isLoading: false });
  }, []);

  const register = useCallback(async (data: { name: string; email: string; password: string }) => {
    const { user, token } = await apiClient.register(data);
    localStorage.setItem('tv_token', token);
    localStorage.setItem('tv_user', JSON.stringify(user));
    setState({ user, isAuthenticated: true, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }, []);

  const requireRole = useCallback((allowed: UserRole[]) => {
    return !!state.user && allowed.includes(state.user.role);
  }, [state.user]);

  return (
    <AuthContext.Provider value={{ state, login, register, logout, requireRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
