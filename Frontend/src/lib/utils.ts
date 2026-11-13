import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map colour for a route, keyed by the backend route `type` (or a label). */
export function routeColor(typeOrLabel: string): string {
  const map: Record<string, string> = {
    fastest: '#9A6B4F',
    shortest: '#4A6A8A',
    least_congested: '#5E8C61',
    safest: '#7E6A9A',
    eco: '#2F7F7A',
    normal: '#6B635A',
    emergency: '#B8453A',
  };
  return map[(typeOrLabel || '').toLowerCase().replace(/[\s-]+/g, '_')] ?? '#1F1D1B';
}

/** "2026-11-10T03:30:00Z" -> "09:00" (IST, which is the city's local time). */
export function istTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  } catch {
    return iso;
  }
}

export function istDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}
