export const CONGESTION_COLORS: Record<string, string> = {
  green: '#16a34a',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#dc2626',
  grey: '#94a3b8',
  blue: '#2563eb',
  purple: '#7c3aed',
};

export function congestionColor(level: number | string): string {
  if (typeof level === 'number') {
    if (level > 0.75) return CONGESTION_COLORS.red;
    if (level > 0.5) return CONGESTION_COLORS.orange;
    if (level > 0.25) return CONGESTION_COLORS.yellow;
    if (level >= 0) return CONGESTION_COLORS.green;
    return CONGESTION_COLORS.grey;
  }
  return CONGESTION_COLORS[level] ?? CONGESTION_COLORS.grey;
}

export function congestionLabel(level: number): string {
  if (level > 0.75) return 'Severe';
  if (level > 0.5) return 'Heavy';
  if (level > 0.25) return 'Moderate';
  if (level >= 0) return 'Flowing';
  return 'No data';
}

export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'verified': return '#16a34a';
    case 'pending': return '#eab308';
    case 'resolved': return '#64748b';
    case 'rejected': return '#dc2626';
    default: return '#94a3b8';
  }
}

export function formatMinutes(n: number): string {
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatETA(n: number): string {
  return `${Math.round(n)} min`;
}

export function isoToLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function isoToLocalDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
