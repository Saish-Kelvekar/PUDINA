import axios, { AxiosError, AxiosInstance } from 'axios';
import type {
  AdminOverview,
  Analytics,
  DuplicatePair,
  EdgeCongestion,
  EmergencyResult,
  EmergencyVehicle,
  GraphEdge,
  GraphNode,
  Incident,
  IncidentCreate,
  Junction,
  NetworkImpact,
  PredictionItem,
  PredictionMetrics,
  PredictionSet,
  RouteComparison,
  RoutePoint,
  RouteResult,
  SignalSimulation,
  SimClock,
  User,
  HistoryPlace,
  RouteHistoryItem,
  RouteHistoryPage,
  CameraStatus,
  CameraSendResult,
  TripPlan,
  TripRouteType,
} from '@/types';
import { routeColor } from '@/lib/utils';

// ---------------------------------------------------------------------------
// HTTP client
// The backend (Express, :5000) wraps every answer as
//   { success: true,  data: <payload>, error: null }
//   { success: false, data: null, error: { code, message, details? } }
// Vite proxies /api and /socket.io to it in development (vite.config.ts).
// ---------------------------------------------------------------------------
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: Array<{ field: string; issue: string }>;
  response?: { status?: number; data?: { detail?: string } };
}

function toApiError(error: AxiosError<any>): ApiError {
  const env = error.response?.data;
  const status = error.response?.status;
  let message: string;
  if (env?.error?.message) {
    // Generic validation messages carry the specifics in `details`; others are already specific.
    const generic = /^invalid input$/i.test(env.error.message);
    const details = generic && Array.isArray(env.error.details) && env.error.details.length
      ? ': ' + env.error.details.map((d: any) => `${d.field} ${d.issue}`).join('; ')
      : '';
    message = env.error.message + details;
  } else if (!error.response) {
    message = 'Cannot reach the HUMSAFAR server. Is the backend running on port 5000?';
  } else if (status === 502 || status === 503 || status === 504) {
    message = 'The HUMSAFAR server is not responding. Is the backend running on port 5000?';
  } else {
    message = error.message;
  }
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = env?.error?.code;
  err.details = env?.error?.details;
  err.response = { status, data: { detail: message } };
  return err;
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<any>) => {
    const url = error.config?.url ?? '';
    const isAuthCall = url.startsWith('/auth/login') || url.startsWith('/auth/register');
    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('tv_token');
      localStorage.removeItem('tv_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(toApiError(error));
  },
);

/** Unwraps the { success, data, error } envelope. */
async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(url, { params });
  return res.data.data as T;
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post(url, body ?? {});
  return res.data.data as T;
}
async function del<T>(url: string): Promise<T> {
  const res = await api.delete(url);
  return res.data.data as T;
}
async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch(url, body ?? {});
  return res.data.data as T;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// Road graph (cached once per page load). Nodes have no real names in the
// dataset ("Junction n123"), so we label them by the streets that meet there.
// ---------------------------------------------------------------------------
export interface GraphIndex {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  edgesById: Map<string, GraphEdge>;
  center: [number, number];
  /** Exact extent of the road network. */
  bounds: [[number, number], [number, number]];
  /** Network extent plus ~3 km — the map is not allowed to pan beyond this. */
  paddedBounds: [[number, number], [number, number]];
}

/** The backend snaps a clicked point to the nearest junction only within this distance. */
export const MAX_SNAP_M = 300;
// Generous on purpose: Leaflet's bounds-clamping misbehaves (and desyncs the vector canvas during
// fly-to animations) when the visible map is about as large as maxBounds. Clicks outside the road
// network are still refused by the 300 m snap rule, and the covered area is outlined on the map.
const PAD_M = 3000;

let graphPromise: Promise<GraphIndex> | null = null;

function buildGraphIndex(raw: { nodes: any[]; edges: any[] }): GraphIndex {
  const streetsAt = new Map<string, string[]>();
  const addStreet = (nodeId: string, name: string | null) => {
    if (!name) return;
    const list = streetsAt.get(nodeId) ?? [];
    if (!list.includes(name)) list.push(name);
    streetsAt.set(nodeId, list);
  };
  const edges: GraphEdge[] = raw.edges.map((e) => {
    addStreet(e.from, e.name);
    addStreet(e.to, e.name);
    return { ...e, coords: e.coords ?? [] };
  });
  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const streets = streetsAt.get(n.id) ?? [];
    const label = streets.length >= 2 ? `${streets[0]} × ${streets[1]}` : streets[0] ?? n.name ?? n.id;
    return { id: n.id, lat: n.lat, lng: n.lng, name: n.name, signalised: !!n.signalised, label };
  });
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const n of nodes) {
    minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
    minLng = Math.min(minLng, n.lng); maxLng = Math.max(maxLng, n.lng);
  }
  return {
    nodes,
    edges,
    nodesById: new Map(nodes.map((n) => [n.id, n])),
    edgesById: new Map(edges.map((e) => [e.id, e])),
    center: nodes.length ? [(minLat + maxLat) / 2, (minLng + maxLng) / 2] : DEFAULT_CENTER,
    bounds: [[minLat, minLng], [maxLat, maxLng]],
    paddedBounds: (() => {
      const midLat = (minLat + maxLat) / 2;
      const dLat = PAD_M / 110540;
      const dLng = PAD_M / (111320 * Math.cos((midLat * Math.PI) / 180));
      return [[minLat - dLat, minLng - dLng], [maxLat + dLat, maxLng + dLng]] as [[number, number], [number, number]];
    })(),
  };
}

/** Centre of the bundled road network (data/graph.json), used before the graph loads. */
export const DEFAULT_CENTER: [number, number] = [12.9345, 77.564];

export function loadGraph(): Promise<GraphIndex> {
  if (!graphPromise) {
    graphPromise = get<{ nodes: any[]; edges: any[] }>('/map/graph')
      .then(buildGraphIndex)
      .catch((err) => {
        graphPromise = null; // allow retry
        throw err;
      });
  }
  return graphPromise;
}

const nodeLabel = (g: GraphIndex, id: string) => g.nodesById.get(id)?.label ?? id;
const edgeStreet = (g: GraphIndex, id: string | null | undefined) =>
  (id && g.edgesById.get(id)?.name) || null;

/** Demo-friendly starting points: every signalised junction plus the documented demo trip. */
export async function getQuickPicks(): Promise<Array<{ node_id: string; label: string; lat: number; lng: number }>> {
  const g = await loadGraph();
  const ids = ['n2509', 'n2563', ...g.nodes.filter((n) => n.signalised).map((n) => n.id)];
  const seen = new Set<string>();
  return ids
    .filter((id) => g.nodesById.has(id) && !seen.has(id) && seen.add(id))
    .map((id) => {
      const n = g.nodesById.get(id)!;
      return { node_id: id, label: `${n.label}${n.signalised ? ' (signal)' : ''}`, lat: n.lat, lng: n.lng };
    });
}

/** Nearest graph node to a clicked point (for labelling map picks). */
export async function nearestNode(lat: number, lng: number): Promise<{ node: GraphNode; distance_m: number } | null> {
  const g = await loadGraph();
  let best: GraphNode | null = null;
  let bestD = Infinity;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  for (const n of g.nodes) {
    const dx = (n.lng - lng) * kx;
    const dy = (n.lat - lat) * 110540;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best ? { node: best, distance_m: Math.round(Math.sqrt(bestD)) } : null;
}

// ---------------------------------------------------------------------------
// Adapters: backend payload -> frontend shape
// ---------------------------------------------------------------------------
function ratioToCongestion(ratio: number | null | undefined): number {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return -1;
  return Math.min(1, Math.max(0, 1 - ratio));
}

function edgeToCongestion(g: GraphIndex, e: GraphEdge, seg?: any): EdgeCongestion {
  const first = e.coords[0] ?? [g.nodesById.get(e.from)?.lat ?? 0, g.nodesById.get(e.from)?.lng ?? 0];
  const last = e.coords[e.coords.length - 1] ?? [g.nodesById.get(e.to)?.lat ?? 0, g.nodesById.get(e.to)?.lng ?? 0];
  return {
    segment_id: e.id,
    street_name: e.name ?? undefined,
    from: nodeLabel(g, e.from),
    to: nodeLabel(g, e.to),
    from_lat: first[0],
    from_lng: first[1],
    to_lat: last[0],
    to_lng: last[1],
    coords: e.coords,
    congestion: ratioToCongestion(seg?.speed_ratio),
    congestion_level: seg?.congestion_level ?? 'no_data',
    speed_kmph: seg?.speed_kmph ?? null,
    road_type: e.road_type,
    speed_limit: num(seg?.free_flow_kmph ?? e.free_flow_kmph),
    distance_km: Math.round((e.length_m / 1000) * 100) / 100,
    source: seg?.source ?? 'SIMULATED',
    last_updated: seg?.timestamp_utc ?? undefined,
  };
}

function toIncident(g: GraphIndex | null, i: any): Incident {
  const street = g ? edgeStreet(g, i.segment_id) : null;
  return {
    id: i.id,
    type: i.category,
    status: i.status,
    lat: num(i.lat),
    lng: num(i.lng),
    description: i.description ?? '',
    severity: i.estimated_severity?.level ?? i.reported_severity,
    reporter: i.reported_by?.name ?? 'Unknown',
    affected_edges: [],
    nearby_node: street ?? '',
    created_at: i.created_at,
    source: i.source,
    segment_id: i.segment_id,
    estimated_severity: i.estimated_severity ?? null,
    lanes_blocked: i.lanes_blocked,
    is_closure: i.is_closure,
  };
}

const latLngList = (coords: Array<[number, number]> = []) => coords.map(([lat, lng]) => ({ lat, lng }));

/** Backend names junctions "Junction n123"; show the friendly street label instead. */
function historyPlace(g: GraphIndex | null, p: any): HistoryPlace {
  const node = g?.nodesById.get(p?.node_id);
  return { node_id: p?.node_id, name: node?.label ?? p?.name ?? p?.node_id, lat: num(p?.lat), lng: num(p?.lng) };
}

function toHistoryItem(g: GraphIndex | null, i: any): RouteHistoryItem {
  return {
    id: i.id,
    created_at: i.created_at,
    sim_time_utc: i.sim_time_utc ?? null,
    source: historyPlace(g, i.source),
    destination: historyPlace(g, i.destination),
    route_count: num(i.route_count),
    recommended: i.recommended ?? null,
    chosen: i.chosen ?? null,
  };
}

function toRoute(r: any): RouteResult {
  return {
    id: r.route_id,
    type: r.type,
    label: r.label,
    color: routeColor(r.type ?? r.label),
    path: r.node_ids ?? [],
    coords: latLngList(r.coords),
    total_distance_km: num(r.distance_km),
    total_time_min: num(r.eta_min),
    avg_congestion: num(r.congestion_pct) / 100,
    incidents: num(r.incident_count),
    fuel_liters: num(r.fuel_litres),
    reliability_pct: num(r.reliability),
    source: 'SIMULATED',
    recommended: !!r.recommended,
    explanation: r.explanation,
    same_path_as: r.same_path_as ?? null,
    closure_warnings: r.closure_warnings ?? [],
    signals_on_route: r.signals_on_route,
  };
}

function toEmergencyRoute(r: any, label: string, type: string): RouteResult {
  return {
    type,
    label,
    color: routeColor(type),
    path: r?.node_ids ?? [],
    coords: latLngList(r?.coords),
    total_distance_km: num(r?.distance_km),
    total_time_min: num(r?.eta_min),
    avg_congestion: 0,
    incidents: 0,
    fuel_liters: 0,
    reliability_pct: 0,
    source: 'SIMULATED',
    signals_on_route: r?.signals_on_route,
  };
}

// ---------------------------------------------------------------------------
// Public API used by the pages
// ---------------------------------------------------------------------------
export const apiClient = {
  // ----- Auth --------------------------------------------------------------
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    return post('/auth/login', { email, password });
  },

  async register(data: { name: string; email: string; password: string }): Promise<{ user: User; token: string }> {
    return post('/auth/register', { name: data.name, email: data.email, password: data.password });
  },

  async me(): Promise<User | null> {
    const d = await get<{ user: User }>('/auth/me');
    return d.user ?? null;
  },

  // ----- Graph & traffic ---------------------------------------------------
  loadGraph,

  async getTrafficFlow(): Promise<EdgeCongestion[]> {
    const [g, flow] = await Promise.all([loadGraph(), get<any>('/traffic/flow')]);
    const bySeg = new Map<string, any>((flow.segments ?? []).map((s: any) => [s.segment_id, s]));
    return g.edges.map((e) => edgeToCongestion(g, e, bySeg.get(e.id)));
  },

  async getSimClock(): Promise<SimClock> {
    return get('/traffic/clock');
  },

  async stepSimClock(action: 'next' | 'prev'): Promise<{ sim_time_utc: string }> {
    return post('/traffic/clock', { action });
  },

  // ----- Routes ------------------------------------------------------------
  async compareRoutes(source: RoutePoint, destination: RoutePoint): Promise<RouteComparison> {
    const d = await post<any>('/routes/compare', { source, destination });
    return {
      comparison_id: d.comparison_id,
      routes: (d.routes ?? []).map(toRoute),
      recommended_route_id: d.recommended_route_id ?? null,
      source: d.source,
      destination: d.destination,
      sim_time_utc: d.sim_time_utc,
    };
  },

  // ----- Route search history (the logged-in user's own) --------------------
  async getRouteHistory(limit = 10, offset = 0): Promise<RouteHistoryPage> {
    const [g, d] = await Promise.all([loadGraph().catch(() => null), get<any>('/routes/history', { limit, offset })]);
    return { ...d, items: (d.items ?? []).map((i: any) => toHistoryItem(g, i)) };
  },

  /** A saved search, in the same shape as compareRoutes(). Routes are as they were at sim_time_utc. */
  async getSavedSearch(id: number): Promise<RouteComparison> {
    const [g, d] = await Promise.all([loadGraph().catch(() => null), get<any>(`/routes/history/${id}`)]);
    return {
      comparison_id: d.comparison_id,
      saved: true,
      created_at: d.created_at,
      chosen_route_id: d.chosen_route_id ?? null,
      routes: (d.routes ?? []).map(toRoute),
      recommended_route_id: d.recommended_route_id ?? null,
      source: { ...d.source, name: historyPlace(g, d.source).name, snapped_m: 0 },
      destination: { ...d.destination, name: historyPlace(g, d.destination).name, snapped_m: 0 },
      sim_time_utc: d.sim_time_utc,
    };
  },

  /** routeId = "r2" marks that route as used; null clears the choice. */
  async chooseRoute(comparisonId: number, routeId: string | null): Promise<RouteHistoryItem> {
    const [g, d] = await Promise.all([
      loadGraph().catch(() => null),
      post<{ item: any }>(`/routes/history/${comparisonId}/choose`, { route_id: routeId }),
    ]);
    return toHistoryItem(g, d.item);
  },

  async deleteSearch(id: number): Promise<{ deleted: number }> {
    return del(`/routes/history/${id}`);
  },

  async clearRouteHistory(): Promise<{ deleted: number }> {
    return del('/routes/history');
  },

  // ----- Live Trip (simulated vehicle position; nothing is saved) ----------
  async planTrip(source: RoutePoint, destination: RoutePoint, routeType: TripRouteType = 'recommended'): Promise<TripPlan> {
    return post<TripPlan>('/trips/plan', { source, destination, route_type: routeType });
  },

  // ----- Live camera -> Telegram -------------------------------------------
  async getCameraStatus(): Promise<CameraStatus> {
    return get<CameraStatus>('/camera/status');
  },

  /** Sends a captured photo or recorded video to the Telegram bot (through the backend). */
  async sendCameraMedia(
    kind: 'photo' | 'video',
    file: Blob,
    opts: {
      incidentId?: number | string | null;
      note?: string;
      danger?: 'low' | 'medium' | 'high' | '';
      location?: { lat: number; lng: number } | null;
    } = {},
  ): Promise<CameraSendResult> {
    const params: Record<string, string> = {};
    if (opts.incidentId) params.incident_id = String(opts.incidentId);
    if (opts.note && opts.note.trim()) params.note = opts.note.trim();
    // Without an incident, the operator can set the danger level and share this device's location.
    if (!opts.incidentId && opts.danger) params.danger = opts.danger;
    if (!opts.incidentId && opts.location) {
      params.lat = opts.location.lat.toFixed(6);
      params.lng = opts.location.lng.toFixed(6);
    }
    const res = await api.post(`/camera/${kind}`, file, {
      params,
      headers: { 'Content-Type': file.type || (kind === 'photo' ? 'image/jpeg' : 'video/webm') },
      timeout: 120000, // videos can take a while to upload
    });
    return res.data.data as CameraSendResult;
  },

  // ----- Incidents ---------------------------------------------------------
  async getIncidents(): Promise<Incident[]> {
    const [g, d] = await Promise.all([loadGraph().catch(() => null), get<{ incidents: any[] }>('/incidents')]);
    return (d.incidents ?? []).map((i) => toIncident(g, i));
  },

  async createIncident(data: IncidentCreate): Promise<Incident> {
    const body: Record<string, unknown> = {
      category: data.type,
      reported_severity: data.severity,
      lat: data.lat,
      lng: data.lng,
      description: data.description,
    };
    if (data.lanes_blocked !== undefined) body.lanes_blocked = data.lanes_blocked;
    if (data.is_closure !== undefined) body.is_closure = data.is_closure;
    const [g, d] = await Promise.all([loadGraph().catch(() => null), post<{ incident: any }>('/incidents', body)]);
    return toIncident(g, d.incident);
  },

  /** status: 'verified' | 'rejected' | 'resolved' — mapped to the backend's action endpoints. */
  async updateIncidentStatus(id: number | string, status: string): Promise<Incident> {
    const action = ({ verified: 'verify', rejected: 'reject', resolved: 'resolve' } as Record<string, string>)[status];
    if (!action) throw new Error(`Unsupported status change: ${status}`);
    const d = await post<{ incident: any }>(`/incidents/${id}/${action}`);
    return toIncident(await loadGraph().catch(() => null), d.incident);
  },

  async mergeIncident(id: number | string, intoId: number | string): Promise<Incident> {
    const d = await post<{ incident: any }>(`/incidents/${id}/merge`, { into_id: Number(intoId) });
    return toIncident(await loadGraph().catch(() => null), d.incident);
  },

  async setIncidentSeverity(id: number | string, level: 'low' | 'medium' | 'high'): Promise<Incident> {
    const d = await patch<{ incident: any }>(`/incidents/${id}/severity`, { level });
    return toIncident(await loadGraph().catch(() => null), d.incident);
  },

  /** Admin only. Collects duplicate candidates for every open incident into unique pairs. */
  async getDuplicateCandidates(openIncidents?: Incident[]): Promise<DuplicatePair[]> {
    const g = await loadGraph().catch(() => null);
    const list = openIncidents ?? (await apiClient.getIncidents());
    const open = list.filter((i) => i.status === 'pending' || i.status === 'verified');
    const results = await Promise.all(
      open.map((inc) =>
        get<{ candidates: any[] }>(`/incidents/${inc.id}/duplicates`)
          .then((d) => ({ inc, candidates: d.candidates ?? [] }))
          .catch(() => ({ inc, candidates: [] as any[] })),
      ),
    );
    const pairs = new Map<string, DuplicatePair>();
    for (const { inc, candidates } of results) {
      for (const c of candidates) {
        if (c.status && c.status !== 'pending') continue;
        const other = toIncident(g, c.incident);
        const key = [inc.id, other.id].map(String).sort().join('-');
        const score = num(c.score);
        if (!pairs.has(key) || pairs.get(key)!.score < score) {
          pairs.set(key, { id: key, incidents: [inc, other], score });
        }
      }
    }
    return [...pairs.values()].sort((a, b) => b.score - a.score);
  },

  /** Admin only. Simulates the network impact of an incident. */
  async getNetworkImpact(incidentId: number | string, mode?: 'lane_blockage' | 'closure'): Promise<NetworkImpact> {
    const d = await post<any>(`/incidents/${incidentId}/impact`, mode ? { mode } : {});
    return {
      incident_id: d.incident_id,
      count: (d.affected_segments ?? []).length,
      total_extra_delay_min: num(d.total_extra_delay_min),
      detour_minutes: d.detour_minutes ?? null,
      affected_segments: d.affected_segments ?? [],
      diversion_route: d.diversion_route
        ? { coords: d.diversion_route.coords ?? [], distance_km: num(d.diversion_route.distance_km), eta_min: num(d.diversion_route.eta_min) }
        : null,
    };
  },

  // ----- Predictions -------------------------------------------------------
  async getPredictions(horizon: 15 | 30 = 15): Promise<PredictionSet> {
    const [g, d] = await Promise.all([loadGraph(), get<any>('/predictions', { horizon })]);
    const items: PredictionItem[] = [];
    for (const p of d.predictions ?? []) {
      const e = g.edgesById.get(p.segment_id);
      if (!e) continue;
      const ff = num(e.free_flow_kmph, 1) || 1;
      const base = edgeToCongestion(g, e);
      const current = p.current_speed_kmph == null ? -1 : ratioToCongestion(num(p.current_speed_kmph) / ff);
      const predicted = p.predicted_speed_kmph == null ? -1 : ratioToCongestion(num(p.predicted_speed_kmph) / ff);
      items.push({
        ...base,
        congestion: current,
        current_congestion: current,
        predicted_congestion: predicted,
        predicted_level: p.predicted_level ?? 'no_data',
        confidence: p.confidence ?? null,
        horizon_min: num(d.horizon_min, horizon),
        source: 'AI_PREDICTED',
        last_updated: p.target_time_utc,
      });
    }
    return {
      items,
      model_version: d.model_version ?? 'unknown',
      fallback_reason: d.fallback_reason ?? null,
      sim_time_utc: d.sim_time_utc ?? null,
    };
  },

  async getPredictionMetrics(): Promise<PredictionMetrics> {
    return get('/predictions/metrics');
  },

  // ----- Signals -----------------------------------------------------------
  async getJunctions(): Promise<Junction[]> {
    const [g, d] = await Promise.all([loadGraph().catch(() => null), get<{ junctions: any[] }>('/signals/junctions')]);
    const compass = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
      // Direction the traffic comes FROM, relative to the junction.
      const dy = fromLat - toLat;
      const dx = (fromLng - toLng) * Math.cos((toLat * Math.PI) / 180);
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
      return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((deg + 360) % 360) / 45) % 8];
    };
    return (d.junctions ?? []).map((j) => ({
      ...j,
      label: g ? nodeLabel(g, j.node_id) : j.name,
      approaches: (j.approaches ?? []).map((a: any) => {
        const street = (g && edgeStreet(g, a.edge_id)) || 'Unnamed road';
        const from = g?.nodesById.get(a.from_node);
        return { ...a, label: from ? `${street} (from ${compass(from.lat, from.lng, j.lat, j.lng)})` : street };
      }),
    }));
  },

  async simulateSignal(junctionId: string, mode: 'optimize' | 'emergency' = 'optimize', emergencyApproachId?: string): Promise<SignalSimulation> {
    const body: Record<string, unknown> = { junction_id: junctionId, mode };
    if (mode === 'emergency') body.emergency_approach_id = emergencyApproachId;
    return post('/signals/simulate', body);
  },

  // ----- Emergency ---------------------------------------------------------
  async emergencyRoutes(source: RoutePoint, destination: RoutePoint, vehicleType: EmergencyVehicle): Promise<EmergencyResult> {
    const [d, g] = await Promise.all([
      post<any>('/emergency/routes', { vehicle_type: vehicleType, source, destination }),
      loadGraph().catch(() => null),
    ]);
    const emergency = toEmergencyRoute(d.emergency_route, 'Emergency priority', 'emergency');
    emergency.time_saved_min = num(d.time_saved_min);
    return {
      normal: toEmergencyRoute(d.normal_route, 'Normal route', 'normal'),
      emergency,
      simulation: !!d.simulation,
      time_saved_min: num(d.time_saved_min),
      signal_wait_source: d.signal_wait_source,
      assumptions: d.assumptions ?? [],
      signals: (d.emergency_route?.signals ?? []).map((s: any) => ({ ...s, name: g ? nodeLabel(g, s.node_id) : s.name })),
      from: d.from,
      to: d.to,
    };
  },

  // ----- Admin -------------------------------------------------------------
  async getAdminOverview(): Promise<AdminOverview> {
    const d = await get<any>('/admin/overview');
    return { ...d, incidents: { total: num(d.counts?.incidents_total), pending: num(d.counts?.pending) } };
  },

  async getAdminAnalytics(): Promise<Analytics> {
    const d = await get<any>('/admin/analytics');
    return {
      ...d,
      congestion_by_hour: (d.congestion_by_hour ?? []).map((h: any) => ({
        hour_ist: num(h.hour_ist),
        avg_speed_ratio: num(h.avg_speed_ratio),
        heavy_or_severe_share: num(h.heavy_or_severe_share),
        samples: num(h.samples),
      })),
      incidents_by_type: (d.incidents_by_type ?? []).map((t: any) => ({ category: t.category, count: num(t.count) })),
      signal_improvement: (d.signal_improvement ?? []).map((s: any) => ({
        ...s,
        avg_wait_before_s: num(s.avg_wait_before_s),
        avg_wait_after_s: num(s.avg_wait_after_s),
        improvement_pct: s.improvement_pct == null ? null : num(s.improvement_pct),
      })),
      emergency_time_saved: {
        sessions: num(d.emergency_time_saved?.sessions),
        avg_saved_min: num(d.emergency_time_saved?.avg_saved_min),
        total_saved_min: num(d.emergency_time_saved?.total_saved_min),
      },
    };
  },

  async health(): Promise<{ status: string; database: string; ml_service: { status: string; model_version?: string; reason?: string } }> {
    return get('/health');
  },
};

export default api;
