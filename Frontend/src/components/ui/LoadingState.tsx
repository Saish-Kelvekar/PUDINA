export { LoadingState } from './ErrorState';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded-full bg-sand-300/70 ${className}`} />;
}
