import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, EmergencyResult, EmergencyVehicle, RouteResult } from '@/types';
import { formatMinutes } from '@/lib/colors';
import { Ambulance, Play, Truck, ShieldAlert, Clock, Info, TrafficCone } from 'lucide-react';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading, SectionLabel } from '@/components/layout/PageHeading';
import {
  RoutePointPicker,
  type PickedPoint,
  pickPins,
  pointFromClick,
  OUTSIDE_MSG,
  nextPicks,
  toRoutePoint,
} from '@/components/RoutePointPicker';
import { cn } from '@/lib/utils';

const NO_ROUTES: RouteResult[] = [];

const VEHICLES: { value: EmergencyVehicle; label: string; icon: React.ReactNode }[] = [
  { value: 'ambulance', label: 'Ambulance', icon: <Ambulance className="h-4 w-4" /> },
  { value: 'fire', label: 'Fire service', icon: <Truck className="h-4 w-4" /> },
  { value: 'police', label: 'Police', icon: <ShieldAlert className="h-4 w-4" /> },
];

export default function EmergencyRouting() {
  const { add } = useToast() as any;
  const [from, setFrom] = useState<PickedPoint | null>(null);
  const [to, setTo] = useState<PickedPoint | null>(null);
  const [vehicleType, setVehicleType] = useState<EmergencyVehicle>('ambulance');
  const [result, setResult] = useState<EmergencyResult | null>(null);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getTrafficFlow().then(setEdges).catch(() => {});
  }, []);

  const setPoints = (a: PickedPoint | null, b: PickedPoint | null) => {
    setFrom(a);
    setTo(b);
    setResult(null);
    setError(null);
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const p = await pointFromClick(lat, lng);
    if (!p) {
      add?.('warning', OUTSIDE_MSG);
      return;
    }
    const [a, b] = nextPicks(from, to, p);
    setPoints(a, b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, add]);

  const mapRoutes = useMemo(
    () => (result ? [result.normal, { ...result.emergency, recommended: true }] : NO_ROUTES),
    [result],
  );
  const pins = useMemo(() => pickPins(from, to, '#B8453A'), [from, to]);

  const fetchRoutes = useCallback(async () => {
    if (!from || !to) {
      setError('Pick a start (A) and a destination (B) — click the map or use a quick pick.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.emergencyRoutes(toRoutePoint(from), toRoutePoint(to), vehicleType);
      setResult(res);
      add?.('success', 'Emergency route computed', `Saves ${formatMinutes(res.time_saved_min)} (simulation)`);
    } catch (err: any) {
      setResult(null);
      setError(err.message || 'Emergency routing failed');
      add?.('error', 'Routing failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, vehicleType, add]);

  return (
    <MapStage
      map={
        <MapView
          edges={edges}
          incidents={[]}
          routes={mapRoutes}
          onMapClick={handleMapClick}
          pins={pins}
        />
      }
      overlay={
        <div className="absolute left-4 top-4 z-10 lg:left-[392px]">
          <MapChip className="bg-traffic-red/90 text-sand-50 border-white/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-50" />
            Simulation mode · click the map to set {from ? 'B' : 'A'}
          </MapChip>
        </div>
      }
      panel={
        <>
          <PageHeading
            eyebrow="Ambulance — Fire — Police"
            title="Every Second"
            accent="Counts"
            description="Priority routing with simulated signal pre-emption along the path."
          />

          <div className="space-y-1.5">
            <span className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Vehicle type</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Vehicle type">
              {VEHICLES.map((v) => {
                const active = vehicleType === v.value;
                return (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVehicleType(v.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-3xl border px-2 py-3.5 text-[11px] font-semibold transition-all',
                      active
                        ? 'border-ink bg-ink text-sand-50 shadow-[0_10px_20px_-10px_rgba(31,29,27,0.8)]'
                        : 'border-white/80 bg-white/55 text-ink-muted hover:bg-white hover:text-ink',
                    )}
                  >
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', active ? 'bg-traffic-red' : 'bg-sand-200')}>
                      {v.icon}
                    </span>
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <RoutePointPicker from={from} to={to} onChange={setPoints} defaults={{ from: 'n2509', to: 'n2563' }} />

          <Button onClick={fetchRoutes} variant="danger" size="lg" className="w-full" loading={loading}>
            <Play className="mr-2 h-4 w-4" /> Compute priority route
          </Button>

          {error && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
              {error}
            </div>
          )}

          {result && result.signals.length > 0 && (
            <div className="space-y-2">
              <SectionLabel right={<span className="text-[11px] text-ink-faint">{result.signals.length}</span>}>
                Signals pre-empted
              </SectionLabel>
              {result.signals.map((s) => (
                <div key={`${s.node_id}-${s.edge_id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white/55 px-3.5 py-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <TrafficCone className="h-3.5 w-3.5 shrink-0 text-traffic-red" />
                    <span className="truncate text-ink">{s.name}</span>
                  </span>
                  {s.red_wait_saved_s != null && (
                    <span className="shrink-0 font-mono text-traffic-green">−{Math.round(s.red_wait_saved_s)}s</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 rounded-3xl border border-traffic-red/20 bg-traffic-red/5 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-traffic-red" />
            <div className="space-y-1 text-[11px] leading-relaxed text-ink-soft">
              <p>
                <strong className="text-traffic-red">Simulation —</strong> for demonstration only. Does not pre-empt real signals or track real vehicles.
              </p>
              {result?.assumptions.map((a) => <p key={a}>— {a}</p>)}
            </div>
          </div>
        </>
      }
      bottom={
        !result ? (
          <div className="glass flex items-center justify-between gap-4 rounded-3xl px-6 py-5">
            <div>
              <p className="eyebrow">Priority route</p>
              <p className="mt-1 font-display text-xl font-light">
                {loading ? 'Computing…' : <>Pick a vehicle, A &amp; B, then <span className="italic text-traffic-red">compute</span>.</>}
              </p>
            </div>
            <Ambulance className="hidden h-6 w-6 text-traffic-red sm:block" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="glass rounded-3xl p-5">
              <p className="eyebrow">Normal route</p>
              <p className="mt-2 font-display text-4xl font-light text-ink">{formatMinutes(result.normal.total_time_min)}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {result.normal.total_distance_km} km · {result.normal.signals_on_route ?? 0} signals
              </p>
            </div>
            <div className="glass rounded-3xl p-5">
              <p className="eyebrow text-traffic-red">Emergency route</p>
              <p className="mt-2 font-display text-4xl font-light text-traffic-red">{formatMinutes(result.emergency.total_time_min)}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {result.emergency.total_distance_km} km · signal priority
              </p>
            </div>
            <div className="glass-dark flex items-center justify-between gap-4 rounded-3xl p-5">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">
                  <Clock className="h-3.5 w-3.5" /> Time saved
                </p>
                <p className="mt-2 font-display text-5xl font-light text-bronze-light">
                  {formatMinutes(result.time_saved_min)}
                </p>
                <p className="mt-1 text-[11px] text-sand-300">
                  Signal waits: {result.signal_wait_source === 'SIGNAL_OPTIMIZER' ? 'AI signal optimiser' : 'assumed 20 s per red'}
                </p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-traffic-red text-sand-50">
                <Ambulance className="h-5 w-5" />
              </span>
            </div>
          </div>
        )
      }
    />
  );
}
