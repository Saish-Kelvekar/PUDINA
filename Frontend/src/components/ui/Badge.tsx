import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-slate-700 text-slate-300 border border-slate-600',
    success: 'bg-green-900/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-900/20 text-red-400 border-red-500/30',
    info: 'bg-blue-900/20 text-blue-400 border-blue-500/30',
    muted: 'bg-slate-800 text-slate-400 border border-slate-700',
  };
  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium leading-none border', variants[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function SourceBadge({
  source,
  children,
  className,
}: { source?: string; children?: React.ReactNode; className?: string }) {
  const label = children ?? (source ? source.replace(/_/g, ' ') : 'Unknown');
  const variants: Record<string, string> = {
    SIMULATED: 'bg-slate-700 text-slate-300 border border-slate-600',
    USER_REPORTED: 'bg-blue-900/20 text-blue-400 border-blue-500/30',
    AI_PREDICTED: 'bg-purple-900/20 text-purple-400 border-purple-500/30',
    HISTORICAL: 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30',
    LIVE_EXTERNAL_API: 'bg-green-900/20 text-green-400 border-green-500/30',
  };
  return (
    <Badge
      variant="default"
      className={cn(variants[source ?? ''] ?? variants[''], className)}
    >
      {label}
    </Badge>
  );
}
