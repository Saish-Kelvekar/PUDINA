import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, RouteResult, RouteHistoryItem } from '@/types';
import { formatETA, congestionColor, congestionLabel } from '@/lib/colors';
import { Sparkles, ArrowUpDown, Fuel, AlertTriangle, ShieldCheck, TrafficCone, Info, CheckCircle2, Navigation, History } from 'lucide-react';
import { RecentSearches } from '@/components/RecentSearches';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading } from '@/components/layout/PageHeading';
import {
  RoutePointPicker,
  type PickedPoint,
  pickPins,
  pointFromClick,
  OUTSIDE_MSG,
  nextPicks,
  toRoutePoint,
} from '@/components/RoutePointPicker';
import { cn, istDateTime, istTime } from '@/lib/utils';

export default function RoutePlanner() {
  const { add } = useToast() as any;
  const [from, setFrom] = useState<PickedPoint | null>(null);
  const [to, setTo] = useState<PickedPoint | null>(null);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Search history: the saved search on screen, the route the user chose, and whether it is an old one
  const [comparisonId, setComparisonId] = useState<number | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ created_at?: string; sim_time_utc?: string } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    apiClient.getTrafficFlow().then(setEdges).catch(() => {});
  }, []);

  const clearResult = () => {
    setRoutes([]);
    setComparisonId(null);
    setChosenId(null);
    setSaved(null);
  };

  const setPoints = (a: PickedPoint | null, b: PickedPoint | null) => {
    setFrom(a);
    setTo(b);
    clearResult();
    setError(null);
  };

  /** Calculates routes now. `a`/`b` override the picked points (used by "Search again"). */
  const fetchRoutes = useCallback(async (a?: PickedPoint, b?: PickedPoint) => {
    const start = a ?? from;
    const end = b ?? to;
    if (!start || !end) {
      setError('Pick a start (A) and a destination (B) — click the map or use a quick pick.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.compareRoutes(toRoutePoint(start), toRoutePoint(end));
      setRoutes(data.routes);
      setSelectedId(data.recommended_route_id ?? data.routes[0]?.id ?? null);
      setComparisonId(data.comparison_id ?? null);
      setChosenId(null);
      setSaved(null);
      setHistoryKey((k) => k + 1); // the new search appears in Recent searches
    } catch (err: any) {
      setRoutes([]);
      setError(err.message || 'Failed to calculate routes');
      add?.('error', 'Route calculation failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, add]);

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

  /** "Use this route": saves the choice in the search history. Clicking the chosen route again un-chooses it. */
  const chooseRoute = async (r: RouteResult) => {
    if (!comparisonId || !r.id || choosing) return;
    const next = chosenId === r.id ? null : r.id;
    setChoosing(true);
    try {
      await apiClient.chooseRoute(comparisonId, next);
      setChosenId(next);
      setSelectedId(r.id);
      setHistoryKey((k) => k + 1);
      if (next) add?.('success', `Using: ${r.label}`, r.recommended ? 'You followed the recommendation.' : 'Saved as your choice in Recent searches.');
    } catch (err: any) {
      add?.('error', 'Could not save your choice', err.message);
    } finally {
      setChoosing(false);
    }
  };

  const pointOf = (p: { node_id: string; name: string; lat: number; lng: number }): PickedPoint =>
    ({ node_id: p.node_id, label: p.name, lat: p.lat, lng: p.lng });

  /** Shows a saved search exactly as it was calculated (old traffic). */
  const viewSaved = async (item: RouteHistoryItem) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSavedSearch(item.id);
      setFrom(pointOf(data.source));
      setTo(pointOf(data.destination));
      setRoutes(data.routes);
      setComparisonId(data.comparison_id ?? item.id);
      setChosenId(data.chosen_route_id ?? null);
      setSelectedId(data.chosen_route_id ?? data.recommended_route_id ?? data.routes[0]?.id ?? null);
      setSaved({ created_at: data.created_at, sim_time_utc: data.sim_time_utc });
    } catch (err: any) {
      add?.('error', 'Could not open the saved search', err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Same trip again, with the current traffic (creates a new history entry). */
  const searchAgain = (item: RouteHistoryItem) => {
    const a = pointOf(item.source);
    const b = pointOf(item.destination);
    setFrom(a);
    setTo(b);
    fetchRoutes(a, b);
  };

  const onHistoryDeleted = (id: number | 'all') => {
    if (id === 'all' || id === comparisonId) {
      // the search on screen no longer exists in the history: keep the routes, but no choosing on it
      setComparisonId(null);
      setChosenId(null);
    }
  };

  // Highlight the selected card's route on the map; dim the rest.
  const mapRoutes = useMemo(
    () => routes.filter((r) => !r.same_path_as || r.id === selectedId).map((r) => ({ ...r, recommended: r.id === selectedId })),
    [routes, selectedId],
  );
  const pins = useMemo(() => pickPins(from, to), [from, to]);

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
            <Button onClick={() => fetchRoutes()} variant="primary" size="lg" className="flex-1" loading={loading}>
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

          {saved && (
            <div className="flex gap-2 rounded-2xl border border-bronze/30 bg-bronze/10 px-4 py-3 text-xs text-ink">
              <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bronze" />
              <span>
                Saved search from {istDateTime(saved.created_at)}, calculated for traffic at {istTime(saved.sim_time_utc)} IST.{' '}
                <button type="button" onClick={() => fetchRoutes()} className="font-semibold text-bronze underline-offset-2 hover:underline">
                  Search again with current traffic
                </button>
              </span>
            </div>
          )}

          <p className="flex gap-2 px-1 text-[11px] leading-relaxed text-ink-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Clicked points snap to the nearest junction (within 300 m). Traffic is simulated.
          </p>

          <RecentSearches
            refreshKey={historyKey}
            activeId={comparisonId}
            onView={viewSaved}
            onSearchAgain={searchAgain}
            onDeleted={onHistoryDeleted}
          />
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
              const isChosen = !!r.id && chosenId === r.id;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={r.id ?? r.label}
                  onClick={() => setSelectedId(r.id ?? null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(r.id ?? null);
                    }
                  }}
                  aria-pressed={isSel}
                  className={cn(
                    'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze',
                    'w-[300px] shrink-0 rounded-3xl p-5 text-left transition-all duration-200',
                    isChosen && 'ring-2 ring-traffic-green',
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

                  {comparisonId && r.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        chooseRoute(r);
                      }}
                      disabled={choosing}
                      className={cn(
                        'mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                        isChosen
                          ? 'bg-traffic-green text-white hover:bg-traffic-green/90'
                          : isSel
                            ? 'bg-bronze-light text-[#14110E] hover:bg-bronze-light/90'
                            : 'bg-ink text-sand-50 hover:bg-ink/85',
                      )}
                      title={isChosen ? 'Click again to un-choose' : 'Save this as the route you used'}
                    >
                      {isChosen ? <><CheckCircle2 className="h-3.5 w-3.5" /> Using this route</> : <><Navigation className="h-3.5 w-3.5" /> Use this route</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      }
    />
  );
}
