import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, RouteResult } from '@/types';
import { formatETA, congestionColor, congestionLabel } from '@/lib/colors';
import { Sparkles, ArrowUpDown, Fuel, AlertTriangle, ShieldCheck, TrafficCone, Info } from 'lucide-react';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading } from '@/components/layout/PageHeading';
import {
  RoutePointPicker,
  type PickedPoint,
  pickPins,
  pointFromClick,
  nextPicks,
  toRoutePoint,
} from '@/components/RoutePointPicker';
import { cn } from '@/lib/utils';

export default function RoutePlanner() {
  const { add } = useToast() as any;
  const [from, setFrom] = useState<PickedPoint | null>(null);
  const [to, setTo] = useState<PickedPoint | null>(null);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getTrafficFlow().then(setEdges).catch(() => {});
  }, []);

  const setPoints = (a: PickedPoint | null, b: PickedPoint | null) => {
    setFrom(a);
    setTo(b);
    setRoutes([]);
    setError(null);
  };

  const fetchRoutes = useCallback(async () => {
    if (!from || !to) {
      setError('Pick a start (A) and a destination (B) — click the map or use a quick pick.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.compareRoutes(toRoutePoint(from), toRoutePoint(to));
      setRoutes(data.routes);
      setSelectedId(data.recommended_route_id ?? data.routes[0]?.id ?? null);
    } catch (err: any) {
      setRoutes([]);
      setError(err.message || 'Failed to calculate routes');
      add?.('error', 'Route calculation failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, add]);

  const handleMapClick = async (lat: number, lng: number) => {
    const p = await pointFromClick(lat, lng);
    const [a, b] = nextPicks(from, to, p);
    setPoints(a, b);
  };

  // Highlight the selected card's route on the map; dim the rest.
  const mapRoutes = routes
    .filter((r) => !r.same_path_as || r.id === selectedId)
    .map((r) => ({ ...r, recommended: r.id === selectedId }));

  return (
    <MapStage
      map={
        <MapView
          edges={edges}
          incidents={[]}
          routes={mapRoutes}
          onMapClick={handleMapClick}
          pins={pickPins(from, to)}
        />
      }
      overlay={
        <div className="absolute left-4 top-4 z-10 lg:left-[392px]">
          <MapChip>
            {from && to ? (
              <>
                <span className="max-w-[16rem] truncate">{from.label}</span>
                <span className="text-ink-faint">→</span>
                <span className="max-w-[16rem] truncate">{to.label}</span>
              </>
            ) : (
              <>Click the map to set {from ? 'the destination (B)' : 'the start (A)'}</>
            )}
          </MapChip>
        </div>
      }
      panel={
        <>
          <PageHeading
            eyebrow="Fastest — Shortest — Least congested"
            title="Find Your"
            accent="Way"
            description="Pick two points and compare up to five routes, scored on time, congestion, incidents, fuel and reliability."
          />

          <RoutePointPicker from={from} to={to} onChange={setPoints} defaults={{ from: 'n2509', to: 'n2563' }} />

          <div className="flex gap-2">
            <Button onClick={fetchRoutes} variant="primary" size="lg" className="flex-1" loading={loading}>
              <Sparkles className="mr-2 h-4 w-4" /> Compare routes
            </Button>
            <button
              type="button"
              onClick={() => setPoints(to, from)}
              disabled={!from || !to}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/70 text-ink transition-transform hover:rotate-180 disabled:opacity-40"
              title="Swap start and destination"
              aria-label="Swap start and destination"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
              {error}
            </div>
          )}

          <p className="flex gap-2 px-1 text-[11px] leading-relaxed text-ink-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Clicked points snap to the nearest junction (within 300 m). Traffic is simulated.
          </p>
        </>
      }
      bottom={
        routes.length === 0 ? (
          <div className="glass flex items-center justify-between gap-4 rounded-3xl px-6 py-5">
            <div>
              <p className="eyebrow">Route options</p>
              <p className="mt-1 font-display text-xl font-light">
                {loading ? 'Calculating routes…' : <>Choose A &amp; B, then <span className="italic text-bronze">compare</span>.</>}
              </p>
            </div>
            <Sparkles className="hidden h-6 w-6 text-bronze sm:block" />
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 pt-1">
            {routes.map((r) => {
              const isSel = selectedId === r.id;
              const twin = r.same_path_as ? routes.find((x) => x.id === r.same_path_as) : null;
              return (
                <button
                  type="button"
                  key={r.id ?? r.label}
                  onClick={() => setSelectedId(r.id ?? null)}
                  className={cn(
                    'w-[300px] shrink-0 rounded-3xl p-5 text-left transition-all duration-200',
                    isSel ? 'glass-dark' : 'glass hover:-translate-y-0.5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ backgroundColor: r.color }} />
                      <span className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', isSel ? 'text-sand-300' : 'text-ink-muted')}>
                        {r.recommended ? 'Recommended' : 'Option'}
                      </span>
                    </div>
                    {twin && (
                      <span className={cn('text-[10px]', isSel ? 'text-sand-300' : 'text-ink-faint')}>same path as {twin.label}</span>
                    )}
                  </div>
                  <p className={cn('mt-2 truncate font-display text-lg font-light leading-tight', isSel ? 'text-sand-50' : 'text-ink')}>{r.label}</p>
                  <p className={cn('font-display text-4xl font-light', isSel ? 'text-bronze-light' : 'text-ink')}>
                    {formatETA(r.total_time_min)}
                  </p>

                  <div className={cn('mt-4 grid grid-cols-3 border-t pt-3 text-xs', isSel ? 'border-white/10' : 'border-ink/10')}>
                    <div>
                      <div className={cn('text-[10px]', isSel ? 'text-sand-300' : 'text-ink-faint')}>Distance</div>
                      <div className={isSel ? 'text-sand-50' : 'text-ink'}>{r.total_distance_km} km</div>
                    </div>
                    <div>
                      <div className={cn('text-[10px]', isSel ? 'text-sand-300' : 'text-ink-faint')}>Congestion</div>
                      <div className="font-semibold" style={{ color: congestionColor(r.avg_congestion) }}>
                        {congestionLabel(r.avg_congestion)}
                      </div>
                    </div>
                    <div>
                      <div className={cn('text-[10px]', isSel ? 'text-sand-300' : 'text-ink-faint')}>Reliability</div>
                      <div className={isSel ? 'text-sand-50' : 'text-ink'}>{r.reliability_pct}%</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                    {[
                      { icon: <AlertTriangle className="h-3 w-3" />, text: `${r.incidents} incidents` },
                      { icon: <Fuel className="h-3 w-3" />, text: `${r.fuel_liters} L fuel` },
                      { icon: <TrafficCone className="h-3 w-3" />, text: `${r.signals_on_route ?? 0} signals` },
                      { icon: <ShieldCheck className="h-3 w-3" />, text: r.source ?? 'SIMULATED' },
                    ].map((chip) => (
                      <span
                        key={chip.text}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-1',
                          isSel ? 'bg-white/10 text-sand-200' : 'bg-white/70 text-ink-muted',
                        )}
                      >
                        {chip.icon}
                        {chip.text}
                      </span>
                    ))}
                  </div>

                  {r.explanation && (
                    <p className={cn('mt-3 text-[11px] leading-relaxed', isSel ? 'text-sand-200' : 'text-ink-muted')}>{r.explanation}</p>
                  )}
                  {r.closure_warnings && r.closure_warnings.length > 0 && (
                    <div className="mt-2 rounded-2xl bg-traffic-red/15 px-3 py-2 text-[11px] font-medium text-traffic-red">
                      {r.closure_warnings.join(' · ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )
      }
    />
  );
}
