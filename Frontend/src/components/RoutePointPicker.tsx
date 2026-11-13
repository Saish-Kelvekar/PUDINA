import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { getQuickPicks, nearestNode } from '@/api/api';
import type { RoutePoint } from '@/types';
import type { MapPin as Pin } from '@/components/MapView';

export interface PickedPoint {
  lat: number;
  lng: number;
  label: string;
  node_id?: string;
}

export const toRoutePoint = (p: PickedPoint): RoutePoint =>
  p.node_id ? { node_id: p.node_id } : { lat: p.lat, lng: p.lng };

/** A/B pins for the map. */
export function pickPins(from: PickedPoint | null, to: PickedPoint | null, toColor = '#9A6B4F'): Pin[] {
  const pins: Pin[] = [];
  if (from) pins.push({ lat: from.lat, lng: from.lng, label: 'A', title: from.label });
  if (to) pins.push({ lat: to.lat, lng: to.lng, label: 'B', color: toColor, title: to.label });
  return pins;
}

/** Turns a map click into the next point: fills From, then To, then starts over. */
export async function pointFromClick(lat: number, lng: number): Promise<PickedPoint> {
  const near = await nearestNode(lat, lng).catch(() => null);
  const label = near
    ? near.distance_m > 300
      ? `Off-road point (${near.distance_m} m from a road)`
      : `Near ${near.node.label}`
    : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return { lat, lng, label };
}

export function nextPicks(
  from: PickedPoint | null,
  to: PickedPoint | null,
  p: PickedPoint,
): [PickedPoint | null, PickedPoint | null] {
  if (!from) return [p, to];
  if (!to) return [from, p];
  return [p, null];
}

interface Props {
  from: PickedPoint | null;
  to: PickedPoint | null;
  onChange: (from: PickedPoint | null, to: PickedPoint | null) => void;
  /** Initial selection by node id, applied once quick picks load. */
  defaults?: { from: string; to: string };
}

/** From / To selector: click on the map, or choose a quick pick. */
export function RoutePointPicker({ from, to, onChange, defaults }: Props) {
  const [picks, setPicks] = useState<Array<{ node_id: string; label: string; lat: number; lng: number }>>([]);

  useEffect(() => {
    getQuickPicks()
      .then((list) => {
        setPicks(list);
        if (defaults && !from && !to) {
          const a = list.find((p) => p.node_id === defaults.from);
          const b = list.find((p) => p.node_id === defaults.to);
          if (a && b) onChange(a, b);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = (key: 'from' | 'to', value: PickedPoint | null) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between pl-1">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-sand-50 ${key === 'from' ? 'bg-ink' : 'bg-bronze'}`}>
            {key === 'from' ? 'A' : 'B'}
          </span>
          {key === 'from' ? 'From' : 'To'}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => (key === 'from' ? onChange(null, to) : onChange(from, null))}
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-white hover:text-ink"
            aria-label={`Clear ${key}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-2.5 text-sm">
        {value ? (
          <span className="block truncate font-medium text-ink" title={value.label}>{value.label}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-ink-faint">
            <MapPin className="h-3.5 w-3.5" /> Click the map…
          </span>
        )}
      </div>
      {picks.length > 0 && (
        <select
          aria-label={`Quick pick for ${key}`}
          className="w-full cursor-pointer appearance-none rounded-full border border-transparent bg-transparent px-1 text-xs text-bronze hover:text-bronze-dark focus:outline-none"
          value=""
          onChange={(e) => {
            const p = picks.find((x) => x.node_id === e.target.value);
            if (!p) return;
            if (key === 'from') onChange(p, to);
            else onChange(from, p);
          }}
        >
          <option value="">or choose a quick pick ▾</option>
          {picks.map((p) => (
            <option key={p.node_id} value={p.node_id}>{p.label}</option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="space-y-3 rounded-3xl border border-white/80 bg-white/50 p-4">
      {row('from', from)}
      {row('to', to)}
    </div>
  );
}
