import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UserRole, AuthState } from '@/types';
import { apiClient } from '@/api/api';

const AuthContext = createContext<{
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; role?: UserRole }) => Promise<void>;
  logout: () => void;
  requireRole: (allowed: UserRole[]) => boolean;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isAuthenticated: false, isLoading: true });

  useEffect(() => {
    const token = localStorage.getItem('tv_token');
    const userStr = localStorage.getItem('tv_user');
    if (token && userStr) {
      try {
        setState({ user: JSON.parse(userStr), isAuthenticated: true, isLoading: false });
      } catch {
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    } else {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await apiClient.login(email, password);
    localStorage.setItem('tv_token', token);
    localStorage.setItem('tv_user', JSON.stringify(user));
    setState({ user, isAuthenticated: true, isLoading: false });
  }, []);

  const register = useCallback(async (data: { name: string; email: string; password: string; role?: UserRole }) => {
    const { user, token } = await apiClient.register(data);
    localStorage.setItem('tv_token', token);
    localStorage.setItem('tv_user', JSON.stringify(user));
    setState({ user, isAuthenticated: true, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tv_token');
    localStorage.removeItem('tv_user');
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
