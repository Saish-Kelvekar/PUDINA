import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Map, Route, AlertCircle, Brain, Signal, Ambulance, ShieldAlert, BarChart3, LogOut } from 'lucide-react';

interface NavItem {
  label: string;
  short: string;
  href: string;
  icon: React.ReactNode;
  role?: 'user' | 'admin' | 'emergency';
  group?: 'core' | 'advanced' | 'admin';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Live Traffic Map', short: 'Map', href: '/map', icon: <Map className="h-[18px] w-[18px]" />, group: 'core' },
  { label: 'Route Planner', short: 'Routes', href: '/route', icon: <Route className="h-[18px] w-[18px]" />, group: 'core' },
  { label: 'Report Incident', short: 'Report', href: '/report', icon: <AlertCircle className="h-[18px] w-[18px]" />, group: 'core' },
  { label: 'Traffic Prediction', short: 'Forecast', href: '/prediction', icon: <Brain className="h-[18px] w-[18px]" />, group: 'advanced' },
  { label: 'Signal Optimization', short: 'Signals', href: '/signal', icon: <Signal className="h-[18px] w-[18px]" />, group: 'advanced' },
  { label: 'Emergency Routing', short: 'Emergency', href: '/emergency', icon: <Ambulance className="h-[18px] w-[18px]" />, role: 'emergency', group: 'advanced' },
  { label: 'Admin Dashboard', short: 'Admin', href: '/admin', icon: <ShieldAlert className="h-[18px] w-[18px]" />, role: 'admin', group: 'admin' },
  { label: 'Analytics', short: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-[18px] w-[18px]" />, role: 'admin', group: 'admin' },
];

export function visibleNavItems(user: any) {
  // The backend lets admins use emergency routing too.
  return NAV_ITEMS.filter(
    (item) => !item.role || user?.role === item.role || (item.role === 'emergency' && user?.role === 'admin'),
  );
}

/**
 * Floating frosted icon rail (desktop) + bottom tab bar (mobile).
 * `isOpen`/`onClose` are kept for API compatibility.
 */
export function Sidebar({ user, isOpen, onClose, onLogout }: { user: any; isOpen: boolean; onClose: () => void; onLogout?: () => void }) {
  const location = useLocation();
  const items = visibleNavItems(user);
  const isActive = (href: string) => location.pathname === href;
  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main navigation"
        className="glass relative z-20 hidden w-[76px] shrink-0 flex-col items-center justify-between rounded-full py-4 md:flex"
      >
        <div className="flex flex-col items-center gap-2">
          {items.map((item, idx) => {
            const prev = items[idx - 1];
            const newGroup = prev && prev.group !== item.group;
            return (
              <div key={item.href} className="flex flex-col items-center">
                {newGroup && <span className="my-2 h-px w-6 bg-ink/10" />}
                <Link
                  to={item.href}
                  onClick={isOpen ? onClose : undefined}
                  aria-label={item.label}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200',
                    isActive(item.href)
                      ? 'bg-ink text-sand-50 shadow-[0_10px_20px_-10px_rgba(31,29,27,0.8)]'
                      : 'text-ink-muted hover:bg-white/80 hover:text-ink',
                  )}
                >
                  {item.icon}
                  <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-sand-50 opacity-0 shadow-panel transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 z-50">
                    {item.label}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-bronze-light to-bronze-dark font-display text-sm italic text-sand-50 ring-2 ring-white/80"
            title={`${user?.name ?? 'User'} · ${user?.role ?? 'user'}`}
          >
            {initials}
          </div>
          <button
            onClick={onLogout}
            aria-label="Sign out"
            className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 text-ink-muted transition-colors hover:border-traffic-red/30 hover:bg-traffic-red/10 hover:text-traffic-red"
          >
            <LogOut className="h-4 w-4" />
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-sand-50 opacity-0 transition-opacity group-hover:opacity-100 z-50">
              Sign out
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Main navigation"
        className="glass-strong fixed inset-x-3 bottom-3 z-[1500] flex items-center gap-1 overflow-x-auto rounded-full p-1.5 md:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            aria-label={item.label}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={cn(
              'flex min-w-[52px] flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[9px] font-semibold transition-colors',
              isActive(item.href) ? 'bg-ink text-sand-50' : 'text-ink-muted',
            )}
          >
            {item.icon}
            <span>{item.short}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
