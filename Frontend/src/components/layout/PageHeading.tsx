import { cn } from '@/lib/utils';

interface PageHeadingProps {
  eyebrow: string;
  title: string;
  accent?: string;
  description?: string;
  className?: string;
  size?: 'md' | 'lg';
}

/** Serif display heading with an eyebrow line and a bronze italic accent word. */
export function PageHeading({ eyebrow, title, accent, description, className, size = 'md' }: PageHeadingProps) {
  return (
    <div className={cn('animate-slide-up', className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h1
        className={cn(
          'display mt-2 leading-[0.95]',
          size === 'lg' ? 'text-5xl md:text-6xl' : 'text-[2.15rem]',
        )}
      >
        {title}
        {accent && (
          <>
            {' '}
            <span className="accent-word">{accent}</span>
          </>
        )}
      </h1>
      {description && <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}

/** Small uppercase section label with a hairline. */
export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-ink/10" />
      {right}
    </div>
  );
}
