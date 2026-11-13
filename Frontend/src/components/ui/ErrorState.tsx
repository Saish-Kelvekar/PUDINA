import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
      <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title, message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
      <h3 className="text-lg font-semibold text-slate-100 mb-2">{title}</h3>
      {message && <p className="text-sm text-slate-400 mb-6 max-w-md">{message}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, icon, action }: { title: string; message?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      {icon && <div className="h-12 w-12 text-slate-600 mb-3">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-100 mb-2">{title}</h3>
      {message && <p className="text-sm text-slate-400 mb-6 max-w-md">{message}</p>}
      {action}
    </div>
  );
}
