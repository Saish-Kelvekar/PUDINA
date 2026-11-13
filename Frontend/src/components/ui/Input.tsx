import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full rounded-full border bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint shadow-[inset_0_1px_2px_rgba(60,45,30,0.06)] transition focus:outline-none focus:ring-2',
            error
              ? 'border-traffic-red/60 focus:ring-traffic-red/30'
              : 'border-white/80 focus:ring-bronze/40 focus:border-bronze/40',
            className,
          )}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        />
        {error && <span className="block pl-1 text-xs text-traffic-red">{error}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
