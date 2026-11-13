import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-white/70 text-ink-soft border-white',
    success: 'bg-traffic-green/10 text-traffic-green border-traffic-green/25',
    warning: 'bg-traffic-yellow/15 text-traffic-yellow border-traffic-yellow/30',
    error: 'bg-traffic-red/10 text-traffic-red border-traffic-red/25',
    info: 'bg-traffic-blue/10 text-traffic-blue border-traffic-blue/25',
    muted: 'bg-sand-200/70 text-ink-muted border-sand-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider leading-none border',
        variants[variant],
        className,
      )}
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
    SIMULATED: 'bg-white/70 text-ink-muted border-white',
    USER_REPORTED: 'bg-traffic-blue/10 text-traffic-blue border-traffic-blue/25',
    AI_PREDICTED: 'bg-bronze/10 text-bronze-dark border-bronze/25',
    HISTORICAL: 'bg-traffic-green/10 text-traffic-green border-traffic-green/25',
    LIVE_EXTERNAL_API: 'bg-traffic-green/10 text-traffic-green border-traffic-green/25',
  };
  return (
    <Badge variant="default" className={cn(variants[source ?? ''] ?? variants.SIMULATED, className)}>
      {label}
    </Badge>
  );
}

/** Small status pill for incident statuses. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const map: Record<string, BadgeProps['variant']> = {
    verified: 'success',
    pending: 'warning',
    resolved: 'muted',
    rejected: 'error',
  };
  return (
    <Badge variant={map[status?.toLowerCase()] ?? 'default'} className={className}>
      {status}
    </Badge>
  );
}
