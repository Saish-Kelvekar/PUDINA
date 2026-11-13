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
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-400 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full px-3 py-2 text-sm text-slate-100 bg-slate-800 border rounded-lg transition-colors placeholder-slate-500',
            error ? 'border-red-500 focus:ring-2 focus:ring-red-500 focus:border-red-500' : 'border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            className,
          )}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
