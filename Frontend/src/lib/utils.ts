import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map colour for a route, keyed by the backend route `type` (or a label). */
export function routeColor(typeOrLabel: string): string {
  const map: Record<string, string> = {
    fastest: '#E3A034',
    shortest: '#6A8FB8',
    least_congested: '#2A8E7E',
    safest: '#9D88C2',
    eco: '#5FBFAE',
    normal: '#B3ADA8',
    emergency: '#E0604F',
  };
  return map[(typeOrLabel || '').toLowerCase().replace(/[\s-]+/g, '_')] ?? '#FFFFFF';
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
