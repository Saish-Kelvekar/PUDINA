import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function routeColor(label: string): string {
  const map: Record<string, string> = {
    shortest: '#06b6d4',
    fastest: '#a855f7',
    'ai_optimized': '#10b981',
    'ai-optimized': '#10b981',
    emergency: '#f43f5e',
  };
  return map[label.toLowerCase().replace(/\s+/g, '_')] ?? '#2563eb';
}
