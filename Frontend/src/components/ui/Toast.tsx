import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  add: (type: ToastType, title: string, message?: string) => void;
  remove: (id: string) => void;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-traffic-green" />,
  error: <AlertCircle className="h-4 w-4 text-traffic-red" />,
  info: <Info className="h-4 w-4 text-traffic-blue" />,
  warning: <AlertCircle className="h-4 w-4 text-traffic-orange" />,
};

const RINGS: Record<ToastType, string> = {
  success: 'bg-traffic-green/10',
  error: 'bg-traffic-red/10',
  info: 'bg-traffic-blue/10',
  warning: 'bg-traffic-orange/10',
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = { toasts, add, remove };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[2000] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="glass-strong pointer-events-auto flex items-start gap-3 rounded-3xl px-4 py-3 animate-slide-up"
            onClick={() => remove(t.id)}
          >
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${RINGS[t.type]}`}>
              {ICONS[t.type]}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h4 className="text-sm font-semibold text-ink">{t.title}</h4>
              {t.message && <p className="mt-0.5 text-xs text-ink-muted">{t.message}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
              className="rounded-full p-1.5 text-ink-faint hover:bg-white hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback when used without a provider
    return { add: () => {}, remove: () => {} };
  }
  return ctx;
}
