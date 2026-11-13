import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { label: string; value: number; positive: boolean };
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, subtitle, trend, icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/80 bg-white/60 p-4 shadow-panel transition-shadow hover:shadow-panelHover',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted leading-snug">{title}</h3>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <div className="mt-2 font-display text-3xl font-light leading-none text-ink">{value}</div>
      {trend && (
        <span
          className={cn(
            'mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
            trend.positive ? 'bg-traffic-green/10 text-traffic-green' : 'bg-bronze/10 text-bronze-dark',
          )}
        >
          {trend.value > 0 ? '+' : ''}
          {trend.value} {trend.label}
        </span>
      )}
      {subtitle && <p className="mt-1.5 text-xs text-ink-muted">{subtitle}</p>}
    </div>
  );
}

interface StatStripItem {
  icon?: React.ReactNode;
  value: string | number;
  label: string;
}

/** Horizontal glass strip of stats separated by hairlines (e.g. "250+ Projects Complete"). */
export function StatStrip({ items, className }: { items: StatStripItem[]; className?: string }) {
  return (
    <div className={cn('glass rounded-3xl px-2 py-4', className)}>
      <div className="flex flex-wrap items-stretch">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cn(
              'flex min-w-[110px] flex-1 flex-col gap-1.5 px-4',
              i > 0 && 'border-l border-ink/10',
            )}
          >
            {it.icon && <span className="text-ink-soft">{it.icon}</span>}
            <span className="font-display text-2xl font-light leading-none text-ink">{it.value}</span>
            <span className="text-[11px] text-ink-muted leading-tight">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
