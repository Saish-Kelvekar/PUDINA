import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Map, Route, AlertCircle, BarChart3, Signal, Ambulance, ShieldAlert, LogOut, ChevronLeft } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  role?: 'user' | 'admin' | 'emergency';
  group?: 'core' | 'advanced' | 'admin';
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Live Traffic Map', href: '/map', icon: <Map className="h-5 w-5" />, group: 'core' },
  { label: 'Route Planner', href: '/route', icon: <Route className="h-5 w-5" />, group: 'core' },
  { label: 'Report Incident', href: '/report', icon: <AlertCircle className="h-5 w-5" />, group: 'core' },
  { label: 'Traffic Prediction', href: '/prediction', icon: <BarChart3 className="h-5 w-5" />, group: 'advanced' },
  { label: 'Signal Optimization', href: '/signal', icon: <Signal className="h-5 w-5" />, group: 'advanced' },
  { label: 'Emergency Routing', href: '/emergency', icon: <Ambulance className="h-5 w-5" />, role: 'emergency', group: 'advanced' },
  { label: 'Admin Dashboard', href: '/admin', icon: <ShieldAlert className="h-5 w-5" />, role: 'admin', group: 'admin' },
  { label: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-5 w-5" />, role: 'admin', group: 'admin' },
];

export function Sidebar({ user, isOpen, onClose, onLogout }: { user: any; isOpen: boolean; onClose: () => void; onLogout?: () => void }) {
  const location = useLocation();

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const isActive = (href: string) => location.pathname === href;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 z-30 transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:translate-x-0 md:w-64',
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-800 shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              TV
            </div>
            <span className="font-semibold text-slate-100 tracking-tight">TrafficVision</span>
          </Link>
          {isOpen && (
            <button
              onClick={onClose}
              className="md:hidden p-1 text-slate-400 hover:text-white"
              aria-label="Close navigation"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const allowed = !item.role || user?.role === item.role;
            if (!allowed) return null;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                )}
                onClick={isOpen ? onClose : undefined}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-800 shrink-0">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-slate-300">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role ?? 'user'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
