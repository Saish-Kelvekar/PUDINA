import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center animate-fade-in">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border border-ink/10" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-bronze" />
        <div className="absolute inset-[18px] rounded-full bg-ink" />
      </div>
      <p className="eyebrow">{message}</p>
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
    <div className="flex h-full items-center justify-center p-6">
      <div className="glass-strong max-w-md rounded-4xl p-8 text-center animate-slide-up">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-traffic-red/10">
          <AlertCircle className="h-6 w-6 text-traffic-red" />
        </div>
        <h3 className="display mb-2 text-2xl">{title}</h3>
        {message && <p className="mb-6 text-sm text-ink-muted">{message}</p>}
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" /> {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, message, icon, action }: { title: string; message?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-ink-muted">
          {icon}
        </div>
      )}
      <h3 className="display mb-1 text-xl">{title}</h3>
      {message && <p className="mb-4 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action}
    </div>
  );
}
