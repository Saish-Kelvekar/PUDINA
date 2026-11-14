import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Sidebar, NAV_ITEMS } from '@/components/Sidebar';
import { Monogram, Wordmark } from '@/components/layout/AuthLayout';
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
import LiveCamera from '@/pages/LiveCamera';
import LiveTrip from '@/pages/LiveTrip';
import { ToastProvider } from '@/components/ui/Toast';
import { Preferences } from '@/components/Preferences';
import { ThemeProvider } from '@/lib/theme';
import { LanguageProvider } from '@/lib/i18n';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-bronze" />
      </div>
    );
  }
  if (!state.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return <>{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>;
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

  const current = NAV_ITEMS.find((n) => n.href === location.pathname);

  return (
    <div className="flex h-[100dvh] w-full flex-col gap-3 overflow-hidden p-3 pb-[5.5rem] text-ink md:gap-4 md:p-5 md:pb-5">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3">
        <Link to="/map" className="flex items-center gap-3 pl-1">
          <Monogram dark />
          <Wordmark className="hidden text-[12px] sm:block" />
        </Link>

        <div className="glass hidden items-center gap-1 rounded-full p-1.5 lg:flex">
          <span className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-sand-50">
            {current?.label ?? 'Overview'}
          </span>
          <span className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-ink-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-traffic-green" />
            Live demo · simulated data
          </span>
          <span className="px-4 py-2 text-xs font-medium text-ink-muted">
            Bengaluru · <LiveClock />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Preferences />
          <div className="hidden items-center gap-3 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-sand-50 shadow-frame sm:flex">
            <div className="leading-tight">
              <p className="text-xs font-semibold">{state.user?.name ?? 'Guest'}</p>
              <p className="text-[10px] capitalize text-sand-300">{state.user?.role ?? 'user'}</p>
            </div>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-50 text-ink transition-transform hover:scale-105"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="icon-btn sm:hidden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <Sidebar
          user={state.user}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={logout}
        />

        <main
          key={location.pathname}
          className="glass relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[2rem] md:rounded-[2.25rem] animate-fade-in"
        >
          <Routes location={location}>
            <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
            <Route path="/route" element={<RequireAuth><RoutePlanner /></RequireAuth>} />
            <Route path="/report" element={<RequireAuth><ReportIncident /></RequireAuth>} />
            <Route path="/prediction" element={<RequireAuth><Prediction /></RequireAuth>} />
            <Route path="/signal" element={<RequireAuth><SignalOptimization /></RequireAuth>} />
            <Route path="/emergency" element={<RequireAuth><EmergencyRouting /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
            <Route path="/trip" element={<RequireAuth><LiveTrip /></RequireAuth>} />
            <Route path="/camera" element={<RequireAuth><LiveCamera /></RequireAuth>} />
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
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
