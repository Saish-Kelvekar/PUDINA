import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, Crosshair, Flag, Gauge, MapPin, Navigation, Pause, Play, RotateCcw, Square, Timer, TrafficCone, TriangleAlert } from 'lucide-react';
import { MapView, type MapLine, type MapPin as Pin } from '@/components/MapView';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading, SectionLabel } from '@/components/layout/PageHeading';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  RoutePointPicker,
  type PickedPoint,
  pickPins,
  pointFromClick,
  OUTSIDE_MSG,
  nextPicks,
  toRoutePoint,
} from '@/components/RoutePointPicker';
import { apiClient, loadGraph, DEFAULT_CENTER, type GraphIndex } from '@/api/api';
import { useLiveIncidents } from '@/lib/realtime';
import { routeColor, istTime, cn } from '@/lib/utils';
import { buildTimeline, spliceTimeline, stateAt, trailUntil, nextSignal, fmtClock, distM, type Timeline } from '@/lib/tripSim';
import type { EdgeCongestion, Incident, RouteResult, TripPlan, TripRouteType } from '@/types';

const ROUTE_TYPES: Array<{ value: TripRouteType; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'least_congested', label: 'Least congested' },
  { value: 'safest', label: 'Fewest incidents' },
  { value: 'eco', label: 'Eco (least fuel)' },
];
const SPEEDS = [1, 5, 10, 30];
const TICK_MS = 200;
const FOLLOW_EVERY_MS = 2500;
const NO_LINES: MapLine[] = [];

type Status = 'idle' | 'ready' | 'running' | 'paused' | 'arrived';
interface LogItem { at: number; text: string; tone?: 'info' | 'warn' | 'ok' }

export default function LiveTrip() {
  const { add } = useToast() as any;
  const [from, setFrom] = useState<PickedPoint | null>(null);
  const [to, setTo] = useState<PickedPoint | null>(null);
  const [routeType, setRouteType] = useState<TripRouteType>('recommended');
  const [speedX, setSpeedX] = useState(10);
  const [follow, setFollow] = useState(true);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [t, setT] = useState(0);
  const [log, setLog] = useState<LogItem[]>([]);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reroutes, setReroutes] = useState(0);
  const [followCenter, setFollowCenter] = useState<[number, number] | undefined>(undefined);

  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [graph, setGraph] = useState<GraphIndex | null>(null);

  // refs so the timer and live events always see the latest values
  const tRef = useRef(0);
  const tlRef = useRef<Timeline | null>(null);
  const planRef = useRef<TripPlan | null>(null);
  const statusRef = useRef<Status>('idle');
  const speedRef = useRef(speedX);
  const lastLegRef = useRef(-1);
  const lastKindRef = useRef<string>('');
  const reroutingRef = useRef(false);
  const lastFollowRef = useRef(0);
  tlRef.current = timeline;
  planRef.current = plan;
  statusRef.current = status;
  speedRef.current = speedX;

  const addLog = useCallback((text: string, tone: LogItem['tone'] = 'info') => {
    setLog((prev) => [{ at: tRef.current, text, tone }, ...prev].slice(0, 30));
  }, []);

  const loadIncidents = useCallback(() => {
    apiClient.getIncidents()
      .then((list) => setIncidents(list.filter((i) => i.status === 'pending' || i.status === 'verified')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiClient.getTrafficFlow().then(setEdges).catch(() => {});
    loadGraph().then(setGraph).catch(() => {});
    loadIncidents();
  }, [loadIncidents]);

  const roadName = (name: string | null) => name || 'Unnamed road';
  const nodeName = (id: string | null | undefined) => (id && graph?.nodesById.get(id)?.label) || id || '';

  // ---------- planning ----------
  const resetTrip = useCallback(() => {
    setPlan(null);
    setTimeline(null);
    setStatus('idle');
    setT(0);
    tRef.current = 0;
    setLog([]);
    setReroutes(0);
    lastLegRef.current = -1;
    lastKindRef.current = '';
  }, []);

  const setPoints = (a: PickedPoint | null, b: PickedPoint | null) => {
    setFrom(a);
    setTo(b);
    setError(null);
    resetTrip();
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (statusRef.current === 'running' || statusRef.current === 'paused') return; // don't change A/B mid-trip
    const p = await pointFromClick(lat, lng);
    if (!p) {
      add?.('warning', OUTSIDE_MSG);
      return;
    }
    const [a, b] = nextPicks(from, to, p);
    setPoints(a, b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, add]);

  const planRoute = useCallback(async () => {
    if (!from || !to) {
      setError('Pick a start (A) and a destination (B) — click the map or use a quick pick.');
      return;
    }
    setPlanning(true);
    setError(null);
    try {
      const p = await apiClient.planTrip(toRoutePoint(from), toRoutePoint(to), routeType);
      resetTrip();
      setPlan(p);
      setTimeline(buildTimeline(p.legs));
      setStatus('ready');
      setFollowCenter(undefined);
    } catch (err: any) {
      setError(err.message || 'Could not plan the trip');
    } finally {
      setPlanning(false);
    }
  }, [from, to, routeType, resetTrip]);

  // ---------- controls ----------
  const start = () => {
    if (!timeline) return;
    if (status === 'arrived' || status === 'ready') {
      setT(0);
      tRef.current = 0;
      setLog([]);
      lastLegRef.current = -1;
      lastKindRef.current = '';
    }
    setStatus('running');
    if (status !== 'paused') {
      addLog(`Trip started: ${plan?.route_label} route, ETA ${fmtClock(timeline.totalS)}`, 'ok');
    } else addLog('Resumed');
  };
  const pause = () => {
    setStatus('paused');
    addLog('Paused');
  };
  const stop = () => {
    setStatus(timeline ? 'ready' : 'idle');
    setT(0);
    tRef.current = 0;
    lastLegRef.current = -1;
    lastKindRef.current = '';
    addLog('Trip stopped');
  };

  // ---------- the live clock ----------
  useEffect(() => {
    if (status !== 'running') return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const tl = tlRef.current;
      if (!tl) return;
      const next = Math.min(tl.totalS, tRef.current + ((now - last) / 1000) * speedRef.current);
      last = now;
      tRef.current = next;
      setT(next);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [status]);

  const state = useMemo(() => (timeline ? stateAt(timeline, t) : null), [timeline, t]);

  // events: new road, red light, arrival; camera follow
  useEffect(() => {
    if (!timeline || !state || (status !== 'running' && status !== 'arrived')) return;
    const leg = timeline.legs[state.legIndex];
    if (state.legIndex !== lastLegRef.current && state.kind !== 'arrived') {
      const prev = lastLegRef.current >= 0 ? timeline.legs[lastLegRef.current] : null;
      if (!prev || roadName(prev.road_name) !== roadName(leg.road_name)) {
        addLog(`On ${roadName(leg.road_name)} · ${Math.round(leg.speed_kmph)} km/h, ${leg.congestion_level}`);
      }
      if (leg.incident_delay_s > 0) addLog(`Slow: reported incident on ${roadName(leg.road_name)} (+${Math.round(leg.incident_delay_s / 60)} min)`, 'warn');
      lastLegRef.current = state.legIndex;
    }
    const kindKey = `${state.legIndex}:${state.kind}`;
    if (kindKey !== lastKindRef.current) {
      if (state.kind === 'signal') addLog(`Red light at ${nodeName(leg.signal_node)} · ${Math.round(leg.signal_wait_s)} s`, 'warn');
      if (state.kind === 'arrived') {
        addLog(`Arrived at ${nodeName(planRef.current?.destination.node_id)} in ${fmtClock(timeline.totalS)}`, 'ok');
        setStatus('arrived');
        add?.('success', 'Arrived', `Trip time ${fmtClock(timeline.totalS)}`);
      }
      lastKindRef.current = kindKey;
    }
    if (follow && status === 'running') {
      const now = Date.now();
      if (now - lastFollowRef.current > FOLLOW_EVERY_MS) {
        lastFollowRef.current = now;
        setFollowCenter([Number(state.lat.toFixed(5)), Number(state.lng.toFixed(5))]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.legIndex, state?.kind, t, status, follow]);

  // ---------- live incidents: reroute around newly verified ones ----------
  const reroute = useCallback(async (incidentId: number) => {
    if (reroutingRef.current) return;
    reroutingRef.current = true;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const tl = tlRef.current;
        const p = planRef.current;
        if (!tl || !p) return;
        const cur = stateAt(tl, tRef.current).legIndex;
        const fromNode = tl.legs[cur].to_node;
        if (fromNode === p.destination.node_id) return;
        const fresh = await apiClient.planTrip({ node_id: fromNode }, { node_id: p.destination.node_id }, routeType);
        const tlNow = tlRef.current;
        if (!tlNow) return;
        if (stateAt(tlNow, tRef.current).legIndex !== cur) continue; // moved on meanwhile: plan again from the new junction
        const merged = spliceTimeline(tlNow, cur, fresh.legs);
        setTimeline(merged);
        setReroutes((n) => n + 1);
        addLog(`Rerouted around incident #${incidentId} · new ETA ${fmtClock(merged.totalS - tRef.current)} left`, 'ok');
        add?.('info', 'Rerouted', `Avoiding incident #${incidentId}`);
        return;
      }
    } catch (err: any) {
      addLog(`Could not reroute: ${err.message}`, 'warn');
    } finally {
      reroutingRef.current = false;
    }
  }, [routeType, addLog, add]);

  useLiveIncidents((e) => {
    loadIncidents();
    const tl = tlRef.current;
    const seg = e.incident?.segment_id;
    if (!tl || !seg || (statusRef.current !== 'running' && statusRef.current !== 'paused')) return;
    const cur = stateAt(tl, tRef.current).legIndex;
    const ahead = tl.legs.slice(cur + 1).some((l) => l.edge_id === seg);
    if (!ahead) return;
    if (e.type === 'incident:new') {
      addLog(`New report #${e.incident.id} on your route ahead (waiting for verification)`, 'warn');
    } else {
      addLog(`Incident #${e.incident.id} verified on your route ahead — rerouting`, 'warn');
      reroute(e.incident.id);
    }
  });

  // ---------- real location (only used as the start point, and only inside the covered area) ----------
  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      add?.('error', 'Location not available', 'This browser cannot share location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const p = await pointFromClick(latitude, longitude);
        if (!p) {
          const km = Math.round(distM([latitude, longitude], DEFAULT_CENTER) / 1000);
          add?.('warning', 'Outside the covered area', `You are about ${km} km away, so the trip uses a simulated position.`);
          return;
        }
        setPoints({ ...p, label: `My location · ${p.label}` }, to);
      },
      (err) => add?.('error', 'Could not get location', err.code === err.PERMISSION_DENIED ? 'Location permission was blocked.' : err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ---------- map layers ----------
  const mapRoutes = useMemo<RouteResult[]>(() => {
    if (!timeline || !plan) return [];
    const coords: Array<{ lat: number; lng: number }> = [];
    timeline.legs.forEach((l, i) => (i === 0 ? l.coords : l.coords.slice(1)).forEach(([lat, lng]) => coords.push({ lat, lng })));
    return [{
      id: `trip-${reroutes}`,
      type: plan.route_type,
      label: `${plan.route_label} (live trip)`,
      color: routeColor(plan.route_type),
      path: plan.node_ids,
      coords,
      total_distance_km: Math.round(timeline.totalM / 10) / 100,
      total_time_min: Math.round((timeline.totalS / 60) * 10) / 10,
      avg_congestion: 0,
      incidents: 0,
      fuel_liters: 0,
      reliability_pct: 0,
      source: 'SIMULATED',
      recommended: true,
      signals_on_route: timeline.legs.filter((l) => l.signal_wait_s > 0).length,
    }];
  }, [timeline, plan, reroutes]);

  const lines = useMemo<MapLine[]>(() => {
    if (!timeline || !state || state.elapsedS <= 0) return NO_LINES;
    return [{ coords: trailUntil(timeline, state), color: '#8F8882', weight: 7, title: 'Driven so far' }];
  }, [timeline, state]);

  const pins = useMemo<Pin[]>(() => {
    const base = pickPins(from, to);
    if (state && status !== 'idle') {
      base.push({ lat: state.lat, lng: state.lng, label: '🚗', color: '#2A8E7E', title: 'Simulated vehicle position' });
    }
    return base;
  }, [from, to, state, status]);

  // ---------- derived numbers ----------
  const leg = timeline && state ? timeline.legs[state.legIndex] : null;
  const ns = timeline && state ? nextSignal(timeline, state) : null;
  const arrival = plan && timeline ? new Date(new Date(plan.sim_time_utc).getTime() + timeline.totalS * 1000).toISOString() : null;
  const live = status === 'running' || status === 'paused';

  return (
    <MapStage
      map={
        <MapView
          edges={edges}
          incidents={incidents}
          routes={mapRoutes}
          onMapClick={handleMapClick}
          pins={pins}
          lines={lines}
          center={followCenter}
          zoom={followCenter ? 16 : undefined}
        />
      }
      overlay={
        <div className="absolute left-4 top-4 z-10 lg:left-[392px]">
          <MapChip className={live ? 'bg-traffic-green/90 text-sand-50 border-white/20' : undefined}>
            <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-sand-50' : 'bg-traffic-green')} />
            {live ? <>LIVE · SIMULATED POSITION · {speedX}× speed</> : <>Simulated live trip · click the map to set {from ? 'B' : 'A'}</>}
          </MapChip>
        </div>
      }
      panel={
        <>
          <PageHeading
            eyebrow="Simulated — Live — Navigation"
            title="Live"
            accent="Trip"
            description="Watch a simulated vehicle drive your route in real time: live ETA, red lights, and rerouting when an incident is verified ahead."
          />

          <RoutePointPicker from={from} to={to} onChange={setPoints} defaults={{ from: 'n2509', to: 'n2563' }} />

          <button
            type="button"
            onClick={handleMyLocation}
            disabled={live}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/80 bg-white/55 px-3 py-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-white hover:text-ink disabled:opacity-50"
          >
            <Crosshair className="h-3.5 w-3.5" /> Use my real location as start
          </button>

          <Select label="Route type" value={routeType} disabled={live}
                  onChange={(e) => { setRouteType(e.target.value as TripRouteType); resetTrip(); }}>
            {ROUTE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>

          <Button onClick={planRoute} variant="secondary" className="w-full" loading={planning} disabled={live}>
            <Navigation className="mr-2 h-4 w-4" /> Plan route
          </Button>

          {error && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">{error}</div>
          )}

          {timeline && (
            <>
              <SectionLabel>Simulation</SectionLabel>
              <div className="segmented" role="radiogroup" aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={speedX === s} data-active={speedX === s} onClick={() => setSpeedX(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 pl-1 text-xs text-ink-muted">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-3.5 w-3.5 accent-current" />
                Follow the vehicle on the map
              </label>

              <div className="flex gap-2">
                {status === 'running' ? (
                  <Button onClick={pause} variant="secondary" className="flex-1"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
                ) : (
                  <Button onClick={start} className="flex-1">
                    {status === 'arrived' ? <><RotateCcw className="mr-2 h-4 w-4" /> Replay trip</>
                      : status === 'paused' ? <><Play className="mr-2 h-4 w-4" /> Resume</>
                      : <><Play className="mr-2 h-4 w-4" /> Start live trip</>}
                  </Button>
                )}
                {live && (
                  <Button onClick={stop} variant="ghost" aria-label="Stop trip"><Square className="h-4 w-4" /></Button>
                )}
              </div>
            </>
          )}

          {log.length > 0 && (
            <div className="space-y-2">
              <SectionLabel right={<span className="text-[11px] text-ink-faint">{log.length}</span>}>Trip log</SectionLabel>
              <ul className="space-y-1.5">
                {log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="flex gap-2 text-xs leading-snug">
                    <span className="shrink-0 font-mono text-[10px] text-ink-faint">{fmtClock(l.at)}</span>
                    <span className={cn(l.tone === 'warn' ? 'text-traffic-orange' : l.tone === 'ok' ? 'text-traffic-green' : 'text-ink-soft')}>{l.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-2xl bg-white/45 px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink">SIMULATED position.</strong> The vehicle moves at each road&apos;s simulated traffic speed and waits {plan?.signal_wait_assumption_s ?? 20} s at
            red lights, the same rules as Route Planner. Real GPS is used only as the start point, and only inside the covered area.
          </p>
        </>
      }
      bottom={
        !timeline || !state || !plan ? (
          <div className="glass flex items-center justify-between gap-4 rounded-3xl px-6 py-5">
            <div>
              <p className="eyebrow">Live trip</p>
              <p className="mt-1 font-display text-xl font-light">
                {planning ? 'Planning route…' : <>Choose A &amp; B, then <span className="accent-word">plan route</span>.</>}
              </p>
            </div>
            <Car className="hidden h-6 w-6 text-bronze sm:block" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Stat icon={<Timer className="h-4 w-4" />} label="Trip timer" value={fmtClock(state.elapsedS)}
                    sub={live ? `${speedX}× speed` : status === 'arrived' ? 'Arrived' : 'Not started'} highlight={live} />
              <Stat icon={<Flag className="h-4 w-4" />} label="ETA left" value={fmtClock(state.remainingS)}
                    sub={arrival ? `Arrive ~${istTime(arrival)} IST` : ''} />
              <Stat icon={<MapPin className="h-4 w-4" />} label="Distance left" value={`${(state.remainingM / 1000).toFixed(2)} km`}
                    sub={`of ${(timeline.totalM / 1000).toFixed(2)} km`} />
              <Stat icon={<Gauge className="h-4 w-4" />} label="Speed" value={`${Math.round(state.speedKmph)} km/h`}
                    sub={state.kind === 'signal' ? 'Waiting at red light' : leg ? roadName(leg.road_name) : ''} />
            </div>
            <div className="glass rounded-3xl px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {state.kind === 'signal' ? (
                    <><TrafficCone className="h-4 w-4 text-traffic-red" /> Red light · {Math.ceil(state.waitLeftS)} s</>
                  ) : state.kind === 'arrived' ? (
                    <><Flag className="h-4 w-4 text-traffic-green" /> Arrived at {nodeName(plan.destination.node_id)}</>
                  ) : (
                    <><Car className="h-4 w-4 text-traffic-green" /> {leg ? roadName(leg.road_name) : ''}</>
                  )}
                </span>
                <span className="flex items-center gap-3 text-ink-muted">
                  {ns && <span className="flex items-center gap-1"><TrafficCone className="h-3.5 w-3.5" /> Next signal in {Math.round(ns.inM)} m</span>}
                  {reroutes > 0 && <span className="flex items-center gap-1 text-traffic-orange"><TriangleAlert className="h-3.5 w-3.5" /> Rerouted ×{reroutes}</span>}
                  <span>{plan.route_label} · {Math.round(state.progress * 100)}%</span>
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/50">
                <div className="h-full rounded-full bg-traffic-green transition-[width] duration-200" style={{ width: `${state.progress * 100}%` }} />
              </div>
            </div>
          </div>
        )
      }
    />
  );
}

function Stat({ icon, label, value, sub, highlight }: { icon: React.ReactNode; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-3xl p-4', highlight ? 'glass-dark' : 'glass')}>
      <p className={cn('flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]', highlight ? 'text-sand-300' : 'text-ink-muted')}>
        {icon} {label}
      </p>
      <p className={cn('mt-1.5 font-mono text-2xl', highlight ? 'text-sand-50' : 'text-ink')}>{value}</p>
      {sub && <p className={cn('mt-0.5 truncate text-[11px]', highlight ? 'text-sand-300' : 'text-ink-faint')}>{sub}</p>}
    </div>
  );
}
