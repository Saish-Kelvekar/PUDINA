import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-400 mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-colors',
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
            className,
          )}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  },
);

Select.displayName = 'Select';
