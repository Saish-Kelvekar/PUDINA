import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Car, Crosshair, Flag, Gauge, LocateFixed, MapPin, Navigation, Pause, Play, RotateCcw, Square, Timer, TrafficCone, TriangleAlert } from 'lucide-react';
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
import {
  buildTimeline,
  spliceTimeline,
  stateAt,
  stateAtDistance,
  projectOnRoute,
  trailUntil,
  nextSignal,
  fmtClock,
  distM,
  type Timeline,
  type VehicleState,
} from '@/lib/tripSim';
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

// Real GPS tuning
const ON_ROUTE_START_M = 150; // first fix this close to the route: follow the real position on the map
const OFF_ROUTE_M = 60; // later fixes further than this count as off-route
const OFF_ROUTE_FIXES = 2; // re-plan after this many off-route fixes in a row
const REPLAN_EVERY_MS = 15000;
const MAX_ACCURACY_M = 100; // ignore weaker fixes
const MIN_STEP_M = 4; // ignore smaller moves (GPS jitter)

type Status = 'idle' | 'ready' | 'running' | 'paused' | 'arrived';
type Source = 'sim' | 'gps';
type GpsMode = 'direct' | 'mirror';
interface LogItem { at: number; text: string; tone?: 'info' | 'warn' | 'ok' }
interface GpsTrack {
  mode: GpsMode | null; // null until the first fix
  last: [number, number] | null;
  lastAt: number;
  travelledM: number;
  speedKmph: number;
  accuracyM: number | null;
  awayKm: number;
  offCount: number;
  lastReplanAt: number;
}

const freshGps = (): GpsTrack => ({ mode: null, last: null, lastAt: 0, travelledM: 0, speedKmph: 0, accuracyM: null, awayKm: 0, offCount: 0, lastReplanAt: 0 });
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const fmtDuration = (s: number) => {
  const v = Math.max(0, Math.round(s));
  const m = Math.floor(v / 60);
  return m > 0 ? `${m}m ${v % 60}s` : `${v}s`;
};

export default function LiveTrip() {
  const { add } = useToast() as any;
  const [from, setFrom] = useState<PickedPoint | null>(null);
  const [to, setTo] = useState<PickedPoint | null>(null);
  const [routeType, setRouteType] = useState<TripRouteType>('recommended');
  const [source, setSource] = useState<Source>('sim');
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
  const [gps, setGps] = useState<GpsTrack>(freshGps);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [arrivedAtMs, setArrivedAtMs] = useState<number | null>(null);

  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [graph, setGraph] = useState<GraphIndex | null>(null);

  // refs so timers, GPS callbacks and live events always see the latest values
  const tRef = useRef(0);
  const tlRef = useRef<Timeline | null>(null);
  const planRef = useRef<TripPlan | null>(null);
  const statusRef = useRef<Status>('idle');
  const sourceRef = useRef<Source>('sim');
  const speedRef = useRef(speedX);
  const gpsRef = useRef<GpsTrack>(freshGps());
  const stateRef = useRef<VehicleState | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const gpsStartRef = useRef(0);
  const lastLegRef = useRef(-1);
  const lastKindRef = useRef<string>('');
  const reroutingRef = useRef(false);
  const lastFollowRef = useRef(0);
  tlRef.current = timeline;
  planRef.current = plan;
  statusRef.current = status;
  sourceRef.current = source;
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

  // wall clock for "estimated arrival = now + ETA left"
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const roadName = (name: string | null) => name || 'Unnamed road';
  const nodeName = (id: string | null | undefined) => (id && graph?.nodesById.get(id)?.label) || id || '';

  // ---------- GPS helpers ----------
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);
  useEffect(() => () => stopWatch(), [stopWatch]); // leaving the page stops GPS

  const setGpsTrack = (g: GpsTrack) => {
    gpsRef.current = g;
    setGps(g);
  };

  // ---------- planning ----------
  const resetRun = useCallback(() => {
    stopWatch();
    setT(0);
    tRef.current = 0;
    setLog([]);
    setReroutes(0);
    lastLegRef.current = -1;
    lastKindRef.current = '';
    gpsRef.current = freshGps();
    setGps(gpsRef.current);
    setArrivedAtMs(null);
  }, [stopWatch]);

  const resetTrip = useCallback(() => {
    resetRun();
    setPlan(null);
    setTimeline(null);
    setStatus('idle');
  }, [resetRun]);

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

  // ---------- real GPS ----------
  const replanFromHere = useCallback(async (lat: number, lng: number) => {
    const p = planRef.current;
    if (!p) return;
    gpsRef.current = { ...gpsRef.current, lastReplanAt: Date.now() };
    try {
      const fresh = await apiClient.planTrip({ lat, lng }, { node_id: p.destination.node_id }, routeType);
      setPlan(fresh);
      setTimeline(buildTimeline(fresh.legs));
      lastLegRef.current = -1;
      setGpsTrack({ ...gpsRef.current, travelledM: 0, offCount: 0 });
      setReroutes((n) => n + 1);
      addLog('Off route — re-planned from your position', 'warn');
    } catch (err: any) {
      addLog(`Could not reroute: ${err.message}`, 'warn');
    }
  }, [routeType, addLog]);

  const onFix = useCallback((pos: GeolocationPosition) => {
    const tl = tlRef.current;
    if (!tl || statusRef.current !== 'running' || sourceRef.current !== 'gps') return;
    const { latitude, longitude, accuracy, speed } = pos.coords;
    const here: [number, number] = [latitude, longitude];
    const g = gpsRef.current;
    const now = Date.now();

    // first fix decides how the real position is used
    if (g.mode === null) {
      const proj = projectOnRoute(tl, latitude, longitude, 0);
      if (proj.offM <= ON_ROUTE_START_M) {
        setGpsTrack({ ...g, mode: 'direct', last: here, lastAt: now, travelledM: proj.alongM, accuracyM: accuracy });
        addLog('Real GPS: you are on the route — following your position', 'ok');
      } else {
        const awayKm = Math.round(distM(here, DEFAULT_CENTER) / 1000);
        setGpsTrack({ ...g, mode: 'mirror', last: here, lastAt: now, travelledM: 0, accuracyM: accuracy, awayKm });
        addLog(`Real GPS: you are about ${awayKm} km from the covered area — your real movement is played along this route`, 'warn');
      }
      return;
    }

    if (accuracy > MAX_ACCURACY_M) {
      setGpsTrack({ ...g, accuracyM: accuracy });
      return; // too weak to use
    }
    const step = g.last ? distM(g.last, here) : 0;
    const dt = g.lastAt ? (now - g.lastAt) / 1000 : 0;
    const kmph = speed !== null && speed !== undefined && !Number.isNaN(speed)
      ? speed * 3.6
      : dt > 0 && step >= MIN_STEP_M && (step / dt) * 3.6 <= 200 ? (step / dt) * 3.6 : g.speedKmph; // >200 km/h = GPS jump, ignore

    if (g.mode === 'mirror') {
      if (step < MIN_STEP_M) {
        setGpsTrack({ ...g, accuracyM: accuracy, speedKmph: speed === 0 ? 0 : g.speedKmph });
        return;
      }
      setGpsTrack({ ...g, last: here, lastAt: now, travelledM: Math.min(tl.totalM, g.travelledM + step), speedKmph: kmph, accuracyM: accuracy });
      return;
    }

    // direct: snap to the route ahead; re-plan if clearly off it
    const proj = projectOnRoute(tl, latitude, longitude, g.travelledM);
    if (proj.offM <= OFF_ROUTE_M) {
      setGpsTrack({ ...g, last: here, lastAt: now, travelledM: Math.max(g.travelledM, proj.alongM), speedKmph: kmph, accuracyM: accuracy, offCount: 0 });
      return;
    }
    const offCount = g.offCount + 1;
    setGpsTrack({ ...g, last: here, lastAt: now, speedKmph: kmph, accuracyM: accuracy, offCount });
    if (offCount >= OFF_ROUTE_FIXES && now - g.lastReplanAt > REPLAN_EVERY_MS) replanFromHere(latitude, longitude);
  }, [addLog, replanFromHere]);

  const gpsWarnedRef = useRef(false);
  const onGpsError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      stopWatch();
      setStatus(tlRef.current ? 'ready' : 'idle');
      tRef.current = 0;
      setT(0);
      addLog('Location permission was blocked.', 'warn');
      add?.('error', 'Could not get location', 'Location permission was blocked.');
      return;
    }
    // a slow or missing fix is normal indoors: keep watching, say it once
    if (!gpsWarnedRef.current) {
      gpsWarnedRef.current = true;
      addLog('Waiting for a stronger GPS signal…', 'warn');
    }
  }, [addLog, add, stopWatch]);

  // ---------- controls ----------
  const start = () => {
    if (!timeline) return;
    const fresh = status === 'arrived' || status === 'ready';
    if (fresh) resetRun();
    if (source === 'gps') {
      if (!navigator.geolocation) {
        add?.('error', 'Location not available', 'This browser cannot share location.');
        return;
      }
      gpsStartRef.current = performance.now();
      gpsWarnedRef.current = false;
      watchIdRef.current = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      setStatus('running');
      addLog(`Trip started with real GPS: ${plan?.route_label} route, ETA ${fmtClock(timeline.totalS)}`, 'ok');
      return;
    }
    setStatus('running');
    if (status !== 'paused') addLog(`Trip started: ${plan?.route_label} route, ETA ${fmtClock(timeline.totalS)}`, 'ok');
    else addLog('Resumed');
  };
  const pause = () => {
    setStatus('paused');
    addLog('Paused');
  };
  const stop = () => {
    stopWatch();
    setStatus(timeline ? 'ready' : 'idle');
    setT(0);
    tRef.current = 0;
    lastLegRef.current = -1;
    lastKindRef.current = '';
    gpsRef.current = freshGps();
    setGps(gpsRef.current);
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
      if (sourceRef.current === 'gps') {
        tRef.current = (now - gpsStartRef.current) / 1000; // real seconds since start
      } else {
        tRef.current = Math.min(tl.totalS, tRef.current + ((now - last) / 1000) * speedRef.current);
      }
      last = now;
      setT(tRef.current);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [status]);

  const state = useMemo<VehicleState | null>(() => {
    if (!timeline) return null;
    if (source === 'gps' && status !== 'ready' && status !== 'idle') {
      const fresh = gps.lastAt > 0 && Date.now() - gps.lastAt < 10000; // no movement for 10 s → speed 0
      return stateAtDistance(timeline, gps.travelledM, t, fresh ? gps.speedKmph : 0);
    }
    return stateAt(timeline, t);
  }, [timeline, t, source, status, gps]);
  stateRef.current = state;

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
      if (state.kind === 'arrived' && status === 'running') {
        addLog(`Arrived at ${nodeName(planRef.current?.destination.node_id)} in ${fmtClock(state.elapsedS)}`, 'ok');
        stopWatch();
        setArrivedAtMs(Date.now());
        setStatus('arrived');
        add?.('success', 'Arrived', `Trip time ${fmtClock(state.elapsedS)}`);
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
  }, [state?.legIndex, state?.kind, t, status, follow, gps]);

  // ---------- live incidents: reroute around newly verified ones ----------
  const currentLeg = () => stateRef.current?.legIndex ?? 0;

  const reroute = useCallback(async (incidentId: number) => {
    if (reroutingRef.current) return;
    reroutingRef.current = true;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const tl = tlRef.current;
        const p = planRef.current;
        if (!tl || !p) return;
        const cur = currentLeg();
        const fromNode = tl.legs[cur].to_node;
        if (fromNode === p.destination.node_id) return;
        const fresh = await apiClient.planTrip({ node_id: fromNode }, { node_id: p.destination.node_id }, routeType);
        const tlNow = tlRef.current;
        if (!tlNow) return;
        if (currentLeg() !== cur) continue; // moved on meanwhile: plan again from the new junction
        const merged = spliceTimeline(tlNow, cur, fresh.legs);
        setTimeline(merged);
        setReroutes((n) => n + 1);
        const left = sourceRef.current === 'gps'
          ? stateAtDistance(merged, gpsRef.current.travelledM, tRef.current, 0).remainingS
          : merged.totalS - tRef.current;
        addLog(`Rerouted around incident #${incidentId} · new ETA ${fmtClock(left)} left`, 'ok');
        add?.('info', 'Rerouted', `Avoiding incident #${incidentId}`);
        return;
      }
    } catch (err: any) {
      addLog(`Could not reroute: ${err.message}`, 'warn');
    } finally {
      reroutingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeType, addLog, add]);

  useLiveIncidents((e) => {
    loadIncidents();
    const tl = tlRef.current;
    const seg = e.incident?.segment_id;
    if (!tl || !seg || (statusRef.current !== 'running' && statusRef.current !== 'paused')) return;
    const cur = currentLeg();
    const ahead = tl.legs.slice(cur + 1).some((l) => l.edge_id === seg);
    if (!ahead) return;
    if (e.type === 'incident:new') {
      addLog(`New report #${e.incident.id} on your route ahead (waiting for verification)`, 'warn');
    } else {
      addLog(`Incident #${e.incident.id} verified on your route ahead — rerouting`, 'warn');
      reroute(e.incident.id);
    }
  });

  // ---------- real location as the start point (only inside the covered area) ----------
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
    if (!timeline || !state || state.travelledM <= 0 || status === 'ready' || status === 'idle') return NO_LINES;
    return [{ coords: trailUntil(timeline, state), color: '#8F8882', weight: 7, title: 'Driven so far' }];
  }, [timeline, state, status]);

  const live = status === 'running' || status === 'paused';
  const gpsLive = source === 'gps' && live;

  const pins = useMemo<Pin[]>(() => {
    const base = pickPins(from, to);
    if (state && status !== 'idle') {
      if (source === 'gps' && status !== 'ready') {
        base.push({ lat: state.lat, lng: state.lng, label: '📍', color: '#6A8FB8',
                    title: gps.mode === 'mirror' ? 'Your real movement, played along this route' : 'Your real GPS position' });
      } else {
        base.push({ lat: state.lat, lng: state.lng, label: '🚗', color: '#2A8E7E', title: 'Simulated vehicle position' });
      }
    }
    return base;
  }, [from, to, state, status, source, gps.mode]);

  // ---------- derived numbers ----------
  const leg = timeline && state ? timeline.legs[state.legIndex] : null;
  const ns = timeline && state ? nextSignal(timeline, state) : null;
  const etaLeftS = state ? state.remainingS : timeline?.totalS ?? 0;
  const arriveAtMs = nowMs + etaLeftS * 1000; // estimated arrival = current time + ETA left
  const arrivalText = status === 'arrived' && arrivedAtMs ? `Arrived · ${clockTime(arrivedAtMs)}` : `Arrive by ${clockTime(arriveAtMs)}`;
  const chip = !live
    ? null
    : source === 'gps'
      ? gps.mode === 'mirror'
        ? `LIVE · REAL GPS MOVEMENT · played along this route (${gps.awayKm} km away)`
        : gps.mode === 'direct' ? 'LIVE · REAL GPS' : 'LIVE · REAL GPS · waiting for a GPS fix…'
      : `LIVE · SIMULATED POSITION · ${speedX}× speed`;

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
            {chip ?? <>Simulated live trip · click the map to set {from ? 'B' : 'A'}</>}
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
              <SectionLabel>Position source</SectionLabel>
              <div className="segmented" role="radiogroup" aria-label="Position source">
                <button type="button" role="radio" aria-checked={source === 'sim'} data-active={source === 'sim'}
                        disabled={live} onClick={() => setSource('sim')}>
                  Simulated vehicle
                </button>
                <button type="button" role="radio" aria-checked={source === 'gps'} data-active={source === 'gps'}
                        disabled={live} onClick={() => setSource('gps')}>
                  My real GPS
                </button>
              </div>

              {source === 'sim' ? (
                <>
                  <SectionLabel>Simulation</SectionLabel>
                  <div className="segmented" role="radiogroup" aria-label="Simulation speed">
                    {SPEEDS.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={speedX === s} data-active={speedX === s} onClick={() => setSpeedX(s)}>
                        {s}×
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="rounded-2xl bg-white/45 px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
                  <strong className="text-ink">Real GPS.</strong> Inside the covered area the marker follows your exact position on the route.
                  Anywhere else, every metre you really move moves the marker one metre along this route.
                </p>
              )}

              <label className="flex cursor-pointer items-center gap-2 pl-1 text-xs text-ink-muted">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-3.5 w-3.5 accent-current" />
                Follow the vehicle on the map
              </label>

              <div className="flex gap-2">
                {status === 'running' && source === 'sim' ? (
                  <Button onClick={pause} variant="secondary" className="flex-1"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
                ) : status === 'running' && source === 'gps' ? (
                  <Button onClick={stop} variant="secondary" className="flex-1"><Square className="mr-2 h-4 w-4" /> Stop GPS trip</Button>
                ) : (
                  <Button onClick={start} className="flex-1">
                    {status === 'arrived' ? <><RotateCcw className="mr-2 h-4 w-4" /> Replay trip</>
                      : status === 'paused' ? <><Play className="mr-2 h-4 w-4" /> Resume</>
                      : source === 'gps' ? <><LocateFixed className="mr-2 h-4 w-4" /> Start with my GPS</>
                      : <><Play className="mr-2 h-4 w-4" /> Start live trip</>}
                  </Button>
                )}
                {live && source === 'sim' && (
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
            <strong className="text-ink">Clearly labelled.</strong> Simulated vehicle: moves at each road&apos;s simulated traffic speed and waits {plan?.signal_wait_assumption_s ?? 20} s at
            red lights, the same rules as Route Planner. My real GPS: uses your device&apos;s location; outside the covered area, your real movement is played along this route.
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat icon={<Timer className="h-4 w-4" />} label="Trip timer" value={fmtClock(state.elapsedS)}
                    sub={arrivalText} highlight={live} />
              <Stat icon={<Flag className="h-4 w-4" />} label="ETA left" value={fmtClock(etaLeftS)}
                    sub={`Traffic as of ${istTime(plan.sim_time_utc)} IST`} />
              <Stat icon={<CalendarClock className="h-4 w-4" />} label="Est. arrival" value={status === 'arrived' && arrivedAtMs ? clockTime(arrivedAtMs) : clockTime(arriveAtMs)}
                    sub={status === 'arrived' ? 'Arrived' : `Now ${clockTime(nowMs)} + ${fmtDuration(etaLeftS)}`} />
              <Stat icon={<MapPin className="h-4 w-4" />} label="Distance left" value={`${(state.remainingM / 1000).toFixed(2)} km`}
                    sub={`of ${(timeline.totalM / 1000).toFixed(2)} km`} />
              <Stat icon={<Gauge className="h-4 w-4" />} label="Speed" value={`${Math.round(state.speedKmph)} km/h`}
                    sub={state.kind === 'signal' ? 'Waiting at red light' : gpsLive && gps.accuracyM !== null ? (gps.accuracyM > MAX_ACCURACY_M ? `Weak GPS ±${Math.round(gps.accuracyM)} m` : `GPS ±${Math.round(gps.accuracyM)} m`) : leg ? roadName(leg.road_name) : ''} />
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
                  <span className="flex items-center gap-1 font-semibold text-ink"><CalendarClock className="h-3.5 w-3.5" /> {arrivalText}</span>
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
    <div className={cn('min-w-0 rounded-3xl p-4', highlight ? 'glass-dark' : 'glass')}>
      <p className={cn('flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.2em]', highlight ? 'text-sand-300' : 'text-ink-muted')}>
        {icon} {label}
      </p>
      <p className={cn('mt-1.5 truncate font-mono text-2xl', highlight ? 'text-sand-50' : 'text-ink')}>{value}</p>
      {sub && <p className={cn('mt-0.5 truncate text-[11px]', highlight ? 'text-sand-300' : 'text-ink-faint')}>{sub}</p>}
    </div>
  );
}
