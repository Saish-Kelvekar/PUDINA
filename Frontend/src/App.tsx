import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/Sidebar';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import MapPage from '@/pages/Map';
import RoutePlanner from '@/pages/RoutePlanner';
import ReportIncident from '@/pages/ReportIncident';
import Prediction from '@/pages/Prediction';
import SignalOptimization from '@/pages/SignalOptimization';
import EmergencyRouting from '@/pages/EmergencyRouting';
import Admin from '@/pages/Admin';
import Analytics from '@/pages/Analytics';
import { ToastProvider } from '@/components/ui/Toast';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin h-6 w-6 text-blue-500 border-4 border-blue-500/30 rounded-full border-t-transparent" />
      </div>
    );
  }
  if (!state.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function AppShell() {
  const { state, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';

  if (isAuthRoute) {
    return (
      <Routes>
        <Route path="/login" element={state.isAuthenticated ? <Navigate to="/map" replace /> : <Login />} />
        <Route path="/register" element={state.isAuthenticated ? <Navigate to="/map" replace /> : <Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-900 text-slate-100">
      <Sidebar
        user={state.user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={logout}
      />
      <div className="flex min-w-0 flex-1 flex-col relative z-10">
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 bg-slate-900/95 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="md:hidden p-2 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              aria-label="Toggle navigation"
            >
              <span className="sr-only">Toggle navigation</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden md:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live demo · simulated data</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-slate-400">
              {state.user?.name ?? 'Guest'} <span className="text-slate-600">·</span> <span className="capitalize">{state.user?.role ?? 'user'}</span>
            </span>
            <button
              onClick={logout}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-900 min-h-0">
          <Routes location={location}>
            <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
            <Route path="/route" element={<RequireAuth><RoutePlanner /></RequireAuth>} />
            <Route path="/report" element={<RequireAuth><ReportIncident /></RequireAuth>} />
            <Route path="/prediction" element={<RequireAuth><Prediction /></RequireAuth>} />
            <Route path="/signal" element={<RequireAuth><SignalOptimization /></RequireAuth>} />
            <Route path="/emergency" element={<RequireAuth><EmergencyRouting /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
            <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}
