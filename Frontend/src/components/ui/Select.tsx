import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={cn(
              'block w-full appearance-none cursor-pointer rounded-full border bg-white/70 py-2.5 pl-4 pr-10 text-sm font-medium text-ink shadow-[inset_0_1px_2px_rgba(60,45,30,0.06)] transition focus:outline-none focus:ring-2',
              error
                ? 'border-traffic-red/60 focus:ring-traffic-red/30'
                : 'border-white/80 focus:ring-bronze/40 focus:border-bronze/40',
              className,
            )}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
        {error && <span className="block pl-1 text-xs text-traffic-red">{error}</span>}
      </div>
    );
  },
);

Select.displayName = 'Select';
