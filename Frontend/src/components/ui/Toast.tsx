import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

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
  success: <CheckCircle className="h-5 w-5 text-green-400" />,
  error: <AlertCircle className="h-5 w-5 text-red-400" />,
  info: <Info className="h-5 w-5 text-blue-400" />,
  warning: <AlertCircle className="h-5 w-5 text-yellow-400" />,
};

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-900/20 border-green-500/30 text-green-300',
  error: 'bg-red-900/20 border-red-500/30 text-red-300',
  info: 'bg-blue-900/20 border-blue-500/30 text-blue-300',
  warning: 'bg-yellow-900/20 border-yellow-500/30 text-yellow-300',
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
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-panel min-w-[320px] transition-opacity ${COLORS[t.type]}`}
            onClick={() => remove(t.id)}
          >
            <div className="mt-0.5 shrink-0">{ICONS[t.type]}</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{t.title}</h4>
              {t.message && <p className="text-xs text-opacity-80 mt-0.5">{t.message}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
              className="ml-2 p-1 text-slate-500 hover:text-white"
              aria-label="Dismiss"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
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
